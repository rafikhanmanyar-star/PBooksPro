/**
 * PBooks Pro - Electron SQLite Bridge
 * Exposes native SQLite to renderer via IPC. Uses better-sqlite3.
 * Supports multi-company: companyManager calls openDb(path) to switch DBs.
 */

const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let db = null;
let dbPath = null;

// ---------------------------------------------------------------------------
// DB open / close
// ---------------------------------------------------------------------------

/**
 * Open a specific database file. Called by companyManager when opening a company.
 * Closes any previously open database first.
 */
function openDb(filePath) {
  close();
  const Database = require('better-sqlite3');
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  db = new Database(filePath, { verbose: process.env.SQLITE_VERBOSE === '1' ? console.log : null });
  dbPath = filePath;

  db.pragma('journal_mode = WAL');
  // Mission-critical local accounting: FULL ensures OS flushes WAL pages (survives crash / power loss better than NORMAL).
  db.pragma('synchronous = FULL');
  db.pragma('foreign_keys = ON');
  db.pragma('temp_store = MEMORY');
  db.pragma('busy_timeout = 5000');
  db.pragma('wal_autocheckpoint = 1000');

  const journalMode = db.pragma('journal_mode', { simple: true });
  console.log(`[SQLiteBridge] Opened: ${filePath} (journal_mode=${journalMode})`);
  if (journalMode !== 'wal') {
    console.warn('[SQLiteBridge] WARNING: WAL mode not active!');
  }

  initSchema();
  return db;
}

let _noDbWarned = false;
function getDb() {
  if (!db) {
    if (!_noDbWarned) {
      console.log('[SQLiteBridge] No database open yet — waiting for company selection.');
      _noDbWarned = true;
    }
    return null;
  }
  _noDbWarned = false;
  return db;
}

function getDbPath() {
  return dbPath;
}

