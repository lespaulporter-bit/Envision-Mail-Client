const { app, dialog, shell } = require("electron");
const fs = require("fs");
const path = require("path");
const accounts = require("./accounts-store.cjs");
const { fetchAttachment } = require("./imap.cjs");

/** Anything larger stays out of the renderer — open it with the OS instead. */
const MAX_INLINE_BYTES = 25 * 1024 * 1024;

const NEEDS_SYNC =
  "This attachment isn't linked to a synced message. Sync this account, then try again.";

/** Sync mints attachment ids as att_<folder>_<uid>_<index>. */
function parseAttachmentId(attachmentId) {
  const match = /^att_([a-z]+)_(\d+)_(\d+)$/i.exec(String(attachmentId || "").trim());
  if (!match) return null;
  return { folder: match[1].toLowerCase(), uid: Number(match[2]), index: Number(match[3]) };
}

function safeFileName(name, fallback = "attachment") {
  const flattened = String(name || "").replace(/[\\/]+/g, "_");
  const cleaned = path
    .basename(flattened)
    .replace(/[\u0000-\u001f<>:"|?*]/g, "_")
    .replace(/^\.+/, "")
    .trim();
  return cleaned || fallback;
}

function uniqueFilePath(dir, name) {
  const safe = safeFileName(name);
  const ext = path.extname(safe);
  const stem = ext ? safe.slice(0, -ext.length) : safe;
  let candidate = path.join(dir, safe);
  let n = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${stem} (${n})${ext}`);
    n += 1;
  }
  return candidate;
}

function desktopDir() {
  for (const key of ["desktop", "downloads", "home"]) {
    try {
      const dir = app.getPath(key);
      if (dir && fs.existsSync(dir)) return dir;
    } catch {
      /* try the next location */
    }
  }
  return process.cwd();
}

async function loadAttachment(payload = {}) {
  const ref = parseAttachmentId(payload.attachmentId);
  if (!ref) return { ok: false, error: NEEDS_SYNC };
  const account = accounts.getAccountSecret(payload.accountId);
  if (!account) return { ok: false, error: "Account not found — open Settings → Accounts." };
  if (!account.password) {
    return { ok: false, error: "App password missing — re-enter it in Settings → Accounts." };
  }
  return fetchAttachment(account, {
    folder: ref.folder,
    uid: ref.uid,
    index: ref.index,
    name: payload.name || "",
  });
}

/** Bytes for in-app preview. Large files are refused so the renderer stays responsive. */
async function getAttachmentData(payload = {}) {
  const result = await loadAttachment(payload);
  if (!result.ok) return result;
  if (result.size > MAX_INLINE_BYTES) {
    return {
      ok: false,
      tooLarge: true,
      name: result.name,
      size: result.size,
      mimeType: result.mimeType,
      error: "That file is too big to preview here — open or save it instead.",
    };
  }
  return result;
}

async function saveAttachment(payload = {}, { win } = {}) {
  const result = await loadAttachment(payload);
  if (!result.ok) return result;
  const buffer = Buffer.from(result.base64, "base64");

  let target;
  if (payload.saveAs) {
    const picked = await dialog.showSaveDialog(win || undefined, {
      title: "Save attachment",
      defaultPath: path.join(desktopDir(), safeFileName(result.name)),
    });
    if (picked.canceled || !picked.filePath) return { ok: false, cancelled: true };
    target = picked.filePath;
  } else {
    target = uniqueFilePath(desktopDir(), result.name);
  }

  try {
    await fs.promises.writeFile(target, buffer);
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
  return {
    ok: true,
    path: target,
    name: path.basename(target),
    folder: path.dirname(target),
    size: buffer.length,
  };
}

/** Write to a scratch folder and hand off to the OS default app. */
async function openAttachment(payload = {}) {
  const result = await loadAttachment(payload);
  if (!result.ok) return result;
  const dir = path.join(app.getPath("temp"), "envision-mail-attachments");
  try {
    fs.mkdirSync(dir, { recursive: true });
    const stamp = safeFileName(String(payload.attachmentId || Date.now()), "att");
    const target = path.join(dir, `${stamp}-${safeFileName(result.name)}`);
    await fs.promises.writeFile(target, Buffer.from(result.base64, "base64"));
    const failure = await shell.openPath(target);
    if (failure) return { ok: false, error: failure, path: target };
    return { ok: true, path: target, name: result.name };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

module.exports = {
  parseAttachmentId,
  safeFileName,
  uniqueFilePath,
  getAttachmentData,
  saveAttachment,
  openAttachment,
  MAX_INLINE_BYTES,
};
