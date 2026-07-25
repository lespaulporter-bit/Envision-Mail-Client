const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");

function formatImapError(err) {
  if (!err) return "Unknown IMAP error";
  const parts = [];
  if (err.authenticationFailed) parts.push("Authentication failed");
  if (err.responseText) parts.push(err.responseText);
  else if (err.message && err.message !== "Command failed") parts.push(err.message);
  else if (err.message) parts.push(err.message);
  if (err.responseStatus) parts.push(`(${err.responseStatus})`);
  if (err.code && !String(parts.join(" ")).includes(err.code)) parts.push(`[${err.code}]`);
  if (err.syscall) parts.push(`${err.syscall}`);
  let text = parts.filter(Boolean).join(" — ").replace(/\s+/g, " ").trim();
  if (!text || text === "Command failed") {
    text =
      "IMAP command failed. Check host, port, SSL, and that your username is the full email address.";
  }
  if (/auth|login|password|credentials|invalid/i.test(text)) {
    text += " Tip: use an app password if 2FA is on; for hosted mail use the full email as username.";
  }
  return text;
}

function normalizeImapOptions(account) {
  const port = Number(account.imapPort) || 993;
  let secure = account.imapSecure;
  if (secure == null) secure = port === 993;
  // Port 143 is almost always STARTTLS, not implicit SSL
  if (port === 143) secure = false;
  if (port === 993) secure = true;

  const rejectUnauthorized = account.imapRejectUnauthorized === true ? true : false;

  return {
    host: String(account.imapHost || "").trim(),
    port,
    secure,
    requireTLS: !secure && (port === 143 || account.imapRequireTls),
    auth: {
      user: String(account.username || account.email || "").trim(),
      pass: String(account.password || ""),
    },
    logger: false,
    connectionTimeout: 25000,
    greetingTimeout: 25000,
    socketTimeout: 60000,
    tls: {
      rejectUnauthorized,
      minVersion: "TLSv1.2",
      servername: String(account.imapHost || "").trim() || undefined,
    },
  };
}

function createClient(account) {
  const opts = normalizeImapOptions(account);
  if (!opts.host) {
    const err = new Error("IMAP host is empty — pick a provider or enter imap.yourdomain.com");
    err.code = "ENOHOST";
    throw err;
  }
  if (!opts.auth.pass) {
    const err = new Error("Password is required");
    err.code = "ENOPASS";
    throw err;
  }
  return new ImapFlow(opts);
}

async function withClient(account, fn) {
  const attempts = buildAttempts(account);
  let lastErr = null;

  for (const attempt of attempts) {
    const client = createClient(attempt);
    try {
      await client.connect();
      const result = await fn(client, attempt);
      try {
        await client.logout();
      } catch {
        try {
          await client.close();
        } catch {
          /* ignore */
        }
      }
      return result;
    } catch (err) {
      lastErr = err;
      try {
        await client.close();
      } catch {
        /* ignore */
      }
      // Don't retry clear auth failures with same credentials on same host
      if (err.authenticationFailed && attempts.length === 1) break;
      if (err.code === "ENOHOST" || err.code === "ENOPASS") break;
    }
  }

  throw lastErr || new Error("IMAP connection failed");
}

