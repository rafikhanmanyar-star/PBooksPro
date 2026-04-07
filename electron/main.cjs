/**
 * PBooks Pro - Electron Main Process
 * Desktop wrapper for the PBooks Pro web application.
 * Multi-company architecture: uses companyManager for DB management.
 */

const { app, BrowserWindow, shell, ipcMain, dialog, Menu, MenuItem } = require('electron');
const path = require('path');
const fs = require('fs');
const sqliteBridge = require('./sqliteBridge.cjs');
const companyManager = require('./companyManager.cjs');
const stability = require('./stability.cjs');
const spellChecker = require('./spellChecker.cjs');

let mainWindow = null;
let autoUpdater = null;
/** When true, window close is not prevented (used after renderer has saved and sent app:ready-to-close). */
let closingAllowed = false;
let updateCheckIntervalId = null;
let lastNotifiedUpdateVersion = null;
let isManualCheck = false;

if (app.isPackaged) {
  try {
    autoUpdater = require('electron-updater').autoUpdater;
  } catch (err) {
    console.error('[AutoUpdater] Failed to load electron-updater:', err && err.message ? err.message : err);
  }
}

app.commandLine.appendSwitch('disable-features', 'TranslateUI');
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-sync');
app.commandLine.appendSwitch('disk-cache-dir', path.join(app.getPath('userData'), 'Cache'));

// Register IPC handlers BEFORE app.whenReady so they're available when renderer loads
stability.setupMainCrashHandlers();
sqliteBridge.setupHandlers();
companyManager.setupHandlers(sqliteBridge);
stability.registerIpcHandlers({
  getMainWindow: () => mainWindow,
  sqliteBridge,
});

ipcMain.on('app:ready-to-close', () => {
  console.log('[Main] app:ready-to-close received, closing window');
  closingAllowed = true;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  }
});

function focusMainWebContents() {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.focus();
  }
}

ipcMain.handle('electron:focus-web-contents', () => {
  focusMainWebContents();
  return { ok: true };
});

ipcMain.handle('spell:get-settings', () => spellChecker.loadSettings());

ipcMain.handle('spell:set-settings', (_event, partial) => {
  const merged = spellChecker.saveSettings(partial && typeof partial === 'object' ? partial : {});
  if (mainWindow && !mainWindow.isDestroyed()) {
    spellChecker.applySpellSettingsToSession(mainWindow.webContents.session, merged);
  }
  return merged;
});

// Migrate existing single-DB users to multi-company on first launch
const migratedCompanyId = companyManager.migrateExistingSingleDb();
if (migratedCompanyId) {
  // Auto-open the migrated company so the user sees their data immediately
  companyManager.getActiveCompany(); // ensure master is ready
  const result = sqliteBridge.openDb(
    companyManager.getCompanyById(migratedCompanyId).db_file_path
  );
  if (result) {
    console.log('[Main] Auto-opened migrated company');
  }
}

/**
 * Chromium spellcheck + right-click suggestions + persist "Add to Dictionary".
 */
function setupSpellChecker(mainWindow) {
  const session = mainWindow.webContents.session;
  const settings = spellChecker.loadSettings();
  spellChecker.applySpellSettingsToSession(session, settings);
  spellChecker.preloadCustomDictionary(session);

  mainWindow.webContents.on('context-menu', (event, params) => {
    const current = spellChecker.loadSettings();
    if (!current.spellcheckEnabled) return;
    if (!params.isEditable || !params.misspelledWord) return;

    event.preventDefault();
    const menu = new Menu();

    for (const suggestion of params.dictionarySuggestions || []) {
      menu.append(
        new MenuItem({
          label: suggestion,
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.replaceMisspelling(suggestion);
            }
          },
        })
      );
    }

    if ((params.dictionarySuggestions || []).length > 0) {
      menu.append(new MenuItem({ type: 'separator' }));
    }

    menu.append(
      new MenuItem({
        label: 'Add to Dictionary',
        click: () => {
          if (!params.misspelledWord) return;
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord);
            spellChecker.addCustomWord(params.misspelledWord);
          }
        },
      })
    );

    menu.append(new MenuItem({ type: 'separator' }));
    menu.append(new MenuItem({ role: 'cut' }));
    menu.append(new MenuItem({ role: 'copy' }));
    menu.append(new MenuItem({ role: 'paste' }));
    menu.append(new MenuItem({ type: 'separator' }));
    menu.append(new MenuItem({ role: 'selectAll' }));

    menu.popup({ window: mainWindow });
  });
}

