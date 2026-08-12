const { ipcMain, app, dialog, shell } = require("electron");
const fs = require("fs");
const path = require("path");
const { PRESETS } = require("./presets.cjs");
const accounts = require("./accounts-store.cjs");
const {
  testImap,
  fetchMail,
  searchMail,
  fetchOlderMail,
  moveMessages,
  deleteMessages,
  emptyFolder,
} = require("./imap.cjs");
const { getAttachmentData, saveAttachment, openAttachment } = require("./attachments.cjs");
const { testSmtp, sendMail, sendPlainMail, sendCalendarInvites } = require("./smtp.cjs");
const { performUnsubscribe } = require("./unsubscribe.cjs");
const appState = require("./app-state.cjs");
const autoUpdate = require("./auto-update.cjs");
const { detectMicrosoftTeams, openTeamsNewMeeting } = require("./calendar-invite.cjs");
const { discoverMailSettings } = require("./discover.cjs");
const { syncSystemCalendars, syncMacCalendars } = require("./system-calendar.cjs");
const { importIcsFiles } = require("./ics-import.cjs");

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
    try {
      const saved = accounts.upsertAccount(input);
      return { ok: true, account: saved };
    } catch (err) {
      return { ok: false, error: err.message || String(err), code: err.code };
    }
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
    const realAuthFail = (msg) =>
      /authentication failed|invalid credentials|invalid user.*password|535|534|APPLICATION-SPECIFIC PASSWORD|password missing|re-enter|app password/i.test(
        String(msg || ""),
      );
    const imap = await testImap(account);
    if (!imap.ok) {
      if (payload.id && realAuthFail(imap.error)) {
        accounts.touchAccount(payload.id, {
          lastError: imap.error,
          verifiedAt: null,
          needsPassword: true,
        });
      }
      return { ok: false, stage: "imap", error: imap.error, suggested: account };
    }
    const smtp = await testSmtp(account);
    if (!smtp.ok) {
      if (payload.id && realAuthFail(smtp.error)) {
        accounts.touchAccount(payload.id, {
          lastError: smtp.error,
          verifiedAt: null,
          needsPassword: true,
        });
      }
      return { ok: false, stage: "smtp", error: smtp.error, suggested: account };
    }
    if (payload.id) {
      accounts.touchAccount(payload.id, {
        lastError: null,
        needsPassword: false,
        verifiedAt: new Date().toISOString(),
      });
    }
    return { ok: true, imap, smtp, suggested: account };
  });

  ipcMain.handle("mail:syncAccount", async (_e, id) => {
    const account = accounts.getAccountSecret(id);
    if (!account) return { ok: false, error: "Account not found" };
    if (!account.password) {
      accounts.touchAccount(id, {
        lastError: "App password missing — re-enter in Settings → Accounts.",
        verifiedAt: null,
        needsPassword: true,
      });
      return { ok: false, error: "App password missing — re-enter in Settings → Accounts." };
    }
    try {
      const messages = await fetchMail(account, {
        inboxLimit: 100,
        sentLimit: 50,
        spamLimit: 40,
        trashLimit: 40,
      });
      accounts.touchAccount(id, {
        lastSyncAt: new Date().toISOString(),
        lastError: null,
        needsPassword: false,
        verifiedAt: new Date().toISOString(),
      });
      return {
        ok: true,
        accountId: id,
        email: account.email,
        displayName: account.name,
        messages,
      };
    } catch (err) {
      const message = err.message || String(err);
      // Only real credential failures require re-entering an app password.
      // Network blips (EHOSTUNREACH, timeouts, etc.) must NOT reopen app-password UI.
      const authFail =
        Boolean(err && err.authenticationFailed) ||
        /authentication failed|invalid credentials|invalid user.*password|535|534|APPLICATION-SPECIFIC PASSWORD|safeStorage|ENEEDPASSWORD|password missing|re-enter/i.test(
          message,
        );
      if (authFail) {
        accounts.touchAccount(id, {
          lastError: message,
          verifiedAt: null,
          needsPassword: true,
        });
      } else {
        accounts.touchAccount(id, {
          lastError: message,
        });
      }
      return { ok: false, error: message };
    }
  });

  ipcMain.handle("mail:searchMail", async (_e, payload) => {
    const id = payload?.accountId;
    const account = accounts.getAccountSecret(id);
    if (!account) return { ok: false, error: "Account not found", messages: [] };
    if (!account.password) {
      return { ok: false, error: "App password missing — re-enter in Settings → Accounts.", messages: [] };
    }
    try {
      const result = await searchMail(account, {
        query: payload?.query,
        limit: payload?.limit,
      });
      return {
        ...result,
        accountId: id,
        email: account.email,
        displayName: account.name,
      };
    } catch (err) {
      return { ok: false, error: err.message || String(err), messages: [] };
    }
  });

  ipcMain.handle("mail:fetchOlderMail", async (_e, payload) => {
    const id = payload?.accountId;
    const account = accounts.getAccountSecret(id);
    if (!account) return { ok: false, error: "Account not found", messages: [] };
    if (!account.password) {
      return { ok: false, error: "App password missing — re-enter in Settings → Accounts.", messages: [] };
    }
    try {
      const result = await fetchOlderMail(account, {
        folder: payload?.folder || "inbox",
        skipNewest: payload?.skipNewest,
        limit: payload?.limit,
      });
      return {
        ...result,
        accountId: id,
        email: account.email,
        displayName: account.name,
      };
    } catch (err) {
      return { ok: false, error: err.message || String(err), messages: [] };
    }
  });

  ipcMain.handle("app:getUpdateStatus", async () => autoUpdate.getUpdateStatus());
  ipcMain.handle("app:setUpdateFeedUrl", async (_e, url) => ({ ok: true, feedUrl: autoUpdate.setUpdateFeedUrl(url) }));
  ipcMain.handle("app:checkForUpdates", async (_e, opts) => {
    try {
      const force = Boolean(opts && opts.force);
      if (!require("electron").app.isPackaged) {
        return { ok: false, error: "Update checks run in the packaged app.", status: autoUpdate.getUpdateStatus() };
      }
      const active = autoUpdate.getActiveUpdater && autoUpdate.getActiveUpdater();
      if (active && typeof active.runCheck === "function") {
        return active.runCheck(force);
      }
      // Fallback if setup hasn't finished yet
      if (!force && !autoUpdate.dueForCheck(false)) {
        return { ok: true, skipped: true, status: autoUpdate.getUpdateStatus() };
      }
      const { autoUpdater } = require("electron-updater");
      autoUpdater.autoDownload = true;
      autoUpdater.setFeedURL({ provider: "generic", url: autoUpdate.getUpdateFeedUrl() });
      const result = await autoUpdater.checkForUpdates();
      return {
        ok: true,
        skipped: false,
        updateInfo: result && result.updateInfo ? { version: result.updateInfo.version } : null,
        status: autoUpdate.getUpdateStatus(),
      };
    } catch (err) {
      return { ok: false, error: err.message || String(err), status: autoUpdate.getUpdateStatus() };
    }
  });
  ipcMain.handle("app:installUpdate", async () => {
    try {
      if (!require("electron").app.isPackaged) {
        return { ok: false, error: "Install runs in the packaged app." };
      }
      const result = await autoUpdate.installPendingUpdateAndRelaunch();
      return result;
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("app:loadState", async () => appState.loadAppState());
  ipcMain.handle("app:saveState", async (_e, payload) => appState.saveAppState(payload));

  ipcMain.handle("mail:unsubscribe", async (_e, payload) => {
    try {
      const p = payload || {};
      const account = p.accountId ? accounts.getAccountSecret(p.accountId) : null;
      const result = await performUnsubscribe({
        account,
        sendPlainMail,
        unsubscribeHttpUrl: p.unsubscribeHttpUrl,
        unsubscribeMailto: p.unsubscribeMailto,
        unsubscribeOneClick: Boolean(p.unsubscribeOneClick),
      });
      return result;
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("mail:send", async (_e, payload) => {
    let account;
    try {
      account = accounts.getAccountSecret(payload.accountId);
    } catch (err) {
      return {
        ok: false,
        error:
          "Could not read the saved app password. Open Settings → Accounts and re-enter the app password, then Save.",
      };
    }
    if (!account) return { ok: false, error: "Account not found" };
    if (!account.password) {
      return {
        ok: false,
        error:
          "App password missing or could not be decrypted. Open Settings → Accounts and paste a new app password for this account, then Save.",
      };
    }
    try {
      const result = await sendMail(account, payload);
      return result;
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("mail:moveMessages", async (_e, payload) => {
    const account = accounts.getAccountSecret(payload?.accountId);
    if (!account) return { ok: false, error: "Account not found" };
    return moveMessages(account, {
      sourceFolder: payload.sourceFolder || "inbox",
      destFolder: payload.destFolder || "trash",
      uids: payload.uids || [],
    });
  });

  ipcMain.handle("mail:deleteMessages", async (_e, payload) => {
    const account = accounts.getAccountSecret(payload?.accountId);
    if (!account) return { ok: false, error: "Account not found" };
    return deleteMessages(account, {
      folder: payload.folder || "trash",
      uids: payload.uids || [],
    });
  });

  ipcMain.handle("mail:emptyFolder", async (_e, payload) => {
    const account = accounts.getAccountSecret(payload?.accountId);
    if (!account) return { ok: false, error: "Account not found" };
    const folder = payload?.folder === "spam" ? "spam" : "trash";
    return emptyFolder(account, { folder });
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

  ipcMain.handle("mail:getAttachment", async (_e, payload) => {
    try {
      return await getAttachmentData(payload || {});
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("mail:saveAttachment", async (event, payload) => {
    try {
      return await saveAttachment(payload || {}, { win: event.sender.getOwnerBrowserWindow() });
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("mail:openAttachment", async (_e, payload) => {
    try {
      return await openAttachment(payload || {});
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("mail:detectTeams", async () => {
    try {
      return { ok: true, ...detectMicrosoftTeams() };
    } catch (err) {
      return { ok: false, installed: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("mail:openTeamsMeeting", async (_e, payload) => {
    try {
      return await openTeamsNewMeeting(payload || {});
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("calendar:syncMac", async () => syncMacCalendars());
  ipcMain.handle("calendar:syncSystem", async () => syncSystemCalendars());
  ipcMain.handle("calendar:importIcs", async () => importIcsFiles());

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
      title: "Uninstall Envision Mail",
      message: "Remove Envision Mail and all local app data?",
      detail:
        "This deletes saved IMAP/SMTP accounts, preferences, and cache for Envision Mail. Your actual email on the server is not deleted.",
    });
    if (result.response !== 1) return { ok: false, cancelled: true };

    const targets = [
      app.getPath("userData"),
      path.join(app.getPath("appData"), "envision-mail"),
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
    const raw = String(url || "").trim();
    // Never hand mailto: to Outlook / system mail — compose stays inside Envision Mail
    if (/^mailto:/i.test(raw)) {
      const { BrowserWindow } = require("electron");
      const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) {
        win.webContents.send("mail:open-mailto", raw);
        if (win.isMinimized()) win.restore();
        win.focus();
      }
      return { ok: true, mailto: true };
    }
    await shell.openExternal(raw);
    return { ok: true };
  });
}

module.exports = { registerMailIpc };
