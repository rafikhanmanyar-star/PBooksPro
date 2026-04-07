/**
 * Migrate tenant-scoped data from a PBooks Pro SQLite backup into PostgreSQL
 * for the "RK Builders" (or named) organization.
 *
 * - Resolves SQLite path: file (.db) or directory (first *.db found, or largest .db).
 * - Detects source tenant_id from SQLite (single tenant, or name match, or --source-tenant).
 * - Resolves target PostgreSQL tenant: default id rk-builders-284d6d (RK Builders), or --pg-tenant-id / PG_TARGET_TENANT_ID.
 * - Maps SQLite → PostgreSQL column differences (e.g. units.name → unit_number).
 * - Normalizes booleans, JSON/JSONB, timestamps, and user passwords (password → password_hash).
 *
 * Insert order: "transactions" must come AFTER "invoices" (and "bills") because PostgreSQL enforces
 * transactions.invoice_id → invoices.id; invoice payment rows would otherwise fail FK and be skipped.
 *
 * Prerequisites:
 *   - DATABASE_URL (or PG_URL) in .env pointing at your PostgreSQL database with LAN migrations applied.
 *   - sql.js + pg (root package.json). Uses sql.js (not better-sqlite3) so this script runs with your
 *     system Node.js without native-module / Electron ABI mismatches.
 *   - bcryptjs: uses backend/node_modules/bcryptjs if present (npm install --prefix backend).
 *
 * Usage:
 *   npm run migrate:sqlite-to-postgres
 *     (default SQLite path: F:\\DB Backup pbookspro\\rkbuilders_14_3_2026_backup_20260329_142110 — or SQLITE_BACKUP_PATH / --sqlite)
 *   node scripts/sqlite-to-postgres-rk-builders.cjs --sqlite "F:\\DB Backup pbookspro\\rkbuilders_14_3_2026_backup_20260329_142110"
 *   node scripts/sqlite-to-postgres-rk-builders.cjs --sqlite "C:\\path\\file.db" --dry-run
 *
 * Windows / npm: paths with spaces MUST be quoted, OR use --sqlite=PATH (equals form avoids split).
 *   npm run migrate:sqlite-to-postgres -- --sqlite="F:\\DB Backup pbookspro\\folder"
 *   npm run migrate:sqlite-to-postgres -- --sqlite=F:\\DB Backup pbookspro\\folder
 *     (unquoted: this script joins argv segments until the next --flag so it still works.)
 *   node scripts/sqlite-to-postgres-rk-builders.cjs --sqlite "..." --wipe   # delete existing RK Builders data first
 *   node scripts/sqlite-to-postgres-rk-builders.cjs --sqlite "..." --pg-tenant-name "RK Builders"
 *   node scripts/sqlite-to-postgres-rk-builders.cjs --sqlite "..." --source-tenant "local"
 *   node scripts/sqlite-to-postgres-rk-builders.cjs --sqlite "..." --transactions-only
 *     Re-imports only the app ledger `transactions` table (deletes existing rows for target tenant first).
 *     Requires invoices (and related parents) to already exist in PostgreSQL.
 *
 * If SQLite "tenants" is empty, the script uses app_settings (tenantId / current_tenant_id) or infers
 * tenant_id from users/accounts/contacts/transactions. Override with --source-tenant if needed.
 *
 * If bills/transactions show wrong or missing category_id in PostgreSQL after import, run:
 *   npm run repair:pg-categories
 *   (same default SQLite path as above; optional --sqlite or SQLITE_BACKUP_PATH)
 * (see scripts/repair-postgres-categories-from-sqlite.cjs). Categories are upserted on conflict by id.
 *
 * Imports run in autocommit (no single giant BEGIN): if one INSERT fails (FK, etc.), other rows still insert.
 * A single wrapping transaction would abort the whole run after the first error.
 *
 * Environment:
 *   DATABASE_URL or PG_URL   PostgreSQL connection string (required)
 *   SQLITE_BACKUP_PATH      Override default SQLite backup folder/file (see DEFAULT_SQLITE_PATH in script)
 *   PG_TARGET_TENANT_ID     Override default PostgreSQL tenant id (default: rk-builders-284d6d)
 *   MIGRATE_DEFAULT_PASSWORD  If SQLite user has no bcrypt hash, set password_hash to bcrypt of this (default: ChangeMe123!)
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

function loadBcrypt() {
  const candidates = [
    path.join(projectRoot, 'backend', 'node_modules', 'bcryptjs'),
    'bcryptjs',
  ];
  for (const c of candidates) {
    try {
      return require(c);
    } catch (_) {}
  }
  console.error('ERROR: bcryptjs not found. Run: npm install --prefix backend');
  process.exit(1);
}

const DEFAULT_SQLITE_PATH =
  'F:\\DB Backup pbookspro\\rkbuilders_14_3_2026_backup_20260329_142110';
const DEFAULT_PG_TENANT_NAME = 'RK Builders';
/** PostgreSQL tenant id for RK Builders (must exist in tenants table unless --create-tenant). */
const DEFAULT_PG_TENANT_ID = 'rk-builders-284d6d';