function setupCSP() {
  const { session } = require('electron');
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (!details.url.startsWith('file://')) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https:",
      // LAN / API client: connect to any http(s) host and WebSockets (same as browser app)
      "connect-src 'self' http: https: ws: wss:",
      "font-src 'self' https://fonts.gstatic.com https://fonts.googleapis.com",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; ');
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });
}

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
    focusable: true,
    ...iconOption,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false,
      spellcheck: true,
    },
    show: false,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // DevTools are not opened by default; use View → Toggle Developer Tools (or F12) to open.
  });

  mainWindow.webContents.once('did-finish-load', () => {
    stability.resetHeartbeat();
  });

  // When window gains focus (e.g. restore from taskbar), ensure webContents has keyboard focus
  // so typing works. Fixes "keyboard not working until minimize/restore" on Windows.
  mainWindow.on('focus', () => {
    focusMainWebContents();
    if (process.env.ELECTRON_FOCUS_LOG === '1') {
      console.log('[Main] BrowserWindow focus');
    }
  });

  // Show / restore: extra paths where focus() may not fire but keyboard routing is stale
  mainWindow.on('show', focusMainWebContents);
  mainWindow.on('restore', focusMainWebContents);

  if (process.env.ELECTRON_FOCUS_LOG === '1') {
    mainWindow.on('blur', () => console.log('[Main] BrowserWindow blur'));
  }

  mainWindow.webContents.on('console-message', (_event, level, message) => {
    const tag = ['debug','log','warn','error'][level] || 'log';
    if (message.includes('[AppContext') || message.includes('[LocalDB]') || message.includes('[index]') || message.includes('loadState')) {
      console.log(`[RENDERER:${tag}] ${message}`);
    }
  });

  mainWindow.on('close', (e) => {
    if (!closingAllowed) {
      e.preventDefault();
      console.log('[Main] window close prevented, sending app:prepare-to-close');
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send('app:prepare-to-close');
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    closingAllowed = false;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  setupSpellChecker(mainWindow);

  const appPath = app.getAppPath();
  const indexHtml = path.join(appPath, 'dist', 'index.html');

  if (process.env.ELECTRON_LOAD_URL) {
    mainWindow.loadURL(process.env.ELECTRON_LOAD_URL);
  } else {
    mainWindow.loadFile(indexHtml);
  }
}

function setupApplicationMenu() {
  const template = [
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Developer Tools',
          accelerator: 'F12',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.toggleDevTools();
            }
          },
        },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize', label: 'Minimize' },
        { role: 'close', label: 'Close' },
      ],
    },
  ];

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.name,
      submenu: [
        { role: 'about', label: 'About ' + app.name },
        { type: 'separator' },
        { role: 'hide', label: 'Hide ' + app.name },
        { role: 'hideOthers', label: 'Hide Others' },
        { role: 'unhide', label: 'Show All' },
        { type: 'separator' },
        { role: 'quit', label: 'Quit ' + app.name },
      ],
    });
  } else {
    template.unshift({
      label: 'File',
      submenu: [{ role: 'quit', label: 'Exit' }],
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function sendUpdateStatus(...args) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', ...args);
  }
}

function getReleasesUrl() {
  try {
    const pkgPath = path.join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const repo = pkg.repository && (pkg.repository.url || pkg.repository);
    if (typeof repo === 'string') {
      const normalized = repo.replace(/\.git$/i, '').trim();
      if (normalized.includes('github.com')) return normalized + '/releases';
    }
  } catch (_) {}
  return null;
}

function setupUpdaterIPC() {
  ipcMain.handle('get-app-version', () => app.getVersion());

  ipcMain.handle('check-for-updates', async () => {
    if (!app.isPackaged || !autoUpdater) {
      const isDev = !app.isPackaged;
      const message = isDev
        ? "You're running the development build. Install the app from the latest release to get updates."
        : 'Update check is not available in this build. Reinstall from the latest release if needed.';
      const payload = { status: 'unavailable', message };
      const releasesUrl = getReleasesUrl();
      if (releasesUrl) payload.releasesUrl = releasesUrl;
      sendUpdateStatus(payload);
      return;
    }
    try {
      isManualCheck = true;
      sendUpdateStatus({ status: 'checking' });
      await autoUpdater.checkForUpdates();
    } catch (err) {
      sendUpdateStatus({
        status: 'error',
        message: err && err.message ? err.message : String(err),
      });
    } finally {
      isManualCheck = false;
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
    // NSIS full installer: enables blockmap-based differential updates (same as electron-updater recommendation).
    autoUpdater.disableWebInstaller = true;

    const isStaging = app.getName().toLowerCase().includes('staging');
    if (isStaging) {
      autoUpdater.allowPrerelease = true;
    }

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
      if (isManualCheck) {
        sendUpdateStatus({
          status: 'error',
          message: err && err.message ? err.message : String(err),
        });
      }
    });
  }
}

app.whenReady().then(() => {
  setupCSP();
  createWindow();
  stability.startWatchdog();
  stability.startMemoryMonitor();
  setupApplicationMenu();
  setupUpdaterIPC();

  if (autoUpdater && app.isPackaged) {
    // Check for updates on first load (short delay so window is ready)
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err) => {
        console.log('[AutoUpdater] Initial check failed:', err?.message);
      });
    }, 5000);

    // Check every 1 hour and alert user if a new version is available
    const oneHourMs = 60 * 60 * 1000;
    updateCheckIntervalId = setInterval(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        autoUpdater.checkForUpdates().catch(() => {});
      }
    }, oneHourMs);
  }
});