/** Passive WAL checkpoint — fast, safe to call after every write (flushes WAL toward main DB file). */
function walCheckpointPassive() {
  const d = getDb();
  if (!d) return { ok: false, error: 'No database open' };
  try {
    d.pragma('wal_checkpoint(PASSIVE)');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

/** Full/truncate checkpoint — use on shutdown, backup, company switch. */
function walCheckpoint() {
  const d = getDb();
  if (!d) return { ok: false, error: 'No database open' };
  try {
    d.pragma('wal_checkpoint(TRUNCATE)');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

/**
 * Flush all WAL frames to the main DB file (stronger than PASSIVE). Use before quit / backup.
 */
function walCheckpointFullSync() {
  const d = getDb();
  if (!d) return { ok: false, error: 'No database open' };
  try {
    d.pragma('wal_checkpoint(FULL)');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

/** Alias for shutdown / crash hooks: ensure WAL is applied to the primary file. */
function commitAllPending() {
  return walCheckpointFullSync();
}

function close() {
  if (db) {
    try {
      // Flush WAL into the main .db file so the file on disk is complete before close.
      // This ensures no data loss when closing the app, logging out, or switching company.
      db.pragma('wal_checkpoint(TRUNCATE)');
    } catch (e) {
      console.warn('[SQLiteBridge] WAL checkpoint before close:', e?.message);
    }
    try {
      db.close();
    } catch (e) {
      console.error('[SQLiteBridge] Close error:', e);
    }
    db = null;
    dbPath = null;
  }
}

// ---------------------------------------------------------------------------
// Schema init & migration (runs on every DB open)
// ---------------------------------------------------------------------------

// Drop tables for removed modules (P2P and Tasks). Run before schema so old DBs get cleaned.
function dropRemovedModuleTables(d) {
  const toDrop = [
    'p2p_bills', 'p2p_invoices', 'p2p_audit_trail', 'supplier_registration_requests',
    'task_updates', 'task_performance_scores', 'task_performance_config', 'tasks',
  ];
  for (const table of toDrop) {
    try {
      d.exec(`DROP TABLE IF EXISTS ${table}`);
      console.log(`[SQLiteBridge] Dropped removed module table: ${table}`);
    } catch (e) {
      console.warn(`[SQLiteBridge] Drop ${table} skipped:`, e.message);
    }
  }
}

function migrateOldTables(d) {
  const entityTables = [
    'accounts', 'contacts', 'vendors', 'categories', 'projects', 'buildings',
    'properties', 'units', 'transactions', 'invoices', 'bills', 'budgets',
    'quotations', 'plan_amenities', 'installment_plans', 'documents',
    'rental_agreements', 'project_agreements', 'sales_returns', 'project_received_assets', 'contracts',
    'recurring_invoice_templates', 'pm_cycle_allocations', 'purchase_orders',
    'transaction_log', 'error_log', 'app_settings', 'license_settings',
    'chat_messages', 'project_agreement_units', 'contract_categories',
    'users', 'sync_outbox', 'sync_metadata',
    'payroll_departments', 'payroll_grades', 'payroll_employees',
    'payroll_runs', 'payslips', 'payroll_salary_components',
    'registered_suppliers',
    'whatsapp_menu_sessions',
  ];

  const requiredColumns = [
    ['tenant_id', "TEXT NOT NULL DEFAULT ''"],
    ['version', 'INTEGER NOT NULL DEFAULT 1'],
    ['deleted_at', 'TEXT'],
    ['user_id', 'TEXT'],
    ['updated_at', "TEXT DEFAULT ''"],
  ];

  for (const table of entityTables) {
    try {
      const cols = d.prepare(`PRAGMA table_info("${table}")`).all();
      if (cols.length === 0) continue;
      const existingCols = new Set(cols.map(c => c.name));
      for (const [colName, colDef] of requiredColumns) {
        if (!existingCols.has(colName)) {
          try {
            d.exec(`ALTER TABLE "${table}" ADD COLUMN ${colName} ${colDef}`);
            console.log(`[SQLiteBridge] Migrated: added ${colName} to ${table}`);
          } catch (_) {}
        }
      }
    } catch (_) {}
  }
}

let _integrityOk = true;

/** Last schema validation result (main process). */
let _schemaHealth = {
  level: 'ok',
  readOnly: false,
  blocking: false,
  version: 0,
  messages: [],
  warnings: [],
  errors: [],
  orphanFkSamples: [],
};
let _dbReadOnly = false;

function isWriteSql(sql) {
  const t = String(sql).trim();
  if (/^pragma\s+/i.test(t)) return false;
  const u = t.toUpperCase();
  return /^(INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|TRUNCATE|ATTACH|DETACH|REINDEX|VACUUM)\b/.test(u);
}

/** Standalone writes use BEGIN IMMEDIATE so we never defer lock acquisition (matches mission-critical contract). */
function isCommitOrRollbackSql(sql) {
  const u = String(sql).trim().toUpperCase();
  return u.startsWith('COMMIT') || u.startsWith('ROLLBACK') || u.startsWith('END ');
}

function shouldUseImmediateTransaction(sql) {
  if (!isWriteSql(sql)) return false;
  const u = String(sql).trim().toUpperCase();
  if (u.startsWith('BEGIN')) return false;
  return true;
}

function logDbCommitSuccess(op, sql, extra) {
  const ts = new Date().toTimeString().slice(0, 8);
  const oneLine = String(sql).replace(/\s+/g, ' ').trim().slice(0, 160);
  console.log(`[DB COMMIT SUCCESS] ${op} at ${ts}${extra ? ` ${extra}` : ''} | ${oneLine}`);
}

function passiveCheckpointAfterWrite(d) {
  try {
    d.pragma('wal_checkpoint(PASSIVE)');
  } catch (_) {}
}

function runPrepared(d, sql, params) {
  const stmt = d.prepare(sql);
  return stmt.run(...(Array.isArray(params) ? params : [params]));
}

/**
 * Run a single statement. When not already inside a user transaction, wrap mutating SQL in
 * BEGIN IMMEDIATE / COMMIT and run a passive WAL checkpoint after commit.
 */
function runWithImmediateTransactionWhenNeeded(d, sql, params) {
  const block = assertWritesAllowed(sql);
  if (block) throw new Error(block);

  if (!shouldUseImmediateTransaction(sql) || d.inTransaction) {
    const result = runPrepared(d, sql, params);
    const u = String(sql).trim().toUpperCase();
    if (isCommitOrRollbackSql(sql) && u.startsWith('COMMIT')) {
      passiveCheckpointAfterWrite(d);
    }
    return result;
  }

  d.exec('BEGIN IMMEDIATE');
  try {
    const result = runPrepared(d, sql, params);
    d.exec('COMMIT');
    logDbCommitSuccess('run', sql, `changes=${result.changes}`);
    passiveCheckpointAfterWrite(d);
    return result;
  } catch (err) {
    try {
      d.exec('ROLLBACK');
    } catch (_) {}
    console.error('[DB COMMIT FAIL] run:', err && err.message, String(sql).slice(0, 200));
    throw err;
  }
}

function assertWritesAllowed(sql) {
  if (!_dbReadOnly) return null;
  if (!isWriteSql(sql)) return null;
  return 'Database is in read-only mode: schema validation failed. Restore from a backup (see Settings → Company) or reinstall the app.';
}

function initSchema() {
  const d = getDb();
  if (!d) return;

  // Integrity check
  try {
    const result = d.pragma('integrity_check');
    if (result && result.length > 0 && result[0].integrity_check === 'ok') {
      console.log('[SQLiteBridge] Integrity check: OK');
      _integrityOk = true;
    } else {
      console.error('[SQLiteBridge] INTEGRITY CHECK FAILED:', result);
      _integrityOk = false;
    }
  } catch (err) {
    console.error('[SQLiteBridge] Integrity check error:', err);
    _integrityOk = false;
  }

  const schemaPath = path.join(__dirname, 'schema.sql');
  if (!fs.existsSync(schemaPath)) {
    console.error('[SQLiteBridge] Schema file not found:', schemaPath);
    return;
  }
  const schema = fs.readFileSync(schemaPath, 'utf8');

  dropRemovedModuleTables(d);
  migrateOldTables(d);

  // System chart: shared tenant_id so all companies use the same canonical sys-acc-*/sys-cat-* rows
  try {
    d.exec(`
      UPDATE accounts SET tenant_id = '__system__' WHERE id GLOB 'sys-acc-*';
      UPDATE categories SET tenant_id = '__system__' WHERE id GLOB 'sys-cat-*';
    `);
  } catch (e) {
    console.warn('[SQLiteBridge] system chart tenant_id normalize skipped:', e && e.message);
  }

  // Normalize project_agreements.status casing (Sales Returns "Select Agreement" lists Active only)
  try {
    const paCols = d.prepare('PRAGMA table_info(project_agreements)').all();
    if (paCols.length > 0) {
      d.exec(`
        UPDATE project_agreements
        SET status = CASE LOWER(TRIM(status))
          WHEN 'active' THEN 'Active'
          WHEN 'cancelled' THEN 'Cancelled'
          WHEN 'canceled' THEN 'Cancelled'
          WHEN 'completed' THEN 'Completed'
          WHEN 'complete' THEN 'Completed'
          ELSE status
        END
        WHERE deleted_at IS NULL
          AND status IS NOT NULL
          AND LOWER(TRIM(status)) IN ('active', 'cancelled', 'canceled', 'completed', 'complete');
      `);
    }
  } catch (e) {
    console.warn('[SQLiteBridge] project_agreements status normalize skipped:', e && e.message);
  }

  // Note: org_id → tenant_id migration is handled by electronDatabaseService.ts migration system
  // (runV10Migrations and repairRentalAgreementsOrgIdToTenantId). This ensures proper version tracking.

  // Ensure company_settings table exists
  try {
    d.exec(`
      CREATE TABLE IF NOT EXISTS company_settings (
        id TEXT PRIMARY KEY DEFAULT 'default',
        company_name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  } catch (_) {}

  // Ensure force_password_change column on users
  try {
    const userCols = d.prepare('PRAGMA table_info(users)').all();
    if (userCols.length > 0 && !userCols.some(c => c.name === 'force_password_change')) {
      d.exec('ALTER TABLE users ADD COLUMN force_password_change INTEGER NOT NULL DEFAULT 0');
    }
  } catch (_) {}

  // Ensure is_hidden column on categories (for Security Deposit category hiding)
  try {
    const catCols = d.prepare('PRAGMA table_info(categories)').all();
    if (catCols.length > 0 && !catCols.some(c => c.name === 'is_hidden')) {
      d.exec('ALTER TABLE categories ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0');
    }
  } catch (_) {}

  // Ensure project_asset_id column on transactions (for asset sale linking)
  try {
    const txCols = d.prepare('PRAGMA table_info(transactions)').all();
    if (txCols.length > 0 && !txCols.some(c => c.name === 'project_asset_id')) {
      d.exec('ALTER TABLE transactions ADD COLUMN project_asset_id TEXT');
      console.log('[SQLiteBridge] Migrated: added project_asset_id to transactions');
    }
  } catch (_) {}

  // Ensure owner_id column on transactions (for ownership history / rent attribution)
  try {
    const txCols2 = d.prepare('PRAGMA table_info(transactions)').all();
    if (txCols2.length > 0 && !txCols2.some(c => c.name === 'owner_id')) {
      d.exec('ALTER TABLE transactions ADD COLUMN owner_id TEXT');
      console.log('[SQLiteBridge] Migrated: added owner_id to transactions');
    }
  } catch (_) {}

  // Ensure paid_amount column on payslips (for partial payment tracking)
  try {
    const payslipCols = d.prepare('PRAGMA table_info(payslips)').all();
    if (payslipCols.length > 0 && !payslipCols.some(c => c.name === 'paid_amount')) {
      d.exec('ALTER TABLE payslips ADD COLUMN paid_amount REAL NOT NULL DEFAULT 0');
    }
  } catch (_) {}

  // Project/building allocation at payslip generation (historical display & payment split)
  try {
    const payslipCols2 = d.prepare('PRAGMA table_info(payslips)').all();
    if (payslipCols2.length > 0 && !payslipCols2.some(c => c.name === 'assignment_snapshot')) {
      d.exec('ALTER TABLE payslips ADD COLUMN assignment_snapshot TEXT');
    }
  } catch (_) {}

  // Rental/building cost allocation on payroll employees (matches PostgreSQL payroll_employees.buildings)
  try {
    const peCols = d.prepare('PRAGMA table_info(payroll_employees)').all();
    if (peCols.length > 0 && !peCols.some(c => c.name === 'buildings')) {
      d.exec("ALTER TABLE payroll_employees ADD COLUMN buildings TEXT DEFAULT '[]'");
    }
  } catch (_) {}

  // Balance sheet classification tags (matches database/migrations/034_accounts_balance_sheet_tags.sql intent)
  try {
    const accCols = d.prepare('PRAGMA table_info(accounts)').all();
    if (accCols.length > 0) {
      if (!accCols.some((c) => c.name === 'bs_position')) {
        d.exec('ALTER TABLE accounts ADD COLUMN bs_position TEXT');
        console.log('[SQLiteBridge] Migrated: added bs_position to accounts');
      }
      if (!accCols.some((c) => c.name === 'bs_term')) {
        d.exec('ALTER TABLE accounts ADD COLUMN bs_term TEXT');
        console.log('[SQLiteBridge] Migrated: added bs_term to accounts');
      }
      if (!accCols.some((c) => c.name === 'bs_group_key')) {
        d.exec('ALTER TABLE accounts ADD COLUMN bs_group_key TEXT');
        console.log('[SQLiteBridge] Migrated: added bs_group_key to accounts');
      }
      if (!accCols.some((c) => c.name === 'account_code')) {
        d.exec('ALTER TABLE accounts ADD COLUMN account_code TEXT');
        console.log('[SQLiteBridge] Migrated: added account_code to accounts');
      }
      if (!accCols.some((c) => c.name === 'sub_type')) {
        d.exec('ALTER TABLE accounts ADD COLUMN sub_type TEXT');
        console.log('[SQLiteBridge] Migrated: added sub_type to accounts');
      }
      if (!accCols.some((c) => c.name === 'is_active')) {
        d.exec('ALTER TABLE accounts ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1');
        console.log('[SQLiteBridge] Migrated: added is_active to accounts');
      }
    }
  } catch (e) {
    console.warn('[SQLiteBridge] accounts bs_* columns migration skipped:', e && e.message);
  }

  // Execute schema statement-by-statement
  const stripped = schema.replace(/--[^\n]*/g, '');
  const statements = stripped.split(';').map(s => s.trim()).filter(s => s.length > 0);
  for (const stmt of statements) {
    try {
      d.exec(stmt + ';');
    } catch (e) {
      if (!e.message.includes('already exists') && !e.message.includes('duplicate column')) {
        console.warn('[SQLiteBridge] Schema statement skipped:', e.message);
      }
    }
  }

  // Schema validation engine: additive fixes, indexes, FK orphan report, version sync, backup before migrations
  try {
    const schemaValidator = require('./schemaValidator.cjs');
    let health = schemaValidator.runStartupValidation(d, dbPath);
    if (!_integrityOk) {
      health = {
        ...health,
        level: 'error',
        blocking: true,
        readOnly: true,
        errors: [...(health.errors || []), 'SQLite integrity_check reported corruption or inconsistency'],
      };
    }
    _schemaHealth = health;
    _dbReadOnly = !!(health.readOnly || health.blocking);
    if (_dbReadOnly) {
      console.error('[SQLiteBridge] Database opened in READ-ONLY mode (schema safety).');
    }
  } catch (err) {
    console.error('[SQLiteBridge] Schema validator failed:', err);
    _schemaHealth = {
      level: 'error',
      readOnly: true,
      blocking: true,
      version: 0,
      messages: [],
      warnings: [],
      errors: [String(err && err.message ? err.message : err)],
      orphanFkSamples: [],
    };
    _dbReadOnly = true;
  }

  // Ownership history: backfill from properties (one-time per property)
  try {
    const hasHistory = d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='property_ownership_history'").get();
    if (hasHistory) {
      const insert = d.prepare(`
        INSERT INTO property_ownership_history (id, tenant_id, property_id, owner_id, ownership_start_date, ownership_end_date, transfer_reference, notes, created_at, updated_at)
        SELECT p.id || '-own-2000', COALESCE(p.tenant_id, ''), p.id, p.owner_id, '2000-01-01', NULL, NULL, NULL, datetime('now'), datetime('now')
        FROM properties p
        WHERE NOT EXISTS (SELECT 1 FROM property_ownership_history h WHERE h.property_id = p.id)
      `);
      const result = insert.run();
      if (result.changes > 0) {
        console.log('[SQLiteBridge] Ownership history backfill: inserted', result.changes, 'rows');
      }
    }
  } catch (e) {
    console.warn('[SQLiteBridge] Ownership history backfill skipped:', e?.message);
  }

  // Backfill transactions.owner_id for rental income (use history at tx date, else property.owner_id)
  try {
    const txCols = d.prepare('PRAGMA table_info(transactions)').all();
    if (txCols.some(c => c.name === 'owner_id')) {
      const update = d.prepare(`
        UPDATE transactions SET owner_id = COALESCE(
          (SELECT h.owner_id FROM property_ownership_history h
           WHERE h.property_id = transactions.property_id
             AND h.ownership_start_date <= transactions.date
             AND (h.ownership_end_date IS NULL OR h.ownership_end_date >= transactions.date)
           ORDER BY h.ownership_start_date DESC LIMIT 1),
          (SELECT p.owner_id FROM properties p WHERE p.id = transactions.property_id)
        )
        WHERE transactions.property_id IS NOT NULL
          AND transactions.type = 'Income'
          AND transactions.category_id = (SELECT id FROM categories WHERE name = 'Rental Income' LIMIT 1)
          AND (transactions.owner_id IS NULL OR transactions.owner_id = '')
      `);
      const result = update.run();
      if (result.changes > 0) {
        console.log('[SQLiteBridge] Transactions owner_id backfill: updated', result.changes, 'rows');
      }
    }
  } catch (e) {
    console.warn('[SQLiteBridge] Transactions owner_id backfill skipped:', e?.message);
  }

  // Tenant_id normalization removed: production DB and app data are already updated.
  // Running UPDATE on tenant-scoped tables on every open could trigger FOREIGN KEY
  // constraint failures in some edge cases; no longer needed.
}

// ---------------------------------------------------------------------------
// IPC Handlers (with optional transaction/lifecycle logging for persistence audit)
// ---------------------------------------------------------------------------

function logTransactionLifecycle(sql) {
  const s = String(sql).trim().toUpperCase();
  if (s.startsWith('BEGIN')) console.log('[SQLiteBridge] BEGIN TRANSACTION');
  else if (s.startsWith('COMMIT')) console.log('[SQLiteBridge] COMMIT');
  else if (s.startsWith('ROLLBACK')) console.log('[SQLiteBridge] ROLLBACK');
}

function setupHandlers() {
  // No auto-open at startup -- companyManager will call openDb() after migration/selection

  ipcMain.handle('sqlite:integrityStatus', () => _integrityOk);

  ipcMain.handle('sqlite:schemaHealth', () => ({ ..._schemaHealth, integrityOk: _integrityOk }));

  ipcMain.handle('sqlite:isReadOnly', () => _dbReadOnly);

  // Blob handlers (for sql.js compatibility -- kept for migration period)
  ipcMain.handle('sqlite:loadBlob', () => {
    try {
      if (!dbPath) return null;
      const blobPath = dbPath.replace(/\.db$/, '_sqljs.bin');
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
      if (!dbPath) return { ok: false, error: 'No database open' };
      const blobPath = dbPath.replace(/\.db$/, '_sqljs.bin');
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

  ipcMain.handle('sqlite:blobExists', () => {
    if (!dbPath) return false;
    return fs.existsSync(dbPath.replace(/\.db$/, '_sqljs.bin'));
  });

  ipcMain.handle('sqlite:clearBlob', () => {
    try {
      if (!dbPath) return { ok: true };
      const blobPath = dbPath.replace(/\.db$/, '_sqljs.bin');
      if (fs.existsSync(blobPath)) fs.unlinkSync(blobPath);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Native SQLite IPC
  ipcMain.handle('sqlite:query', (_event, sql, params = []) => {
    try {
      const d = getDb();
      if (!d) return { ok: false, error: 'No database open', rows: [] };
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
      logTransactionLifecycle(sql);
      const d = getDb();
      if (!d) return { ok: false, error: 'No database open' };
      const result = runWithImmediateTransactionWhenNeeded(d, sql, params);
      return { ok: true, changes: result.changes, lastInsertRowid: result.lastInsertRowid };
    } catch (err) {
      const msg = err && err.message;
      console.error('[SQLiteBridge] run error:', msg, 'SQL:', String(sql).slice(0, 200));
      if (msg && (msg.includes('FOREIGN KEY') || msg.includes('constraint failed'))) {
        console.error('[SQLiteBridge] FK failed params:', Array.isArray(params) ? params : [params]);
      }
      return { ok: false, error: msg };
    }
  });

  ipcMain.handle('sqlite:exec', (_event, sql) => {
    try {
      logTransactionLifecycle(sql);
      const d = getDb();
      if (!d) return { ok: false, error: 'No database open' };
      const block = assertWritesAllowed(sql);
      if (block) return { ok: false, error: block };
      d.exec(sql);
      if (isWriteSql(sql)) {
        logDbCommitSuccess('exec', sql, '');
        passiveCheckpointAfterWrite(d);
      }
      return { ok: true };
    } catch (err) {
      console.error('[SQLiteBridge] exec error:', err.message, 'SQL:', String(sql).slice(0, 200));
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('sqlite:transaction', async (_event, operations) => {
    try {
      const d = getDb();
      if (!d) return { ok: false, error: 'No database open' };
      if (Array.isArray(operations)) {
        for (let j = 0; j < operations.length; j++) {
          const op = operations[j];
          const block = op && op.sql ? assertWritesAllowed(op.sql) : null;
          if (block) return { ok: false, error: block };
        }
      }
      const tx = d.transaction(() => {
        const results = [];
        for (let i = 0; i < operations.length; i++) {
          const op = operations[i];
          try {
            if (op.type === 'query') {
              const stmt = d.prepare(op.sql);
              results.push(stmt.all(...(op.params || [])));
            } else if (op.type === 'run') {
              const stmt = d.prepare(op.sql);
              results.push(stmt.run(...(op.params || [])));
            }
          } catch (stmtErr) {
            const msg = stmtErr && stmtErr.message;
            if (msg && (msg.includes('FOREIGN KEY') || msg.includes('constraint failed'))) {
              console.error('[SQLiteBridge] transaction FK failed at op index', i, 'SQL:', String(op.sql).slice(0, 300), 'params:', op.params);
            }
            throw stmtErr;
          }
        }
        return results;
      });
      // better-sqlite3: .immediate() uses BEGIN IMMEDIATE (see docs/api.md)
      const results = typeof tx.immediate === 'function' ? tx.immediate() : tx();
      logDbCommitSuccess('batch', `transaction(${operations.length} ops)`, '');
      try {
        d.pragma('wal_checkpoint(PASSIVE)');
      } catch (_) {}
      return { ok: true, results };
    } catch (err) {
      const msg = err && err.message;
      console.error('[SQLiteBridge] transaction error:', msg);
      if (msg && (msg.includes('FOREIGN KEY') || msg.includes('constraint failed')) && Array.isArray(operations)) {
        operations.forEach((op, i) => { console.error('[SQLiteBridge] transaction op[' + i + ']:', String(op.sql).slice(0, 200)); });
      }
      return { ok: false, error: msg };
    }
  });

  ipcMain.handle('sqlite:getDbPath', () => getDbPath());

  // Sync IPC for main DB
  ipcMain.on('sqlite:querySync', (event, sql, params) => {
    try {
      const d = getDb();
      if (!d) { event.returnValue = { ok: false, error: 'No database open', rows: [] }; return; }
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
      logTransactionLifecycle(sql);
      const d = getDb();
      if (!d) { event.returnValue = { ok: false, error: 'No database open' }; return; }
      const result = runWithImmediateTransactionWhenNeeded(d, sql, params);
      event.returnValue = { ok: true, changes: result.changes, lastInsertRowid: result.lastInsertRowid };
    } catch (err) {
      const msg = err && err.message;
      console.error('[SQLiteBridge] runSync error:', msg, 'SQL:', String(sql).slice(0, 200));
      if (msg && (msg.includes('FOREIGN KEY') || msg.includes('constraint failed'))) {
        console.error('[SQLiteBridge] FK failed params:', Array.isArray(params) ? params : [params]);
      }
      event.returnValue = { ok: false, error: msg };
    }
  });

  ipcMain.on('sqlite:execSync', (event, sql) => {
    try {
      logTransactionLifecycle(sql);
      const d = getDb();
      if (!d) { event.returnValue = { ok: false, error: 'No database open' }; return; }
      const block = assertWritesAllowed(sql);
      if (block) { event.returnValue = { ok: false, error: block }; return; }
      d.exec(sql);
      if (isWriteSql(sql)) {
        logDbCommitSuccess('execSync', sql, '');
        passiveCheckpointAfterWrite(d);
      }
      event.returnValue = { ok: true };
    } catch (err) {
      console.error('[SQLiteBridge] execSync error:', err.message, 'SQL:', String(sql).slice(0, 200));
      event.returnValue = { ok: false, error: err.message };
    }
  });

  ipcMain.on('sqlite:readDbBytesSync', (event) => {
    try {
      const d = getDb();
      const p = getDbPath();
      if (!d || !p || !fs.existsSync(p)) {
        event.returnValue = p && !fs.existsSync(p)
          ? { ok: false, error: 'Database file not found.' }
          : { ok: false, error: 'No database open.' };
        return;
      }
      // Flush WAL into the main database file so the file on disk is complete
      d.pragma('wal_checkpoint(TRUNCATE)');
      const buf = fs.readFileSync(p);
      event.returnValue = { ok: true, data: Array.from(new Uint8Array(buf)) };
    } catch (err) {
      event.returnValue = { ok: false, error: err?.message };
    }
  });

  ipcMain.handle('sqlite:commitAllPending', () => commitAllPending());

  ipcMain.handle('sqlite:resetAndDeleteDb', () => {
    try {
      const p = getDbPath();
      close();
      if (p && fs.existsSync(p)) fs.unlinkSync(p);
      const blobPath = p ? p.replace(/\.db$/, '_sqljs.bin') : null;
      if (blobPath && fs.existsSync(blobPath)) fs.unlinkSync(blobPath);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err?.message };
    }
  });
}

module.exports = {
  setupHandlers,
  openDb,
  getDb,
  getDbPath,
  initSchema,
  close,
  walCheckpoint,
  walCheckpointPassive,
  walCheckpointFullSync,
  commitAllPending,
  isIntegrityOk: () => _integrityOk,
  getSchemaHealth: () => ({ ..._schemaHealth, integrityOk: _integrityOk }),
  isReadOnly: () => _dbReadOnly,
};
