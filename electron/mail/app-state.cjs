const fs = require("fs");
const path = require("path");

/** Keep renderer / IPC from choking on multi‑MB HTML bodies (embedded images, etc.). */
const MAX_BODY_CHARS = 400_000;

function statePath() {
  const { app } = require("electron");
  return path.join(app.getPath("userData"), "envision-mail-state.json");
}

function truncateBody(value, max = MAX_BODY_CHARS) {
  const raw = String(value || "");
  if (raw.length <= max) return { text: raw, truncated: false };
  return {
    text: `${raw.slice(0, max)}\n<!-- truncated for performance -->`,
    truncated: true,
  };
}

/** Shrink oversized message bodies in-place; returns whether anything changed. */
function pruneOversizedBodies(payload) {
  if (!payload || typeof payload !== "object") return { payload, changed: false };
  const root = payload.state && typeof payload.state === "object" ? payload.state : payload;
  const messages = root.messages;
  if (!messages || typeof messages !== "object") return { payload, changed: false };

  let changed = false;
  const nextMessages = { ...messages };
  for (const [id, msg] of Object.entries(messages)) {
    if (!msg || typeof msg !== "object") continue;
    const html = truncateBody(msg.bodyHtml);
    const text = truncateBody(msg.bodyText);
    if (!html.truncated && !text.truncated) continue;
    changed = true;
    nextMessages[id] = {
      ...msg,
      bodyHtml: html.text,
      bodyText: text.text,
    };
  }
  if (!changed) return { payload, changed: false };

  if (payload.state && typeof payload.state === "object") {
    return {
      payload: { ...payload, state: { ...payload.state, messages: nextMessages } },
      changed: true,
    };
  }
  return { payload: { ...payload, messages: nextMessages }, changed: true };
}

function loadAppState() {
  const file = statePath();
  if (!fs.existsSync(file)) return null;
  try {
    const rawText = fs.readFileSync(file, "utf8");
    const raw = JSON.parse(rawText);
    if (!raw || typeof raw !== "object") return null;
    const { payload, changed } = pruneOversizedBodies(raw);
    if (changed) {
      try {
        saveAppState(payload);
        console.log("Pruned oversized email bodies from app state for safe load");
      } catch (err) {
        console.warn("Could not rewrite pruned state:", err);
      }
    }
    // Return a string so IPC avoids deep-cloning tens of MB of nested objects.
    return JSON.stringify(payload);
  } catch (err) {
    console.warn("loadAppState failed", err);
  }
  return null;
}

function saveAppState(payload) {
  const file = statePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let data = payload;
  if (typeof payload === "string") {
    try {
      data = JSON.parse(payload);
    } catch (err) {
      console.warn("saveAppState: invalid JSON string", err);
      return { ok: false, error: "invalid JSON" };
    }
  }
  const { payload: pruned } = pruneOversizedBodies(data);
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(pruned), "utf8");
  fs.renameSync(tmp, file);
  return { ok: true, path: file };
}

module.exports = {
  loadAppState,
  saveAppState,
  statePath,
  pruneOversizedBodies,
  MAX_BODY_CHARS,
};
