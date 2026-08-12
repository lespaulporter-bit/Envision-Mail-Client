const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");
const { extractUnsubscribeInfo } = require("./unsubscribe.cjs");

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
  const client = new ImapFlow(opts);
  // Late socket/TLS errors (EHOSTUNREACH, ECONNRESET) must not crash the main process
  client.on("error", (err) => {
    console.warn("imap:", err && err.code, err && err.message);
  });
  return client;
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

/** Cap stored HTML so one newsletter with embedded images can't blow up app state (~80MB+). */
const MAX_STORED_BODY = 400_000;
function capStoredBody(html) {
  const raw = String(html || "");
  if (raw.length <= MAX_STORED_BODY) return raw;
  return `${raw.slice(0, MAX_STORED_BODY)}\n<!-- truncated for performance -->`;
}

function idPrefixForFolder(accountId, folder) {
  if (folder === "sent") return `imap_${accountId}_sent`;
  if (folder === "spam") return `imap_${accountId}_spam`;
  if (folder === "trash") return `imap_${accountId}_trash`;
  return `imap_${accountId}`;
}

async function parseFetchedMessage(msg, account, folder) {
  const parsed = await simpleParser(msg.source);
  const fromAddr = parsed.from?.value?.[0] || {};
  const toAddrs = (parsed.to?.value || []).map((v) => v.address).filter(Boolean);
  const html = capStoredBody(
    sanitizeHtml(parsed.html || `<p>${(parsed.text || "").replace(/\n/g, "<br/>")}</p>`),
  );
  const messageId = `${idPrefixForFolder(account.id, folder)}_${msg.uid}`;
  const attachments = (parsed.attachments || []).map((a, idx) => ({
    id: `att_${folder}_${msg.uid}_${idx}`,
    name: a.filename || `attachment-${idx + 1}`,
    size: a.size || 0,
    mimeType: a.contentType || "application/octet-stream",
    messageId,
    threadId: "",
    receivedAt: (parsed.date || msg.internalDate || new Date()).toISOString(),
  }));
  const unsub = extractUnsubscribeInfo(parsed, html);
  const bodyTextRaw = parsed.text || stripHtml(html);
  return {
    uid: msg.uid,
    folder,
    messageIdHeader: parsed.messageId || null,
    inReplyTo: parsed.inReplyTo || null,
    references: parsed.references || [],
    from: fromAddr.address || "unknown@unknown",
    fromName: fromAddr.name || (fromAddr.address || "Unknown").split("@")[0],
    to: toAddrs.length ? toAddrs : [account.email],
    subject: parsed.subject || "(no subject)",
    bodyHtml: html,
    bodyText: capStoredBody(bodyTextRaw),
    sentAt: (parsed.date || msg.internalDate || new Date()).toISOString(),
    seen: Boolean(msg.flags?.has("\\Seen")),
    attachments,
    trackersBlocked: extractTrackers(parsed.html || ""),
    listUnsubscribe: unsub.listUnsubscribe,
    listUnsubscribePost: unsub.listUnsubscribePost,
    unsubscribeHttpUrl: unsub.unsubscribeHttpUrl,
    unsubscribeMailto: unsub.unsubscribeMailto,
    unsubscribeOneClick: unsub.unsubscribeOneClick,
  };
}

/** Fetch by sequence window. skipNewest=50 loads the 51st–oldest chunk (older mail). */
async function fetchFolderMessages(
  client,
  mailboxPath,
  account,
  { limit = 40, folder = "inbox", skipNewest = 0, uids = null } = {},
) {
  const messages = [];
  const lock = await client.getMailboxLock(mailboxPath);
  try {
    const total = client.mailbox.exists || 0;
    if (!total && !(uids && uids.length)) return [];

    const fetchOpts = {
      envelope: true,
      source: true,
      uid: true,
      flags: true,
      internalDate: true,
    };

    if (uids && uids.length) {
      const range = uidRange(uids);
      if (!range) return [];
      for await (const msg of client.fetch(range, { ...fetchOpts, uid: true })) {
        messages.push(await parseFetchedMessage(msg, account, folder));
      }
    } else {
      const end = Math.max(0, total - Math.max(0, skipNewest));
      if (end < 1) return [];
      const start = Math.max(1, end - limit + 1);
      for await (const msg of client.fetch(`${start}:${end}`, fetchOpts)) {
        messages.push(await parseFetchedMessage(msg, account, folder));
      }
    }
  } finally {
    lock.release();
  }
  return messages;
}

