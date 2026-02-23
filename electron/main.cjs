/**
 * PBooks Pro - Electron Main Process
 * Desktop wrapper for the PBooks Pro web application.
 */

const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const sqliteBridge = require('./sqliteBridge.cjs');

const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--enable-logging');

let mainWindow = null;
let autoUpdater = null;
let updateCheckIntervalId = null;
let lastNotifiedUpdateVersion = null;

if (app.isPackaged) {
  try {
    autoUpdater = require('electron-updater').autoUpdater;
  } catch (_) {}
}

app.commandLine.appendSwitch('disable-features', 'TranslateUI');
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-sync');
app.commandLine.appendSwitch('disk-cache-dir', path.join(app.getPath('userData'), 'Cache'));

sqliteBridge.setupHandlers();

function createWindow() {
  const iconName = process.platform === 'darwin' ? 'icon.icns' : 'icon.ico';
  const iconPath = path.join(__dirname, 'assets', iconName);
  const iconOption = fs.existsSync(iconPath) ? { icon: iconPath } : {};

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'PBooks Pro',
    ...iconOption,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false,
    },
    show: false,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  const appPath = app.getAppPath();
  const indexHtml = path.join(appPath, 'dist', 'index.html');

  if (process.env.ELECTRON_LOAD_URL) {
    mainWindow.loadURL(process.env.ELECTRON_LOAD_URL);
  } else {
    mainWindow.loadFile(indexHtml);
  }
}

function sendUpdateStatus(...args) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', ...args);
  }
}

function setupUpdaterIPC() {
  ipcMain.handle('get-app-version', () => app.getVersion());

  ipcMain.handle('check-for-updates', async () => {
    if (!app.isPackaged || !autoUpdater) {
      sendUpdateStatus({
        status: 'unavailable',
        message: 'Updates only work in the installed app.',
      });
      return;
    }
    try {
      sendUpdateStatus({ status: 'checking' });
      await autoUpdater.checkForUpdates();
    } catch (err) {
      sendUpdateStatus({
        status: 'error',
        message: err && err.message ? err.message : String(err),
      });
    }
  });

  ipcMain.handle('start-update-download', () => {
    if (autoUpdater) return autoUpdater.downloadUpdate();
  });

  ipcMain.handle('quit-and-install', () => {
    if (autoUpdater) autoUpdater.quitAndInstall(false, true);
  });

  if (autoUpdater) {
    autoUpdater.autoDownload = false;
    autoUpdater.logger = console;

    autoUpdater.on('update-available', (info) => {
      console.log('[AutoUpdater] Update available:', info.version);
      sendUpdateStatus({ status: 'available', version: info.version });

      if (info.version && info.version !== lastNotifiedUpdateVersion) {
        lastNotifiedUpdateVersion = info.version;
        const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
        dialog
          .showMessageBox(win, {
            type: 'info',
            title: 'Update available',
            message: `PBooks Pro ${info.version} is available.`,
            detail: 'Would you like to download and install it now?',
            buttons: ['Download and install', 'Later'],
            defaultId: 0,
            cancelId: 1,
          })
          .then(({ response }) => {
            if (response === 0) autoUpdater.downloadUpdate();
          });
      }
    });

    autoUpdater.on('update-not-available', () => {
      console.log('[AutoUpdater] No update available.');
      sendUpdateStatus({ status: 'not-available' });
    });

    autoUpdater.on('download-progress', (p) => {
      console.log(`[AutoUpdater] Download progress: ${p.percent.toFixed(1)}%`);
      sendUpdateStatus({ status: 'downloading', percent: p.percent });
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log('[AutoUpdater] Update downloaded:', info.version);
      sendUpdateStatus({ status: 'downloaded' });
    });

    autoUpdater.on('error', (err) => {
      console.error('[AutoUpdater] Error:', err);
      sendUpdateStatus({
        status: 'error',
        message: err && err.message ? err.message : String(err),
      });
    });
  }
}

app.whenReady().then(() => {
  createWindow();
  setupUpdaterIPC();

  if (autoUpdater && app.isPackaged) {
    // Initial check after a short delay (allows Render cold starts)
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err) => {
        console.log('[AutoUpdater] Initial check failed:', err?.message);
      });
    }, 10000);

    // Periodic check every 60 seconds
    const oneMinuteMs = 60 * 1000;
    updateCheckIntervalId = setInterval(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        autoUpdater.checkForUpdates().catch(() => {});
      }
    }, oneMinuteMs);
  }
});

app.on('window-all-closed', () => {
  if (updateCheckIntervalId) {
    clearInterval(updateCheckIntervalId);
    updateCheckIntervalId = null;
  }
  if (process.platform !== 'darwin') {
    sqliteBridge.close();
    app.quit();
  }
});

app.on('before-quit', () => {
  sqliteBridge.close();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
