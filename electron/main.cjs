const { app, BrowserWindow, shell, Menu, nativeTheme, dialog } = require("electron");
const path = require("path");
const http = require("http");
const fs = require("fs");

// Must run before IMAP / updater / TLS traffic — swallows EHOSTUNREACH etc. so they
// never become Electron's "JavaScript error in the main process" dialog.
try {
  require("./mail/safe-process.cjs").installSafeProcessHandlers();
} catch {
  /* optional */
}

let registerMailIpc;
try {
  require("imapflow");
  require("mailparser");
  require("nodemailer");
  require("encoding-japanese");
  ({ registerMailIpc } = require("./mail/ipc.cjs"));
} catch (err) {
  app.whenReady().then(() => {
    dialog.showErrorBox(
      "Envision Mail failed to start",
      `A required mail module is missing from the app package.\n\n${err.message}\n\nReinstall Envision Mail 2.2+ from the release folder.`,
    );
    app.quit();
  });
}

// Product identity
app.setName("Envision Mail");

// Import Les Mail accounts + local data before windows open (keeps app passwords when possible)
let migrateFromLesMail = () => ({ skipped: true });
try {
  ({ migrateFromLesMail } = require("./mail/migrate-from-les-mail.cjs"));
} catch {
  /* optional */
}

let autoUpdateApi = null;
let setupAutoUpdate = () => ({ enabled: false });
try {
  ({ setupAutoUpdate } = require("./mail/auto-update.cjs"));
} catch {
  /* optional */
}

const isDev = !app.isPackaged;
const DEFAULT_WIDTH = 1180;
const DEFAULT_HEIGHT = 800;
const MIN_WIDTH = 860;
const MIN_HEIGHT = 560;

let mainWindow = null;
let staticServer = null;
let staticPort = 0;
/** mailto: received before the renderer is ready */
let pendingMailto = null;

function isMailtoUrl(url) {
  return /^mailto:/i.test(String(url || "").trim());
}

function deliverMailto(url) {
  const raw = String(url || "").trim();
  if (!isMailtoUrl(raw)) return false;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("mail:open-mailto", raw);
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    pendingMailto = null;
    return true;
  }
  pendingMailto = raw;
  return true;
}

function registerMailtoProtocolClient() {
  try {
    if (process.defaultApp) {
      if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient("mailto", process.execPath, [path.resolve(process.argv[1])]);
      }
    } else {
      app.setAsDefaultProtocolClient("mailto");
    }
  } catch (err) {
    console.warn("mailto protocol registration:", err);
  }
}

function getOutDir() {
  if (isDev) return path.join(__dirname, "..", "out");
  return path.join(process.resourcesPath, "out");
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".ico": "image/x-icon",
      ".woff": "font/woff",
      ".woff2": "font/woff2",
      ".txt": "text/plain; charset=utf-8",
      ".map": "application/json",
    }[ext] || "application/octet-stream"
  );
}

function resolveStaticPath(urlPath, outDir) {
  let pathname = decodeURIComponent((urlPath || "/").split("?")[0] || "/");
  // Strip leading slashes so URL paths never become absolute on Windows.
  pathname = pathname.replace(/^[/\\]+/, "");
  if (!pathname) {
    pathname = "index.html";
  } else if (/[/\\]$/.test(pathname)) {
    pathname = `${pathname.replace(/[/\\]+$/, "")}/index.html`;
  }

  const root = path.resolve(outDir);
  const tryResolve = (rel) => {
    const candidate = path.resolve(root, rel);
    const relToRoot = path.relative(root, candidate);
    if (!relToRoot || relToRoot.startsWith("..") || path.isAbsolute(relToRoot)) {
      // Allow exact root only if someone asks for it; otherwise reject escapes.
      if (candidate === root) return null;
      if (relToRoot.startsWith("..") || path.isAbsolute(relToRoot)) return null;
    }
    return candidate;
  };

  if (!path.extname(pathname)) {
    const asDir = tryResolve(path.join(pathname, "index.html"));
    if (asDir && fs.existsSync(asDir)) return asDir;
    const asHtml = tryResolve(`${pathname}.html`);
    if (asHtml && fs.existsSync(asHtml)) return asHtml;
  }
  return tryResolve(pathname) || path.join(root, "404.html");
}