/** Insert order: parents before children (aligned with scripts/copy-tenant-from-production.cjs + LAN schema). */
const INSERT_TABLE_ORDER = [
  'tenants',
  'users',
  'accounts',
  'contacts',
  'vendors',
  'categories',
  'projects',
  'buildings',
  'properties',
  'units',
  'documents',
  'plan_amenities',
  'installment_plans',
  'budgets',
  'rental_agreements',
  'project_agreements',
  'sales_returns',
  'project_received_assets',
  'contracts',
  'pm_cycle_allocations',
  'invoices',
  'bills',
  'transactions',
  'quotations',
  'recurring_invoice_templates',
  'purchase_orders',
  'registered_suppliers',
  'payroll_tenant_config',
  'payroll_departments',
  'payroll_grades',
  'payroll_projects',
  'payroll_employees',
  'payroll_runs',
  'payslips',
  'payroll_salary_components',
  'personal_categories',
  'personal_transactions',
  'journal_entries',
  'journal_lines',
  'journal_reversals',
  'accounting_audit_log',
  'app_settings',
];

/** Delete order: children before parents (best-effort; missing tables ignored). */
const DELETE_TABLE_ORDER = [
  'journal_lines',
  'journal_reversals',
  'journal_entries',
  'accounting_audit_log',
  'payslips',
  'payroll_runs',
  'payroll_employees',
  'payroll_projects',
  'payroll_salary_components',
  'payroll_grades',
  'payroll_departments',
  'payroll_tenant_config',
  'personal_transactions',
  'personal_categories',
  'transactions',
  'invoices',
  'bills',
  'project_agreement_units',
  'contract_categories',
  'sales_returns',
  'project_received_assets',
  'project_agreements',
  'contracts',
  'recurring_invoice_templates',
  'pm_cycle_allocations',
  'budgets',
  'rental_agreements',
  'installment_plans',
  'units',
  'properties',
  'buildings',
  'projects',
  'categories',
  'vendors',
  'contacts',
  'accounts',
  'quotations',
  'documents',
  'plan_amenities',
  'purchase_orders',
  'registered_suppliers',
  'users',
];

const JUNCTION_INSERT_ORDER = [
  {
    table: 'project_agreement_units',
    sql: (sourceTenant) =>
      `SELECT pau.* FROM project_agreement_units pau
       INNER JOIN project_agreements pa ON pa.id = pau.agreement_id
       WHERE pa.tenant_id = ?`,
    params: (sourceTenant) => [sourceTenant],
  },
  {
    table: 'contract_categories',
    sql: (sourceTenant) =>
      `SELECT cc.* FROM contract_categories cc
       INNER JOIN contracts c ON c.id = cc.contract_id
       WHERE c.tenant_id = ?`,
    params: (sourceTenant) => [sourceTenant],
  },
];

