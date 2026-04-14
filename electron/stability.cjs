/**
 * PBooks Pro — Stability layer (main process)
 * Heartbeat watchdog, memory monitoring, crash logging, IPC for renderer logs / DB checkpoint.
 */

const { ipcMain, app } = require('electron');
const fs = require('fs');
const path = require('path');

let lastHeartbeat = Date.now();
let watchdogTimer = null;
let memoryTimer = null;
let getMainWindow = () => null;
let sqliteBridgeRef = null;
let lastReloadAt = 0;
let warnedStaleAt = 0;

const HEARTBEAT_STALE_MS = 30000;
const HEARTBEAT_WARN_MS = 10000;
const WATCHDOG_INTERVAL_MS = 5000;
const RELOAD_COOLDOWN_MS = 60000;
const MEMORY_LOG_INTERVAL_MS = 10000;
const HEAP_WARN_BYTES = 500 * 1024 * 1024;

function logDir() {
  return path.join(app.getPath('userData'), 'logs');
}

function logLine(level, ...parts) {
  const line = `[${new Date().toISOString()}] [${level}] ${parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ')}\n`;
  const text = line.trim();
  if (level === 'ERROR') console.error(text);
  else if (level === 'WARN') console.warn(text);
  else console.log(text);
  try {
    const dir = logDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'stability.log');
    fs.appendFileSync(file, line, 'utf8');
  } catch (_) {}
}

function setupMainCrashHandlers() {
  process.on('uncaughtException', (err) => {
    logLine('ERROR', 'Main uncaughtException:', err && err.stack ? err.stack : String(err));
    try {
      if (sqliteBridgeRef && typeof sqliteBridgeRef.commitAllPending === 'function') {
        sqliteBridgeRef.commitAllPending();
      }
    } catch (_) {}
  });
  process.on('unhandledRejection', (reason) => {
    logLine('ERROR', 'Main unhandledRejection:', reason && reason.stack ? reason.stack : String(reason));
    try {
      if (sqliteBridgeRef && typeof sqliteBridgeRef.commitAllPending === 'function') {
        sqliteBridgeRef.commitAllPending();
      }
    } catch (_) {}
  });
}

function resetHeartbeat() {
  lastHeartbeat = Date.now();
}

function registerIpcHandlers(deps) {
  getMainWindow = deps.getMainWindow || (() => null);
  sqliteBridgeRef = deps.sqliteBridge || null;

  ipcMain.on('stability:heartbeat', () => {
    lastHeartbeat = Date.now();
  });

  ipcMain.handle('stability:log', (_e, payload) => {
    try {
      const level = (payload && payload.level) || 'info';
      const message = (payload && payload.message) || '';
      const detail = payload && payload.detail != null ? payload.detail : '';
      logLine(level.toUpperCase(), '[Renderer]', message, detail);
    } catch (err) {
      logLine('WARN', 'stability:log failed', String(err));
    }
    return { ok: true };
  });

  ipcMain.handle('stability:db-checkpoint', () => {
    try {
      if (sqliteBridgeRef && typeof sqliteBridgeRef.walCheckpoint === 'function') {
        return sqliteBridgeRef.walCheckpoint();
      }
      return { ok: false, error: 'walCheckpoint not available' };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });
}

function startWatchdog() {
  if (process.env.STABILITY_DISABLE_WATCHDOG === '1') {
    logLine('INFO', 'Stability watchdog disabled (STABILITY_DISABLE_WATCHDOG=1)');
    return;
  }
  if (watchdogTimer) clearInterval(watchdogTimer);
  watchdogTimer = setInterval(() => {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return;
    const wc = win.webContents;
    if (!wc || wc.isDestroyed()) return;
    const now = Date.now();
    const elapsed = now - lastHeartbeat;
    if (elapsed > HEARTBEAT_WARN_MS && elapsed <= HEARTBEAT_STALE_MS && !warnedStaleAt) {
      warnedStaleAt = now;
      logLine('WARN', `Renderer heartbeat stale (${elapsed}ms) — watching for recovery`);
    }
    if (elapsed > HEARTBEAT_STALE_MS) {
      if (now - lastReloadAt < RELOAD_COOLDOWN_MS) {
        logLine('WARN', `Renderer heartbeat stale (${elapsed}ms) but skipping reload — cooldown active (last reload ${now - lastReloadAt}ms ago)`);
        return;
      }
      logLine('WARN', `Renderer heartbeat stale (${elapsed}ms) — reloading webContents`);
      try {
        resetHeartbeat();
        lastReloadAt = now;
        warnedStaleAt = 0;
        wc.reload();
      } catch (err) {
        logLine('ERROR', 'Watchdog reload failed', String(err));
      }
    } else if (elapsed <= HEARTBEAT_WARN_MS) {
      warnedStaleAt = 0;
    }
  }, WATCHDOG_INTERVAL_MS);
}

function startMemoryMonitor() {
  if (process.env.STABILITY_DISABLE_MEMORY_LOG === '1') return;
  if (memoryTimer) clearInterval(memoryTimer);
  memoryTimer = setInterval(() => {
    try {
      const mem = process.memoryUsage();
      logLine('INFO', 'Memory heapUsed MB:', (mem.heapUsed / 1024 / 1024).toFixed(1), 'rss MB:', (mem.rss / 1024 / 1024).toFixed(1));
      if (mem.heapUsed > HEAP_WARN_BYTES) {
        logLine('WARN', 'High main-process heap usage', (mem.heapUsed / 1024 / 1024).toFixed(1), 'MB');
      }
    } catch (_) {}
  }, MEMORY_LOG_INTERVAL_MS);
}

function stopWatchdog() {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
}

function stopMemoryMonitor() {
  if (memoryTimer) {
    clearInterval(memoryTimer);
    memoryTimer = null;
  }
}

module.exports = {
  setupMainCrashHandlers,
  registerIpcHandlers,
  resetHeartbeat,
  startWatchdog,
  startMemoryMonitor,
  stopWatchdog,
  stopMemoryMonitor,
  logLine,
};
