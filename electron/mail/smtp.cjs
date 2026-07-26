const nodemailer = require("nodemailer");
const { buildInviteIcs } = require("./calendar-invite.cjs");

function formatSmtpError(err) {
  if (!err) return "Unknown SMTP error";
  const parts = [err.response || err.message || String(err)];
  if (err.code) parts.push(`[${err.code}]`);
  let text = parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  if (/auth|login|invalid|credentials/i.test(text)) {
    text += " Tip: username is usually your full email; use an app password if required.";
  }
  return text;
}

function normalizeSmtp(account) {
  const port = Number(account.smtpPort) || 465;
  let secure = account.smtpSecure;
  if (secure == null) secure = port === 465;
  if (port === 587 || port === 25) secure = false;
  if (port === 465) secure = true;
  return {
    host: String(account.smtpHost || "").trim(),
    port,
    secure,
    requireTLS: !secure && (port === 587 || port === 25),
    auth: {
      user: String(account.username || account.email || "").trim(),
      pass: String(account.password || ""),
    },
    connectionTimeout: 25000,
    greetingTimeout: 25000,
    socketTimeout: 60000,
    tls: {
      rejectUnauthorized: account.smtpRejectUnauthorized === true,
      minVersion: "TLSv1.2",
      servername: String(account.smtpHost || "").trim() || undefined,
    },
  };
}

function createTransport(account) {
  const opts = normalizeSmtp(account);
  if (!opts.host) {
    const err = new Error("SMTP host is empty — enter smtp.yourdomain.com or use Auto-detect");
    err.code = "ENOHOST";
    throw err;
  }
  return nodemailer.createTransport(opts);
}

async function testSmtp(account) {
  try {
    const transport = createTransport(account);
    await transport.verify();
    return { ok: true };
  } catch (err) {
    // Retry with relaxed TLS (common on shared hosting)
    try {
      const transport = createTransport({ ...account, smtpRejectUnauthorized: false });
      await transport.verify();
      return { ok: true, warning: "Connected with relaxed TLS (self-signed or hostname mismatch)." };
    } catch (err2) {
      return { ok: false, error: formatSmtpError(err2.message ? err2 : err) };
    }
  }
}

function parseDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) return null;
  const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(dataUrl);
  if (!match) return null;
  return { contentType: match[1], content: Buffer.from(match[2], "base64") };
}