function parseArgs() {
  const args = process.argv.slice(2);
  let sqlitePath = null;
  let pgTenantName = DEFAULT_PG_TENANT_NAME;
  let pgTenantId = null;
  let sourceTenant = null;
  let dryRun = false;
  let wipe = false;
  let createTenant = false;
  let transactionsOnly = false;

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
    } else if (a === '--wipe') {
      wipe = true;
    } else if (a === '--create-tenant') {
      createTenant = true;
    } else if (a === '--transactions-only') {
      transactionsOnly = true;
    }
  }

  if (!sqlitePath) sqlitePath = process.env.SQLITE_BACKUP_PATH || DEFAULT_SQLITE_PATH;

  if (!pgTenantId) {
    pgTenantId = (process.env.PG_TARGET_TENANT_ID || '').trim() || DEFAULT_PG_TENANT_ID;
  }

  return { sqlitePath, pgTenantName, pgTenantId, sourceTenant, dryRun, wipe, createTenant, transactionsOnly };
}

function resolveSqliteDbPath(input) {
  let resolved = path.resolve(String(input).trim());
  if (!fs.existsSync(resolved)) {
    const withDb = resolved + '.db';
    if (fs.existsSync(withDb)) {
      resolved = withDb;
    }
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(
      `SQLite path does not exist: ${resolved}\n` +
        '  • Use quotes if the path contains spaces: --sqlite "F:\\DB Backup pbookspro\\backup_folder"\n' +
        '  • Or equals form: --sqlite=F:\\\\DB Backup pbookspro\\\\backup_folder\n' +
        '  • If this is a .db file, pass the full path including .db'
    );
  }
  const st = fs.statSync(resolved);
  if (st.isFile()) {
    if (!resolved.toLowerCase().endsWith('.db')) {
      console.warn('WARNING: File does not end with .db — attempting to open as SQLite anyway.');
    }
    return resolved;
  }
  if (st.isDirectory()) {
    const files = fs.readdirSync(resolved).filter((f) => f.toLowerCase().endsWith('.db'));
    if (!files.length) {
      throw new Error(`No .db file found in directory: ${resolved}`);
    }
    if (files.length === 1) return path.join(resolved, files[0]);
    const withPath = files.map((f) => ({
      f,
      p: path.join(resolved, f),
      s: fs.statSync(path.join(resolved, f)).size,
    }));
    withPath.sort((a, b) => b.s - a.s);
    const picked = withPath[0];
    console.log(`Directory has ${files.length} .db files; using largest: ${picked.f} (${(picked.s / 1024 / 1024).toFixed(2)} MB)`);
    return picked.p;
  }
  throw new Error(`Not a file or directory: ${resolved}`);
}

/** sql.js: run SELECT / PRAGMA and return rows as objects (same shape as better-sqlite3 .all()). */
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

function pragmaColumns(sqlite, table) {
  const rows = sqliteAll(sqlite, `PRAGMA table_info(${quoteIdentLite(table)})`);
  return new Map(rows.map((r) => [r.name, r]));
}

