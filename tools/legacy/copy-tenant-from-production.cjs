/**
 * Copy Tenant from Cloud Production DB to Local SQLite
 *
 * Copies all data for one tenant from production PostgreSQL into the local
 * SQLite DB and remaps tenant_id to 'local' so the local-only app can use it.
 *
 * IMPORTANT: Close the Electron app before running. The app must be closed so
 * the SQLite WAL is checkpointed.
 *
 * Usage:
 *   Set PG_URL in environment (e.g. in .env or export):
 *     PG_URL=postgresql://user:pass@host/dbname
 *   Then:
 *   node scripts/copy-tenant-from-production.cjs
 *
 * This script migrates data for tenant_1767873389330_fce675e2 only.
 * Optional: --local-db "C:\path\to\PBooksPro.db"  (default: %APPDATA%\pbooks-pro\pbookspro\PBooksPro.db)
 *
 * rental_agreements: If production has org_id, it is migrated into tenant_id and org_id is not copied (SQLite has no org_id).
 */

'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
const { Client } = require('pg');

// Load .env from project root and server/ if dotenv is available (optional)
const projectRoot = path.join(__dirname, '..');
try {
  const dotenv = require('dotenv');
  dotenv.config({ path: path.join(projectRoot, '.env') });
  dotenv.config({ path: path.join(projectRoot, 'server', '.env') });
} catch (_) {}

const DEFAULT_TENANT = 'tenant_1767873389330_fce675e2';
const LOCAL_TENANT = 'local';

const PG_URL = (process.env.PG_URL || process.env.DATABASE_URL || '').trim();
if (!PG_URL) {
  console.error('ERROR: PG_URL (or DATABASE_URL) is required.');
  console.error('');
  console.error('Create a .env file in the project root with:');
  console.error('  PG_URL=postgresql://user:password@host:5432/database');
  console.error('');
  console.error('Or set it in the terminal before running:');
  console.error('  $env:PG_URL="postgresql://user:password@host:5432/database"; npm run copy-tenant-from-production');
  process.exit(1);
}

function getLocalDbPath(customPath) {
  if (customPath) return path.resolve(customPath);
  // Same path the Electron app uses: .../pbooks-pro/pbookspro/PBooksPro.db
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appData, 'pbooks-pro', 'pbookspro', 'PBooksPro.db');
}

function parseArgs() {
  const args = process.argv.slice(2);
  let localDb = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--local-db' && args[i + 1]) {
      localDb = args[i + 1];
      i++;
    }
  }
  return { localDb };
}

// Tables ordered by FK dependency. tenantCol = column used for WHERE tenant_id = $1
// For "tenants" we use id; for "users" we use tenant_id.
const TABLES = [
  { table: 'tenants', tenantCol: 'id', isIdCol: true },           // single row WHERE id = $1
  { table: 'users', tenantCol: 'tenant_id' },
  { table: 'accounts', tenantCol: 'tenant_id' },
  { table: 'contacts', tenantCol: 'tenant_id' },
  { table: 'vendors', tenantCol: 'tenant_id' },
  { table: 'categories', tenantCol: 'tenant_id' },
  { table: 'projects', tenantCol: 'tenant_id' },
  { table: 'buildings', tenantCol: 'tenant_id' },
  { table: 'properties', tenantCol: 'tenant_id' },
  { table: 'units', tenantCol: 'tenant_id' },
  { table: 'documents', tenantCol: 'tenant_id' },
  { table: 'plan_amenities', tenantCol: 'tenant_id' },
  { table: 'installment_plans', tenantCol: 'tenant_id' },
  { table: 'budgets', tenantCol: 'tenant_id' },
  { table: 'rental_agreements', tenantCol: 'tenant_id' },
  { table: 'project_agreements', tenantCol: 'tenant_id' },
  { table: 'sales_returns', tenantCol: 'tenant_id' },
  { table: 'contracts', tenantCol: 'tenant_id' },
  { table: 'pm_cycle_allocations', tenantCol: 'tenant_id' },
  { table: 'transactions', tenantCol: 'tenant_id' },
  { table: 'invoices', tenantCol: 'tenant_id' },
  { table: 'bills', tenantCol: 'tenant_id' },
  { table: 'quotations', tenantCol: 'tenant_id' },
  { table: 'recurring_invoice_templates', tenantCol: 'tenant_id' },
  { table: 'purchase_orders', tenantCol: 'tenant_id' },
  { table: 'registered_suppliers', tenantCol: 'tenant_id' },
  { table: 'payroll_departments', tenantCol: 'tenant_id' },
  { table: 'payroll_grades', tenantCol: 'tenant_id' },
  { table: 'payroll_employees', tenantCol: 'tenant_id' },
  { table: 'payroll_runs', tenantCol: 'tenant_id' },
  { table: 'payslips', tenantCol: 'tenant_id' },
  { table: 'payroll_salary_components', tenantCol: 'tenant_id' },
  { table: 'sync_outbox', tenantCol: 'tenant_id' },
  { table: 'sync_metadata', tenantCol: 'tenant_id' },
  { table: 'whatsapp_menu_sessions', tenantCol: 'tenant_id' },
];

