/**
 * Electron shell for PBooks Pro API (Express + PostgreSQL).
 * Spawns Node with bundled backend from resources; tray + status window.
 */

const { app, BrowserWindow, ipcMain, shell, Tray, Menu, dialog, nativeImage } = require('electron');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let mainWindow = null;
let tray = null;
let apiChild = null;
let allowQuit = false;
let autoUpdater = null;
const logLines = [];
const MAX_LOG = 500;

if (app.isPackaged) {
  try {
    autoUpdater = require('electron-updater').autoUpdater;
    autoUpdater.channel = 'api-server';
    autoUpdater.autoDownload = false;
    autoUpdater.logger = console;
    // NSIS full installer (not web installer): required for reliable blockmap / differential downloads.
    autoUpdater.disableWebInstaller = true;
  } catch (err) {
    console.error('[API Server AutoUpdater] Failed to load electron-updater:', err && err.message ? err.message : err);
  }
}

function pushLog(line) {
  const s = typeof line === 'string' ? line : String(line);
  logLines.push(s);
  while (logLines.length > MAX_LOG) logLines.shift();
  broadcast({ type: 'log' });
}

function broadcast(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('server:event', payload);
  }
}

function parseEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function getBackendRoot() {
  return path.join(process.resourcesPath, 'backend');
}

/** Writable config dir (recommended): copy your dev repo `backend/.env` here as `.env`. */
function getUserBackendConfigDir() {
  return path.join(app.getPath('userData'), 'backend');
}

/**
 * Merge env files (later files override earlier). Does not log secrets.
 * 1) install resources/backend/.env — optional defaults from packaging
 * 2) AppData/.../backend/.env — where users should put the real config (same as dev repo layout)
 * 3) AppData/.../.env — optional single file override
 */
function getMergedEnv() {
  const userData = app.getPath('userData');
  const layers = [
    path.join(getBackendRoot(), '.env'),
    path.join(userData, 'backend', '.env'),
    path.join(userData, '.env'),
  ];
  let merged = {};
  for (const p of layers) {
    merged = { ...merged, ...parseEnvFile(p) };
  }
  return { ...process.env, ...merged };
}

function getIndexPath() {
  return path.join(getBackendRoot(), 'dist', 'index.js');
}

function emitDownloadProgress(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('server:download-progress', payload);
  }
}

function getPort() {
  const merged = getMergedEnv();
  const p = Number(merged.PORT) || 3000;
  return p;
}

function isIPv4(net) {
  return net.family === 'IPv4' || net.family === 4;
}

/** Localhost plus non-internal IPv4 addresses (API listens on 0.0.0.0 in backend). */
function getApiEndpointAddresses(port) {
  const p = Number(port) || 3000;
  const out = [
    {
      kind: 'localhost',
      interfaceName: 'localhost',
      ip: '127.0.0.1',
      apiUrl: `http://127.0.0.1:${p}/api`,
      healthUrl: `http://127.0.0.1:${p}/health`,
    },
  ];
  const seen = new Set(['127.0.0.1']);
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets).sort()) {
    for (const net of nets[name] || []) {
      if (!isIPv4(net)) continue;
      if (net.internal) continue;
      if (seen.has(net.address)) continue;
      seen.add(net.address);
      out.push({
        kind: 'lan',
        interfaceName: name,
        ip: net.address,
        apiUrl: `http://${net.address}:${p}/api`,
        healthUrl: `http://${net.address}:${p}/health`,
      });
    }
  }
  return out;
}

function isRunning() {
  return apiChild && !apiChild.killed;
}

