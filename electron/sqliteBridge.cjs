/**
 * PBooks Pro - Electron SQLite Bridge
 * Exposes native SQLite to renderer via IPC. Uses better-sqlite3.
 * Also provides file-based load/save for sql.js compatibility (Electron file storage).
 */

const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let db = null;
let dbPath = null;
let _isStaging = null;

function isStaging() {
  if (_isStaging !== null) return _isStaging;
  try {
    const { app } = require('electron');
    const configPath = path.join(app.getAppPath(), 'dist', 'env-config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      _isStaging = !!config.isStaging;
    } else {
      _isStaging = false;
    }
  } catch {
    _isStaging = false;
  }
  return _isStaging;
}

function getDbFileName() {
  return isStaging() ? 'PBooksPro-Staging.db' : 'PBooksPro.db';
}

function getSqlJsBlobName() {
  return isStaging() ? 'PBooksPro-Staging_sqljs.bin' : 'PBooksPro_sqljs.bin';
}

function getDbPath() {
  if (dbPath) return dbPath;
  const { app } = require('electron');
  const userData = app.getPath('userData');
  const dbDir = path.join(userData, 'pbookspro');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  dbPath = path.join(dbDir, getDbFileName());
  console.log(`[SQLiteBridge] DB path: ${dbPath} (staging=${isStaging()})`);
  return dbPath;
}

/** Get path for sql.js blob storage (same dir, different file for migration period) */
function getSqlJsBlobPath() {
  const { app } = require('electron');
  const userData = app.getPath('userData');
  const dbDir = path.join(userData, 'pbookspro');
  return path.join(dbDir, getSqlJsBlobName());
}

function getDb() {
  if (db) return db;
  try {
    const Database = require('better-sqlite3');
    const path = getDbPath();
    db = new Database(path, { verbose: process.env.SQLITE_VERBOSE === '1' ? console.log : null });
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    return db;
  } catch (err) {
    console.error('[SQLiteBridge] Failed to open database:', err);
    throw err;
  }
}

function initSchema() {
  const d = getDb();
  const schemaPath = path.join(__dirname, 'schema.sql');
  if (!fs.existsSync(schemaPath)) {
    console.error('[SQLiteBridge] Schema file not found:', schemaPath);
    return;
  }
  const schema = fs.readFileSync(schemaPath, 'utf8');
  d.exec(schema);

  // Electron-specific tables (sync_queue, locks) - run after main schema
  d.exec(`
-- Sync queue (replaces localStorage sync_queue_*)
CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  type TEXT CHECK (type IN ('create','update','delete')),
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  data TEXT,
  timestamp INTEGER NOT NULL,
  source TEXT DEFAULT 'local',
  status TEXT CHECK (status IN ('pending','syncing','completed','failed')) DEFAULT 'pending',
  retries INTEGER DEFAULT 0,
  error_message TEXT,
  sync_started_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sync_queue_tenant_status ON sync_queue(tenant_id, status);

-- Record locks (replaces localStorage record_locks)
CREATE TABLE IF NOT EXISTS record_locks (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

-- Offline locks (replaces localStorage offline_locks) - id=tenantId
CREATE TABLE IF NOT EXISTS offline_locks (
  id TEXT PRIMARY KEY,
  entity_type TEXT,
  entity_id TEXT,
  user_id TEXT NOT NULL,
  expires_at INTEGER,
  created_at INTEGER
);

-- Migrations for existing DBs: add columns if missing
  `);
  try { d.exec('ALTER TABLE record_locks ADD COLUMN user_name TEXT'); } catch (_) { }
  try { d.exec('ALTER TABLE record_locks ADD COLUMN tenant_id TEXT'); } catch (_) { }
  try { d.exec('ALTER TABLE offline_locks ADD COLUMN tenant_id TEXT'); } catch (_) { }
  try { d.exec('ALTER TABLE offline_locks ADD COLUMN user_name TEXT'); } catch (_) { }
  try { d.exec('ALTER TABLE offline_locks ADD COLUMN locked_at INTEGER'); } catch (_) { }
}

