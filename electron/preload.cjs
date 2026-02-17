/**
 * PBooks Pro - Electron Preload Script
 * Exposes safe APIs to the renderer process.
 */

const { contextBridge, ipcRenderer } = require('electron');

// Unregister any service workers that may show "Offline / app is not cached" when loading from file://
if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    if (regs.length > 0) {
      Promise.all(regs.map((r) => r.unregister()))
        .then(() => window.location.reload())
        .catch(() => {});
    }
  });
}

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  isElectron: true,
});

contextBridge.exposeInMainWorld('sqliteBridge', {
  // Async IPC (for sync queue, locks)
  query: (sql, params) => ipcRenderer.invoke('sqlite:query', sql, params),
  run: (sql, params) => ipcRenderer.invoke('sqlite:run', sql, params),
  exec: (sql) => ipcRenderer.invoke('sqlite:exec', sql),
  transaction: (operations) => ipcRenderer.invoke('sqlite:transaction', operations),
  getDbPath: () => ipcRenderer.invoke('sqlite:getDbPath'),
  // Sync IPC for main DB (blocks renderer - keeps DatabaseService sync API)
  querySync: (sql, params) => ipcRenderer.sendSync('sqlite:querySync', sql, params),
  runSync: (sql, params) => ipcRenderer.sendSync('sqlite:runSync', sql, params),
  execSync: (sql) => ipcRenderer.sendSync('sqlite:execSync', sql),
  // File storage for sql.js (fallback when native DB not used)
  loadBlob: () => ipcRenderer.invoke('sqlite:loadBlob'),
  saveBlob: (data) => ipcRenderer.invoke('sqlite:saveBlob', data),
  blobExists: () => ipcRenderer.invoke('sqlite:blobExists'),
  clearBlob: () => ipcRenderer.invoke('sqlite:clearBlob'),
  resetAndDeleteDb: () => ipcRenderer.invoke('sqlite:resetAndDeleteDb'),
  readDbBytesSync: () => ipcRenderer.sendSync('sqlite:readDbBytesSync'),
});