function escapeHtml(s) {
  return String(s || "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]);
}

function buildBrandHeaderHtml(account, useCid) {
  const name = account.name || account.email;
  const letter = escapeHtml((account.brandLetter || name.charAt(0) || "L").toUpperCase().slice(0, 2));
  const color = escapeHtml(account.brandColor || "#0d9488");
  const img = useCid
    ? `<img src="cid:lesmail-brand" width="48" height="48" alt="${letter}" style="display:block;width:48px;height:48px;border-radius:50%;object-fit:cover;" />`
    : `<div style="width:48px;height:48px;border-radius:50%;background:${color};color:#fff;font:700 22px Georgia,Times,serif;line-height:48px;text-align:center;">${letter}</div>`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px 0;border-collapse:collapse;">
  <tr>
    <td style="vertical-align:middle;padding:0 12px 0 0;">${img}</td>
    <td style="vertical-align:middle;font:600 15px system-ui,sans-serif;color:#111;">
      ${escapeHtml(name)}
      <div style="font:400 12px system-ui,sans-serif;color:#666;">${escapeHtml(account.email)}</div>
    </td>
  </tr>
</table>`;
}

async function sendMail(
  account,
  {

    to,
    cc,
    bcc,
    subject,
    text,
    html,
    inReplyTo,
    references,
    requestReadReceipt,
    icalEvent,
    attachments,
  },
) {
  if (!account || !account.email) {
    const err = new Error("Account not found");
    throw err;
  }
  if (!account.password) {
    const err = new Error(
      "App password missing or could not be decrypted. Open Settings → Accounts and paste a new app password for this account, then Save.",
    );
    err.code = "ENEEDPASSWORD";
    throw err;
  }
  if (!to) {
    const err = new Error("Missing To address");
    throw err;
  }
  const transport = createTransport(account);
  const headers = {};
  if (requestReadReceipt) {
    headers["Disposition-Notification-To"] = account.email;
    headers["Return-Receipt-To"] = account.email;
    headers["X-Confirm-Reading-To"] = account.email;
  }

  const bodyHtml = html || `<p>${String(text || "").replace(/\n/g, "<br/>")}</p>`;
  const logoParsed = parseDataUrl(account.brandLogoDataUrl);
  const brandAttachments = [];
  let useCid = false;
  // Raster only — many clients (Gmail) strip SVG CIDs
  if (logoParsed && /^image\/(png|jpe?g|gif|webp)$/i.test(logoParsed.contentType)) {
    brandAttachments.push({
      filename: "brand-logo.png",
      content: logoParsed.content,
      contentType: logoParsed.contentType,
      cid: "lesmail-brand",
      contentDisposition: "inline",
    });
    useCid = true;
  }
  const brandHtml = buildBrandHeaderHtml(account, useCid);
  const finalHtml = `${brandHtml}${bodyHtml}`;

  const mail = {
    from: `"${account.name || account.email}" <${account.email}>`,
    to,
    cc: cc || undefined,
    bcc: bcc || undefined,
    subject,
    text,
    html: finalHtml,
    inReplyTo: inReplyTo || undefined,
    references: references || undefined,
    headers,
    attachments: [...(attachments || []), ...brandAttachments],
  };

  if (icalEvent) {
    mail.icalEvent = {
      method: "REQUEST",
      content: typeof icalEvent === "string" ? icalEvent : icalEvent.content,
      filename: "invite.ics",
    };
    mail.attachments = [
      ...(mail.attachments || []),
      {
        filename: "invite.ics",
        content: typeof icalEvent === "string" ? icalEvent : icalEvent.content,
        contentType: "text/calendar; method=REQUEST; charset=UTF-8",
      },
    ];
  }

  const info = await transport.sendMail(mail);
  return {
    ok: true,
    messageId: info.messageId,
    response: info.response,
  };
}

/** Minimal send for List-Unsubscribe mailto — no brand header. */
async function sendPlainMail(account, { to, subject, text }) {
  if (!account?.email) throw Object.assign(new Error("Account not found"), { code: "ENOACCOUNT" });
  if (!account.password) {
    const err = new Error(
      "App password missing. Open Settings → Accounts and paste a new app password, then Save.",
    );
    err.code = "ENEEDPASSWORD";
    throw err;
  }
  if (!to) throw new Error("Missing unsubscribe address");
  const transport = createTransport(account);
  const info = await transport.sendMail({
    from: `"${account.name || account.email}" <${account.email}>`,
    to,
    subject: subject || "unsubscribe",
    text: text || "unsubscribe",
  });
  return { ok: true, messageId: info.messageId };
}

async function sendCalendarInvites(account, event) {
  const invitees = event.invitees || [];
  if (!invitees.length) return { ok: false, error: "Add at least one invitee email." };

  const ics = buildInviteIcs({
    uid: event.id,
    title: event.title,
    description: event.notes || "",
    location: event.location || event.meetingUrl || "",
    start: event.start,
    end: event.end,
    organizerEmail: account.email,
    organizerName: account.name,
    invitees,
    meetingUrl: event.meetingUrl,
  });

  const when = new Date(event.start).toLocaleString();
  const results = [];
  for (const person of invitees) {
    const html = `
      <div style="font-family:system-ui,sans-serif;line-height:1.5">
        <h2 style="margin:0 0 8px">${event.title}</h2>
        <p><strong>When:</strong> ${when}</p>
        ${event.location ? `<p><strong>Where:</strong> ${event.location}</p>` : ""}
        ${event.meetingUrl ? `<p><strong>Join:</strong> <a href="${event.meetingUrl}">${event.meetingUrl}</a></p>` : ""}
        ${event.notes ? `<p>${event.notes}</p>` : ""}
        <p style="color:#666;font-size:13px">A calendar invite (.ics) is attached — add it to Outlook, Apple Calendar, or Google Calendar.</p>
      </div>`;
    try {
      const sent = await sendMail(account, {
        to: person.email,
        subject: `Invitation: ${event.title}`,
        text: `${event.title}\nWhen: ${when}\n${event.meetingUrl || ""}\n${event.notes || ""}`,
        html,
        icalEvent: ics,
        requestReadReceipt: false,
      });
      results.push({ email: person.email, ok: true, messageId: sent.messageId });
    } catch (err) {
      results.push({ email: person.email, ok: false, error: err.message || String(err) });
    }
  }

  const failed = results.filter((r) => !r.ok);
  return {
    ok: failed.length === 0,
    results,
    error: failed.length ? failed.map((f) => `${f.email}: ${f.error}`).join("; ") : undefined,
  };
}

module.exports = { testSmtp, sendMail, sendPlainMail, sendCalendarInvites, formatSmtpError };