function setupHandlers() {
  // Native SQLite (for future use: sync_queue, locks). Optional - blob storage works without it.
  try {
    getDb();
    initSchema();
  } catch (e) {
    console.warn('[SQLiteBridge] Native SQLite init skipped (blob storage will be used):', e?.message || e);
  }

  // Blob handlers (required for sql.js file persistence)
  ipcMain.handle('sqlite:loadBlob', () => {
    try {
      const blobPath = getSqlJsBlobPath();
      if (!fs.existsSync(blobPath)) return null;
      const buf = fs.readFileSync(blobPath);
      return new Uint8Array(buf);
    } catch (err) {
      console.error('[SQLiteBridge] loadBlob error:', err.message);
      return null;
    }
  });

  ipcMain.handle('sqlite:saveBlob', (_event, data) => {
    try {
      const blobPath = getSqlJsBlobPath();
      const dir = path.dirname(blobPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const buf = data instanceof Uint8Array ? Buffer.from(data) : Buffer.from(data);
      fs.writeFileSync(blobPath, buf);
      return { ok: true };
    } catch (err) {
      console.error('[SQLiteBridge] saveBlob error:', err.message);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('sqlite:blobExists', () => fs.existsSync(getSqlJsBlobPath()));

  ipcMain.handle('sqlite:clearBlob', () => {
    try {
      const blobPath = getSqlJsBlobPath();
      if (fs.existsSync(blobPath)) fs.unlinkSync(blobPath);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Native SQLite IPC (for Phase 3+ sync queue, etc.)
  ipcMain.handle('sqlite:query', (_event, sql, params = []) => {
    try {
      const d = getDb();
      const stmt = d.prepare(sql);
      const rows = stmt.all(...(Array.isArray(params) ? params : [params]));
      return { ok: true, rows };
    } catch (err) {
      console.error('[SQLiteBridge] query error:', err.message);
      return { ok: false, error: err.message, rows: [] };
    }
  });

  ipcMain.handle('sqlite:run', (_event, sql, params = []) => {
    try {
      const d = getDb();
      const stmt = d.prepare(sql);
      const result = stmt.run(...(Array.isArray(params) ? params : [params]));
      return { ok: true, changes: result.changes, lastInsertRowid: result.lastInsertRowid };
    } catch (err) {
      console.error('[SQLiteBridge] run error:', err.message);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('sqlite:exec', (_event, sql) => {
    try {
      const d = getDb();
      d.exec(sql);
      return { ok: true };
    } catch (err) {
      console.error('[SQLiteBridge] exec error:', err.message);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('sqlite:transaction', async (_event, operations) => {
    try {
      const d = getDb();
      const tx = d.transaction(() => {
        const results = [];
        for (const op of operations) {
          if (op.type === 'query') {
            const stmt = d.prepare(op.sql);
            results.push(stmt.all(...(op.params || [])));
          } else if (op.type === 'run') {
            const stmt = d.prepare(op.sql);
            results.push(stmt.run(...(op.params || [])));
          }
        }
        return results;
      });
      const results = tx();
      return { ok: true, results };
    } catch (err) {
      console.error('[SQLiteBridge] transaction error:', err.message);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('sqlite:getDbPath', () => getDbPath());

  // Sync IPC for main DB - blocks renderer until complete (keeps DatabaseService sync API)
  ipcMain.on('sqlite:querySync', (event, sql, params) => {
    try {
      const d = getDb();
      const stmt = d.prepare(sql);
      const rows = stmt.all(...(Array.isArray(params) ? params : [params]));
      event.returnValue = { ok: true, rows };
    } catch (err) {
      console.error('[SQLiteBridge] querySync error:', err.message);
      event.returnValue = { ok: false, error: err.message, rows: [] };
    }
  });

  ipcMain.on('sqlite:runSync', (event, sql, params) => {
    try {
      const d = getDb();
      const stmt = d.prepare(sql);
      const result = stmt.run(...(Array.isArray(params) ? params : [params]));
      event.returnValue = { ok: true, changes: result.changes, lastInsertRowid: result.lastInsertRowid };
    } catch (err) {
      console.error('[SQLiteBridge] runSync error:', err.message);
      event.returnValue = { ok: false, error: err.message };
    }
  });

  ipcMain.on('sqlite:execSync', (event, sql) => {
    try {
      const d = getDb();
      d.exec(sql);
      event.returnValue = { ok: true };
    } catch (err) {
      console.error('[SQLiteBridge] execSync error:', err.message);
      event.returnValue = { ok: false, error: err.message };
    }
  });

  ipcMain.on('sqlite:readDbBytesSync', (event) => {
    try {
      close();
      const p = getDbPath();
      if (!fs.existsSync(p)) {
        event.returnValue = { ok: true, data: null };
        return;
      }
      const buf = fs.readFileSync(p);
      event.returnValue = { ok: true, data: Array.from(new Uint8Array(buf)) };
    } catch (err) {
      event.returnValue = { ok: false, error: err?.message };
    }
  });

  ipcMain.handle('sqlite:resetAndDeleteDb', () => {
    try {
      close();
      const p = getDbPath();
      if (fs.existsSync(p)) fs.unlinkSync(p);
      const blobPath = getSqlJsBlobPath();
      if (fs.existsSync(blobPath)) fs.unlinkSync(blobPath);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err?.message };
    }
  });
}

function close() {
  if (db) {
    try {
      db.close();
    } catch (e) {
      console.error('[SQLiteBridge] Close error:', e);
    }
    db = null;
  }
}

module.exports = { setupHandlers, getDb, getDbPath, initSchema, close };
