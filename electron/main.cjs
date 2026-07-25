const { app, BrowserWindow, shell, Menu, nativeTheme, dialog } = require("electron");
const path = require("path");
const http = require("http");
const fs = require("fs");

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
      "Les Mail failed to start",
      `A required mail module is missing from the app package.\n\n${err.message}\n\nReinstall Les Mail 3.0+ from the release folder.`,
    );
    app.quit();
  });
}

// Product identity
app.setName("Les Mail");

const isDev = !app.isPackaged;
const DEFAULT_WIDTH = 1180;
const DEFAULT_HEIGHT = 800;
const MIN_WIDTH = 860;
const MIN_HEIGHT = 560;

let mainWindow = null;
let staticServer = null;
let staticPort = 0;

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
  let pathname = decodeURIComponent((urlPath || "/").split("?")[0]);
  if (pathname.endsWith("/")) pathname += "index.html";
  if (!path.extname(pathname)) {
    const asDir = path.join(outDir, pathname, "index.html");
    if (fs.existsSync(asDir)) return asDir;
    const asHtml = path.join(outDir, `${pathname}.html`);
    if (fs.existsSync(asHtml)) return asHtml;
  }
  return path.join(outDir, pathname);
}

function startStaticServer() {
  const outDir = getOutDir();
  if (!fs.existsSync(outDir)) {
    throw new Error(`Static export missing at ${outDir}. Run npm run build:web first.`);
  }

  return new Promise((resolve, reject) => {
    staticServer = http.createServer((req, res) => {
      try {
        const filePath = resolveStaticPath(req.url || "/", outDir);
        if (!filePath.startsWith(outDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
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

    staticServer.listen(0, "127.0.0.1", () => {
      staticPort = staticServer.address().port;
      resolve(staticPort);
    });
    staticServer.on("error", reject);
  });
}

function createWindow(startUrl) {
  mainWindow = new BrowserWindow({
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#1d2d35" : "#fbfcfd",
    title: "Les Mail",
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
    shell.openExternal(url);
    return { action: "deny" };
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
                label: "Uninstall Les Mail…",
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
          label: "Open LesBox",
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
          label: "Uninstall Les Mail…",
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
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
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
    } catch (err) {
      dialog.showErrorBox("Les Mail failed to start", String(err));
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