async function findAllMailMailboxPath(client) {
  try {
    const boxes = await client.list();
    return findSpecialMailbox(
      boxes,
      "\\All",
      ["[Gmail]/All Mail", "All Mail", "Archive"],
      /(\[Gmail\]\/)?all.?mail|^archive$/i,
    );
  } catch {
    return null;
  }
}

async function searchMailboxUids(client, path, q) {
  const lock = await client.getMailboxLock(path);
  try {
    let uids = [];
    try {
      uids = await client.search(
        { or: [{ subject: q }, { from: q }, { to: q }, { body: q }] },
        { uid: true },
      );
    } catch {
      try {
        uids = await client.search({ text: q }, { uid: true });
      } catch {
        try {
          uids = await client.search({ subject: q }, { uid: true });
        } catch {
          uids = [];
        }
      }
    }
    return [...new Set((uids || []).map(Number).filter((n) => Number.isFinite(n) && n > 0))];
  } finally {
    lock.release();
  }
}

/**
 * Search the mail server for older messages (any IMAP provider — Gmail, Yahoo, AOL, custom).
 * Prefers All Mail / Archive when present; otherwise searches INBOX + Sent.
 */
async function searchMail(account, { query, limit = 40 } = {}) {
  const q = String(query || "").trim();
  if (q.length < 2) {
    return { ok: false, error: "Enter at least 2 characters to search.", messages: [] };
  }
  const max = Math.min(80, Math.max(5, Number(limit) || 40));
  try {
    return await withClient(account, async (client) => {
      const allMailPath = await findAllMailMailboxPath(client);
      const targets = [];
      if (allMailPath) {
        targets.push({ path: allMailPath, folder: "inbox" });
      } else {
        targets.push({ path: "INBOX", folder: "inbox" });
        const sentPath = await findSentMailboxPath(client);
        if (sentPath) targets.push({ path: sentPath, folder: "sent" });
        // Common archive / older-mail folders on hosted IMAP
        try {
          const boxes = await client.list();
          for (const hint of ["Archive", "Archives", "INBOX.Archive", "Old Mail", "INBOX.Old"]) {
            const hit = boxes.find(
              (b) => b.path === hint || String(b.path || "").toLowerCase() === hint.toLowerCase(),
            );
            if (hit?.path && !targets.some((t) => t.path === hit.path)) {
              targets.push({ path: hit.path, folder: "inbox" });
            }
          }
        } catch {
          /* ignore list failures */
        }
      }

      const collected = [];
      const pathsSearched = [];
      for (const target of targets) {
        if (collected.length >= max) break;
        try {
          const uids = (await searchMailboxUids(client, target.path, q))
            .sort((a, b) => b - a)
            .slice(0, max - collected.length);
          if (!uids.length) continue;
          pathsSearched.push(target.path);
          const batch = await fetchFolderMessages(client, target.path, account, {
            folder: target.folder,
            uids,
          });
          collected.push(...batch);
        } catch {
          /* try next folder */
        }
      }

      // Dedupe by IMAP uid+folder or message-id header
      const seen = new Set();
      const messages = [];
      for (const m of collected.sort((a, b) => +new Date(b.sentAt) - +new Date(a.sentAt))) {
        const key = m.messageIdHeader || `${m.folder}:${m.uid}`;
        if (seen.has(key)) continue;
        seen.add(key);
        messages.push(m);
        if (messages.length >= max) break;
      }
      return {
        ok: true,
        messages,
        query: q,
        path: pathsSearched.join(", ") || "INBOX",
        matched: messages.length,
      };
    });
  } catch (err) {
    return { ok: false, error: formatImapError(err), messages: [] };
  }
}