/** Try primary settings, then common alternates for custom / misconfigured accounts */
function buildAttempts(account) {
  const base = {
    ...account,
    imapHost: String(account.imapHost || "").trim(),
    username: String(account.username || account.email || "").trim(),
    password: account.password,
    email: account.email,
  };

  const attempts = [base];

  // If host empty but email domain present, try common hosts
  if (!base.imapHost && base.email?.includes("@")) {
    const domain = base.email.split("@")[1];
    for (const host of [`imap.${domain}`, `mail.${domain}`, domain]) {
      attempts.push({ ...base, imapHost: host, imapPort: 993, imapSecure: true });
    }
  }

  // Alternate SSL modes on same host
  if (base.imapHost) {
    const port = Number(base.imapPort) || 993;
    if (port === 993) {
      attempts.push({
        ...base,
        imapPort: 143,
        imapSecure: false,
        imapRequireTls: true,
        imapRejectUnauthorized: false,
      });
    } else if (port === 143) {
      attempts.push({ ...base, imapPort: 993, imapSecure: true, imapRejectUnauthorized: false });
    }
    // Retry with relaxed TLS (self-signed / hostname mismatch on shared hosting)
    attempts.push({ ...base, imapRejectUnauthorized: false });
  }

  // Dedupe by host:port:secure
  const seen = new Set();
  return attempts.filter((a) => {
    const key = `${a.imapHost}|${a.imapPort}|${a.imapSecure}|${a.imapRejectUnauthorized}`;
    if (!a.imapHost || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function testImap(account) {
  try {
    const result = await withClient(account, async (client) => {
      // Prefer opening INBOX; some hosts use different casing — ImapFlow normalizes INBOX
      let exists = 0;
      try {
        const lock = await client.getMailboxLock("INBOX");
        try {
          exists = client.mailbox?.exists || 0;
        } finally {
          lock.release();
        }
      } catch (boxErr) {
        // Connected + authenticated is enough for a passing test
        if (client.authenticated) {
          return {
            ok: true,
            exists: 0,
            warning: formatImapError(boxErr),
            used: {
              host: client.servername || account.imapHost,
            },
          };
        }
        throw boxErr;
      }
      return {
        ok: true,
        exists,
        used: {
          host: account.imapHost,
          port: account.imapPort,
        },
      };
    });
    return result;
  } catch (err) {
    return { ok: false, error: formatImapError(err) };
  }
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTrackers(html) {
  const found = [];
  const re = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html || ""))) {
    const src = m[1];
    if (/pixel|track|open\.|beacon|spy|analytics/i.test(src) || /1x1|height=["']1["']/i.test(m[0])) {
      found.push(src.slice(0, 120));
    }
  }
  return found.slice(0, 5);
}

function sanitizeHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+=["'][^"']*["']/gi, "")
    .replace(/src=["']https?:\/\/[^"']*(?:track|pixel|beacon)[^"']*["']/gi, 'src=""');
}

async function fetchInbox(account, { limit = 40 } = {}) {
  try {
    return await withClient(account, async (client) => {
      const messages = [];
      const lock = await client.getMailboxLock("INBOX");
      try {
        const total = client.mailbox.exists || 0;
        if (!total) return [];
        const start = Math.max(1, total - limit + 1);
        for await (const msg of client.fetch(`${start}:${total}`, {
          envelope: true,
          source: true,
          uid: true,
          flags: true,
          internalDate: true,
        })) {
          const parsed = await simpleParser(msg.source);
          const fromAddr = parsed.from?.value?.[0] || {};
          const toAddrs = (parsed.to?.value || []).map((v) => v.address).filter(Boolean);
          const html = sanitizeHtml(parsed.html || `<p>${(parsed.text || "").replace(/\n/g, "<br/>")}</p>`);
          const attachments = (parsed.attachments || []).map((a, idx) => ({
            id: `att_${msg.uid}_${idx}`,
            name: a.filename || `attachment-${idx + 1}`,
            size: a.size || 0,
            mimeType: a.contentType || "application/octet-stream",
            messageId: `imap_${account.id}_${msg.uid}`,
            threadId: "",
            receivedAt: (parsed.date || msg.internalDate || new Date()).toISOString(),
          }));

          messages.push({
            uid: msg.uid,
            messageIdHeader: parsed.messageId || null,
            inReplyTo: parsed.inReplyTo || null,
            references: parsed.references || [],
            from: fromAddr.address || "unknown@unknown",
            fromName: fromAddr.name || (fromAddr.address || "Unknown").split("@")[0],
            to: toAddrs.length ? toAddrs : [account.email],
            subject: parsed.subject || "(no subject)",
            bodyHtml: html,
            bodyText: parsed.text || stripHtml(html),
            sentAt: (parsed.date || msg.internalDate || new Date()).toISOString(),
            seen: Boolean(msg.flags?.has("\\Seen")),
            attachments,
            trackersBlocked: extractTrackers(parsed.html || ""),
          });
        }
      } finally {
        lock.release();
      }
      return messages.sort((a, b) => +new Date(b.sentAt) - +new Date(a.sentAt));
    });
  } catch (err) {
    const wrapped = new Error(formatImapError(err));
    wrapped.cause = err;
    throw wrapped;
  }
}

module.exports = { testImap, fetchInbox, formatImapError };
