const { app, dialog, shell } = require("electron");
const crypto = require("crypto");
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

const OUTGOING_ID = /^out_[a-z0-9]+$/i;
const MAX_OUTGOING_BYTES = 25 * 1024 * 1024;
const MAX_OUTGOING_FILES = 20;

function outgoingRoot() {
  return path.join(app.getPath("userData"), "outgoing-attachments");
}

function mimeFromName(name) {
  const ext = path.extname(String(name || "")).toLowerCase();
  const map = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".csv": "text/csv",
    ".ics": "text/calendar",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".zip": "application/zip",
    ".mp3": "audio/mpeg",
    ".mp4": "video/mp4",
  };
  return map[ext] || "application/octet-stream";
}

function loadOutgoingFile(attachmentId) {
  const id = String(attachmentId || "").trim();
  if (!OUTGOING_ID.test(id)) return null;
  const dir = path.join(outgoingRoot(), id);
  const metaPath = path.join(dir, "meta.json");
  if (!fs.existsSync(metaPath)) return null;
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    const filePath = path.join(dir, safeFileName(meta.name));
    if (!fs.existsSync(filePath)) return null;
    const buffer = fs.readFileSync(filePath);
    return {
      id,
      name: meta.name || path.basename(filePath),
      mimeType: meta.mimeType || mimeFromName(meta.name),
      size: buffer.length,
      path: filePath,
      buffer,
    };
  } catch {
    return null;
  }
}

function stageOutgoingFiles(filePaths) {
  const files = [];
  for (const src of filePaths || []) {
    if (!src || !fs.existsSync(src) || !fs.statSync(src).isFile()) continue;
    const stat = fs.statSync(src);
    if (stat.size <= 0) {
      return { ok: false, error: `${path.basename(src)} is empty` };
    }
    if (stat.size > MAX_OUTGOING_BYTES) {
      return { ok: false, error: `${path.basename(src)} is over 25 MB` };
    }
    if (files.length >= MAX_OUTGOING_FILES) {
      return { ok: false, error: `You can attach up to ${MAX_OUTGOING_FILES} files` };
    }
    const id = `out_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const name = safeFileName(path.basename(src));
    const destDir = path.join(outgoingRoot(), id);
    fs.mkdirSync(destDir, { recursive: true });
    const dest = path.join(destDir, name);
    fs.copyFileSync(src, dest);
    const mimeType = mimeFromName(name);
    fs.writeFileSync(
      path.join(destDir, "meta.json"),
      JSON.stringify({ name, size: stat.size, mimeType }),
      "utf8",
    );
    files.push({ id, name, size: stat.size, mimeType });
  }
  return { ok: true, files };
}

async function pickOutgoingAttachments({ win } = {}) {
  const picked = await dialog.showOpenDialog(win || undefined, {
    title: "Attach files",
    properties: ["openFile", "multiSelections"],
  });
  if (picked.canceled || !picked.filePaths?.length) {
    return { ok: true, cancelled: true, files: [] };
  }
  const staged = stageOutgoingFiles(picked.filePaths);
  if (!staged.ok) return staged;
  return { ok: true, files: staged.files };
}

async function stageOutgoingFromBase64(payload = {}) {
  const name = safeFileName(payload.name || payload.filename || "attachment");
  const raw = String(payload.contentBase64 || "");
  if (!raw) return { ok: false, error: "Missing file data" };
  let buffer;
  try {
    buffer = Buffer.from(raw, "base64");
  } catch {
    return { ok: false, error: "Could not read that file" };
  }
  if (!buffer.length) return { ok: false, error: `${name} is empty` };
  if (buffer.length > MAX_OUTGOING_BYTES) return { ok: false, error: `${name} is over 25 MB` };
  const id = `out_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const destDir = path.join(outgoingRoot(), id);
  fs.mkdirSync(destDir, { recursive: true });
  fs.writeFileSync(path.join(destDir, name), buffer);
  const mimeType = payload.mimeType || payload.contentType || mimeFromName(name);
  fs.writeFileSync(
    path.join(destDir, "meta.json"),
    JSON.stringify({ name, size: buffer.length, mimeType }),
    "utf8",
  );
  return { ok: true, file: { id, name, size: buffer.length, mimeType } };
}

function resolveSendAttachments(list) {
  const resolved = [];
  for (const item of list || []) {
    if (!item) continue;
    if (item.id && OUTGOING_ID.test(item.id)) {
      const stored = loadOutgoingFile(item.id);
      if (!stored) {
        throw new Error(`${item.filename || item.name || "An attachment"} is no longer available`);
      }
      resolved.push({
        filename: stored.name,
        content: stored.buffer,
        contentType: stored.mimeType,
      });
      continue;
    }
    if (item.path && fs.existsSync(item.path)) {
      resolved.push({
        filename: item.filename || item.name || path.basename(item.path),
        path: item.path,
        contentType: item.contentType || item.mimeType || mimeFromName(item.filename || item.path),
      });
      continue;
    }
    if (item.contentBase64) {
      resolved.push({
        filename: item.filename || item.name || "attachment",
        content: Buffer.from(item.contentBase64, "base64"),
        contentType: item.contentType || item.mimeType || "application/octet-stream",
      });
    }
  }
  const total = resolved.reduce((sum, file) => {
    if (file.content) return sum + file.content.length;
    try {
      return sum + fs.statSync(file.path).size;
    } catch {
      return sum;
    }
  }, 0);
  if (total > MAX_OUTGOING_BYTES) {
    throw new Error("Attachments together must stay under 25 MB");
  }
  return resolved;
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
  const outgoing = loadOutgoingFile(payload.attachmentId);
  if (outgoing) {
    return {
      ok: true,
      name: outgoing.name,
      mimeType: outgoing.mimeType,
      size: outgoing.size,
      base64: outgoing.buffer.toString("base64"),
    };
  }
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
  pickOutgoingAttachments,
  stageOutgoingFromBase64,
  resolveSendAttachments,
  loadOutgoingFile,
  MAX_INLINE_BYTES,
};