/** Load older INBOX messages past the recent sync window (skipNewest = already-loaded count). */
async function fetchOlderMail(account, { folder = "inbox", skipNewest = 50, limit = 40 } = {}) {
  const skip = Math.max(0, Number(skipNewest) || 0);
  const max = Math.min(80, Math.max(10, Number(limit) || 40));
  try {
    return await withClient(account, async (client) => {
      const path = (await resolveFolderPath(client, folder)) || "INBOX";
      const lock = await client.getMailboxLock(path);
      let total = 0;
      try {
        total = client.mailbox.exists || 0;
      } finally {
        lock.release();
      }
      if (skip >= total) {
        return { ok: true, messages: [], total, skipNewest: skip, limit: max, hasMore: false };
      }
      const messages = await fetchFolderMessages(client, path, account, {
        folder: folder === "sent" || folder === "spam" || folder === "trash" ? folder : "inbox",
        limit: max,
        skipNewest: skip,
      });
      messages.sort((a, b) => +new Date(b.sentAt) - +new Date(a.sentAt));
      const nextSkip = skip + messages.length;
      return {
        ok: true,
        messages,
        total,
        skipNewest: skip,
        limit: max,
        hasMore: nextSkip < total,
        nextSkipNewest: nextSkip,
      };
    });
  } catch (err) {
    return { ok: false, error: formatImapError(err), messages: [] };
  }
}

/** Sync names unnamed parts attachment-1, attachment-2… — those can't be matched by filename. */
const GENERATED_ATTACHMENT_NAME = /^attachment-\d+$/i;

async function readAttachmentFromMailbox(client, mailboxPath, { uid, index, name }) {
  const lock = await client.getMailboxLock(mailboxPath);
  try {
    let msg = null;
    try {
      msg = await client.fetchOne(String(uid), { source: true, uid: true }, { uid: true });
    } catch {
      return null;
    }
    if (!msg || !msg.source) return null;

    const parsed = await simpleParser(msg.source);
    const list = parsed.attachments || [];
    const byIndex = index >= 0 && index < list.length ? list[index] : null;
    const matchByName = name && !GENERATED_ATTACHMENT_NAME.test(name) && list.some((a) => a.filename);
    // UIDs are mailbox-scoped, so a filename check is what keeps a stale or
    // cross-mailbox UID from handing back somebody else's file.
    const picked = matchByName
      ? byIndex && (byIndex.filename || "") === name
        ? byIndex
        : list.find((a) => (a.filename || "") === name) || null
      : byIndex;
    if (!picked || !picked.content) return null;

    const buf = Buffer.isBuffer(picked.content) ? picked.content : Buffer.from(picked.content);
    return {
      ok: true,
      name: picked.filename || name || `attachment-${index + 1}`,
      mimeType: picked.contentType || "application/octet-stream",
      size: buf.length,
      base64: buf.toString("base64"),
    };
  } finally {
    lock.release();
  }
}

/**
 * Download one attachment's bytes. Sync keeps only attachment metadata, so the
 * message is re-fetched from the server and re-parsed on demand.
 */
async function fetchAttachment(account, { folder = "inbox", uid, index = 0, name = "" } = {}) {
  const messageUid = Number(uid);
  if (!Number.isFinite(messageUid) || messageUid <= 0) {
    return { ok: false, error: "This attachment is not linked to a message on the server." };
  }
  const wanted = Number.isInteger(Number(index)) ? Number(index) : 0;
  try {
    return await withClient(account, async (client) => {
      const paths = [(await resolveFolderPath(client, folder)) || "INBOX"];
      // Search results carry All Mail UIDs under an inbox label — look there too.
      const allMail = await findAllMailMailboxPath(client);
      if (allMail && !paths.includes(allMail)) paths.push(allMail);

      for (const mailboxPath of paths) {
        const found = await readAttachmentFromMailbox(client, mailboxPath, {
          uid: messageUid,
          index: wanted,
          name,
        });
        if (found) return found;
      }
      return {
        ok: false,
        error: "That file is no longer on the server — sync this account and try again.",
      };
    });
  } catch (err) {
    return { ok: false, error: formatImapError(err) };
  }
}