/**
 * Automatic backup of the active company DB on close (keep last 5).
 */
function createAutoBackup() {
  try {
    console.log('[Main] createAutoBackup starting');
    const activeCompany = companyManager.getActiveCompany();
    if (!activeCompany) return;

    const dbFilePath = activeCompany.db_file_path;
    if (!dbFilePath || !fs.existsSync(dbFilePath)) return;

    const backupDir = path.join(path.dirname(dbFilePath), '..', 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const backupPath = path.join(backupDir, `${activeCompany.slug}_auto_${dateStr}.db`);

    // WAL checkpoint before backup
    try {
      const d = sqliteBridge.getDb();
      if (d) d.pragma('wal_checkpoint(TRUNCATE)');
    } catch (_) {}

    fs.copyFileSync(dbFilePath, backupPath);
    console.log(`[Backup] Created: ${backupPath}`);

    // Keep last 5 auto-backups per company
    const prefix = `${activeCompany.slug}_auto_`;
    const backups = fs.readdirSync(backupDir)
      .filter(f => f.startsWith(prefix) && f.endsWith('.db'))
      .sort()
      .reverse();
    for (const old of backups.slice(5)) {
      try {
        fs.unlinkSync(path.join(backupDir, old));
        console.log(`[Backup] Deleted old: ${old}`);
      } catch (_) {}
    }
  } catch (err) {
    console.error('[Backup] Failed:', err);
  }
}

app.on('window-all-closed', () => {
  console.log('[Main] window-all-closed');
  stability.stopWatchdog();
  stability.stopMemoryMonitor();
  if (updateCheckIntervalId) {
    clearInterval(updateCheckIntervalId);
    updateCheckIntervalId = null;
  }
  if (process.platform !== 'darwin') {
    createAutoBackup();
    sqliteBridge.close();
    companyManager.closeMasterDb();
    app.quit();
  }
});

app.on('before-quit', () => {
  console.log('[Main] before-quit');
  stability.stopWatchdog();
  stability.stopMemoryMonitor();
  createAutoBackup();
  try {
    if (typeof sqliteBridge.commitAllPending === 'function') {
      sqliteBridge.commitAllPending();
    }
  } catch (e) {
    console.error('[Main] commitAllPending before close:', e);
  }
  sqliteBridge.close();
  companyManager.closeMasterDb();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
