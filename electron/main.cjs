/**
 * PBooks Pro - Electron Main Process
 * Desktop wrapper for the PBooks Pro web application.
 */

const { app, BrowserWindow, shell, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const sqliteBridge = require('./sqliteBridge.cjs');

const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--enable-logging');

let mainWindow = null;

// Reduce cache/service-worker errors when loading from file:// (Electron on Windows)
app.commandLine.appendSwitch('disable-features', 'TranslateUI');
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-sync');
// Avoid "Unable to create cache" / "Database IO error" when loading from file:// on Windows
app.commandLine.appendSwitch('disk-cache-dir', path.join(app.getPath('userData'), 'Cache'));

// Initialize SQLite bridge (native DB for desktop app)
sqliteBridge.setupHandlers();

function createWindow() {
  // Use custom app icon if present (electron/assets/icon.ico on Windows, icon.icns on macOS)
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
      // Reduce cache errors when loading from file:// on Windows
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

  // Open external links (e.g. payment gateways, docs) in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Load the built app
  // Use app.getAppPath() for reliable path resolution in dev and packaged builds (avoids file:///F:/ on Windows)
  const appPath = app.getAppPath();
  const indexHtml = path.join(appPath, 'dist', 'index.html');

  if (process.env.ELECTRON_LOAD_URL) {
    mainWindow.loadURL(process.env.ELECTRON_LOAD_URL);
  } else {
    mainWindow.loadFile(indexHtml);
  }
}

// --- Auto-updater setup ---

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

if (isDev) {
  autoUpdater.logger = console;
  autoUpdater.forceDevUpdateConfig = true;
}

function setupAutoUpdater() {
  autoUpdater.on('checking-for-update', () => {
    mainWindow?.webContents.send('update-checking');
  });

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update-available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on('update-not-available', () => {
    mainWindow?.webContents.send('update-not-available');
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('update-download-progress', {
      bytesPerSecond: progress.bytesPerSecond,
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('update-downloaded', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on('error', (err) => {
    mainWindow?.webContents.send('update-error', err?.message || 'Unknown update error');
  });

  ipcMain.on('install-update', () => {
    autoUpdater.quitAndInstall(false, true);
  });

  ipcMain.on('check-for-updates', () => {
    autoUpdater.checkForUpdates().catch((err) => {
      mainWindow?.webContents.send('update-error', err?.message || 'Failed to check for updates');
    });
  });
}

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdater();
  // Check for updates 10 seconds after launch
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 10000);
});

app.on('window-all-closed', () => {
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