function startApiServer() {
  if (isRunning()) return { ok: true, message: 'Already running' };

  const indexJs = getIndexPath();
  if (!fs.existsSync(indexJs)) {
    const msg = 'Backend bundle missing: ' + indexJs;
    pushLog('[error] ' + msg);
    return { ok: false, message: msg };
  }

  const env = getMergedEnv();
  if (!env.DATABASE_URL) {
    const target = path.join(getUserBackendConfigDir(), '.env');
    const msg =
      'DATABASE_URL is not set. Copy your project backend/.env to: ' + target + ' (button: Open folder).';
    pushLog('[error] ' + msg);
    return { ok: false, message: msg };
  }

  const cwd = getBackendRoot();
  const child = spawn('node', [indexJs], {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  apiChild = child;
  child.stdout.on('data', (buf) => pushLog(buf.toString()));
  child.stderr.on('data', (buf) => pushLog(buf.toString()));
  child.on('exit', (code, signal) => {
    pushLog(`[process] exited code=${code} signal=${signal}`);
    apiChild = null;
    broadcast({ type: 'state' });
  });
  child.on('error', (err) => {
    pushLog('[spawn error] ' + (err && err.message ? err.message : String(err)));
    apiChild = null;
    broadcast({ type: 'state' });
  });

  pushLog('[api] started');
  broadcast({ type: 'state' });
  return { ok: true };
}

function stopApiServer() {
  if (!apiChild || apiChild.killed) return { ok: true };
  try {
    apiChild.kill();
  } catch (e) {
    pushLog('[stop] ' + (e && e.message ? e.message : String(e)));
  }
  apiChild = null;
  broadcast({ type: 'state' });
  return { ok: true };
}

function createWindow() {
  const iconPath = path.join(__dirname, 'assets', 'icon.ico');
  const icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : undefined;

  mainWindow = new BrowserWindow({
    width: 560,
    height: 640,
    show: true,
    icon,
    webPreferences: {
      preload: path.join(__dirname, 'server-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'server-ui.html'));

  mainWindow.on('close', (e) => {
    if (!allowQuit) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'icon.ico');
  const trayIcon = fs.existsSync(iconPath) ? iconPath : undefined;
  tray = new Tray(trayIcon || nativeImage.createEmpty());

  const menu = Menu.buildFromTemplate([
    {
      label: 'Show window',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: 'Open config folder (.env)',
      click: () => openEnvFolder(),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        allowQuit = true;
        stopApiServer();
        app.quit();
      },
    },
  ]);
  tray.setToolTip('PBooks Pro API Server');
  tray.setContextMenu(menu);
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) mainWindow.hide();
      else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

function openEnvFolder() {
  const folder = getUserBackendConfigDir();
  if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
  const exampleSrc = path.join(getBackendRoot(), '.env.example');
  const exampleDst = path.join(folder, '.env.example');
  if (fs.existsSync(exampleSrc) && !fs.existsSync(exampleDst)) {
    try {
      fs.copyFileSync(exampleSrc, exampleDst);
    } catch (_) {}
  }
  shell.openPath(folder);
}

ipcMain.handle('server:get-app-version', () => app.getVersion());

ipcMain.handle('server:get-state', () => {
  const port = getPort();
  const addresses = getApiEndpointAddresses(port);
  return {
    running: isRunning(),
    port,
    listenUrl: 'http://127.0.0.1:' + port + ' (API /api, health /health)',
    addresses,
    appVersion: app.getVersion(),
    userEnvDir: getUserBackendConfigDir(),
  };
});

ipcMain.handle('server:start', () => startApiServer());

ipcMain.handle('server:stop', () => stopApiServer());

ipcMain.handle('server:get-logs', () => logLines.join(''));

ipcMain.handle('server:open-env-folder', () => {
  openEnvFolder();
  return { ok: true };
});

ipcMain.handle('server:check-update', async () => {
  const currentVersion = app.getVersion();
  if (!app.isPackaged || !autoUpdater) {
    return {
      ok: false,
      message: 'Update check is only available in the installed PBooks Pro API Server.',
    };
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    if (!result) {
      return { ok: true, upToDate: true, currentVersion };
    }
    if (result.isUpdateAvailable && result.updateInfo) {
      return {
        ok: true,
        upToDate: false,
        currentVersion,
        latestVersion: result.updateInfo.version,
      };
    }
    return { ok: true, upToDate: true, currentVersion };
  } catch (e) {
    return {
      ok: false,
      message: e && e.message ? e.message : String(e),
    };
  }
});

ipcMain.handle('server:download-and-install', async () => {
  if (!autoUpdater) {
    return { ok: false, message: 'Updater is not available in this build.' };
  }
  const onProgress = (p) => {
    emitDownloadProgress({
      phase: 'progress',
      percent: typeof p.percent === 'number' ? p.percent : 0,
      received: p.transferred,
      total: p.total,
      indeterminate: !p.total,
    });
  };
  try {
    emitDownloadProgress({ phase: 'start' });
    autoUpdater.on('download-progress', onProgress);
    await autoUpdater.downloadUpdate();
    autoUpdater.removeListener('download-progress', onProgress);
    emitDownloadProgress({ phase: 'done' });
  } catch (e) {
    autoUpdater.removeListener('download-progress', onProgress);
    const msg = e && e.message ? e.message : String(e);
    emitDownloadProgress({ phase: 'error', message: msg });
    return { ok: false, message: msg };
  }
  const { response } = await dialog.showMessageBox({
    type: 'info',
    buttons: ['Restart and install', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
    title: 'Update ready',
    message: 'Update downloaded.',
    detail: 'The app will quit so the installer can run.',
  });
  if (response !== 0) return { ok: false, message: 'Cancelled' };
  allowQuit = true;
  stopApiServer();
  autoUpdater.quitAndInstall(false, true);
  return { ok: true };
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createTray();
    createWindow();

    const merged = getMergedEnv();
    if (merged.DATABASE_URL) {
      startApiServer();
    } else {
      pushLog(
        '[hint] No DATABASE_URL. Copy your project backend/.env to: ' +
          path.join(getUserBackendConfigDir(), '.env') +
          ' — then Start API (Open folder opens this directory).'
      );
    }

    const hidden =
      process.argv.includes('--hidden') ||
      process.argv.includes('--background') ||
      process.env.PBOOKS_API_SERVER_TRAY_ONLY === '1';
    if (hidden && mainWindow) {
      mainWindow.hide();
    }
  });

  app.on('window-all-closed', () => {});

  app.on('before-quit', () => {
    if (!allowQuit) {
      /* tray quit sets allowQuit */
    }
    stopApiServer();
  });
}
