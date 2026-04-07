/**
 * Repair PostgreSQL `category_id` on `bills` and `transactions` after a SQLite → PostgreSQL
 * migration where categories were skipped (`ON CONFLICT DO NOTHING`) or IDs did not line up.
 *
 * What it does (for a target tenant in PostgreSQL):
 * 1. Upserts rows from SQLite `categories` (same `id`, remapped `tenant_id`) so FK targets exist.
 * 2. Sets `bills.category_id` from the SQLite backup for each bill id.
 * 3. Sets `transactions.category_id` from the SQLite backup for each transaction id.
 * 4. For Expense rows with `bill_id` still NULL category, copies `category_id` from the linked bill.
 *
 * Prerequisites: same as sqlite-to-postgres-rk-builders.cjs (DATABASE_URL, sql.js, pg, root .env).
 * Environment: DATABASE_URL or PG_URL; SQLITE_BACKUP_PATH (optional); PG_TARGET_TENANT_ID (optional).
 *
 * Usage:
 *   npm run repair:pg-categories
 *     (uses default backup folder below, or SQLITE_BACKUP_PATH in .env, or --sqlite PATH)
 *   node scripts/repair-postgres-categories-from-sqlite.cjs --sqlite "F:\\path\\backup.db"
 *   node scripts/repair-postgres-categories-from-sqlite.cjs --sqlite "F:\\folder" --pg-tenant-id rk-builders-284d6d --dry-run
 *
 * Default SQLite path (same as migrate:sqlite-to-postgres):
 *   F:\\DB Backup pbookspro\\rkbuilders_14_3_2026_backup_20260329_142110
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { Client } = require('pg');

const projectRoot = path.join(__dirname, '..');
try {
  const dotenv = require('dotenv');
  dotenv.config({ path: path.join(projectRoot, '.env') });
  dotenv.config({ path: path.join(projectRoot, 'backend', '.env') });
} catch (_) {}

const DEFAULT_PG_TENANT_ID = process.env.PG_TARGET_TENANT_ID || 'rk-builders-284d6d';
const DEFAULT_PG_TENANT_NAME = 'RK Builders';
/** Same default as scripts/sqlite-to-postgres-rk-builders.cjs (folder or largest .db inside). */
const DEFAULT_SQLITE_PATH =
  'F:\\DB Backup pbookspro\\rkbuilders_14_3_2026_backup_20260329_142110';

function parseArgs() {
  const args = process.argv.slice(2);
  let sqlitePath = null;
  let pgTenantName = DEFAULT_PG_TENANT_NAME;
  let pgTenantId = null;
  let sourceTenant = null;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--sqlite') {
      const parts = [];
      while (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        i++;
        parts.push(args[i]);
      }
      sqlitePath = parts.join(' ').trim() || null;
    } else if (a.startsWith('--sqlite=')) {
      sqlitePath = a.slice('--sqlite='.length).trim() || null;
    } else if (a === '--pg-tenant-name' && args[i + 1]) {
      pgTenantName = args[++i];
    } else if (a === '--pg-tenant-id' && args[i + 1]) {
      pgTenantId = args[++i];
    } else if (a === '--source-tenant' && args[i + 1]) {
      sourceTenant = args[++i];
    } else if (a === '--dry-run') {
      dryRun = true;
    }
  }
  if (!sqlitePath) sqlitePath = process.env.SQLITE_BACKUP_PATH || DEFAULT_SQLITE_PATH;
  if (!pgTenantId) pgTenantId = (process.env.PG_TARGET_TENANT_ID || '').trim() || DEFAULT_PG_TENANT_ID;
  return { sqlitePath, pgTenantName, pgTenantId, sourceTenant, dryRun };
}