function findSpecialMailbox(boxes, specialUse, nameHints, fuzzyRe) {
  const special = boxes.find(
    (b) => b.specialUse === specialUse || (b.specialUseFlags || []).includes(specialUse),
  );
  if (special?.path) return special.path;
  for (const name of nameHints) {
    const hit = boxes.find((b) => b.path === name || b.path?.toLowerCase() === name.toLowerCase());
    if (hit?.path) return hit.path;
  }
  const fuzzy = boxes.find((b) => fuzzyRe.test(b.path || ""));
  return fuzzy?.path || null;
}

async function findSentMailboxPath(client) {
  try {
    const boxes = await client.list();
    return findSpecialMailbox(
      boxes,
      "\\Sent",
      ["Sent", "Sent Messages", "Sent Items", "INBOX.Sent", "INBOX/Sent", "[Gmail]/Sent Mail", "Sent Mail"],
      /^(\[Gmail\]\/)?sent/i,
    );
  } catch {
    return null;
  }
}

async function findSpamMailboxPath(client) {
  try {
    const boxes = await client.list();
    return findSpecialMailbox(
      boxes,
      "\\Junk",
      [
        "Junk",
        "Spam",
        "Junk E-mail",
        "Junk Email",
        "INBOX.Junk",
        "INBOX/Junk",
        "INBOX.Spam",
        "INBOX/Spam",
        "[Gmail]/Spam",
        "Bulk Mail",
      ],
      /(junk|spam|bulk)/i,
    );
  } catch {
    return null;
  }
}

async function findTrashMailboxPath(client) {
  try {
    const boxes = await client.list();
    return findSpecialMailbox(
      boxes,
      "\\Trash",
      [
        "Trash",
        "Deleted",
        "Deleted Items",
        "Deleted Messages",
        "INBOX.Trash",
        "INBOX/Trash",
        "[Gmail]/Trash",
        "Bin",
      ],
      /(trash|deleted|bin)/i,
    );
  } catch {
    return null;
  }
}

async function resolveFolderPath(client, folder) {
  const key = String(folder || "inbox").toLowerCase();
  if (key === "inbox") return "INBOX";
  if (key === "sent") return findSentMailboxPath(client);
  if (key === "spam") return findSpamMailboxPath(client);
  if (key === "trash") return findTrashMailboxPath(client);
  return key;
}

function uidRange(uids) {
  const list = [...new Set((uids || []).map(Number).filter((n) => Number.isFinite(n) && n > 0))];
  if (!list.length) return null;
  return list.sort((a, b) => a - b).join(",");
}

/** Move messages between folders (e.g. inbox → trash, inbox → spam). */
async function moveMessages(account, { sourceFolder = "inbox", destFolder = "trash", uids = [] } = {}) {
  const range = uidRange(uids);
  if (!range) return { ok: false, error: "No message UIDs to move." };
  try {
    return await withClient(account, async (client) => {
      const source = await resolveFolderPath(client, sourceFolder);
      const dest = await resolveFolderPath(client, destFolder);
      if (!source) return { ok: false, error: `Source folder not found (${sourceFolder}).` };
      if (!dest) return { ok: false, error: `Destination folder not found (${destFolder}).` };
      if (source === dest) return { ok: true, moved: 0, skipped: true };
      const lock = await client.getMailboxLock(source);
      try {
        const result = await client.messageMove(range, dest, { uid: true });
        const moved = result?.uidMap ? result.uidMap.size : uids.length;
        return { ok: true, moved, source, dest };
      } finally {
        lock.release();
      }
    });
  } catch (err) {
    return { ok: false, error: formatImapError(err) };
  }
}

