const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { app, dialog, BrowserWindow } = require("electron");

const CHECK_EVERY_MS = 60 * 24 * 60 * 60 * 1000; // 60 days
const GITHUB_OWNER = process.env.ENVISION_MAIL_GH_OWNER || "lespaulporter-bit";
const GITHUB_REPO = process.env.ENVISION_MAIL_GH_REPO || "Envision-Mail-Client";
/** Public GitHub Releases folder that hosts latest-mac.yml + installers */
const GITHUB_LATEST_FEED = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest/download`;
/** Optional generic feed override (Railway/CDN). Empty = GitHub Releases latest/download. */
const DEFAULT_FEED = String(process.env.ENVISION_MAIL_UPDATE_URL || GITHUB_LATEST_FEED).replace(
  /\/$/,
  "",
);

/** Dead / invalid feeds — always fall back to GitHub Releases latest/download */
const STALE_FEED_HOSTS = ["updates.envisiondms.com"];

/** Active updater API (set by setupAutoUpdate) so IPC can reuse the same instance */
let activeUpdater = null;
/** Last downloaded zip/path from electron-updater */
let lastDownloadedFile = null;

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
  // Internal marker / non-http values are invalid for electron-updater generic feeds
  if (cleaned.startsWith("github:") || !/^https?:\/\//i.test(cleaned)) return "";
  return cleaned;
}

/** One-time: wipe saved feed that 404s or is not a real HTTP URL */
function migrateStaleFeedMeta() {
  const meta = readMeta();
  const raw = String(meta.feedUrl || "").trim();
  if (!raw) return;
  if (!isStaleFeed(raw) && sanitizeFeedUrl(raw)) return;
  writeMeta({
    feedUrl: GITHUB_LATEST_FEED,
    lastError: null,
    lastResult: "migrated-to-github-releases",
  });
  console.log("auto-update: migrated feedUrl →", GITHUB_LATEST_FEED);
}

function getUpdateFeedUrl() {
  migrateStaleFeedMeta();
  const meta = readMeta();
  return sanitizeFeedUrl(meta.feedUrl) || sanitizeFeedUrl(DEFAULT_FEED) || GITHUB_LATEST_FEED;
}

function setUpdateFeedUrl(url) {
  const cleaned = sanitizeFeedUrl(url) || GITHUB_LATEST_FEED;
  writeMeta({ feedUrl: cleaned });
  return getUpdateFeedUrl();
}

function applyUpdaterFeed(autoUpdater) {
  migrateStaleFeedMeta();
  const url = getUpdateFeedUrl();
  autoUpdater.setFeedURL({ provider: "generic", url });
  return url;
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
    downloadedFile: lastDownloadedFile || meta.downloadedFile || null,
    nextCheckDueAt: meta.lastCheckAt
      ? new Date(Date.parse(meta.lastCheckAt) + CHECK_EVERY_MS).toISOString()
      : new Date().toISOString(),
    checkEveryDays: 60,
    autoDownload: true,
  };
}

function getAppBundlePath() {
  // process.execPath = .../Envision Mail.app/Contents/MacOS/Envision Mail
  return path.resolve(process.execPath, "..", "..", "..");
}

function findPendingZip() {
  if (lastDownloadedFile && fs.existsSync(lastDownloadedFile)) return lastDownloadedFile;
  const meta = readMeta();
  if (meta.downloadedFile && fs.existsSync(meta.downloadedFile)) return meta.downloadedFile;

  const cacheRoots = [
    path.join(app.getPath("home"), "Library", "Caches", "envision-mail-updater", "pending"),
    path.join(app.getPath("home"), "Library", "Caches", "Envision Mail-updater", "pending"),
    path.join(app.getPath("home"), "Library", "Caches", `${app.getName()}-updater`, "pending"),
  ];
  for (const dir of cacheRoots) {
    if (!fs.existsSync(dir)) continue;
    const zips = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".zip"))
      .map((f) => ({ f, p: path.join(dir, f), m: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m);
    if (zips[0]) return zips[0].p;
  }
  return null;
}

/**
 * Unsigned Mac builds cannot use Squirrel ShipIt (code signature validation fails).
 * Spawn a detached script: wait for this process to die, replace .app, relaunch.
 */
function installMacUpdateAndRelaunch(zipPath) {
  if (!zipPath || !fs.existsSync(zipPath)) {
    throw new Error("Downloaded update zip not found. Check for updates again.");
  }
  const appBundle = getAppBundlePath();
  if (!appBundle.endsWith(".app") || !fs.existsSync(appBundle)) {
    throw new Error(`Could not locate app bundle at ${appBundle}`);
  }

  const logPath = path.join(app.getPath("userData"), "update-install.log");
  const scriptPath = path.join(
    app.getPath("temp"),
    `envision-mail-apply-update-${Date.now()}.sh`,
  );
  const pid = process.pid;

  const script = `#!/bin/bash