function resolveSqliteDbPath(input) {
  if (!input) {
    throw new Error(
      'Set SQLite backup path: pass --sqlite PATH, or SQLITE_BACKUP_PATH in .env, or edit DEFAULT_SQLITE_PATH in this script.'
    );
  }
  let resolved = path.resolve(String(input).trim());
  if (!fs.existsSync(resolved)) {
    const withDb = resolved + '.db';
    if (fs.existsSync(withDb)) resolved = withDb;
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(`SQLite path does not exist: ${resolved}`);
  }
  const st = fs.statSync(resolved);
  if (st.isFile()) return resolved;
  if (st.isDirectory()) {
    const files = fs.readdirSync(resolved).filter((f) => f.toLowerCase().endsWith('.db'));
    if (!files.length) throw new Error(`No .db file in directory: ${resolved}`);
    if (files.length === 1) return path.join(resolved, files[0]);
    const withPath = files.map((f) => ({
      f,
      p: path.join(resolved, f),
      s: fs.statSync(path.join(resolved, f)).size,
    }));
    withPath.sort((a, b) => b.s - a.s);
    console.log(`Directory has ${files.length} .db files; using largest: ${withPath[0].f}`);
    return withPath[0].p;
  }
  throw new Error(`Not a file or directory: ${resolved}`);
}