/** Permanently delete messages (\\Deleted + expunge) in a folder. */
async function deleteMessages(account, { folder = "trash", uids = [] } = {}) {
  const range = uidRange(uids);
  if (!range) return { ok: false, error: "No message UIDs to delete." };
  try {
    return await withClient(account, async (client) => {
      const path = await resolveFolderPath(client, folder);
      if (!path) return { ok: false, error: `Folder not found (${folder}).` };
      const lock = await client.getMailboxLock(path);
      try {
        await client.messageDelete(range, { uid: true });
        return { ok: true, deleted: uids.length, path };
      } finally {
        lock.release();
      }
    });
  } catch (err) {
    return { ok: false, error: formatImapError(err) };
  }
}

/** Empty Spam or Trash on the server (all messages). */
async function emptyFolder(account, { folder = "trash" } = {}) {
  try {
    return await withClient(account, async (client) => {
      const path = await resolveFolderPath(client, folder);
      if (!path) return { ok: false, error: `Folder not found (${folder}).` };
      const lock = await client.getMailboxLock(path);
      try {
        const total = client.mailbox.exists || 0;
        if (!total) return { ok: true, deleted: 0, path };
        await client.messageDelete("1:*", { uid: true });
        return { ok: true, deleted: total, path };
      } finally {
        lock.release();
      }
    });
  } catch (err) {
    return { ok: false, error: formatImapError(err) };
  }
}

async function fetchInbox(account, { limit = 40 } = {}) {
  try {
    return await withClient(account, async (client) => {
      const inbox = await fetchFolderMessages(client, "INBOX", account, { limit, folder: "inbox" });
      return inbox.sort((a, b) => +new Date(b.sentAt) - +new Date(a.sentAt));
    });
  } catch (err) {
    const wrapped = new Error(formatImapError(err));
    wrapped.cause = err;
    throw wrapped;
  }
}

/** Fetch INBOX + Sent + Spam/Junk + Trash when available */
async function fetchMail(
  account,
  { inboxLimit = 50, sentLimit = 40, spamLimit = 40, trashLimit = 40 } = {},
) {
  try {
    return await withClient(account, async (client) => {
      const inbox = await fetchFolderMessages(client, "INBOX", account, {
        limit: inboxLimit,
        folder: "inbox",
      });
      let sent = [];
      let spam = [];
      let trash = [];
      const sentPath = await findSentMailboxPath(client);
      if (sentPath) {
        try {
          sent = await fetchFolderMessages(client, sentPath, account, {
            limit: sentLimit,
            folder: "sent",
          });
        } catch {
          sent = [];
        }
      }
      const spamPath = await findSpamMailboxPath(client);
      if (spamPath) {
        try {
          spam = await fetchFolderMessages(client, spamPath, account, {
            limit: spamLimit,
            folder: "spam",
          });
        } catch {
          spam = [];
        }
      }
      const trashPath = await findTrashMailboxPath(client);
      if (trashPath) {
        try {
          trash = await fetchFolderMessages(client, trashPath, account, {
            limit: trashLimit,
            folder: "trash",
          });
        } catch {
          trash = [];
        }
      }
      return [...inbox, ...sent, ...spam, ...trash].sort(
        (a, b) => +new Date(b.sentAt) - +new Date(a.sentAt),
      );
    });
  } catch (err) {
    const wrapped = new Error(formatImapError(err));
    wrapped.cause = err;
    throw wrapped;
  }
}

module.exports = {
  testImap,
  fetchInbox,
  fetchMail,
  searchMail,
  fetchOlderMail,
  moveMessages,
  deleteMessages,
  emptyFolder,
  fetchAttachment,
  formatImapError,
};