function quoteIdentLite(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function quoteIdentPg(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

async function loadPgColumnMeta(client) {
  const { rows } = await client.query(`
    SELECT table_name, column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);
  const byTable = new Map();
  for (const r of rows) {
    if (!byTable.has(r.table_name)) byTable.set(r.table_name, []);
    byTable.get(r.table_name).push({
      name: r.column_name,
      dataType: r.data_type,
      udtName: r.udt_name,
    });
  }
  return byTable;
}

async function loadPgTables(client) {
  const { rows } = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `);
  return new Set(rows.map((r) => r.table_name));
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

/** When tenants table is empty, infer from DISTINCT tenant_id on core tables. */
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
    `SQLite "tenants" is empty; multiple tenant_id values in data — using "${best}" (most tables agree). Use --source-tenant to override.`
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
    console.log(`Source tenant_id inferred from tenant_id columns: ${inferred}`);
    return inferred;
  }

  throw new Error(
    'Could not determine SQLite tenant id (empty "tenants" table and no tenant_id in users/accounts/contacts). ' +
      'Pass --source-tenant explicitly (common values: "local" for prepared local DB, or your cloud tenant_* id).'
  );
}

function mapSqliteToPgColumn(table, pgCol, sqliteColSet) {
  if (sqliteColSet.has(pgCol)) return pgCol;

  if (table === 'units') {
    if (pgCol === 'unit_number') return sqliteColSet.has('unit_number') ? 'unit_number' : 'name';
    if (pgCol === 'owner_contact_id') return sqliteColSet.has('owner_contact_id') ? 'owner_contact_id' : 'contact_id';
    if (pgCol === 'unit_type') return sqliteColSet.has('unit_type') ? 'unit_type' : 'type';
  }

  if (table === 'users' && pgCol === 'password_hash') {
    if (sqliteColSet.has('password_hash')) return 'password_hash';
    if (sqliteColSet.has('password')) return 'password';
  }

  return null;
}

function normalizeValue(val, colMeta, table, colName) {
  if (val === undefined) return null;
  if (val === null) return null;

  const dt = colMeta.dataType;
  const udt = colMeta.udtName;

  if (dt === 'boolean' || udt === 'bool') {
    if (typeof val === 'boolean') return val;
    if (val === 0 || val === '0') return false;
    if (val === 1 || val === '1') return true;
    return Boolean(val);
  }

  if (dt === 'json' || dt === 'jsonb' || udt === 'jsonb') {
    if (val === null || val === '') return null;
    if (typeof val === 'object') return JSON.stringify(val);
    const s = String(val).trim();
    if (!s) return null;
    try {
      JSON.parse(s);
      return s;
    } catch {
      return JSON.stringify(s);
    }
  }

  if (dt === 'integer' || dt === 'bigint' || dt === 'smallint') {
    if (val === '' || val === null) return null;
    const n = parseInt(String(val), 10);
    return Number.isNaN(n) ? null : n;
  }

  if (dt === 'numeric' || dt === 'real' || dt === 'double precision') {
    if (val === '' || val === null) return null;
    const n = Number(val);
    return Number.isNaN(n) ? null : n;
  }

  if (dt === 'date' || dt === 'timestamp with time zone' || dt === 'timestamp without time zone') {
    if (val === '' || val === null) return null;
    const s = String(val).trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
    return s;
  }

  return val;
}

function resolvePasswordHash(bcrypt, raw, sqliteColName) {
  const s = raw == null ? '' : String(raw);
  if (!s) {
    const pwd = process.env.MIGRATE_DEFAULT_PASSWORD || 'ChangeMe123!';
    return bcrypt.hashSync(pwd, 10);
  }
  if (s.startsWith('$2a$') || s.startsWith('$2b$') || s.startsWith('$2y$')) return s;
  return bcrypt.hashSync(s, 10);
}

/** Remap cross-tenant FK columns when they still point at the SQLite source tenant. */
function applyTenantRemap(selected, vals, sourceTenant, targetTenant) {
  for (let i = 0; i < selected.length; i++) {
    const c = selected[i];
    if (c === 'buyer_tenant_id' || c === 'supplier_tenant_id' || c === 'tenant_id') {
      if (vals[i] === sourceTenant) vals[i] = targetTenant;
    }
  }
}

/**
 * Categories use stable `id` across SQLite → PostgreSQL. `ON CONFLICT DO NOTHING` skips rows when
 * an id already exists (e.g. seed row), leaving bills/transactions pointing at missing category rows.
 * Upsert by id so tenant_id/name/type and FK targets stay aligned with the backup.
 */
function getCategoriesConflictClause(selected) {
  const skip = new Set(['id', 'created_at']);
  const parts = [];
  for (const c of selected) {
    if (skip.has(c)) continue;
    parts.push(`${quoteIdentPg(c)} = EXCLUDED.${quoteIdentPg(c)}`);
  }
  if (!selected.includes('updated_at')) {
    parts.push(`${quoteIdentPg('updated_at')} = NOW()`);
  }
  return `ON CONFLICT (id) DO UPDATE SET ${parts.join(', ')}`;
}

function getInsertConflictClause(table, selected) {
  if (table === 'categories') return getCategoriesConflictClause(selected);
  return 'ON CONFLICT DO NOTHING';
}

async function resolveTargetTenant(client, { pgTenantId, pgTenantName, createTenant, dryRun, bcrypt }) {
  if (pgTenantId) {
    const r = await client.query('SELECT id, name FROM tenants WHERE id = $1', [pgTenantId]);
    if (!r.rows.length) {
      if (!createTenant) throw new Error(`PostgreSQL has no tenant id=${pgTenantId}. Use --create-tenant to insert it.`);
      if (!dryRun) {
        await client.query(
          `INSERT INTO tenants (id, name) VALUES ($1, $2)
           ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()`,
          [pgTenantId, pgTenantName]
        );
      }
      console.log(`Target tenant: ${pgTenantId} (${pgTenantName}) [created or updated]`);
      return pgTenantId;
    }
    console.log(`Target tenant: ${r.rows[0].id} (${r.rows[0].name})`);
    return r.rows[0].id;
  }

  const r = await client.query(
    `SELECT id, name FROM tenants WHERE lower(trim(name)) = lower(trim($1)) LIMIT 1`,
    [pgTenantName]
  );
  if (r.rows.length) {
    console.log(`Target tenant: ${r.rows[0].id} (${r.rows[0].name})`);
    return r.rows[0].id;
  }

  const like = await client.query(
    `SELECT id, name FROM tenants WHERE lower(name) LIKE $1 OR lower(name) LIKE $2 ORDER BY name LIMIT 5`,
    ['%rk%builder%', '%builder%']
  );
  if (like.rows.length === 1) {
    console.log(`Matched tenant by pattern: ${like.rows[0].id} (${like.rows[0].name})`);
    return like.rows[0].id;
  }
  if (like.rows.length > 1) {
    console.error('Multiple possible tenants in PostgreSQL:');
    like.rows.forEach((x) => console.error(`  - ${x.id}  ${x.name}`));
    throw new Error('Disambiguate with --pg-tenant-id or exact --pg-tenant-name');
  }

  if (!createTenant) {
    throw new Error(
      `No PostgreSQL tenant named "${pgTenantName}". Create it in the app or run with --create-tenant (and optionally --pg-tenant-id).`
    );
  }

  const newId = `tenant_rk_${Date.now()}`;
  if (!dryRun) {
    await client.query(`INSERT INTO tenants (id, name) VALUES ($1, $2)`, [newId, pgTenantName]);
  }
  console.log(`Created tenant ${newId} (${pgTenantName})`);
  return newId;
}

async function wipeTargetTenant(client, targetTenantId, pgTables, dryRun) {
  if (dryRun) {
    console.log('[dry-run] Would delete existing rows for target tenant (see --wipe).');
    return;
  }
  await client.query('BEGIN');
  try {
    for (const table of DELETE_TABLE_ORDER) {
      if (!pgTables.has(table)) continue;
      const { rows } = await client.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'tenant_id' LIMIT 1`,
        [table]
      );
      if (!rows.length) continue;
      const r = await client.query(`DELETE FROM ${quoteIdentPg(table)} WHERE tenant_id = $1`, [targetTenantId]);
      if (r.rowCount > 0) console.log(`  DELETE ${table}: ${r.rowCount} rows`);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}

function buildInsertColumns(table, pgCols, sqliteColMap, sourceTenant, targetTenant) {
  const sqliteColSet = new Set(sqliteColMap.keys());
  const selected = [];
  const sqliteSources = [];

  for (const pc of pgCols) {
    const name = pc.name;
    if (name === 'tenant_id') {
      selected.push(name);
      sqliteSources.push({ special: 'tenant_id' });
      continue;
    }
    if (table === 'tenants' && name === 'id') {
      selected.push(name);
      sqliteSources.push({ special: 'target_tenant_id' });
      continue;
    }

    const sc = mapSqliteToPgColumn(table, name, sqliteColSet);
    if (!sc) continue;
    selected.push(name);
    sqliteSources.push({ sqlite: sc });
  }

  return { selected, sqliteSources };
}

async function insertTableRows({
  client,
  table,
  sqlite,
  pgCols,
  sqliteColMap,
  sourceTenant,
  targetTenant,
  dryRun,
  bcrypt,
  pgTables,
}) {
  if (!pgTables.has(table)) return { n: 0, skipped: 'no table in PostgreSQL' };

  const sqliteColSet = new Set(sqliteColMap.keys());
  const tenantCol = table === 'tenants' ? 'id' : 'tenant_id';
  const where =
    table === 'tenants'
      ? `${quoteIdentLite('id')} = ?`
      : `${quoteIdentLite('tenant_id')} = ?`;

  let rows;
  try {
    rows = sqliteAll(sqlite, `SELECT * FROM ${quoteIdentLite(table)} WHERE ${where}`, [sourceTenant]);
  } catch (e) {
    if (String(e.message).includes('no such table')) return { n: 0, skipped: 'no table in SQLite' };
    throw e;
  }

  if (table === 'rental_agreements' && sqliteColSet.has('org_id')) {
    rows = sqliteAll(
      sqlite,
      `SELECT * FROM ${quoteIdentLite(table)} WHERE ${quoteIdentLite('tenant_id')} = ? OR ${quoteIdentLite('org_id')} = ?`,
      [sourceTenant, sourceTenant]
    );
    for (const row of rows) {
      if (row.tenant_id == null || row.tenant_id === '') row.tenant_id = row.org_id;
    }
  }

  if (!rows.length) return { n: 0 };

  const { selected, sqliteSources } = buildInsertColumns(table, pgCols, sqliteColMap, sourceTenant, targetTenant);
  if (!selected.length) return { n: 0, skipped: 'no column overlap' };

  const colMetaByName = Object.fromEntries(pgCols.map((c) => [c.name, c]));
  let inserted = 0;

  const batchSize = 80;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const valueRows = [];

    for (const row of batch) {
      const vals = [];
      for (let j = 0; j < selected.length; j++) {
        const colName = selected[j];
        const src = sqliteSources[j];
        const meta = colMetaByName[colName];

        if (src.special === 'tenant_id') {
          vals.push(targetTenant);
          continue;
        }
        if (src.special === 'target_tenant_id') {
          vals.push(targetTenant);
          continue;
        }

        let raw = row[src.sqlite];
        if (table === 'users' && colName === 'password_hash') {
          const fromCol = src.sqlite;
          raw = resolvePasswordHash(bcrypt, raw, fromCol);
        } else {
          raw = normalizeValue(raw, meta, table, colName);
        }

        if (table === 'units' && colName === 'status' && (raw === null || raw === '')) {
          raw = 'available';
        }

        vals.push(raw);
      }
      applyTenantRemap(selected, vals, sourceTenant, targetTenant);
      valueRows.push(vals);
    }

    if (dryRun) {
      inserted += batch.length;
      continue;
    }

    const placeholders = valueRows
      .map(
        (_, ri) =>
          `(${selected.map((_, ci) => `$${ri * selected.length + ci + 1}`).join(', ')})`
      )
      .join(', ');
    const flat = valueRows.flat();
    const sql = `INSERT INTO ${quoteIdentPg(table)} (${selected.map(quoteIdentPg).join(', ')}) VALUES ${placeholders} ${getInsertConflictClause(table, selected)}`;
    try {
      const r = await client.query(sql, flat);
      inserted += r.rowCount || batch.length;
    } catch (e) {
      console.warn(
        `  batch insert failed for ${table} (${batch.length} rows), trying one-by-one: ${(e.message || '').split('\n')[0]}`
      );
      for (const row of batch) {
        const vals = [];
        for (let j = 0; j < selected.length; j++) {
          const colName = selected[j];
          const src = sqliteSources[j];
          const meta = colMetaByName[colName];
          if (src.special === 'tenant_id') {
            vals.push(targetTenant);
            continue;
          }
          if (src.special === 'target_tenant_id') {
            vals.push(targetTenant);
            continue;
          }
          let raw = row[src.sqlite];
          if (table === 'users' && colName === 'password_hash') {
            raw = resolvePasswordHash(bcrypt, raw, src.sqlite);
          } else {
            raw = normalizeValue(raw, meta, table, colName);
          }
          if (table === 'units' && colName === 'status' && (raw === null || raw === '')) {
            raw = 'available';
          }
          vals.push(raw);
        }
        applyTenantRemap(selected, vals, sourceTenant, targetTenant);
        const singlePlace = selected.map((_, ci) => `$${ci + 1}`).join(', ');
        try {
          await client.query(
            `INSERT INTO ${quoteIdentPg(table)} (${selected.map(quoteIdentPg).join(', ')}) VALUES (${singlePlace}) ${getInsertConflictClause(table, selected)}`,
            vals
          );
          inserted++;
        } catch (err2) {
          console.warn(`  row skip ${table} id=${row.id || '?'}: ${(err2.message || '').split('\n')[0]}`);
        }
      }
    }
  }

  return { n: inserted };
}

async function insertJunctionTables({ client, sqlite, sourceTenant, targetTenant, dryRun, pgTables, pgColMeta }) {
  let total = 0;
  for (const def of JUNCTION_INSERT_ORDER) {
    if (!pgTables.has(def.table)) continue;
    let rows;
    try {
      rows = sqliteAll(sqlite, def.sql(sourceTenant), def.params(sourceTenant));
    } catch (e) {
      if (String(e.message).includes('no such table')) continue;
      throw e;
    }
    if (!rows.length) continue;
    const pgCols = pgColMeta.get(def.table);
    if (!pgCols) continue;
    const colMetaByName = Object.fromEntries(pgCols.map((c) => [c.name, c]));
    const conflict =
      def.table === 'project_agreement_units'
        ? 'ON CONFLICT (agreement_id, unit_id) DO NOTHING'
        : def.table === 'contract_categories'
          ? 'ON CONFLICT (contract_id, category_id) DO NOTHING'
          : 'ON CONFLICT DO NOTHING';

    for (const row of rows) {
      const selected = [];
      const vals = [];
      for (const pc of pgCols) {
        let raw = row[pc.name];
        raw = normalizeValue(raw, colMetaByName[pc.name], def.table, pc.name);
        if (pc.name === 'buyer_tenant_id' || pc.name === 'supplier_tenant_id' || pc.name === 'tenant_id') {
          if (raw === sourceTenant) raw = targetTenant;
        }
        selected.push(pc.name);
        vals.push(raw);
      }
      applyTenantRemap(selected, vals, sourceTenant, targetTenant);
      if (dryRun) {
        total++;
        continue;
      }
      const ph = vals.map((_, i) => `$${i + 1}`).join(', ');
      try {
        await client.query(
          `INSERT INTO ${quoteIdentPg(def.table)} (${selected.map(quoteIdentPg).join(', ')}) VALUES (${ph}) ${conflict}`,
          vals
        );
        total++;
      } catch (e) {
        console.warn(`  junction skip ${def.table}: ${(e.message || '').split('\n')[0]}`);
      }
    }
  }
  return total;
}

async function main() {
  const bcrypt = loadBcrypt();
  const opts = parseArgs();
  const DATABASE_URL = (process.env.DATABASE_URL || process.env.PG_URL || '').trim();
  if (!DATABASE_URL) {
    console.error('ERROR: DATABASE_URL or PG_URL is required in .env');
    process.exit(1);
  }

  const sqlitePath = resolveSqliteDbPath(opts.sqlitePath);
  console.log('SQLite file:', sqlitePath);
  console.log('PostgreSQL:', DATABASE_URL.replace(/:[^:@/]+@/, ':****@'));

  const sqlJsMod = require('sql.js');
  const initSqlJs = typeof sqlJsMod === 'function' ? sqlJsMod : sqlJsMod.default;
  const SQL = await initSqlJs();
  const sqliteBuf = fs.readFileSync(sqlitePath);
  const sqlite = new SQL.Database(sqliteBuf);
  const sourceTenant = pickSourceTenantId(sqlite, opts.sourceTenant);
  console.log('Source tenant_id (SQLite):', sourceTenant);

  let ssl = { rejectUnauthorized: false };
  try {
    const u = new URL(DATABASE_URL.replace(/^postgresql:\/\//, 'http://'));
    const host = (u.hostname || '').toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') ssl = false;
  } catch (_) {}

  const client = new Client({
    connectionString: DATABASE_URL,
    ssl,
  });
  await client.connect();

  const pgColMeta = await loadPgColumnMeta(client);
  const pgTables = await loadPgTables(client);

  const targetTenant = await resolveTargetTenant(client, {
    pgTenantId: opts.pgTenantId,
    pgTenantName: opts.pgTenantName,
    createTenant: opts.createTenant,
    dryRun: opts.dryRun,
    bcrypt,
  });

  if (opts.transactionsOnly) {
    console.log('\n--- Transactions-only mode ---');
    console.log('Deletes existing `transactions` for the target tenant, then imports from SQLite.');
    console.log('Ensure invoices, accounts, etc. are already in PostgreSQL (invoice_id FK).\n');

    if (!opts.dryRun) {
      const del = await client.query(`DELETE FROM transactions WHERE tenant_id = $1`, [targetTenant]);
      console.log(`Deleted ${del.rowCount} existing transaction row(s) for tenant ${targetTenant}.`);
    } else {
      console.log('[dry-run] Would: DELETE FROM transactions WHERE tenant_id = <target>');
    }

    const table = 'transactions';
    const pgCols = pgColMeta.get(table);
    if (!pgCols) {
      console.error('ERROR: PostgreSQL has no transactions table.');
      process.exit(1);
    }
    let sqliteColMap;
    try {
      sqliteColMap = pragmaColumns(sqlite, table);
    } catch (e) {
      console.error('ERROR: SQLite has no transactions table:', e.message || e);
      process.exit(1);
    }
    if (!sqliteColMap.size) {
      console.error('ERROR: Could not read SQLite transactions columns.');
      process.exit(1);
    }

    process.stdout.write(`  ${table.padEnd(36)} `);
    const r = await insertTableRows({
      client,
      table,
      sqlite,
      pgCols,
      sqliteColMap,
      sourceTenant,
      targetTenant,
      dryRun: opts.dryRun,
      bcrypt,
      pgTables,
    });
    if (r.skipped) console.log(`skip (${r.skipped})`);
    else console.log(`${String(r.n).padStart(6)} rows inserted`);

    try {
      sqlite.close();
    } catch (_) {}
    await client.end();

    console.log('\nDone (transactions only).');
    if (opts.dryRun) console.log('Dry run: no changes written.');
    return;
  }

  if (opts.wipe) {
    console.log('\nWiping existing data for target tenant...');
    await wipeTargetTenant(client, targetTenant, pgTables, opts.dryRun);
  }

  let grand = 0;
  try {
    for (const table of INSERT_TABLE_ORDER) {
      const pgCols = pgColMeta.get(table);
      if (!pgCols) continue;
      let sqliteColMap;
      try {
        sqliteColMap = pragmaColumns(sqlite, table);
      } catch {
        continue;
      }
      if (!sqliteColMap.size) continue;

      process.stdout.write(`  ${table.padEnd(36)} `);
      const r = await insertTableRows({
        client,
        table,
        sqlite,
        pgCols,
        sqliteColMap,
        sourceTenant,
        targetTenant,
        dryRun: opts.dryRun,
        bcrypt,
        pgTables,
      });
      if (r.skipped) console.log(`skip (${r.skipped})`);
      else console.log(`${String(r.n).padStart(6)} rows`);
      grand += r.n;
    }

    console.log('\n  Junction tables...');
    const jn = await insertJunctionTables({
      client,
      sqlite,
      sourceTenant,
      targetTenant,
      dryRun: opts.dryRun,
      pgTables,
      pgColMeta,
    });
    console.log(`  total junction rows inserted: ${jn}`);
  } finally {
    try {
      sqlite.close();
    } catch (_) {}
    await client.end();
  }

  console.log('\nDone.');
  if (opts.dryRun) console.log('This was a dry run; no data was written. Remove --dry-run to apply.');
  else console.log(`Imported into tenant ${targetTenant} (${opts.pgTenantName}).`);
}

main().catch((err) => {
  console.error('\nFATAL:', err.message || err);
  process.exit(1);
});
