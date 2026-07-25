const fs = require("fs");
const path = require("path");
const { app, dialog, BrowserWindow } = require("electron");

const CHECK_EVERY_MS = 60 * 24 * 60 * 60 * 1000; // 60 days
const GITHUB_OWNER = process.env.ENVISION_MAIL_GH_OWNER || "lespaulporter-bit";
const GITHUB_REPO = process.env.ENVISION_MAIL_GH_REPO || "Envision-Mail-Client";
/** Optional generic feed override (Railway/CDN). Empty = GitHub Releases. */
const DEFAULT_FEED = String(process.env.ENVISION_MAIL_UPDATE_URL || "").replace(/\/$/, "");

function metaPath() {
  return path.join(app.getPath("userData"), "update-check.json");
}

function readMeta() {
  try {
    return JSON.parse(fs.readFileSync(metaPath(), "utf8"));
  } catch {
    return {};
  }
}

function writeMeta(patch) {
  const next = { ...readMeta(), ...patch, updatedAt: new Date().toISOString() };
  fs.mkdirSync(path.dirname(metaPath()), { recursive: true });
  fs.writeFileSync(metaPath(), JSON.stringify(next, null, 2), "utf8");
  return next;
}

function getUpdateFeedUrl() {
  const meta = readMeta();
  const custom = String(meta.feedUrl || DEFAULT_FEED || "").replace(/\/$/, "");
  if (custom) return custom;
  return `github:${GITHUB_OWNER}/${GITHUB_REPO}`;
}

function setUpdateFeedUrl(url) {
  const cleaned = String(url || "").trim().replace(/\/$/, "");
  writeMeta({ feedUrl: cleaned });
  return getUpdateFeedUrl();
}

function applyUpdaterFeed(autoUpdater) {
  const custom = String(readMeta().feedUrl || DEFAULT_FEED || "").replace(/\/$/, "");
  if (custom && !custom.startsWith("github:")) {
    autoUpdater.setFeedURL({ provider: "generic", url: custom });
    return custom;
  }
  autoUpdater.setFeedURL({
    provider: "github",
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
  });
  return `github:${GITHUB_OWNER}/${GITHUB_REPO}`;
}

function dueForCheck(force = false) {
  if (force) return true;
  const last = readMeta().lastCheckAt;
  if (!last) return true;
  const t = Date.parse(last);
  if (!Number.isFinite(t)) return true;
  return Date.now() - t >= CHECK_EVERY_MS;
}

function msUntilNextCheck() {
  const last = readMeta().lastCheckAt;
  if (!last) return 0;
  const t = Date.parse(last);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, CHECK_EVERY_MS - (Date.now() - t));
}

function getUpdateStatus() {
  const meta = readMeta();
  return {
    feedUrl: getUpdateFeedUrl(),
    lastCheckAt: meta.lastCheckAt || null,
    lastResult: meta.lastResult || null,
    lastVersion: meta.lastVersion || null,
    nextCheckDueAt: meta.lastCheckAt
      ? new Date(Date.parse(meta.lastCheckAt) + CHECK_EVERY_MS).toISOString()
      : new Date().toISOString(),
    checkEveryDays: 60,
    autoDownload: true,
  };
}

/**
 * Packaged builds only. Checks at most once every 60 days (unless force),
 * auto-downloads updates, prompts to restart when ready.
 * Updates never touch envision-mail-state.json or accounts on disk.
 */
function setupAutoUpdate({ getMainWindow } = {}) {
  if (!app.isPackaged) {
    return { enabled: false, reason: "dev" };
  }

  let autoUpdater;
  try {
    ({ autoUpdater } = require("electron-updater"));
  } catch (err) {
    console.warn("electron-updater missing", err);
    return { enabled: false, reason: "missing-module" };
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on("error", (err) => {
    console.warn("autoUpdater error", err);
    writeMeta({ lastResult: "error", lastError: String(err && err.message ? err.message : err) });
  });

  autoUpdater.on("update-available", (info) => {
    writeMeta({
      lastResult: "available",
      lastVersion: info && info.version,
    });
  });

  autoUpdater.on("update-not-available", (info) => {
    writeMeta({
      lastResult: "up-to-date",
      lastVersion: (info && info.version) || app.getVersion(),
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    writeMeta({
      lastResult: "downloaded",
      lastVersion: info && info.version,
      downloadedAt: new Date().toISOString(),
    });
    const win = typeof getMainWindow === "function" ? getMainWindow() : BrowserWindow.getFocusedWindow();
    const ver = (info && info.version) || "the latest version";
    dialog
      .showMessageBox(win || undefined, {
        type: "info",
        buttons: ["Restart now", "Later"],
        defaultId: 0,
        cancelId: 1,
        title: "Envision Mail update ready",
        message: `Version ${ver} downloaded.`,
        detail:
          "Restart Envision Mail to install the update. Your mail, accounts, and collections stay on this Mac — updates never overwrite Application Support data.",
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall();
      })
      .catch(() => {});
  });

  const runCheck = async (force = false) => {
    if (!dueForCheck(force)) {
      return { ok: true, skipped: true, status: getUpdateStatus() };
    }
    const feedUrl = applyUpdaterFeed(autoUpdater);
    writeMeta({ lastCheckAt: new Date().toISOString(), lastResult: "checking", feedUrl });
    try {
      const result = await autoUpdater.checkForUpdates();
      return {
        ok: true,
        skipped: false,
        feedUrl,
        updateInfo: result && result.updateInfo ? { version: result.updateInfo.version } : null,
        status: getUpdateStatus(),
      };
    } catch (err) {
      writeMeta({ lastResult: "error", lastError: String(err && err.message ? err.message : err) });
      return { ok: false, error: String(err && err.message ? err.message : err), status: getUpdateStatus() };
    }
  };

  setTimeout(() => {
    runCheck(false).catch((e) => console.warn("update check", e));
  }, 12_000);

  setInterval(() => {
    runCheck(false).catch(() => {});
  }, 24 * 60 * 60 * 1000);

  return {
    enabled: true,
    runCheck,
    getUpdateStatus,
    getUpdateFeedUrl,
    setUpdateFeedUrl,
    msUntilNextCheck,
  };
}

module.exports = {
  setupAutoUpdate,
  getUpdateStatus,
  getUpdateFeedUrl,
  setUpdateFeedUrl,
  dueForCheck,
  CHECK_EVERY_MS,
  DEFAULT_FEED,
  GITHUB_OWNER,
  GITHUB_REPO,
};