set -euo pipefail
APP_PID=${pid}
ZIP=${JSON.stringify(zipPath)}
DEST=${JSON.stringify(appBundle)}
LOG=${JSON.stringify(logPath)}
exec >>"$LOG" 2>&1
echo "---- $(date -u +%Y-%m-%dT%H:%M:%SZ) apply update ----"
echo "pid=$APP_PID zip=$ZIP dest=$DEST"

# Wait for main process to exit (and any stubborn children)
for i in $(seq 1 150); do
  if ! kill -0 "$APP_PID" 2>/dev/null; then
    break
  fi
  sleep 0.2
done
sleep 0.6
# Ensure no Envision Mail helpers keep the bundle locked
pkill -f "/Envision Mail.app/Contents/MacOS/" 2>/dev/null || true
sleep 0.4

TMP=$(mktemp -d /tmp/envision-mail-update.XXXXXX)
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

echo "Extracting…"
ditto -x -k "$ZIP" "$TMP"
NEW_APP=$(find "$TMP" -name "*.app" -type d -maxdepth 3 | head -1)
if [ -z "$NEW_APP" ] || [ ! -d "$NEW_APP" ]; then
  echo "ERROR: no .app inside zip"
  exit 1
fi
echo "New app: $NEW_APP"

PARENT=$(dirname "$DEST")
STAGE="$PARENT/.EnvisionMailUpdateStaging.app"
rm -rf "$STAGE"
ditto "$NEW_APP" "$STAGE"
# Clear quarantine / broken partial signatures so Gatekeeper doesn't block relaunch
xattr -cr "$STAGE" 2>/dev/null || true

# Atomic-ish swap
rm -rf "$DEST"
mv "$STAGE" "$DEST"
xattr -cr "$DEST" 2>/dev/null || true