/**
 * Fetch rental_agreements from PG with org_id → tenant_id migration.
 * If production has org_id, filter by tenant_id = $1 OR org_id = $1, then set tenant_id from org_id where needed and remove org_id so SQLite (no org_id column) gets correct tenant_id only.
 */
async function fetchRentalAgreementsWithOrgIdMigration(pg, sourceTenant) {
  const hasOrgId = await pg.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rental_agreements' AND column_name = 'org_id' LIMIT 1`
  ).then((r) => r.rows.length > 0);
  const hasTenantId = await pg.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rental_agreements' AND column_name = 'tenant_id' LIMIT 1`
  ).then((r) => r.rows.length > 0);

  let query;
  if (hasOrgId && hasTenantId) {
    query = `SELECT * FROM rental_agreements WHERE tenant_id = $1 OR org_id = $1`;
  } else if (hasTenantId) {
    query = `SELECT * FROM rental_agreements WHERE tenant_id = $1`;
  } else if (hasOrgId) {
    query = `SELECT * FROM rental_agreements WHERE org_id = $1`;
  } else {
    return { rows: [], columns: [] };
  }

  const res = await pg.query(query, [sourceTenant]);
  const rows = res.rows || [];
  if (!rows.length) return { rows: [], columns: [] };

  // Migrate org_id into tenant_id; remove org_id so we don't insert it (SQLite has no org_id)
  for (const row of rows) {
    if (row.tenant_id == null || row.tenant_id === '') {
      row.tenant_id = row.org_id;
    }
    delete row.org_id;
  }
  const columns = Object.keys(rows[0]);
  return { rows, columns };
}

// Junction tables: no tenant_id; join to parent to scope by tenant
const JUNCTION_TABLES = [
  {
    table: 'project_agreement_units',
    sql: `SELECT pau.* FROM project_agreement_units pau
          JOIN project_agreements pa ON pa.id = pau.agreement_id
          WHERE pa.tenant_id = $1`,
  },
  {
    table: 'contract_categories',
    sql: `SELECT cc.* FROM contract_categories cc
          JOIN contracts c ON c.id = cc.contract_id
          WHERE c.tenant_id = $1`,
  },
];

function pgToSqlite(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'boolean') return val ? 1 : 0;
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'object') return JSON.stringify(val);
  return val;
}

function esc(v) {
  if (v === null || v === undefined) return 'NULL';
  const str = String(v).replace(/'/g, "''");
  return `'${str}'`;
}

function buildInsertSql(table, columns, rows, sourceTenant) {
  const colList = columns.map((c) => `"${c}"`).join(', ');
  const valuesList = rows.map((row) => {
    const vals = columns.map((col) => {
      let v = row[col];
      if (col === 'tenant_id' && v === sourceTenant) v = LOCAL_TENANT;
      if (col === 'id' && table === 'tenants' && v === sourceTenant) v = LOCAL_TENANT;
      if (col === 'buyer_tenant_id' && v === sourceTenant) v = LOCAL_TENANT;
      if (col === 'supplier_tenant_id' && v === sourceTenant) v = LOCAL_TENANT;
      v = pgToSqlite(v);
      if (v === null) return 'NULL';
      if (typeof v === 'number') return String(v);
      return esc(v);
    });
    return `(${vals.join(', ')})`;
  });
  return `INSERT OR IGNORE INTO "${table}" (${colList}) VALUES ${valuesList.join(',\n')};`;
}

async function migrateTable(db, tableDef, rows, columns, sourceTenant) {
  if (!rows.length) return { inserted: 0, skipped: 0 };
  const BATCH = 200;
  let inserted = 0;
  let skipped = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const sql = buildInsertSql(tableDef.table, columns, batch, sourceTenant);
    try {
      db.run(sql);
      inserted += batch.length;
    } catch (err) {
      inserted -= batch.length;
      for (const row of batch) {
        const singleSql = buildInsertSql(tableDef.table, columns, [row], sourceTenant);
        try {
          db.run(singleSql);
          inserted++;
        } catch {
          skipped++;
        }
      }
    }
  }
  return { inserted, skipped };
}

