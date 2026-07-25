const { ipcMain, app, dialog, shell } = require("electron");
const fs = require("fs");
const path = require("path");
const { PRESETS } = require("./presets.cjs");
const accounts = require("./accounts-store.cjs");
const { testImap, fetchInbox } = require("./imap.cjs");
const { testSmtp, sendMail, sendCalendarInvites } = require("./smtp.cjs");
const { generateTeamsMeetingUrl } = require("./calendar-invite.cjs");
const { discoverMailSettings } = require("./discover.cjs");
const { syncMacCalendars } = require("./mac-calendar.cjs");

function registerMailIpc() {
  ipcMain.handle("mail:presets", async () => PRESETS);

  ipcMain.handle("mail:discover", async (_e, email) => discoverMailSettings(email));

  ipcMain.handle("mail:listAccounts", async () => accounts.listAccounts());

  ipcMain.handle("mail:saveAccount", async (_e, payload) => {
    const input = payload || {};
    if (!String(input.email || "").includes("@")) {
      return { ok: false, error: "Email address is required." };
    }
    if (!String(input.imapHost || "").trim()) {
      // Auto-discover when saving without hosts (common Custom mistake)
      try {
        const found = await discoverMailSettings(input.email);
        if (found.ok && found.imapHost) {
          Object.assign(input, {
            provider: input.provider === "custom" && found.provider ? found.provider : input.provider,
            imapHost: found.imapHost,
            imapPort: found.imapPort,
            imapSecure: found.imapSecure,
            smtpHost: found.smtpHost,
            smtpPort: found.smtpPort,
            smtpSecure: found.smtpSecure,
            username: input.username || found.username || input.email,
          });
        }
      } catch {
        /* ignore */
      }
    }
    if (!String(input.imapHost || "").trim() || !String(input.smtpHost || "").trim()) {
      return {
        ok: false,
        error: "IMAP and SMTP hosts are required. Click Auto-detect or choose Stackmail / your provider.",
      };
    }
    const saved = accounts.upsertAccount(input);
    return { ok: true, account: saved };
  });

  ipcMain.handle("mail:removeAccount", async (_e, id) => {
    accounts.removeAccount(id);
    return { ok: true };
  });

  ipcMain.handle("mail:testAccount", async (_e, payload) => {
    const existing = payload.id ? accounts.getAccountSecret(payload.id) : null;
    let account = {
      ...(existing || {}),
      ...payload,
      password: payload.password || existing?.password || "",
      email: String(payload.email || existing?.email || "").trim(),
      username: String(payload.username || existing?.username || payload.email || "").trim(),
      imapHost: String(payload.imapHost || existing?.imapHost || "").trim(),
      smtpHost: String(payload.smtpHost || existing?.smtpHost || "").trim(),
    };
    if (!account.password) {
      return { ok: false, error: "Password is required to test the connection." };
    }
    if (!account.imapHost) {
      const found = await discoverMailSettings(account.email);
      if (found.ok && found.imapHost) {
        account = {
          ...account,
          provider: found.provider || account.provider,
          imapHost: found.imapHost,
          imapPort: found.imapPort,
          imapSecure: found.imapSecure,
          smtpHost: found.smtpHost,
          smtpPort: found.smtpPort,
          smtpSecure: found.smtpSecure,
          username: account.username || found.username,
        };
      }
    }
    if (!account.imapHost) {
      return {
        ok: false,
        stage: "imap",
        error: "IMAP host is empty. Click Auto-detect (your domain uses Stackmail/20i, Gmail, etc.) or enter the host.",
      };
    }
    const imap = await testImap(account);
    if (!imap.ok) return { ok: false, stage: "imap", error: imap.error, suggested: account };
    const smtp = await testSmtp(account);
    if (!smtp.ok) return { ok: false, stage: "smtp", error: smtp.error, suggested: account };
    return { ok: true, imap, smtp, suggested: account };
  });

  ipcMain.handle("mail:syncAccount", async (_e, id) => {
    const account = accounts.getAccountSecret(id);
    if (!account) return { ok: false, error: "Account not found" };
    try {
      const messages = await fetchInbox(account, { limit: 50 });
      accounts.touchAccount(id, { lastSyncAt: new Date().toISOString(), lastError: null });
      return {
        ok: true,
        accountId: id,
        email: account.email,
        displayName: account.name,
        messages,
      };
    } catch (err) {
      const message = err.message || String(err);
      accounts.touchAccount(id, { lastError: message });
      return { ok: false, error: message };
    }
  });

  ipcMain.handle("mail:send", async (_e, payload) => {
    const account = accounts.getAccountSecret(payload.accountId);
    if (!account) return { ok: false, error: "Account not found" };
    try {
      const result = await sendMail(account, payload);
      return result;
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("mail:sendCalendarInvites", async (_e, payload) => {
    const account = accounts.getAccountSecret(payload.accountId);
    if (!account) return { ok: false, error: "Account not found" };
    try {
      return await sendCalendarInvites(account, payload.event);
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("mail:generateTeamsUrl", async (_e, title) => ({
    ok: true,
    url: generateTeamsMeetingUrl(title || "Les Mail meeting"),
  }));

  ipcMain.handle("calendar:syncMac", async () => syncMacCalendars());

  ipcMain.handle("app:getInfo", async () => ({
    name: app.getName(),
    version: app.getVersion(),
    userData: app.getPath("userData"),
    platform: process.platform,
    isPackaged: app.isPackaged,
  }));

  ipcMain.handle("app:uninstall", async (event) => {
    const win = event.sender.getOwnerBrowserWindow();
    const result = await dialog.showMessageBox(win || undefined, {
      type: "warning",
      buttons: ["Cancel", "Quit & Uninstall"],
      defaultId: 0,
      cancelId: 0,
      title: "Uninstall Les Mail",
      message: "Remove Les Mail and all local app data?",
      detail:
        "This deletes saved IMAP/SMTP accounts, preferences, and cache for Les Mail. Your actual email on the server is not deleted.",
    });
    if (result.response !== 1) return { ok: false, cancelled: true };

    const targets = [
      app.getPath("userData"),
      path.join(app.getPath("appData"), "les-mail"),
      path.join(app.getPath("cache"), app.getName()),
    ];

    // Quit after short delay so renderer gets the response
    setTimeout(() => {
      for (const target of targets) {
        try {
          if (target && fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      }

      if (process.platform === "darwin" && app.isPackaged) {
        const appPath = path.resolve(app.getAppPath(), "..", "..", "..");
        // Move .app to Trash via osascript for a clean Finder uninstall feel
        try {
          const { execFileSync } = require("child_process");
          execFileSync("osascript", ["-e", `tell application "Finder" to delete POSIX file ${JSON.stringify(appPath)}`]);
        } catch {
          try {
            fs.rmSync(appPath, { recursive: true, force: true });
          } catch {
            /* ignore */
          }
        }
      }

      app.exit(0);
    }, 400);

    return { ok: true };
  });

  ipcMain.handle("app:showInstallers", async () => {
    const release = path.join(app.getAppPath(), "..", "..", "..", "release");
    const dir = fs.existsSync(release) ? release : app.getPath("desktop");
    shell.openPath(dir);
    return { ok: true };
  });

  ipcMain.handle("shell:openExternal", async (_e, url) => {
    await shell.openExternal(url);
    return { ok: true };
  });
}

module.exports = { registerMailIpc };
