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
  sendMail: (payload) => ipcRenderer.invoke("mail:send", payload),
  sendCalendarInvites: (payload) => ipcRenderer.invoke("mail:sendCalendarInvites", payload),
  generateTeamsUrl: (title) => ipcRenderer.invoke("mail:generateTeamsUrl", title),
  getAppInfo: () => ipcRenderer.invoke("app:getInfo"),
  uninstall: () => ipcRenderer.invoke("app:uninstall"),
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
