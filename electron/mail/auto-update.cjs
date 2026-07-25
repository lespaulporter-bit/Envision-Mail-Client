const fs = require("fs");
const path = require("path");

function electron() {
  return require("electron");
}

const CHECK_EVERY_MS = 60 * 24 * 60 * 60 * 1000; // 60 days
const DEFAULT_FEED =
  process.env.ENVISION_MAIL_UPDATE_URL ||
  "https://updates.envisiondms.com/envision-mail";

function metaPath() {
  return path.join(electron().app.getPath("userData"), "update-check.json");
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
  return String(meta.feedUrl || DEFAULT_FEED).replace(/\/$/, "");
}

function setUpdateFeedUrl(url) {
  const cleaned = String(url || "").trim().replace(/\/$/, "");
  writeMeta({ feedUrl: cleaned || DEFAULT_FEED });
  return getUpdateFeedUrl();
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
 */
function setupAutoUpdate({ getMainWindow } = {}) {
  if (!electron().app.isPackaged) {
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

  const applyFeed = () => {
    const url = getUpdateFeedUrl();
    autoUpdater.setFeedURL({ provider: "generic", url });
    return url;
  };

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
      lastVersion: (info && info.version) || electron().app.getVersion(),
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    writeMeta({
      lastResult: "downloaded",
      lastVersion: info && info.version,
      downloadedAt: new Date().toISOString(),
    });
    const win = typeof getMainWindow === "function" ? getMainWindow() : electron().BrowserWindow.getFocusedWindow();
    const ver = (info && info.version) || "the latest version";
    dialog
      .showMessageBox(win || undefined, {
        type: "info",
        buttons: ["Restart now", "Later"],
        defaultId: 0,
        cancelId: 1,
        title: "Envision Mail update ready",
        message: `Version ${ver} downloaded.`,
        detail: "Restart Envision Mail to install the update. Your mail data stays on this Mac.",
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
    const feedUrl = applyFeed();
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

  // Startup: check if 60 days elapsed
  setTimeout(() => {
    runCheck(false).catch((e) => console.warn("update check", e));
  }, 12_000);

  // While running, re-evaluate once a day in case the app stays open past 60 days
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
};
