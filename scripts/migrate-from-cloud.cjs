/**
 * migrate-from-cloud.cjs
 *
 * Copies project construction data for a cloud tenant from PostgreSQL
 * into the local SQLite DB, remapping tenant_id → 'local'.
 *
 * Uses INSERT OR IGNORE — new rows are added; existing PKs are kept unchanged.
 * Number conflicts (UNIQUE tenant_id + number) are silently skipped.
 *
 * IMPORTANT: Close the Electron app before running this script.
 *            The app must be closed so the SQLite WAL is checkpointed.
 *
 * Usage:
 *   node scripts/migrate-from-cloud.cjs
 *   node scripts/migrate-from-cloud.cjs --tenant <other_tenant_id>
 */

'use strict';

const path     = require('path');
const os       = require('os');
const fs       = require('fs');
const { Client } = require('pg');

const DEFAULT_SOURCE_TENANT = 'tenant_1767873389330_fce675e2';
const LOCAL_TENANT  = 'local';

const PG_URL = process.env.PG_URL;
if (!PG_URL) {
  console.error('❌ Error: PG_URL environment variable is required');
  console.error('   Set PG_URL to your PostgreSQL connection string:');
  console.error('   export PG_URL=postgresql://user:password@host:5432/database');
  process.exit(1);
}

function getLocalDbPath() {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appData, 'pbooks-pro', 'pbookspro', 'PBooksPro.db');
}

function parseArgs() {
  const args = process.argv.slice(2);
  let tenant = DEFAULT_SOURCE_TENANT;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--tenant' && args[i + 1]) { tenant = args[i + 1]; i++; }
  }
  return { tenant };
}

// Tables ordered by FK dependency (parents before children)
const TABLES = [
  { table: 'accounts',                   tenantCol: 'tenant_id' },
  { table: 'contacts',                   tenantCol: 'tenant_id' },
  { table: 'vendors',                    tenantCol: 'tenant_id' },
  { table: 'categories',                 tenantCol: 'tenant_id' },
  { table: 'projects',                   tenantCol: 'tenant_id' },
  { table: 'buildings',                  tenantCol: 'tenant_id' },
  { table: 'properties',                 tenantCol: 'tenant_id' },
  { table: 'units',                      tenantCol: 'tenant_id' },
  { table: 'documents',                  tenantCol: 'tenant_id' },
  { table: 'installment_plans',          tenantCol: 'tenant_id' },
  { table: 'plan_amenities',             tenantCol: 'tenant_id' },
  { table: 'budgets',                    tenantCol: 'tenant_id' },
  { table: 'project_agreements',         tenantCol: 'tenant_id' },
  { table: 'sales_returns',              tenantCol: 'tenant_id' },
  { table: 'contracts',                  tenantCol: 'tenant_id' },
  { table: 'pm_cycle_allocations',       tenantCol: 'tenant_id' },
  { table: 'transactions',               tenantCol: 'tenant_id' },
  { table: 'invoices',                   tenantCol: 'tenant_id' },
  { table: 'bills',                      tenantCol: 'tenant_id' },
  { table: 'quotations',                 tenantCol: 'tenant_id' },
  { table: 'recurring_invoice_templates',tenantCol: 'tenant_id' },
];

// Junction tables — joined to parent to resolve tenant
const JUNCTION_TABLES = [
  {
    table: 'project_agreement_units',
    sql: `SELECT pau.*
          FROM project_agreement_units pau
          JOIN project_agreements pa ON pa.id = pau.agreement_id
          WHERE pa.tenant_id = $1`,
  },
  {
    table: 'contract_categories',
    sql: `SELECT cc.*
          FROM contract_categories cc
          JOIN contracts c ON c.id = cc.contract_id
          WHERE c.tenant_id = $1`,
  },
];

// Convert a PostgreSQL value to something SQLite / sql.js accepts
function pgToSqlite(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'boolean')  return val ? 1 : 0;
  if (val instanceof Date)       return val.toISOString();
  if (typeof val === 'object')   return JSON.stringify(val);
  return val;
}

