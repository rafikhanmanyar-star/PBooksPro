/**
 * Preload script for secure IPC communication between main process and renderer
 * This exposes a safe API to the renderer process for auto-update functionality
 */
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App version and info
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getPlatform: () => process.platform,
  isElectron: true,

  // Auto-updater controls
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: (immediate = false) => ipcRenderer.invoke('install-update', immediate),
  isUpdateReady: () => ipcRenderer.invoke('is-update-ready'),

  // Update event listeners
  onUpdateChecking: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('update-checking', handler);
    return () => ipcRenderer.removeListener('update-checking', handler);
  },
  
  onUpdateAvailable: (callback) => {
    const handler = (event, info) => callback(info);
    ipcRenderer.on('update-available', handler);
    return () => ipcRenderer.removeListener('update-available', handler);
  },
  
  onUpdateNotAvailable: (callback) => {
    const handler = (event, info) => callback(info);
    ipcRenderer.on('update-not-available', handler);
    return () => ipcRenderer.removeListener('update-not-available', handler);
  },
  
  onUpdateError: (callback) => {
    const handler = (event, error) => callback(error);
    ipcRenderer.on('update-error', handler);
    return () => ipcRenderer.removeListener('update-error', handler);
  },
  
  onDownloadProgress: (callback) => {
    const handler = (event, progress) => callback(progress);
    ipcRenderer.on('download-progress', handler);
    return () => ipcRenderer.removeListener('download-progress', handler);
  },
  
  onUpdateDownloaded: (callback) => {
    const handler = (event, info) => callback(info);
    ipcRenderer.on('update-downloaded', handler);
    return () => ipcRenderer.removeListener('update-downloaded', handler);
  },

  // Window controls (optional, for frameless windows)
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),

  // Database file operations for persistent storage
  readDatabaseFile: () => ipcRenderer.invoke('read-database-file'),
  writeDatabaseFile: (data) => ipcRenderer.invoke('write-database-file', data),
  databaseFileExists: () => ipcRenderer.invoke('database-file-exists'),

  // Listen for menu actions
  onOpenUpdateSettings: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('open-update-settings', handler);
    return () => ipcRenderer.removeListener('open-update-settings', handler);
  },

  onMenuCreateBackup: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('menu-create-backup', handler);
    return () => ipcRenderer.removeListener('menu-create-backup', handler);
  },

  onMenuRestoreBackup: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('menu-restore-backup', handler);
    return () => ipcRenderer.removeListener('menu-restore-backup', handler);
  },

  onOpenHelpSection: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('open-help-section', handler);
    return () => ipcRenderer.removeListener('open-help-section', handler);
  },

  // Database save before close
  onSaveDatabaseNow: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('save-database-now', handler);
    return () => ipcRenderer.removeListener('save-database-now', handler);
  },

  // Notify main process that database save is complete
  notifyDatabaseSaveComplete: (result) => {
    ipcRenderer.send('database-save-complete', result);
  },
});

// Log that preload script has loaded
console.log('Preload script loaded - electronAPI exposed to renderer');

