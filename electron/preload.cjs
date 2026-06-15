/**
 * PBooks Pro - Electron Preload Script
 * Exposes safe APIs to the renderer process.
 * Legacy sqliteBridge/companyBridge load only when PBOOKS_ENABLE_SQLITE=1.
 */

const { contextBridge, ipcRenderer } = require('electron');

/** @deprecated Legacy SQLite — set only via electron:offline:* scripts */
const SQLITE_ENABLED = process.env.PBOOKS_ENABLE_SQLITE === '1';

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
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  onUpdateStatus: (callback) => {
    const handler = (_event, ...args) => callback(...args);
    ipcRenderer.on('update-status', handler);
    return () => ipcRenderer.removeListener('update-status', handler);
  },
  startUpdateDownload: () => ipcRenderer.invoke('start-update-download'),
  quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
  /** Subscribe to window-close: main process sends this before closing so renderer can save state. Call notifyReadyToClose() when done. */
  onPrepareToClose: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('app:prepare-to-close', handler);
    return () => ipcRenderer.removeListener('app:prepare-to-close', handler);
  },
  /** Notify main process that save is complete and the window can close. */
  notifyReadyToClose: () => ipcRenderer.send('app:ready-to-close'),
  /** Restore keyboard focus to the renderer (fixes stuck typing on Windows without minimize/restore). */
  focusWebContents: () => ipcRenderer.invoke('electron:focus-web-contents'),
  /** Open installed WhatsApp (whatsapp://send?…) without loading the web landing page. */
  openWhatsAppSendUrl: (url) => ipcRenderer.invoke('shell:open-whatsapp-send', url),
  /**
   * Save PDF bytes to temp, copy file to clipboard for paste into WhatsApp, open WhatsApp chat.
   * phoneDigits: digits only (e.g. 923001234567), or empty string for generic compose.
   */
  sharePdfOpenWhatsApp: (payload) => ipcRenderer.invoke('whatsapp:share-pdf-open-chat', payload),
  /** Spell checker: local JSON + Chromium dictionary (offline). */
  spellGetSettings: () => ipcRenderer.invoke('spell:get-settings'),
  spellSetSettings: (partial) => ipcRenderer.invoke('spell:set-settings', partial),
  /** Stability layer: main-process heartbeat (watchdog). */
  sendStabilityHeartbeat: () => ipcRenderer.send('stability:heartbeat'),
  stabilityLog: (level, message, detail) => ipcRenderer.invoke('stability:log', { level, message, detail }),
  stabilityDbCheckpoint: () => ipcRenderer.invoke('stability:db-checkpoint'),
});

