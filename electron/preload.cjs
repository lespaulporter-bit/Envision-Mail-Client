const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("lesMail", {
  isDesktop: true,
  platform: process.platform,
  presets: () => ipcRenderer.invoke("mail:presets"),
  discover: (email) => ipcRenderer.invoke("mail:discover", email),
  listAccounts: () => ipcRenderer.invoke("mail:listAccounts"),
  saveAccount: (payload) => ipcRenderer.invoke("mail:saveAccount", payload),
  removeAccount: (id) => ipcRenderer.invoke("mail:removeAccount", id),
  testAccount: (payload) => ipcRenderer.invoke("mail:testAccount", payload),
  syncAccount: (id) => ipcRenderer.invoke("mail:syncAccount", id),
  loadAppState: () => ipcRenderer.invoke("app:loadState"),
  saveAppState: (payload) => ipcRenderer.invoke("app:saveState", payload),
  sendMail: (payload) => ipcRenderer.invoke("mail:send", payload),
  moveMessages: (payload) => ipcRenderer.invoke("mail:moveMessages", payload),
  deleteMessages: (payload) => ipcRenderer.invoke("mail:deleteMessages", payload),
  emptyFolder: (payload) => ipcRenderer.invoke("mail:emptyFolder", payload),
  sendCalendarInvites: (payload) => ipcRenderer.invoke("mail:sendCalendarInvites", payload),
  detectTeams: () => ipcRenderer.invoke("mail:detectTeams"),
  openTeamsMeeting: (payload) => ipcRenderer.invoke("mail:openTeamsMeeting", payload || {}),
  syncMacCalendars: () => ipcRenderer.invoke("calendar:syncMac"),
  getAppInfo: () => ipcRenderer.invoke("app:getInfo"),
  getUpdateStatus: () => ipcRenderer.invoke("app:getUpdateStatus"),
  setUpdateFeedUrl: (url) => ipcRenderer.invoke("app:setUpdateFeedUrl", url),
  checkForUpdates: (opts) => ipcRenderer.invoke("app:checkForUpdates", opts || {}),
  installUpdate: () => ipcRenderer.invoke("app:installUpdate"),
  uninstall: () => ipcRenderer.invoke("app:uninstall"),
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
  onRequestUninstall: (cb) => {
    const listener = () => cb();
    ipcRenderer.on("app:request-uninstall", listener);
    return () => ipcRenderer.removeListener("app:request-uninstall", listener);
  },
  onRequestSync: (cb) => {
    const listener = () => cb();
    ipcRenderer.on("mail:request-sync", listener);
    return () => ipcRenderer.removeListener("mail:request-sync", listener);
  },
  onOpenSettings: (cb) => {
    const listener = () => cb();
    ipcRenderer.on("app:open-settings", listener);
    return () => ipcRenderer.removeListener("app:open-settings", listener);
  },
});