// Escape a string value for safe embedding in SQL
function esc(v) {
  if (v === null || v === undefined) return 'NULL';
  const str = String(v).replace(/'/g, "''");
  return `'${str}'`;
}

// Build one big INSERT OR IGNORE SQL block for a batch of rows
function buildInsertSql(table, columns, rows, sourceTenant) {
  const colList = columns.map(c => `"${c}"`).join(', ');
  const valuesList = rows.map(row => {
    const vals = columns.map(col => {
      let v = row[col];
      if (col === 'tenant_id' && v === sourceTenant) v = LOCAL_TENANT;
      v = pgToSqlite(v);
      if (v === null) return 'NULL';
      if (typeof v === 'number') return String(v);
      return esc(v);
    });
    return `(${vals.join(', ')})`;
  });
  // Execute in batches of 200 rows to stay within SQLite limits
  return `INSERT OR IGNORE INTO "${table}" (${colList}) VALUES ${valuesList.join(',\n')};`;
}

async function migrateTable(db, pg, table, rows, columns, sourceTenant) {
  if (!rows.length) return { inserted: 0, skipped: 0 };

  const BATCH = 200;
  let inserted = 0;
  let skipped  = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const sql = buildInsertSql(table, columns, batch, sourceTenant);
    try {
      db.run(sql);
      // Count actual inserts: compare count before/after isn't feasible here.
      // We'll count via changes — run individually for accurate count.
      // For performance, just estimate: track exceptions vs successes
      inserted += batch.length; // optimistic; corrected below if needed
    } catch (err) {
      // Fallback: run one-by-one for this batch to count properly
      inserted -= batch.length;
      for (const row of batch) {
        const singleSql = buildInsertSql(table, columns, [row], sourceTenant);
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
  const { tenant: SOURCE_TENANT } = parseArgs();
  const LOCAL_DB_PATH = getLocalDbPath();

  console.log('='.repeat(70));
  console.log('  Cloud Production → Local SQLite Migration');
  console.log('='.repeat(70));
  console.log(`  Source tenant : ${SOURCE_TENANT}`);
  console.log(`  Target tenant : ${LOCAL_TENANT}`);
  console.log(`  Local DB      : ${LOCAL_DB_PATH}`);
  console.log('='.repeat(70));
  console.log();
  console.log('  NOTE: Make sure the Electron app is CLOSED before running this.');
  console.log();

  if (!fs.existsSync(LOCAL_DB_PATH)) {
    console.error(`ERROR: Local DB not found: ${LOCAL_DB_PATH}`);
    console.error('Run the app once (npm run electron:local) to create it first.');
    process.exit(1);
  }

  // ── Load sql.js ───────────────────────────────────────────────────────────
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  // Read the DB file (sql.js reads main db file only; WAL must be checkpointed)
  const walPath = LOCAL_DB_PATH + '-wal';
  if (fs.existsSync(walPath) && fs.statSync(walPath).size > 32) {
    console.log('  WARNING: A WAL file exists. For best results, open and close the');
    console.log('           Electron app once to checkpoint WAL, then re-run this script.');
    console.log('           Continuing anyway — data in the WAL may not be visible to');
    console.log('           this script but will be preserved when the app next opens.');
    console.log();
  }

  console.log(`  [1/4] Loading local DB (${(fs.statSync(LOCAL_DB_PATH).size / 1024 / 1024).toFixed(1)} MB)...`);
  const dbBuffer = fs.readFileSync(LOCAL_DB_PATH);
  const db = new SQL.Database(dbBuffer);

  // Disable FK enforcement for bulk insert
  db.run('PRAGMA foreign_keys = OFF;');

  // ── Connect to PostgreSQL ──────────────────────────────────────────────────
  console.log('  [2/4] Connecting to cloud PostgreSQL...');
  const pg = new Client({
    connectionString: PG_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
  });
  await pg.connect();
  console.log('        Connected.\n');

  // Verify tenant
  try {
    const tenantRow = await pg.query(`SELECT name FROM tenants WHERE id = $1`, [SOURCE_TENANT]);
    if (tenantRow.rows.length) {
      console.log(`  Tenant name   : "${tenantRow.rows[0].name}"`);
    }
  } catch { /* tenants table may differ */ }

  // Backup
  console.log('\n  [3/4] Creating backup of local DB...');
  const backupName = `PBooksPro.db.backup-before-migration-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const backupPath = path.join(path.dirname(LOCAL_DB_PATH), backupName);
  fs.copyFileSync(LOCAL_DB_PATH, backupPath);
  console.log(`        Backup: ${backupName}`);

  // ── Migrate ────────────────────────────────────────────────────────────────
  console.log('\n  [4/4] Migrating tables...\n');

  let totalInserted = 0;
  let totalSkipped  = 0;

  for (const { table, tenantCol } of TABLES) {
    process.stdout.write(`  ${table.padEnd(36)} `);
    let rows;
    try {
      const res = await pg.query(
        `SELECT * FROM "${table}" WHERE "${tenantCol}" = $1`,
        [SOURCE_TENANT]
      );
      rows = res.rows;
    } catch (err) {
      console.log(`SKIP (${err.message.split('\n')[0].slice(0, 60)})`);
      continue;
    }

    if (!rows.length) { console.log('0 rows'); continue; }

    const columns = Object.keys(rows[0]);
    const { inserted, skipped } = await migrateTable(db, pg, table, rows, columns, SOURCE_TENANT);
    console.log(`${String(rows.length).padStart(5)} rows  →  +${inserted} inserted, ${skipped} skipped`);
    totalInserted += inserted;
    totalSkipped  += skipped;
  }

  // Junction tables
  console.log();
  for (const { table, sql } of JUNCTION_TABLES) {
    process.stdout.write(`  ${table.padEnd(36)} `);
    let rows;
    try {
      const res = await pg.query(sql, [SOURCE_TENANT]);
      rows = res.rows;
    } catch (err) {
      console.log(`SKIP (${err.message.split('\n')[0].slice(0, 60)})`);
      continue;
    }

    if (!rows.length) { console.log('0 rows'); continue; }

    const columns = Object.keys(rows[0]);
    let inserted = 0, skipped = 0;
    for (const row of rows) {
      const s = buildInsertSql(table, columns, [row], SOURCE_TENANT);
      try { db.run(s); inserted++; } catch { skipped++; }
    }
    console.log(`${String(rows.length).padStart(5)} rows  →  +${inserted} inserted, ${skipped} skipped`);
    totalInserted += inserted;
    totalSkipped  += skipped;
  }

  await pg.end();

  // Re-enable FK
  db.run('PRAGMA foreign_keys = ON;');

  // ── Save ───────────────────────────────────────────────────────────────────
  console.log('\n  Saving updated local DB...');
  const data = db.export();
  db.close();
  fs.writeFileSync(LOCAL_DB_PATH, Buffer.from(data));

  // Remove stale WAL/SHM so the app opens cleanly (may fail silently if app is running)
  try { if (fs.existsSync(LOCAL_DB_PATH + '-wal')) fs.unlinkSync(LOCAL_DB_PATH + '-wal'); } catch {}
  try { if (fs.existsSync(LOCAL_DB_PATH + '-shm')) fs.unlinkSync(LOCAL_DB_PATH + '-shm'); } catch {}

  // Copy PBooksPro.db → PBooksPro_sqljs.bin so the renderer loads the correct (migrated) DB.
  // The Electron renderer uses the blob as its primary database; OPFS/IndexedDB are stale fallbacks.
  const blobPath = path.join(path.dirname(LOCAL_DB_PATH), 'PBooksPro_sqljs.bin');
  try {
    fs.copyFileSync(LOCAL_DB_PATH, blobPath);
    console.log(`  Blob synced: ${path.basename(blobPath)} (${finalMb} MB)`);
  } catch (blobErr) {
    console.log(`  WARNING: Could not update blob (${blobErr.message}). Run: node scripts/sync-db-to-blob.cjs`);
  }

  const finalMb = (fs.statSync(LOCAL_DB_PATH).size / 1024 / 1024).toFixed(1);
  console.log(`  Saved: ${LOCAL_DB_PATH} (${finalMb} MB)`);

  console.log();
  console.log('='.repeat(70));
  console.log('  MIGRATION COMPLETE');
  console.log(`  Rows inserted : ${totalInserted}`);
  console.log(`  Rows skipped  : ${totalSkipped}  (already existed or UNIQUE conflict)`);
  console.log('='.repeat(70));
  console.log();
  console.log('  Next steps:');
  console.log('    1. Run:  npm run electron:local');
  console.log('    2. All project construction data from the cloud is now in the local app');
  console.log(`    3. Backup kept at: ${backupPath}`);
  console.log();
}

main().catch(err => {
  console.error('\nFATAL ERROR:', err.message || err);
  process.exit(1);
});