function sqliteAll(db, sql, params = []) {
  const stmt = db.prepare(sql);
  if (params && params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function quoteIdentLite(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function quoteIdentPg(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function parseAppSettingTenantId(raw) {
  if (raw == null || raw === '') return null;
  let s = String(raw).trim();
  if (!s) return null;
  if ((s[0] === '"' && s[s.length - 1] === '"') || (s[0] === "'" && s[s.length - 1] === "'")) {
    s = s.slice(1, -1);
  }
  try {
    const j = JSON.parse(s);
    if (typeof j === 'string') return j;
  } catch (_) {}
  return s;
}

function tryAppSettingsSourceTenant(sqlite) {
  const keys = ['tenantId', 'current_tenant_id', 'current_org_id'];
  for (const key of keys) {
    try {
      const r = sqliteAll(sqlite, `SELECT value FROM app_settings WHERE key = ?`, [key]);
      if (r.length && r[0].value != null) {
        const id = parseAppSettingTenantId(r[0].value);
        if (id && String(id).trim()) return String(id).trim();
      }
    } catch (_) {}
  }
  return null;
}

function inferSourceTenantFromData(sqlite) {
  const queries = [
    `SELECT tenant_id AS tid FROM users WHERE tenant_id IS NOT NULL AND trim(tenant_id) != '' GROUP BY tenant_id`,
    `SELECT tenant_id AS tid FROM accounts WHERE tenant_id IS NOT NULL AND trim(tenant_id) != '' GROUP BY tenant_id`,
    `SELECT tenant_id AS tid FROM contacts WHERE tenant_id IS NOT NULL AND trim(tenant_id) != '' GROUP BY tenant_id`,
    `SELECT tenant_id AS tid FROM transactions WHERE tenant_id IS NOT NULL AND trim(tenant_id) != '' GROUP BY tenant_id`,
  ];
  const score = new Map();
  for (const q of queries) {
    try {
      const rows = sqliteAll(sqlite, q);
      for (const row of rows) {
        const tid = row.tid;
        if (tid == null || String(tid).trim() === '') continue;
        const k = String(tid).trim();
        score.set(k, (score.get(k) || 0) + 1);
      }
    } catch (_) {}
  }
  if (score.size === 0) return null;
  if (score.size === 1) return [...score.keys()][0];
  let best = null;
  let bestN = -1;
  for (const [id, n] of score) {
    if (n > bestN) {
      bestN = n;
      best = id;
    }
  }
  console.warn(
    `SQLite "tenants" is empty; multiple tenant_id values — using "${best}". Use --source-tenant to override.`
  );
  return best;
}

function pickSourceTenantId(sqlite, explicit) {
  if (explicit) return explicit;

  let rows = [];
  try {
    rows = sqliteAll(sqlite, 'SELECT id, name FROM tenants');
  } catch (_) {
    rows = [];
  }

  if (rows.length) {
    if (rows.length === 1) return rows[0].id;
    const lower = (s) => (s || '').toLowerCase();
    const rk = rows.find(
      (r) =>
        lower(r.name).includes('rk') &&
        (lower(r.name).includes('builder') || lower(r.name).includes('builders'))
    );
    if (rk) return rk.id;
    const named = rows.find((r) => lower(r.name).includes('builder'));
    if (named) return named.id;
    console.warn('Multiple tenants in SQLite; using first row. Use --source-tenant to pick another.');
    return rows[0].id;
  }

  const fromApp = tryAppSettingsSourceTenant(sqlite);
  if (fromApp) {
    console.log(`Source tenant_id from app_settings: ${fromApp}`);
    return fromApp;
  }

  const inferred = inferSourceTenantFromData(sqlite);
  if (inferred) {
    console.log(`Source tenant_id inferred from data: ${inferred}`);
    return inferred;
  }

  throw new Error(
    'Could not determine SQLite tenant id. Pass --source-tenant (e.g. "local" for local-only DB).'
  );
}

function nullIfEmpty(v) {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function toBool(v) {
  if (v === true || v === 1 || v === '1') return true;
  if (v === false || v === 0 || v === '0') return false;
  return Boolean(v);
}

/** Topological order: parents before children (SQLite categories for one tenant). */
function sortCategoriesForInsert(rows) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const sorted = [];
  const done = new Set();
  function visit(id) {
    if (!id || done.has(id)) return;
    const row = byId.get(id);
    if (!row) return;
    const p = row.parent_category_id;
    if (p && byId.has(p) && !done.has(p)) visit(p);
    done.add(id);
    sorted.push(row);
  }
  for (const r of rows) visit(r.id);
  return sorted;
}

async function resolveTargetTenant(client, pgTenantId, pgTenantName) {
  const r = await client.query('SELECT id, name FROM tenants WHERE id = $1', [pgTenantId]);
  if (r.rows.length) {
    console.log(`PostgreSQL target tenant: ${r.rows[0].id} (${r.rows[0].name})`);
    return r.rows[0].id;
  }
  const byName = await client.query(
    `SELECT id, name FROM tenants WHERE lower(trim(name)) = lower(trim($1)) LIMIT 1`,
    [pgTenantName]
  );
  if (byName.rows.length) {
    console.log(`PostgreSQL target tenant (by name): ${byName.rows[0].id} (${byName.rows[0].name})`);
    return byName.rows[0].id;
  }
  throw new Error(
    `No PostgreSQL tenant id=${pgTenantId} and no tenant named "${pgTenantName}". Create the tenant or fix --pg-tenant-id.`
  );
}

async function printStats(client, tenantId) {
  const b = await client.query(
    `SELECT
       count(*)::int AS total,
       count(*) FILTER (WHERE category_id IS NULL OR trim(category_id::text) = '')::int AS null_cat,
       count(*) FILTER (WHERE category_id IS NOT NULL AND trim(category_id::text) != ''
         AND NOT EXISTS (SELECT 1 FROM categories c WHERE c.id = bills.category_id AND c.tenant_id = bills.tenant_id))::int AS orphan_cat
     FROM bills WHERE tenant_id = $1 AND deleted_at IS NULL`,
    [tenantId]
  );
  const t = await client.query(
    `SELECT
       count(*) FILTER (WHERE type = 'Expense' AND bill_id IS NOT NULL)::int AS expense_bill_total,
       count(*) FILTER (WHERE type = 'Expense' AND bill_id IS NOT NULL
         AND (category_id IS NULL OR trim(category_id::text) = ''))::int AS expense_bill_null,
       count(*) FILTER (WHERE type = 'Expense' AND bill_id IS NOT NULL AND category_id IS NOT NULL
         AND trim(category_id::text) != ''
         AND NOT EXISTS (SELECT 1 FROM categories c WHERE c.id = transactions.category_id AND c.tenant_id = transactions.tenant_id))::int AS orphan_cat
     FROM transactions WHERE tenant_id = $1 AND deleted_at IS NULL`,
    [tenantId]
  );
  console.log(
    `  bills: total=${b.rows[0].total}  category_id null=${b.rows[0].null_cat}  orphan FK=${b.rows[0].orphan_cat}`
  );
  console.log(
    `  transactions Expense+bill: total=${t.rows[0].expense_bill_total}  null category=${t.rows[0].expense_bill_null}  orphan FK=${t.rows[0].orphan_cat}`
  );
}

async function upsertCategoriesFromSqlite(client, sqlite, sourceTenant, targetTenant, dryRun) {
  let rows;
  try {
    rows = sqliteAll(sqlite, `SELECT * FROM ${quoteIdentLite('categories')} WHERE tenant_id = ?`, [
      sourceTenant,
    ]);
  } catch (e) {
    throw new Error(`SQLite categories read failed: ${e.message || e}`);
  }
  if (!rows.length) {
    console.log('  categories: no rows in SQLite for source tenant — skip upsert');
    return 0;
  }

  const sorted = sortCategoriesForInsert(rows);
  let n = 0;
  for (const row of sorted) {
    const id = row.id;
    if (!id) continue;
    const vals = {
      id,
      tenant_id: targetTenant,
      name: row.name,
      type: row.type,
      description: nullIfEmpty(row.description),
      is_permanent: toBool(row.is_permanent),
      is_rental: toBool(row.is_rental),
      is_hidden: toBool(row.is_hidden),
      parent_category_id: nullIfEmpty(row.parent_category_id),
      version: row.version != null ? parseInt(String(row.version), 10) || 1 : 1,
    };

    if (dryRun) {
      n++;
      continue;
    }

    await client.query(
      `INSERT INTO categories (
        id, tenant_id, name, type, description, is_permanent, is_rental, is_hidden, parent_category_id, version, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        name = EXCLUDED.name,
        type = EXCLUDED.type,
        description = COALESCE(EXCLUDED.description, categories.description),
        is_permanent = EXCLUDED.is_permanent,
        is_rental = EXCLUDED.is_rental,
        is_hidden = EXCLUDED.is_hidden,
        parent_category_id = COALESCE(EXCLUDED.parent_category_id, categories.parent_category_id),
        version = EXCLUDED.version,
        updated_at = NOW()`,
      [
        vals.id,
        vals.tenant_id,
        vals.name,
        vals.type,
        vals.description,
        vals.is_permanent,
        vals.is_rental,
        vals.is_hidden,
        vals.parent_category_id,
        vals.version,
      ]
    );
    n++;
  }
  console.log(`  categories: upserted ${n} row(s) from SQLite`);
  return n;
}

async function syncBillsCategoryId(client, sqlite, sourceTenant, targetTenant, dryRun) {
  const rows = sqliteAll(sqlite, `SELECT id, category_id FROM ${quoteIdentLite('bills')} WHERE tenant_id = ?`, [
    sourceTenant,
  ]);
  let updated = 0;
  let skipped = 0;
  for (const row of rows) {
    const cat = nullIfEmpty(row.category_id);
    const exists = await client.query(`SELECT 1 FROM bills WHERE id = $1 AND tenant_id = $2`, [
      row.id,
      targetTenant,
    ]);
    if (!exists.rows.length) {
      skipped++;
      continue;
    }
    if (dryRun) {
      updated++;
      continue;
    }
    const r = await client.query(
      `UPDATE bills SET category_id = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3`,
      [cat, row.id, targetTenant]
    );
    if (r.rowCount) updated++;
  }
  console.log(`  bills: updated ${updated} row(s) (skipped ${skipped} not in PostgreSQL)`);
}

async function syncTransactionsCategoryId(client, sqlite, sourceTenant, targetTenant, dryRun) {
  const rows = sqliteAll(sqlite, `SELECT id, category_id FROM ${quoteIdentLite('transactions')} WHERE tenant_id = ?`, [
    sourceTenant,
  ]);
  let updated = 0;
  let skipped = 0;
  for (const row of rows) {
    const cat = nullIfEmpty(row.category_id);
    const exists = await client.query(`SELECT 1 FROM transactions WHERE id = $1 AND tenant_id = $2`, [
      row.id,
      targetTenant,
    ]);
    if (!exists.rows.length) {
      skipped++;
      continue;
    }
    if (dryRun) {
      updated++;
      continue;
    }
    const r = await client.query(
      `UPDATE transactions SET category_id = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3`,
      [cat, row.id, targetTenant]
    );
    if (r.rowCount) updated++;
  }
  console.log(`  transactions: updated ${updated} row(s) (skipped ${skipped} not in PostgreSQL)`);
}

async function fillExpenseBillPaymentsFromBill(client, tenantId, dryRun) {
  if (dryRun) {
    console.log('  fill from bill: [dry-run] would run UPDATE for Expense+bill_id with NULL category');
    return;
  }
  const r = await client.query(
    `UPDATE transactions t
     SET category_id = b.category_id, updated_at = NOW()
     FROM bills b
     WHERE t.tenant_id = $1 AND t.tenant_id = b.tenant_id
       AND t.bill_id = b.id
       AND t.type = 'Expense'
       AND b.category_id IS NOT NULL AND trim(b.category_id::text) != ''
       AND (t.category_id IS NULL OR trim(t.category_id::text) = '')`,
    [tenantId]
  );
  console.log(`  fill from bill: set category on ${r.rowCount || 0} expense payment row(s) still NULL`);
}

async function main() {
  const opts = parseArgs();
  const DATABASE_URL = (process.env.DATABASE_URL || process.env.PG_URL || '').trim();
  if (!DATABASE_URL) {
    console.error('ERROR: Set DATABASE_URL or PG_URL in .env');
    process.exit(1);
  }

  const sqlitePath = resolveSqliteDbPath(opts.sqlitePath);
  console.log('SQLite backup:', sqlitePath);
  console.log('PostgreSQL:', DATABASE_URL.replace(/:[^:@/]+@/, ':****@'));

  const sqlJsMod = require('sql.js');
  const initSqlJs = typeof sqlJsMod === 'function' ? sqlJsMod : sqlJsMod.default;
  const SQL = await initSqlJs();
  const sqliteBuf = fs.readFileSync(sqlitePath);
  const sqlite = new SQL.Database(sqliteBuf);
  const sourceTenant = pickSourceTenantId(sqlite, opts.sourceTenant);
  console.log('SQLite source tenant_id:', sourceTenant);

  let ssl = { rejectUnauthorized: false };
  try {
    const u = new URL(DATABASE_URL.replace(/^postgresql:\/\//, 'http://'));
    const host = (u.hostname || '').toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') ssl = false;
  } catch (_) {}

  const client = new Client({ connectionString: DATABASE_URL, ssl });
  await client.connect();

  const targetTenant = await resolveTargetTenant(client, opts.pgTenantId, opts.pgTenantName);

  console.log('\n--- Before repair ---');
  await printStats(client, targetTenant);

  if (opts.dryRun) {
    console.log('\n[dry-run] No writes. Remove --dry-run to apply.\n');
  }

  try {
    if (!opts.dryRun) await client.query('BEGIN');

    await upsertCategoriesFromSqlite(client, sqlite, sourceTenant, targetTenant, opts.dryRun);
    await syncBillsCategoryId(client, sqlite, sourceTenant, targetTenant, opts.dryRun);
    await syncTransactionsCategoryId(client, sqlite, sourceTenant, targetTenant, opts.dryRun);
    await fillExpenseBillPaymentsFromBill(client, targetTenant, opts.dryRun);

    if (!opts.dryRun) await client.query('COMMIT');
  } catch (e) {
    if (!opts.dryRun) {
      try {
        await client.query('ROLLBACK');
      } catch (_) {}
    }
    throw e;
  } finally {
    try {
      sqlite.close();
    } catch (_) {}
    await client.end();
  }

  if (!opts.dryRun) {
    const client2 = new Client({ connectionString: DATABASE_URL, ssl });
    await client2.connect();
    console.log('\n--- After repair ---');
    await printStats(client2, targetTenant);
    await client2.end();
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('\nFATAL:', err.message || err);
  process.exit(1);
});