if (SQLITE_ENABLED) {
  contextBridge.exposeInMainWorld('sqliteBridge', {
    query: (sql, params) => ipcRenderer.invoke('sqlite:query', sql, params),
    run: (sql, params) => ipcRenderer.invoke('sqlite:run', sql, params),
    exec: (sql) => ipcRenderer.invoke('sqlite:exec', sql),
    transaction: (operations) => ipcRenderer.invoke('sqlite:transaction', operations),
    getDbPath: () => ipcRenderer.invoke('sqlite:getDbPath'),
    commitAllPending: () => ipcRenderer.invoke('sqlite:commitAllPending'),
    querySync: (sql, params) => ipcRenderer.sendSync('sqlite:querySync', sql, params),
    runSync: (sql, params) => ipcRenderer.sendSync('sqlite:runSync', sql, params),
    execSync: (sql) => ipcRenderer.sendSync('sqlite:execSync', sql),
    loadBlob: () => ipcRenderer.invoke('sqlite:loadBlob'),
    saveBlob: (data) => ipcRenderer.invoke('sqlite:saveBlob', data),
    blobExists: () => ipcRenderer.invoke('sqlite:blobExists'),
    clearBlob: () => ipcRenderer.invoke('sqlite:clearBlob'),
    resetAndDeleteDb: () => ipcRenderer.invoke('sqlite:resetAndDeleteDb'),
    readDbBytesSync: () => ipcRenderer.sendSync('sqlite:readDbBytesSync'),
    integrityStatus: () => ipcRenderer.invoke('sqlite:integrityStatus'),
    schemaHealth: () => ipcRenderer.invoke('sqlite:schemaHealth'),
    isReadOnly: () => ipcRenderer.invoke('sqlite:isReadOnly'),
  });

  contextBridge.exposeInMainWorld('companyBridge', {
    list: () => ipcRenderer.invoke('company:list'),
    create: (companyName) => ipcRenderer.invoke('company:create', companyName),
    open: (companyId) => ipcRenderer.invoke('company:open', companyId),
    getActive: () => ipcRenderer.invoke('company:getActive'),
    delete: (companyId) => ipcRenderer.invoke('company:delete', companyId),
    checkCredentials: (companyId) => ipcRenderer.invoke('company:checkCredentials', companyId),
    login: (companyId, username, password) => ipcRenderer.invoke('company:login', companyId, username, password),
    setPassword: (companyId, userId, newPassword) => ipcRenderer.invoke('company:setPassword', companyId, userId, newPassword),
    updateUserDisplayTimezone: (companyId, userId, displayTimezone) =>
      ipcRenderer.invoke('company:updateUserDisplayTimezone', companyId, userId, displayTimezone),
    prepareForBackup: (companyId) => ipcRenderer.invoke('company:prepareForBackup', companyId),
    backup: (companyId) => ipcRenderer.invoke('company:backup', companyId),
    listBackups: (companyId) => ipcRenderer.invoke('company:listBackups', companyId),
    restore: (backupFilePath) => ipcRenderer.invoke('company:restore', backupFilePath),
    selectBackupFile: () => ipcRenderer.invoke('company:selectBackupFile'),
    closeForCreation: () => ipcRenderer.invoke('company:closeForCreation'),
    selectCompanyFile: () => ipcRenderer.invoke('company:selectCompanyFile'),
    openFile: (filePath) => ipcRenderer.invoke('company:openFile', filePath),
    getCompanyNameFromFile: (filePath) => ipcRenderer.invoke('company:getCompanyNameFromFile', filePath),
    copyExternalWithNewName: (sourceFilePath, newCompanyName) =>
      ipcRenderer.invoke('company:copyExternalWithNewName', sourceFilePath, newCompanyName),
    listUsers: () => ipcRenderer.invoke('company:listUsers'),
    createUser: (data) => ipcRenderer.invoke('company:createUser', data),
    updateUser: (userId, data) => ipcRenderer.invoke('company:updateUser', userId, data),
    deleteUser: (userId) => ipcRenderer.invoke('company:deleteUser', userId),
    resetPassword: (userId) => ipcRenderer.invoke('company:resetPassword', userId),
  });
} else {
  const sqliteDisabledMsg =
    'Legacy SQLite is disabled (Architecture v2.1). Use apiClient → PostgreSQL.';
  const sqliteDisabledAsync = () => Promise.reject(new Error(sqliteDisabledMsg));
  const sqliteDisabledSync = () => {
    throw new Error(sqliteDisabledMsg);
  };

  contextBridge.exposeInMainWorld('sqliteBridge', {
    query: sqliteDisabledAsync,
    run: sqliteDisabledAsync,
    exec: sqliteDisabledAsync,
    transaction: sqliteDisabledAsync,
    getDbPath: sqliteDisabledAsync,
    commitAllPending: sqliteDisabledAsync,
    querySync: sqliteDisabledSync,
    runSync: sqliteDisabledSync,
    execSync: sqliteDisabledSync,
    loadBlob: sqliteDisabledAsync,
    saveBlob: sqliteDisabledAsync,
    blobExists: sqliteDisabledAsync,
    clearBlob: sqliteDisabledAsync,
    resetAndDeleteDb: sqliteDisabledAsync,
    readDbBytesSync: sqliteDisabledSync,
    integrityStatus: sqliteDisabledAsync,
    schemaHealth: sqliteDisabledAsync,
    isReadOnly: sqliteDisabledAsync,
  });

  contextBridge.exposeInMainWorld('companyBridge', {
    list: sqliteDisabledAsync,
    create: sqliteDisabledAsync,
    open: sqliteDisabledAsync,
    getActive: sqliteDisabledAsync,
    delete: sqliteDisabledAsync,
    checkCredentials: sqliteDisabledAsync,
    login: sqliteDisabledAsync,
    setPassword: sqliteDisabledAsync,
    updateUserDisplayTimezone: sqliteDisabledAsync,
    prepareForBackup: sqliteDisabledAsync,
    backup: sqliteDisabledAsync,
    listBackups: sqliteDisabledAsync,
    restore: sqliteDisabledAsync,
    selectBackupFile: sqliteDisabledAsync,
    closeForCreation: sqliteDisabledAsync,
    selectCompanyFile: sqliteDisabledAsync,
    openFile: sqliteDisabledAsync,
    getCompanyNameFromFile: sqliteDisabledAsync,
    copyExternalWithNewName: sqliteDisabledAsync,
    listUsers: sqliteDisabledAsync,
    createUser: sqliteDisabledAsync,
    updateUser: sqliteDisabledAsync,
    deleteUser: sqliteDisabledAsync,
    resetPassword: sqliteDisabledAsync,
  });
}
