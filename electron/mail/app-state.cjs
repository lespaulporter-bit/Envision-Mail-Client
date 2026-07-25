const fs = require("fs");
const path = require("path");
const { app } = require("electron");

function statePath() {
  return path.join(app.getPath("userData"), "envision-mail-state.json");
}

function loadAppState() {
  const file = statePath();
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    // Accept either { state, version } (zustand) or bare state
    if (raw && typeof raw === "object") return raw;
  } catch (err) {
    console.warn("loadAppState failed", err);
  }
  return null;
}

function saveAppState(payload) {
  const file = statePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(payload), "utf8");
  fs.renameSync(tmp, file);
  return { ok: true, path: file };
}

module.exports = { loadAppState, saveAppState, statePath };
