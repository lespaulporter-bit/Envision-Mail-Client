const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
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
/** Last downloaded zip/path from electron-updater or direct download */
let lastDownloadedFile = null;
let getMainWindowFn = null;

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
  if (cleaned.startsWith("github:") || !/^https?:\/\//i.test(cleaned)) return "";
  return cleaned;
}

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
    currentVersion: app.getVersion(),
    nextCheckDueAt: meta.lastCheckAt
      ? new Date(Date.parse(meta.lastCheckAt) + CHECK_EVERY_MS).toISOString()
      : new Date().toISOString(),
    checkEveryDays: 60,
    autoDownload: true,
  };
}

function getAppBundlePath() {
  return path.resolve(process.execPath, "..", "..", "..");
}

function pendingDir() {
  return path.join(app.getPath("home"), "Library", "Caches", "envision-mail-updater", "pending");
}

function isNewerVersion(remote, local) {
  const parts = (v) =>
    String(v || "0")
      .replace(/^v/i, "")
      .split(/[.+-]/)
      .map((n) => parseInt(n, 10) || 0);
  const a = parts(remote);
  const b = parts(local);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

function fetchUrl(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 8) {
      reject(new Error("Too many redirects"));
      return;
    }
    const lib = String(url).startsWith("http://") ? http : https;
    const req = lib.get(
      url,
      {
        headers: {
          "User-Agent": "Envision-Mail-Updater",
          Accept: "*/*",
        },
      },
      (res) => {
        const code = res.statusCode || 0;
        if ([301, 302, 303, 307, 308].includes(code) && res.headers.location) {
          const next = new URL(res.headers.location, url).toString();
          res.resume();
          fetchUrl(next, redirects + 1).then(resolve, reject);
          return;
        }
        if (code >= 400) {
          res.resume();
          reject(new Error(`HTTP ${code} for ${url}`));
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.setTimeout(120_000, () => {
      req.destroy(new Error("Request timeout"));
    });
  });
}

async function downloadToFile(url, dest) {
  const buf = await fetchUrl(url);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.partial`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, dest);
  return dest;
}

function parseLatestMacYml(text) {
  const versionMatch = String(text).match(/^version:\s*['"]?([^\s'"#]+)/m);
  const version = versionMatch ? versionMatch[1] : null;
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const files = [];
  const fileBlocks = String(text).split(/\n\s*-\s+url:/).slice(1);
  for (const block of fileBlocks) {
    const urlLine = block.split("\n")[0] || "";
    const name = urlLine.trim().replace(/^['"]|['"]$/g, "");
    const sizeMatch = block.match(/\n\s*size:\s*(\d+)/);
    const size = sizeMatch ? Number(sizeMatch[1]) : 0;
    if (name) files.push({ name, size });
  }
  let file =
    files.find((f) => f.name.includes(`mac-${arch}`) && f.name.endsWith(".zip")) ||
    files.find((f) => f.name.endsWith(".zip")) ||
    null;
  const pathMatch = String(text).match(/^path:\s*['"]?([^\s'"#]+)/m);
  if (!file && pathMatch) {
    file = { name: pathMatch[1], size: 0 };
  }
  return { version, file };
}

async function fetchLatestReleaseInfo() {
  const feed = getUpdateFeedUrl();
  const ymlUrl = `${feed}/latest-mac.yml`;
  const buf = await fetchUrl(ymlUrl);
  const parsed = parseLatestMacYml(buf.toString("utf8"));
  if (!parsed.version || !parsed.file?.name) {
    throw new Error("Could not parse latest-mac.yml from update feed");
  }
  return {
    version: parsed.version,
    fileName: parsed.file.name,
    size: parsed.file.size || 0,
    url: `${feed}/${parsed.file.name}`,
    feed,
  };
}

function clearStalePendingZips(keepFileName) {
  const dir = pendingDir();
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".zip")) continue;
    if (keepFileName && name === keepFileName) continue;
    try {
      fs.unlinkSync(path.join(dir, name));
    } catch {
      /* ignore */
    }
  }
  // Also remove ambiguous update.zip leftover from ShipIt
  const rootZip = path.join(path.dirname(dir), "update.zip");
  try {
    if (fs.existsSync(rootZip)) fs.unlinkSync(rootZip);
  } catch {
    /* ignore */
  }
}

function findPendingZip(expectedVersion) {
  if (lastDownloadedFile && fs.existsSync(lastDownloadedFile)) {
    if (!expectedVersion || String(lastDownloadedFile).includes(expectedVersion)) {
      return lastDownloadedFile;
    }
  }
  const meta = readMeta();
  if (meta.downloadedFile && fs.existsSync(meta.downloadedFile)) {
    if (!expectedVersion || String(meta.downloadedFile).includes(expectedVersion)) {
      return meta.downloadedFile;
    }
  }

  const dir = pendingDir();
  if (!fs.existsSync(dir)) return null;
  const zips = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".zip"))
    .map((f) => ({ f, p: path.join(dir, f), m: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);

  if (expectedVersion) {
    const match = zips.find((z) => z.f.includes(expectedVersion));
    if (match) return match.p;
    return null; // never install a stale different version
  }
  return zips[0]?.p || null;
}

/**
 * Direct GitHub download — bypasses ShipIt (unsigned Mac builds fail signature checks).
 */
async function ensureLatestMacZip({ promptInstall = false } = {}) {
  writeMeta({
    lastCheckAt: new Date().toISOString(),
    lastResult: "checking",
    feedUrl: getUpdateFeedUrl(),
    lastError: null,
  });
  const info = await fetchLatestReleaseInfo();
  const current = app.getVersion();
  writeMeta({ lastVersion: info.version, feedUrl: info.feed });

  if (!isNewerVersion(info.version, current)) {
    clearStalePendingZips(null);
    writeMeta({ lastResult: "up-to-date", lastError: null, lastVersion: info.version });
    return { ok: true, upToDate: true, version: info.version, currentVersion: current };
  }

  writeMeta({ lastResult: "downloading", lastVersion: info.version });
  const dest = path.join(pendingDir(), info.fileName);
  fs.mkdirSync(pendingDir(), { recursive: true });
  clearStalePendingZips(info.fileName);

  const needsDownload =
    !fs.existsSync(dest) ||
    (info.size > 0 && fs.statSync(dest).size !== info.size) ||
    fs.statSync(dest).size < 1_000_000;

  if (needsDownload) {
    console.log("auto-update: downloading", info.url);
    await downloadToFile(info.url, dest);
    if (info.size > 0 && fs.statSync(dest).size !== info.size) {
      throw new Error(
        `Downloaded size mismatch for ${info.fileName} (got ${fs.statSync(dest).size}, expected ${info.size})`,
      );
    }
  }

  lastDownloadedFile = dest;
  writeMeta({
    lastResult: "downloaded",
    lastVersion: info.version,
    downloadedAt: new Date().toISOString(),
    downloadedFile: dest,
    lastError: null,
  });

  if (promptInstall) {
    promptRestartToInstall(info.version);
  }

  return {
    ok: true,
    upToDate: false,
    version: info.version,
    currentVersion: current,
    downloadedFile: dest,
  };
}

function promptRestartToInstall(ver) {
  const win =
    (typeof getMainWindowFn === "function" ? getMainWindowFn() : null) ||
    BrowserWindow.getFocusedWindow();
  dialog
    .showMessageBox(win || undefined, {
      type: "info",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "Envision Mail update ready",
      message: `Version ${ver} is ready to install.`,
      detail:
        "Restart Envision Mail to apply the update. Your mail, accounts, and collections stay on this Mac — updates never overwrite Application Support data.",
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

for i in $(seq 1 150); do
  if ! kill -0 "$APP_PID" 2>/dev/null; then
    break
  fi
  sleep 0.2
done
sleep 0.6
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
xattr -cr "$STAGE" 2>/dev/null || true

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

async function installPendingUpdateAndRelaunch() {
  if (process.platform === "darwin") {
    const meta = readMeta();
    let zip = findPendingZip(meta.lastVersion);
    // If we don't have the right zip yet, download it first
    if (!zip) {
      const ensured = await ensureLatestMacZip({ promptInstall: false });
      if (ensured.upToDate) {
        return { ok: false, error: "Already on the latest version." };
      }
      zip = ensured.downloadedFile || findPendingZip(ensured.version);
    }
    if (!zip) throw new Error("Update zip missing after download.");
    installMacUpdateAndRelaunch(zip);
    return { ok: true, method: "mac-replace" };
  }
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
 * Packaged builds only.
 * macOS: direct GitHub zip download + app replace (ShipIt cannot install unsigned builds).
 * Windows/Linux: electron-updater.
 */
function setupAutoUpdate({ getMainWindow } = {}) {
  getMainWindowFn = getMainWindow || null;

  if (!app.isPackaged) {
    activeUpdater = {
      enabled: false,
      reason: "dev",
      runCheck: async () => ({ ok: false, error: "dev", status: getUpdateStatus() }),
    };
    return activeUpdater;
  }

  migrateStaleFeedMeta();

  const runCheck = async (force = false) => {
    if (!dueForCheck(force)) {
      return { ok: true, skipped: true, status: getUpdateStatus() };
    }

    // macOS: never rely on ShipIt
    if (process.platform === "darwin") {
      try {
        const result = await ensureLatestMacZip({ promptInstall: true });
        return {
          ok: true,
          skipped: false,
          feedUrl: getUpdateFeedUrl(),
          updateInfo: result.upToDate ? null : { version: result.version },
          status: getUpdateStatus(),
        };
      } catch (err) {
        const msg = String(err && err.message ? err.message : err);
        writeMeta({ lastResult: "error", lastError: msg, feedUrl: GITHUB_LATEST_FEED });
        return { ok: false, error: msg, status: getUpdateStatus() };
      }
    }

    let autoUpdater;
    try {
      ({ autoUpdater } = require("electron-updater"));
    } catch (err) {
      return { ok: false, error: "electron-updater missing", status: getUpdateStatus() };
    }

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowDowngrade = false;

    const feedUrl = applyUpdaterFeed(autoUpdater);
    writeMeta({
      lastCheckAt: new Date().toISOString(),
      lastResult: "checking",
      feedUrl,
      lastError: null,
    });
    try {
      const result = await autoUpdater.checkForUpdates();
      const remoteVer = result && result.updateInfo && result.updateInfo.version;
      if (remoteVer && !isNewerVersion(remoteVer, app.getVersion())) {
        writeMeta({ lastResult: "up-to-date", lastVersion: remoteVer, lastError: null });
        return {
          ok: true,
          skipped: false,
          feedUrl,
          updateInfo: null,
          status: getUpdateStatus(),
        };
      }
      return {
        ok: true,
        skipped: false,
        feedUrl,
        updateInfo: remoteVer ? { version: remoteVer } : null,
        status: getUpdateStatus(),
      };
    } catch (err) {
      const msg = String(err && err.message ? err.message : err);
      writeMeta({ lastResult: "error", lastError: msg, feedUrl: GITHUB_LATEST_FEED });
      return { ok: false, error: msg, status: getUpdateStatus() };
    }
  };

  // Wire electron-updater events for non-Mac (and Mac leftover downloads)
  try {
    const { autoUpdater } = require("electron-updater");
    autoUpdater.autoDownload = process.platform !== "darwin";
    autoUpdater.autoInstallOnAppQuit = process.platform !== "darwin";
    autoUpdater.on("error", (err) => {
      console.warn("autoUpdater error", err);
      const msg = String(err && err.message ? err.message : err);
      if (/code signature|ShipIt|did not pass validation/i.test(msg)) {
        // Fall back to direct Mac download path
        if (process.platform === "darwin") {
          ensureLatestMacZip({ promptInstall: true }).catch((e) =>
            writeMeta({ lastResult: "error", lastError: String(e.message || e) }),
          );
          return;
        }
      }
      writeMeta({ lastResult: "error", lastError: msg });
    });
    autoUpdater.on("update-downloaded", (info) => {
      if (process.platform === "darwin") return; // Mac uses ensureLatestMacZip
      const downloadedFile = (info && info.downloadedFile) || findPendingZip();
      lastDownloadedFile = downloadedFile || lastDownloadedFile;
      writeMeta({
        lastResult: "downloaded",
        lastVersion: info && info.version,
        downloadedAt: new Date().toISOString(),
        downloadedFile: lastDownloadedFile,
        lastError: null,
      });
      promptRestartToInstall((info && info.version) || "the latest version");
    });
  } catch {
    /* optional */
  }

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
    ensureLatestMacZip,
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
  ensureLatestMacZip,
  CHECK_EVERY_MS,
  DEFAULT_FEED,
  GITHUB_OWNER,
  GITHUB_REPO,
  migrateStaleFeedMeta,
};