echo "Installed. Opening…"
open "$DEST"
echo "Done."
rm -f ${JSON.stringify(scriptPath)}
`;

  fs.writeFileSync(scriptPath, script, { mode: 0o755 });
  writeMeta({
    lastResult: "installing",
    lastError: null,
    downloadedFile: zipPath,
    installStartedAt: new Date().toISOString(),
  });

  const child = spawn("/bin/bash", [scriptPath], {
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();

  // Force-kill UI so ShipIt isn't needed and the bundle unlocks
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      win.removeAllListeners("close");
      win.destroy();
    } catch {
      /* ignore */
    }
  }
  app.exit(0);
}

function installPendingUpdateAndRelaunch() {
  if (process.platform === "darwin") {
    const zip = findPendingZip();
    installMacUpdateAndRelaunch(zip);
    return { ok: true, method: "mac-replace" };
  }
  // Windows / Linux: standard electron-updater path
  try {
    const { autoUpdater } = require("electron-updater");
    autoUpdater.quitAndInstall(false, true);
    return { ok: true, method: "quitAndInstall" };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

function getActiveUpdater() {
  return activeUpdater;
}

/**
 * Packaged builds only. Checks at most once every 60 days (unless force),
 * auto-downloads updates, prompts to restart when ready.
 * Updates never touch envision-mail-state.json or accounts on disk.
 */
function setupAutoUpdate({ getMainWindow } = {}) {
  if (!app.isPackaged) {
    activeUpdater = { enabled: false, reason: "dev", runCheck: async () => ({ ok: false, error: "dev" }) };
    return activeUpdater;
  }

  migrateStaleFeedMeta();

  let autoUpdater;
  try {
    ({ autoUpdater } = require("electron-updater"));
  } catch (err) {
    console.warn("electron-updater missing", err);
    activeUpdater = { enabled: false, reason: "missing-module" };
    return activeUpdater;
  }

  autoUpdater.autoDownload = true;
  // ShipIt signature checks break unsigned Mac builds — we apply updates ourselves on darwin
  autoUpdater.autoInstallOnAppQuit = process.platform !== "darwin";
  autoUpdater.allowDowngrade = false;

  autoUpdater.on("error", (err) => {
    console.warn("autoUpdater error", err);
    const msg = String(err && err.message ? err.message : err);
    // Signature failure after a successful download — keep downloaded state so Restart still works
    if (/code signature|ShipIt|did not pass validation/i.test(msg) && findPendingZip()) {
      writeMeta({
        lastResult: "downloaded",
        lastError: msg,
        downloadedFile: findPendingZip(),
      });
      return;
    }
    writeMeta({ lastResult: "error", lastError: msg });
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
    const downloadedFile =
      (info && info.downloadedFile) ||
      (typeof info === "object" && info.path) ||
      findPendingZip();
    lastDownloadedFile = downloadedFile || lastDownloadedFile;
    writeMeta({
      lastResult: "downloaded",
      lastVersion: info && info.version,
      downloadedAt: new Date().toISOString(),
      downloadedFile: lastDownloadedFile,
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
        if (response !== 0) return;
        try {
          installPendingUpdateAndRelaunch();
        } catch (err) {
          writeMeta({
            lastResult: "error",
            lastError: String(err && err.message ? err.message : err),
          });
          dialog.showErrorBox(
            "Update install failed",
            String(err && err.message ? err.message : err),
          );
        }
      })
      .catch(() => {});
  });

  const runCheck = async (force = false) => {
    if (!dueForCheck(force)) {
      return { ok: true, skipped: true, status: getUpdateStatus() };
    }
    const feedUrl = applyUpdaterFeed(autoUpdater);
    writeMeta({
      lastCheckAt: new Date().toISOString(),
      lastResult: "checking",
      feedUrl,
      lastError: null,
    });
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
      // Retry once against the known-good GitHub Releases feed
      if (/404|latest-mac\.yml|envisiondms|Invalid URL/i.test(msg) && feedUrl !== GITHUB_LATEST_FEED) {
        writeMeta({ feedUrl: GITHUB_LATEST_FEED });
        try {
          const retryFeed = applyUpdaterFeed(autoUpdater);
          const retry = await autoUpdater.checkForUpdates();
          writeMeta({ lastResult: "up-to-date", lastError: null, feedUrl: retryFeed });
          return {
            ok: true,
            skipped: false,
            feedUrl: retryFeed,
            updateInfo: retry && retry.updateInfo ? { version: retry.updateInfo.version } : null,
            status: getUpdateStatus(),
          };
        } catch (err2) {
          writeMeta({
            lastResult: "error",
            lastError: String(err2 && err2.message ? err2.message : err2),
            feedUrl: GITHUB_LATEST_FEED,
          });
          return {
            ok: false,
            error: String(err2 && err2.message ? err2.message : err2),
            status: getUpdateStatus(),
          };
        }
      }
      writeMeta({ lastResult: "error", lastError: msg, feedUrl: GITHUB_LATEST_FEED });
      return { ok: false, error: msg, status: getUpdateStatus() };
    }
  };

  setTimeout(() => {
    runCheck(false).catch((e) => console.warn("update check", e));
  }, 12_000);

  setInterval(() => {
    runCheck(false).catch(() => {});
  }, 24 * 60 * 60 * 1000);

  activeUpdater = {
    enabled: true,
    runCheck,
    getUpdateStatus,
    getUpdateFeedUrl,
    setUpdateFeedUrl,
    msUntilNextCheck,
    installPendingUpdateAndRelaunch,
  };
  return activeUpdater;
}

module.exports = {
  setupAutoUpdate,
  getUpdateStatus,
  getUpdateFeedUrl,
  setUpdateFeedUrl,
  dueForCheck,
  getActiveUpdater,
  installPendingUpdateAndRelaunch,
  findPendingZip,
  CHECK_EVERY_MS,
  DEFAULT_FEED,
  GITHUB_OWNER,
  GITHUB_REPO,
  migrateStaleFeedMeta,
};
