const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('apiServerUI', {
  getAppVersion: () => ipcRenderer.invoke('server:get-app-version'),
  getState: () => ipcRenderer.invoke('server:get-state'),
  startServer: () => ipcRenderer.invoke('server:start'),
  stopServer: () => ipcRenderer.invoke('server:stop'),
  getLogs: () => ipcRenderer.invoke('server:get-logs'),
  openEnvFolder: () => ipcRenderer.invoke('server:open-env-folder'),
  checkForUpdate: () => ipcRenderer.invoke('server:check-update'),
  downloadAndInstall: () => ipcRenderer.invoke('server:download-and-install'),
  onServerEvent: (callback) => {
    const handler = (_e, payload) => callback(payload);
    ipcRenderer.on('server:event', handler);
    return () => ipcRenderer.removeListener('server:event', handler);
  },
  onDownloadProgress: (callback) => {
    const handler = (_e, payload) => callback(payload);
    ipcRenderer.on('server:download-progress', handler);
    return () => ipcRenderer.removeListener('server:download-progress', handler);
  },
});