async function main() {
  const { localDb } = parseArgs();
  const SOURCE_TENANT = DEFAULT_TENANT; // This script migrates tenant_1767873389330_fce675e2 only
  const LOCAL_DB_PATH = getLocalDbPath(localDb);

  console.log('='.repeat(70));
  console.log('  Copy Tenant: Cloud Production → Local SQLite');
  console.log('='.repeat(70));
  console.log(`  Source tenant : ${SOURCE_TENANT} (fixed)`);
  console.log(`  Target tenant : ${LOCAL_TENANT}`);
  console.log(`  Local DB      : ${LOCAL_DB_PATH}`);
  console.log('='.repeat(70));
  console.log();
  console.log('  NOTE: Close the Electron app before running this.');
  console.log();

  if (!fs.existsSync(LOCAL_DB_PATH)) {
    console.error(`ERROR: Local DB not found: ${LOCAL_DB_PATH}`);
    console.error('Run the app once (e.g. npm run test:local-only) to create it first.');
    process.exit(1);
  }

  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  const walPath = LOCAL_DB_PATH + '-wal';
  if (fs.existsSync(walPath) && fs.statSync(walPath).size > 32) {
    console.log('  WARNING: A WAL file exists. For best results, close the app to checkpoint');
    console.log('           WAL, then re-run this script.');
    console.log();
  }

  console.log(`  [1/4] Loading local DB (${(fs.statSync(LOCAL_DB_PATH).size / 1024 / 1024).toFixed(1)} MB)...`);
  let dbBuffer;
  let db;
  try {
    dbBuffer = fs.readFileSync(LOCAL_DB_PATH);
    db = new SQL.Database(dbBuffer);
    const integrity = db.exec('PRAGMA integrity_check(1)');
    if (!integrity.length || integrity[0].values[0][0] !== 'ok') {
      db.close();
      throw new Error('Integrity check failed');
    }
  } catch (loadErr) {
    console.error('\n  ERROR: Local database file is corrupted or unreadable (database disk image is malformed).');
    console.error('  To fix:');
    console.error('    1. Close the app completely.');
    console.error('    2. Delete (or rename) the corrupted file:');
    console.error(`       ${LOCAL_DB_PATH}`);
    console.error('       And if present: .../PBooksPro.db-wal and .../PBooksPro.db-shm');
    console.error('    3. Start the app once so it creates a fresh empty database, then close it.');
    console.error('    4. Run this script again: npm run copy-tenant-from-production');
    console.error('');
    process.exit(1);
  }
  db.run('PRAGMA foreign_keys = OFF;');

  console.log('  [2/4] Connecting to cloud PostgreSQL...');
  const pg = new Client({
    connectionString: PG_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
  });
  await pg.connect();
  console.log('        Connected.\n');

  try {
    const tenantRow = await pg.query('SELECT name FROM tenants WHERE id = $1', [SOURCE_TENANT]);
    if (tenantRow.rows.length) {
      console.log(`  Tenant name   : "${tenantRow.rows[0].name}"`);
    } else {
      console.log('  WARNING: Tenant not found in production tenants table.');
    }
  } catch (e) {
    // ignore
  }

  console.log('\n  [3/4] Creating backup of local DB...');
  const backupName = `PBooksPro.db.backup-before-copy-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const backupPath = path.join(path.dirname(LOCAL_DB_PATH), backupName);
  fs.copyFileSync(LOCAL_DB_PATH, backupPath);
  console.log(`        Backup: ${backupName}`);

  console.log('\n  [4/4] Copying tables...\n');
  let totalInserted = 0;
  let totalSkipped = 0;

  for (const tableDef of TABLES) {
    process.stdout.write(`  ${tableDef.table.padEnd(40)} `);
    let rows;
    let columns;

    if (tableDef.table === 'rental_agreements') {
      try {
        const result = await fetchRentalAgreementsWithOrgIdMigration(pg, SOURCE_TENANT);
        rows = result.rows;
        columns = result.columns;
      } catch (err) {
        console.log(`SKIP (${(err.message || '').split('\n')[0].slice(0, 50)})`);
        continue;
      }
    } else {
      try {
        const col = tableDef.tenantCol;
        const query =
          tableDef.isIdCol
            ? `SELECT * FROM "${tableDef.table}" WHERE "${col}" = $1`
            : `SELECT * FROM "${tableDef.table}" WHERE "${col}" = $1`;
        const res = await pg.query(query, [SOURCE_TENANT]);
        rows = res.rows;
        columns = rows.length ? Object.keys(rows[0]) : [];
      } catch (err) {
        console.log(`SKIP (${(err.message || '').split('\n')[0].slice(0, 50)})`);
        continue;
      }
    }

    if (!rows.length) {
      console.log('0 rows');
      continue;
    }

    const { inserted, skipped } = await migrateTable(db, tableDef, rows, columns, SOURCE_TENANT);
    console.log(`${String(rows.length).padStart(5)} rows  →  +${inserted} inserted, ${skipped} skipped`);
    totalInserted += inserted;
    totalSkipped += skipped;
  }

  for (const { table, sql } of JUNCTION_TABLES) {
    process.stdout.write(`  ${table.padEnd(40)} `);
    let rows;
    try {
      const res = await pg.query(sql, [SOURCE_TENANT]);
      rows = res.rows;
    } catch (err) {
      console.log(`SKIP (${(err.message || '').split('\n')[0].slice(0, 50)})`);
      continue;
    }

    if (!rows.length) {
      console.log('0 rows');
      continue;
    }

    const columns = Object.keys(rows[0]);
    let inserted = 0,
      skipped = 0;
    for (const row of rows) {
      const s = buildInsertSql(table, columns, [row], SOURCE_TENANT);
      try {
        db.run(s);
        inserted++;
      } catch {
        skipped++;
      }
    }
    console.log(`${String(rows.length).padStart(5)} rows  →  +${inserted} inserted, ${skipped} skipped`);
    totalInserted += inserted;
    totalSkipped += skipped;
  }

  await pg.end();

  // Critical: set app_settings.tenantId to 'local' so the app does not think the tenant changed
  // and clear all data on startup (AppContext compares localTenantId with effectiveTenantId).
  try {
    db.run(`INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('tenantId', '"local"', datetime('now'))`);
    console.log('\n  Set app_settings.tenantId = "local" (prevents app from clearing DB on load).');
  } catch (e) {
    console.warn('  WARNING: Could not set app_settings.tenantId:', e.message);
  }

  db.run('PRAGMA foreign_keys = ON;');

  console.log('\n  Saving updated local DB...');
  const data = db.export();
  db.close();

  // Write to system temp dir first (avoids EPERM when target is in AppData), verify, then copy over target
  const dbDir = path.dirname(LOCAL_DB_PATH);
  const tempPath = path.join(os.tmpdir(), `PBooksPro-copy-${Date.now()}.db`);
  try {
    fs.writeFileSync(tempPath, Buffer.from(data));
    const verifyDb = new SQL.Database(fs.readFileSync(tempPath));
    const check = verifyDb.exec('PRAGMA integrity_check(1)');
    verifyDb.close();
    if (!check.length || check[0].values[0][0] !== 'ok') {
      fs.unlinkSync(tempPath);
      throw new Error('Written database failed integrity check');
    }
    // Overwrite target (no unlink/rename — avoids EPERM on Windows when file is locked)
    fs.copyFileSync(tempPath, LOCAL_DB_PATH);
    try { fs.unlinkSync(tempPath); } catch (_) {}
  } catch (writeErr) {
    if (fs.existsSync(tempPath)) try { fs.unlinkSync(tempPath); } catch (_) {}
    const isEperm = writeErr.code === 'EPERM' || (writeErr.message && writeErr.message.includes('EPERM'));
    console.error('\n  ERROR: Failed to save database:', writeErr.message);
    if (isEperm) {
      console.error('\n  The database file may be in use. Close the Electron app completely, then run:');
      console.error('  npm run copy-tenant-from-production');
    }
    process.exit(1);
  }

  try {
    if (fs.existsSync(LOCAL_DB_PATH + '-wal')) fs.unlinkSync(LOCAL_DB_PATH + '-wal');
  } catch {}
  try {
    if (fs.existsSync(LOCAL_DB_PATH + '-shm')) fs.unlinkSync(LOCAL_DB_PATH + '-shm');
  } catch {}

  const blobPath = path.join(dbDir, 'PBooksPro_sqljs.bin');
  try {
    fs.copyFileSync(LOCAL_DB_PATH, blobPath);
    console.log(`  Blob synced: ${path.basename(blobPath)}`);
  } catch (blobErr) {
    console.log(`  WARNING: Could not update blob. Run: node scripts/sync-db-to-blob.cjs`);
  }

  const finalMb = (fs.statSync(LOCAL_DB_PATH).size / 1024 / 1024).toFixed(1);
  console.log(`  Saved: ${LOCAL_DB_PATH} (${finalMb} MB)`);

  console.log();
  console.log('='.repeat(70));
  console.log('  COPY COMPLETE');
  console.log(`  Rows inserted : ${totalInserted}`);
  console.log(`  Rows skipped  : ${totalSkipped} (already existed or UNIQUE conflict)`);
  console.log('='.repeat(70));
  console.log();
  console.log('  Next: Run the app (e.g. npm run test:local-only). Data is under tenant "local".');
  console.log(`  Backup: ${backupPath}`);
  console.log();
}

main().catch((err) => {
  console.error('\nFATAL ERROR:', err.message || err);
  process.exit(1);
});