function startStaticServer() {
  const outDir = getOutDir();
  if (!fs.existsSync(outDir)) {
    throw new Error(`Static export missing at ${outDir}. Run npm run build:web first.`);
  }

  return new Promise((resolve, reject) => {
    staticServer = http.createServer((req, res) => {
      try {
        const root = path.resolve(outDir);
        const filePath = resolveStaticPath(req.url || "/", outDir);
        const rel = path.relative(root, filePath);
        const outside = !filePath || rel.startsWith("..") || path.isAbsolute(rel);
        if (outside || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          // Prefer the static 404 page so client navigations don't blank out with a raw "Not found".
          const notFound = path.join(root, "404.html");
          if (fs.existsSync(notFound)) {
            res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
            fs.createReadStream(notFound).pipe(res);
            return;
          }
          res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("Not found");
          return;
        }
        res.writeHead(200, { "Content-Type": contentType(filePath) });
        fs.createReadStream(filePath).pipe(res);
      } catch (err) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(String(err));
      }
    });

    // Fixed port — random ports made localStorage look "wiped" on every launch
    const FIXED_PORT = Number(process.env.ENVISION_MAIL_PORT) || 17885;
    let port = FIXED_PORT;
    const onError = (err) => {
      if (err && err.code === "EADDRINUSE" && port < FIXED_PORT + 20) {
        port += 1;
        staticServer.listen(port, "127.0.0.1");
        return;
      }
      reject(err);
    };
    staticServer.on("error", onError);
    staticServer.listen(port, "127.0.0.1", () => {
      staticServer.off("error", onError);
      staticPort = staticServer.address().port;
      resolve(staticPort);
    });
  });
}

function createWindow(startUrl) {
  mainWindow = new BrowserWindow({
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#1d2d35" : "#fbfcfd",
    title: "Envision Mail",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // needed for some native deps via IPC only; renderer still isolated
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isMailtoUrl(url)) {
      deliverMailto(url);
      return { action: "deny" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isMailtoUrl(url)) {
      event.preventDefault();
      deliverMailto(url);
      return;
    }
    // Keep the app on its local server; open http(s) externally
    if (/^https?:/i.test(url) && !url.startsWith(`http://127.0.0.1:${staticPort}`)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
  mainWindow.webContents.on("did-finish-load", () => {
    if (pendingMailto) deliverMailto(pendingMailto);
  });
  mainWindow.loadURL(startUrl);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function buildMenu() {
  const template = [
    ...(process.platform === "darwin"
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              {
                label: "Uninstall Envision Mail…",
                click: async () => {
                  if (mainWindow) mainWindow.webContents.send("app:request-uninstall");
                },
              },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "Open MoneyBox $",
          accelerator: "CmdOrCtrl+1",
          click: () => mainWindow?.loadURL(`http://127.0.0.1:${staticPort}/app/`),
        },
        {
          label: "Fetch new mail now",
          accelerator: "CmdOrCtrl+Shift+N",
          click: () => mainWindow?.webContents.send("mail:request-sync"),
        },
        {
          label: "Sync Mail",
          accelerator: "CmdOrCtrl+R",
          click: () => mainWindow?.webContents.send("mail:request-sync"),
        },
        { type: "separator" },
        {
          label: "Uninstall Envision Mail…",
          click: () => mainWindow?.webContents.send("app:request-uninstall"),
        },
        process.platform === "darwin" ? { role: "close" } : { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { label: "Window", submenu: [{ role: "minimize" }, { role: "zoom" }, { role: "front" }] },
    {
      label: "Help",
      submenu: [
        {
          label: "Accounts & IMAP/SMTP setup",
          click: () => mainWindow?.webContents.send("app:open-settings"),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  // macOS: cold-start / click mailto: while running
  app.on("open-url", (event, url) => {
    event.preventDefault();
    deliverMailto(url);
  });

  app.on("second-instance", (_event, argv) => {
    const mailtoArg = (argv || []).find((a) => isMailtoUrl(a));
    if (mailtoArg) deliverMailto(mailtoArg);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // Capture mailto from argv before ready (Windows / Linux)
  for (const arg of process.argv) {
    if (isMailtoUrl(arg)) {
      pendingMailto = arg;
      break;
    }
  }

  app.whenReady().then(async () => {
    registerMailtoProtocolClient();
    try {
      const mig = migrateFromLesMail();
      if (mig && (mig.accounts || mig.localStorage)) {
        console.log("Migrated from Les Mail:", mig);
      }
    } catch (e) {
      console.warn("Les Mail migration:", e);
    }
    try {
      const store = require("./mail/accounts-store.cjs");
      const n = store.clearUndecryptablePasswords();
      if (n) console.log(`Cleared ${n} undecryptable app password(s) — user must re-enter`);
      const dedupe = store.dedupeAccountsByEmail();
      if (dedupe.removed) console.log(`Removed ${dedupe.removed} duplicate email account(s)`);
    } catch (e) {
      console.warn("Account cleanup:", e);
    }
    if (!registerMailIpc) return;
    registerMailIpc();
    buildMenu();

    let startUrl;
    try {
      if (isDev && process.env.ELECTRON_START_URL) {
        startUrl = process.env.ELECTRON_START_URL;
      } else {
        await startStaticServer();
        startUrl = `http://127.0.0.1:${staticPort}/app/`;
      }
      createWindow(startUrl);
      autoUpdateApi = setupAutoUpdate({ getMainWindow: () => mainWindow });
    } catch (err) {
      dialog.showErrorBox("Envision Mail failed to start", String(err));
      app.quit();
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0 && startUrl) createWindow(startUrl);
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (staticServer) {
    staticServer.close();
    staticServer = null;
  }
});
