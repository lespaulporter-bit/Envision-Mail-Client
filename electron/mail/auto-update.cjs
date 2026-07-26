const fs = require("fs");
const path = require("path");
const { app, dialog, BrowserWindow } = require("electron");

const CHECK_EVERY_MS = 60 * 24 * 60 * 60 * 1000; // 60 days
const GITHUB_OWNER = process.env.ENVISION_MAIL_GH_OWNER || "lespaulporter-bit";
const GITHUB_REPO = process.env.ENVISION_MAIL_GH_REPO || "Envision-Mail-Client";
/** Optional generic feed override (Railway/CDN). Empty = GitHub Releases. */
const DEFAULT_FEED = String(process.env.ENVISION_MAIL_UPDATE_URL || "").replace(/\/$/, "");

/** Dead feeds that 404 — always fall back to GitHub Releases */
const STALE_FEED_HOSTS = ["updates.envisiondms.com"];

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

function isStaleFeed(url) {
  const u = String(url || "").toLowerCase();
  if (!u) return false;
  return STALE_FEED_HOSTS.some((host) => u.includes(host));
}

function sanitizeFeedUrl(url) {
  const cleaned = String(url || "").trim().replace(/\/$/, "");
  if (!cleaned || isStaleFeed(cleaned)) return "";
  return cleaned;
}

/** One-time: wipe saved feed that points at the dead CDN so GitHub is used */
function migrateStaleFeedMeta() {
  const meta = readMeta();
  if (!isStaleFeed(meta.feedUrl)) return;
  writeMeta({
    feedUrl: "",
    lastError: null,
    lastResult: "migrated-to-github",
  });
  console.log("auto-update: cleared stale feedUrl → GitHub Releases");
}

function getUpdateFeedUrl() {
  const meta = readMeta();
  const custom = sanitizeFeedUrl(meta.feedUrl || DEFAULT_FEED);
  if (custom) return custom;
  return `github:${GITHUB_OWNER}/${GITHUB_REPO}`;
}

function setUpdateFeedUrl(url) {
  const cleaned = sanitizeFeedUrl(url);
  writeMeta({ feedUrl: cleaned });
  return getUpdateFeedUrl();
}

function applyUpdaterFeed(autoUpdater) {
  migrateStaleFeedMeta();
  const custom = sanitizeFeedUrl(readMeta().feedUrl || DEFAULT_FEED);
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
  migrateStaleFeedMeta();
  const meta = readMeta();
  return {
    feedUrl: getUpdateFeedUrl(),
    lastCheckAt: meta.lastCheckAt || null,
    lastResult: meta.lastResult || null,
    lastVersion: meta.lastVersion || null,
    lastError: meta.lastError || null,
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

  migrateStaleFeedMeta();

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
      lastError: null,
    });
  });

  autoUpdater.on("update-not-available", (info) => {
    writeMeta({
      lastResult: "up-to-date",
      lastVersion: (info && info.version) || app.getVersion(),
      lastError: null,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    writeMeta({
      lastResult: "downloaded",
      lastVersion: info && info.version,
      downloadedAt: new Date().toISOString(),
      lastError: null,
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
    writeMeta({ lastCheckAt: new Date().toISOString(), lastResult: "checking", feedUrl, lastError: null });
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
      const msg = String(err && err.message ? err.message : err);
      // If a bad generic feed still fails, force GitHub and retry once
      if (/404|latest-mac\.yml|envisiondms/i.test(msg)) {
        writeMeta({ feedUrl: "" });
        try {
          applyUpdaterFeed(autoUpdater);
          const retry = await autoUpdater.checkForUpdates();
          writeMeta({ lastResult: "up-to-date", lastError: null });
          return {
            ok: true,
            skipped: false,
            feedUrl: `github:${GITHUB_OWNER}/${GITHUB_REPO}`,
            updateInfo: retry && retry.updateInfo ? { version: retry.updateInfo.version } : null,
            status: getUpdateStatus(),
          };
        } catch (err2) {
          writeMeta({ lastResult: "error", lastError: String(err2 && err2.message ? err2.message : err2) });
          return {
            ok: false,
            error: String(err2 && err2.message ? err2.message : err2),
            status: getUpdateStatus(),
          };
        }
      }
      writeMeta({ lastResult: "error", lastError: msg });
      return { ok: false, error: msg, status: getUpdateStatus() };
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
  migrateStaleFeedMeta,
};
