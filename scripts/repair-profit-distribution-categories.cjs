#!/usr/bin/env node
/**
 * One-off repair: set category_id to canonical Profit Share expense (sys-cat-profit-share)
 * on transactions that are profit-distribution clearing legs but were mis-tagged (e.g. first
 * arbitrary expense category).
 *
 * Criteria (conservative):
 * - type = Expense
 * - description LIKE 'Profit Distribution:%'
 * - account_id is an account named "Internal Clearing"
 * - category_id IS DISTINCT FROM sys-cat-profit-share
 * - deleted_at IS NULL (if column exists)
 *
 * Also ensures the categories row for sys-cat-profit-share exists (same as migration 040).
 *
 * SQLite (local Electron DB):
 *   node scripts/repair-profit-distribution-categories.cjs
 *   node scripts/repair-profit-distribution-categories.cjs "F:\\path\\PBooksPro.db"
 *   node scripts/repair-profit-distribution-categories.cjs --dry-run
 *
 * PostgreSQL (LAN API DB) — load DATABASE_URL from root .env:
 *   Do NOT run bare `dotenv` in PowerShell (not on PATH). Use one of:
 *   npm run repair:profit-distribution-categories:pg -- --dry-run
 *   npm run repair:profit-distribution-categories:pg -- --dry-run --tenant-id YOUR_TENANT_ID
 *   npm run repair:profit-distribution-categories:pg --
 *   npx dotenv-cli -e .env -- node scripts/repair-profit-distribution-categories.cjs --pg --dry-run
 *
 * IMPORTANT: Close the Electron app before editing SQLite to avoid locks.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const TARGET_CATEGORY_ID = 'sys-cat-profit-share';
const TARGET_CATEGORY_NAME = 'Profit Share';
const TARGET_CATEGORY_TYPE = 'Expense';

const projectRoot = path.join(__dirname, '..');

try {
  const dotenv = require('dotenv');
  dotenv.config({ path: path.join(projectRoot, '.env') });
  dotenv.config({ path: path.join(projectRoot, 'backend', '.env') });
} catch (_) {}

function getPossibleDbPaths() {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return [
    path.join(appData, 'pbooks-pro', 'pbookspro', 'PBooksPro-Staging.db'),
    path.join(appData, 'pbooks-pro', 'pbookspro', 'PBooksPro.db'),
    path.join(appData, 'PBooks Pro', 'pbookspro', 'PBooksPro-Staging.db'),
    path.join(appData, 'PBooks Pro', 'pbookspro', 'PBooksPro.db'),
    path.join(projectRoot, 'finance_db.sqlite'),
  ];
}

function findDefaultSqlitePath(overridePath) {
  if (overridePath) {
    const resolved = path.resolve(overridePath);
    return fs.existsSync(resolved) ? resolved : null;
  }
  for (const p of getPossibleDbPaths()) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  let sqlitePath = null;
  let dryRun = false;
  let usePg = false;
  let tenantId = null;
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry-run') dryRun = true;
    else if (a === '--pg') usePg = true;
    else if (a === '--sqlite' && args[i + 1]) sqlitePath = args[++i];
    else if (a.startsWith('--sqlite=')) sqlitePath = a.slice('--sqlite='.length).trim();
    else if (a === '--tenant-id' && args[i + 1]) tenantId = args[++i];
    else if (!a.startsWith('-')) positional.push(a);
  }
  if (!sqlitePath && positional.length && !usePg) sqlitePath = positional[0];
  return { sqlitePath, dryRun, usePg, tenantId };
}

function tableExistsSqlite(db, name) {
  const r = db.exec(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=" + JSON.stringify(name)
  );
  return r.length > 0 && r[0].values && r[0].values.length > 0;
}

function columnExistsSqlite(db, table, col) {
  const r = db.exec('PRAGMA table_info(' + JSON.stringify(table) + ')');
  if (!r.length || !r[0].values) return false;
  const cols = r[0].values.map((row) => row[1]);
  return cols.includes(col);
}

async function repairSqlite(dbPath, dryRun) {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(fileBuffer);

  if (!tableExistsSqlite(db, 'transactions') || !tableExistsSqlite(db, 'categories')) {
    console.error('❌ Expected tables `transactions` and `categories` not found.');
    db.close();
    process.exit(1);
  }

  const hasDeletedAt = columnExistsSqlite(db, 'transactions', 'deleted_at');

  db.run(
    `INSERT OR IGNORE INTO categories (id, tenant_id, name, type, is_permanent, is_rental, is_hidden, version, updated_at)
     VALUES (?, '__system__', ?, ?, 1, 0, 0, 1, datetime('now'))`,
    [TARGET_CATEGORY_ID, TARGET_CATEGORY_NAME, TARGET_CATEGORY_TYPE]
  );

  const clearingFilter =
    'account_id IN (SELECT id FROM accounts WHERE name = ' + JSON.stringify('Internal Clearing') + ')';

  const deletedClause = hasDeletedAt ? 'AND (deleted_at IS NULL OR deleted_at = \'\')' : '';

  const countSql =
    `SELECT COUNT(*) AS n FROM transactions WHERE type = 'Expense'
     AND description LIKE 'Profit Distribution:%'
     AND ` +
    clearingFilter +
    `
     AND (category_id IS NULL OR category_id != ?)
     ` +
    deletedClause;

  const countStmt = db.prepare(countSql);
  countStmt.bind([TARGET_CATEGORY_ID]);
  countStmt.step();
  const countRow = countStmt.getAsObject();
  countStmt.free();
  const n = Number(countRow.n || 0);

  console.log(`📦 SQLite: ${dbPath}`);
  console.log(`   Rows matching repair criteria: ${n}`);
  if (n === 0) {
    console.log('ℹ️  Nothing to update.');
    db.close();
    return;
  }

  if (dryRun) {
    const sampleSql =
      `SELECT id, amount, date, description, category_id FROM transactions WHERE type = 'Expense'
       AND description LIKE 'Profit Distribution:%'
       AND ` +
      clearingFilter +
      `
       AND (category_id IS NULL OR category_id != ?)
       ` +
      deletedClause +
      ` LIMIT 15`;
    const sampleStmt = db.prepare(sampleSql);
    sampleStmt.bind([TARGET_CATEGORY_ID]);
    console.log('\n🔍 DRY RUN — sample rows (up to 15):');
    let any = false;
    while (sampleStmt.step()) {
      any = true;
      console.log('   ', JSON.stringify(sampleStmt.getAsObject()));
    }
    sampleStmt.free();
    if (!any) console.log('   (none)');
    console.log('\n🔍 DRY RUN — no file changes.');
    db.close();
    return;
  }

  const updateSql =
    `UPDATE transactions SET category_id = ?, updated_at = datetime('now'), version = version + 1
     WHERE type = 'Expense'
     AND description LIKE 'Profit Distribution:%'
     AND ` +
    clearingFilter +
    `
     AND (category_id IS NULL OR category_id != ?)
     ` +
    deletedClause;

  db.run(updateSql, [TARGET_CATEGORY_ID, TARGET_CATEGORY_ID]);
  const out = db.export();
  fs.writeFileSync(dbPath, Buffer.from(out));
  db.close();
  console.log(`✅ Updated ${n} transaction row(s). Category ${TARGET_CATEGORY_ID} ensured.`);
}

async function repairPostgres(dryRun, tenantId) {
  const databaseUrl = process.env.DATABASE_URL || process.env.PG_URL;
  if (!databaseUrl) {
    console.error('❌ Set DATABASE_URL (or PG_URL) for --pg mode.');
    process.exit(1);
  }
  const { Client } = require('pg');
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query(
      `INSERT INTO categories (id, tenant_id, name, type, is_permanent, is_rental, is_hidden, version)
       VALUES ($1, '__system__', $2, $3, TRUE, FALSE, FALSE, 1)
       ON CONFLICT (id) DO NOTHING`,
      [TARGET_CATEGORY_ID, TARGET_CATEGORY_NAME, TARGET_CATEGORY_TYPE]
    );

    const tenantClause = tenantId ? 'AND t.tenant_id = $2' : '';
    const countRes = await client.query(
      `SELECT COUNT(*)::int AS n FROM transactions t
       WHERE t.type = 'Expense'
         AND t.description LIKE 'Profit Distribution:%'
         AND t.account_id IN (SELECT id FROM accounts WHERE name = 'Internal Clearing')
         AND (t.category_id IS DISTINCT FROM $1)
         AND (t.deleted_at IS NULL)
         ${tenantClause}`,
      tenantId ? [TARGET_CATEGORY_ID, tenantId] : [TARGET_CATEGORY_ID]
    );

    const n = countRes.rows[0].n;
    console.log(`📦 PostgreSQL: ${databaseUrl.replace(/:[^:@/]+@/, ':****@')}`);
    if (tenantId) console.log(`   tenant_id filter: ${tenantId}`);
    console.log(`   Rows matching repair criteria: ${n}`);

    if (n === 0) {
      console.log('ℹ️  Nothing to update.');
      return;
    }

    if (dryRun) {
      const sample = await client.query(
        `SELECT t.id, t.amount, t.date, t.description, t.category_id, t.tenant_id
         FROM transactions t
         WHERE t.type = 'Expense'
           AND t.description LIKE 'Profit Distribution:%'
           AND t.account_id IN (SELECT id FROM accounts WHERE name = 'Internal Clearing')
           AND (t.category_id IS DISTINCT FROM $1)
           AND (t.deleted_at IS NULL)
           ${tenantClause}
         LIMIT 15`,
        tenantId ? [TARGET_CATEGORY_ID, tenantId] : [TARGET_CATEGORY_ID]
      );
      console.log('\n🔍 DRY RUN — sample rows:');
      sample.rows.forEach((r) => console.log('   ', JSON.stringify(r)));
      console.log('\n🔍 DRY RUN — no database changes.');
      return;
    }

    const updateRes = await client.query(
      `UPDATE transactions t
       SET category_id = $1,
           updated_at = NOW(),
           version = version + 1
       WHERE t.type = 'Expense'
         AND t.description LIKE 'Profit Distribution:%'
         AND t.account_id IN (SELECT id FROM accounts WHERE name = 'Internal Clearing')
         AND (t.category_id IS DISTINCT FROM $1)
         AND (t.deleted_at IS NULL)
         ${tenantClause}
       RETURNING t.id`,
      tenantId ? [TARGET_CATEGORY_ID, tenantId] : [TARGET_CATEGORY_ID]
    );

    console.log(`✅ Updated ${updateRes.rowCount} transaction row(s).`);
  } finally {
    await client.end();
  }
}

async function main() {
  const { sqlitePath, dryRun, usePg, tenantId } = parseArgs(process.argv);

  if (dryRun) console.log('🔍 DRY RUN — preview only\n');

  if (usePg) {
    await repairPostgres(dryRun, tenantId);
    return;
  }

  const resolved = findDefaultSqlitePath(sqlitePath);
  if (!resolved) {
    console.error(
      '❌ SQLite database not found. Pass path: node scripts/repair-profit-distribution-categories.cjs "F:\\\\path\\\\PBooksPro.db"'
    );
    process.exit(1);
  }

  await repairSqlite(resolved, dryRun);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
