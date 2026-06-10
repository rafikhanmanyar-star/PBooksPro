/**
 * Copy one tenant's data from a source PostgreSQL database to a target PostgreSQL database.
 *
 * Use case: migrate RK Builders from local pbookspro → Render production.
 *
 * Prerequisites:
 *   - Migrations applied on BOTH databases (npm run migrate --prefix backend with each DATABASE_URL).
 *   - pg client (root package.json).
 *
 * Environment:
 *   SOURCE_DATABASE_URL  Source DB (default: DATABASE_URL / PG_URL from .env — local)
 *   TARGET_DATABASE_URL  Target DB (required — e.g. Render external URL with ?sslmode=require)
 *
 * Usage:
 *   $env:TARGET_DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"
 *   npm run copy-tenant:postgres -- --dry-run
 *   npm run copy-tenant:postgres -- --wipe
 *   npm run copy-tenant:postgres -- --source-tenant rk-builders-284d6d --target-tenant rk-builders-284d6d
 *
 * Flags:
 *   --dry-run         Count rows only; no writes
 *   --wipe            Delete existing target-tenant rows before import
 *   --create-tenant   Insert tenants row on target if missing
 *   --source-tenant   Source tenant id (default: rk-builders-284d6d or PG_SOURCE_TENANT_ID)
 *   --target-tenant   Target tenant id (default: same as source)
 *   --source-url      Override SOURCE_DATABASE_URL
 *   --target-url      Override TARGET_DATABASE_URL
 */

'use strict';

const path = require('path');
const { Client } = require('pg');

const projectRoot = path.join(__dirname, '..');
try {
  const dotenv = require('dotenv');
  dotenv.config({ path: path.join(projectRoot, '.env') });
  dotenv.config({ path: path.join(projectRoot, 'backend', '.env') });
} catch (_) {}

const DEFAULT_TENANT_ID = 'rk-builders-284d6d';

/** Insert order: parents before children (aligned with sqlite-to-postgres-rk-builders.cjs). */
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

const DELETE_TABLE_ORDER = [
  'journal_reversals',
  'journal_lines',
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

const JUNCTION_QUERIES = [
  {
    table: 'project_agreement_units',
    sql: `SELECT pau.* FROM project_agreement_units pau
          INNER JOIN project_agreements pa ON pa.id = pau.agreement_id
          WHERE pa.tenant_id = $1`,
    conflict: 'ON CONFLICT (agreement_id, unit_id) DO NOTHING',
  },
  {
    table: 'contract_categories',
    sql: `SELECT cc.* FROM contract_categories cc
          INNER JOIN contracts c ON c.id = cc.contract_id
          WHERE c.tenant_id = $1`,
    conflict: 'ON CONFLICT (contract_id, category_id) DO NOTHING',
  },
];

function parseArgs() {
  const args = process.argv.slice(2);
  let sourceUrl = null;
  let targetUrl = null;
  let sourceTenant = null;
  let targetTenant = null;
  let dryRun = false;
  let wipe = false;
  let createTenant = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--source-url' && args[i + 1]) sourceUrl = args[++i];
    else if (a.startsWith('--source-url=')) sourceUrl = a.slice('--source-url='.length);
    else if (a === '--target-url' && args[i + 1]) targetUrl = args[++i];
    else if (a.startsWith('--target-url=')) targetUrl = a.slice('--target-url='.length);
    else if (a === '--source-tenant' && args[i + 1]) sourceTenant = args[++i];
    else if (a === '--target-tenant' && args[i + 1]) targetTenant = args[++i];
    else if (a === '--dry-run') dryRun = true;
    else if (a === '--wipe') wipe = true;
    else if (a === '--create-tenant') createTenant = true;
  }

  sourceUrl =
    (sourceUrl || process.env.SOURCE_DATABASE_URL || process.env.DATABASE_URL || process.env.PG_URL || '').trim();
  targetUrl = (targetUrl || process.env.TARGET_DATABASE_URL || '').trim();

  if (!sourceTenant) {
    sourceTenant = (process.env.PG_SOURCE_TENANT_ID || process.env.PG_TARGET_TENANT_ID || '').trim() || DEFAULT_TENANT_ID;
  }
  if (!targetTenant) targetTenant = sourceTenant;

  return { sourceUrl, targetUrl, sourceTenant, targetTenant, dryRun, wipe, createTenant };
}

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function maskUrl(url) {
  return url.replace(/:([^:@/]+)@/, ':****@');
}

function clientSsl(url) {
  try {
    const u = new URL(url.replace(/^postgresql:\/\//, 'http://'));
    const host = (u.hostname || '').toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') return false;
  } catch (_) {}
  return { rejectUnauthorized: false };
}

async function loadPgColumnMeta(client) {
  const { rows } = await client.query(`
    SELECT table_name, column_name, data_type, udt_name, column_default, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);
  const byTable = new Map();
  for (const r of rows) {
    if (!byTable.has(r.table_name)) byTable.set(r.table_name, []);
    byTable.get(r.table_name).push(r);
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

function applyTenantRemap(selected, vals, sourceTenant, targetTenant) {
  if (sourceTenant === targetTenant) return;
  for (let i = 0; i < selected.length; i++) {
    const c = selected[i];
    if (c === 'buyer_tenant_id' || c === 'supplier_tenant_id' || c === 'tenant_id') {
      if (vals[i] === sourceTenant) vals[i] = targetTenant;
    }
  }
}

function getCategoriesConflictClause(selected) {
  const skip = new Set(['id', 'created_at']);
  const parts = [];
  for (const c of selected) {
    if (skip.has(c)) continue;
    parts.push(`${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`);
  }
  if (!selected.includes('updated_at')) {
    parts.push(`${quoteIdent('updated_at')} = NOW()`);
  }
  return `ON CONFLICT (id) DO UPDATE SET ${parts.join(', ')}`;
}

function getInsertConflictClause(table, selected) {
  if (table === 'categories') return getCategoriesConflictClause(selected);
  return 'ON CONFLICT DO NOTHING';
}

function buildSelectedColumns(table, sourceCols, targetCols, sourceTenant, targetTenant) {
  const sourceSet = new Set(sourceCols.map((c) => c.column_name));
  const selected = [];

  for (const tc of targetCols) {
    const name = tc.column_name;
    if (name === 'tenant_id') {
      selected.push(name);
      continue;
    }
    if (table === 'tenants' && name === 'id') {
      selected.push(name);
      continue;
    }
    if (!sourceSet.has(name)) continue;
    selected.push(name);
  }

  return selected;
}

function normalizePgValue(val, colMeta) {
  if (val === null || val === undefined) return null;
  const dt = colMeta?.data_type;
  const udt = colMeta?.udt_name;
  if (dt === 'json' || dt === 'jsonb' || udt === 'jsonb') {
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
  return val;
}

function rowToVals(row, table, selected, sourceTenant, targetTenant, colMetaByName) {
  const vals = [];
  for (const col of selected) {
    if (col === 'tenant_id') {
      vals.push(targetTenant);
      continue;
    }
    if (table === 'tenants' && col === 'id') {
      vals.push(targetTenant);
      continue;
    }
    vals.push(normalizePgValue(row[col], colMetaByName?.[col]));
  }
  applyTenantRemap(selected, vals, sourceTenant, targetTenant);
  return vals;
}

const JOURNAL_IMMUTABILITY_DELETE_TRIGGERS = [
  { table: 'journal_entries', trigger: 'journal_entries_immutable_del' },
  { table: 'journal_lines', trigger: 'journal_lines_immutable_del' },
];

async function setJournalDeleteTriggers(target, enabled) {
  const action = enabled ? 'ENABLE' : 'DISABLE';
  for (const { table, trigger } of JOURNAL_IMMUTABILITY_DELETE_TRIGGERS) {
    try {
      await target.query(`ALTER TABLE ${quoteIdent(table)} ${action} TRIGGER ${quoteIdent(trigger)}`);
    } catch (_) {
      /* table/trigger may be absent on older DBs */
    }
  }
}

async function fetchSourceRows(source, table, sourceTenant) {
  if (table === 'tenants') {
    const r = await source.query(`SELECT * FROM ${quoteIdent(table)} WHERE id = $1`, [sourceTenant]);
    return r.rows;
  }
  if (table === 'rental_agreements') {
    const hasOrgId = await source
      .query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'rental_agreements' AND column_name = 'org_id' LIMIT 1`
      )
      .then((x) => x.rows.length > 0);
    if (hasOrgId) {
      const r = await source.query(
        `SELECT * FROM rental_agreements WHERE tenant_id = $1 OR org_id = $1`,
        [sourceTenant]
      );
      for (const row of r.rows) {
        if (row.tenant_id == null || row.tenant_id === '') row.tenant_id = row.org_id;
      }
      return r.rows;
    }
  }
  const r = await source.query(
    `SELECT * FROM ${quoteIdent(table)} WHERE tenant_id = $1`,
    [sourceTenant]
  );
  return r.rows;
}

async function ensureTargetTenant(target, { sourceTenant, targetTenant, createTenant, dryRun, source }) {
  const existing = await target.query('SELECT id, name FROM tenants WHERE id = $1', [targetTenant]);
  if (existing.rows.length) {
    console.log(`Target tenant: ${existing.rows[0].id} (${existing.rows[0].name})`);
    return;
  }

  const src = await source.query('SELECT id, name FROM tenants WHERE id = $1', [sourceTenant]);
  if (!src.rows.length) {
    throw new Error(`Source has no tenant with id "${sourceTenant}".`);
  }

  if (!createTenant) {
    if (dryRun) {
      console.warn(
        `Target has no tenant id="${targetTenant}" yet — dry run will continue (source row counts only).`
      );
      console.warn('  For the real copy, add --create-tenant.');
      return;
    }
    throw new Error(
      `Target has no tenant id="${targetTenant}". Re-run with --create-tenant or create the organization in the app first.`
    );
  }

  if (!dryRun) {
    await target.query(
      `INSERT INTO tenants (id, name) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()`,
      [targetTenant, src.rows[0].name]
    );
  }
  console.log(`Target tenant: ${targetTenant} (${src.rows[0].name}) [created or updated]`);
}

async function wipeTargetTenant(target, targetTenant, pgTables, dryRun) {
  if (dryRun) {
    console.log('[dry-run] Would delete existing rows for target tenant (--wipe).');
    return;
  }
  await target.query('BEGIN');
  try {
    await setJournalDeleteTriggers(target, false);
    for (const table of DELETE_TABLE_ORDER) {
      if (!pgTables.has(table)) continue;
      const { rows } = await target.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'tenant_id' LIMIT 1`,
        [table]
      );
      if (!rows.length) continue;
      const r = await target.query(`DELETE FROM ${quoteIdent(table)} WHERE tenant_id = $1`, [targetTenant]);
      if (r.rowCount > 0) console.log(`  DELETE ${table}: ${r.rowCount} rows`);
    }
    await setJournalDeleteTriggers(target, true);
    await target.query('COMMIT');
  } catch (e) {
    await target.query('ROLLBACK');
    try {
      await setJournalDeleteTriggers(target, true);
    } catch (_) {}
    throw e;
  }
}

async function insertRows(target, table, selected, rows, sourceTenant, targetTenant, dryRun, colMetaByName) {
  if (!rows.length) return 0;

  const conflict = getInsertConflictClause(table, selected);
  let inserted = 0;
  const batchSize = 80;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const valueRows = batch.map((row) =>
      rowToVals(row, table, selected, sourceTenant, targetTenant, colMetaByName)
    );

    if (dryRun) {
      inserted += batch.length;
      continue;
    }

    const placeholders = valueRows
      .map((_, ri) => `(${selected.map((_, ci) => `$${ri * selected.length + ci + 1}`).join(', ')})`)
      .join(', ');
    const flat = valueRows.flat();
    const sql = `INSERT INTO ${quoteIdent(table)} (${selected.map(quoteIdent).join(', ')}) VALUES ${placeholders} ${conflict}`;

    try {
      const r = await target.query(sql, flat);
      inserted += r.rowCount || batch.length;
    } catch (e) {
      console.warn(
        `  batch insert failed for ${table} (${batch.length} rows), trying one-by-one: ${(e.message || '').split('\n')[0]}`
      );
      for (const row of batch) {
        const vals = rowToVals(row, table, selected, sourceTenant, targetTenant, colMetaByName);
        const ph = selected.map((_, ci) => `$${ci + 1}`).join(', ');
        try {
          await target.query(
            `INSERT INTO ${quoteIdent(table)} (${selected.map(quoteIdent).join(', ')}) VALUES (${ph}) ${conflict}`,
            vals
          );
          inserted++;
        } catch (err2) {
          console.warn(`  row skip ${table} id=${row.id || '?'}: ${(err2.message || '').split('\n')[0]}`);
        }
      }
    }
  }

  return inserted;
}

async function copyTable({ source, target, table, sourceTenant, targetTenant, sourceMeta, targetMeta, targetTables, dryRun }) {
  if (!targetTables.has(table)) return { n: 0, skipped: 'no table on target' };

  const targetCols = targetMeta.get(table);
  if (!targetCols) return { n: 0, skipped: 'no columns on target' };

  let rows;
  try {
    rows = await fetchSourceRows(source, table, sourceTenant);
  } catch (e) {
    if (String(e.message).includes('does not exist')) return { n: 0, skipped: 'no table on source' };
    throw e;
  }

  if (!rows.length) return { n: 0 };

  const sourceCols = sourceMeta.get(table) || [];
  const selected = buildSelectedColumns(table, sourceCols, targetCols, sourceTenant, targetTenant);
  if (!selected.length) return { n: 0, skipped: 'no column overlap' };

  const colMetaByName = Object.fromEntries(targetCols.map((c) => [c.column_name, c]));
  const n = await insertRows(target, table, selected, rows, sourceTenant, targetTenant, dryRun, colMetaByName);
  return { n };
}

async function copyJunctionTables({ source, target, sourceTenant, targetTenant, targetMeta, targetTables, dryRun }) {
  let total = 0;
  for (const def of JUNCTION_QUERIES) {
    if (!targetTables.has(def.table)) continue;
    const targetCols = targetMeta.get(def.table);
    if (!targetCols) continue;

    const { rows } = await source.query(def.sql, [sourceTenant]);
    if (!rows.length) continue;

    const sourceColSet = new Set(Object.keys(rows[0]));
    const selected = targetCols.map((c) => c.column_name).filter((n) => sourceColSet.has(n));
    if (!selected.length) continue;

    const colMetaByName = Object.fromEntries(targetCols.map((c) => [c.column_name, c]));
    for (const row of rows) {
      const vals = rowToVals(row, def.table, selected, sourceTenant, targetTenant, colMetaByName);
      if (dryRun) {
        total++;
        continue;
      }
      const ph = vals.map((_, i) => `$${i + 1}`).join(', ');
      try {
        await target.query(
          `INSERT INTO ${quoteIdent(def.table)} (${selected.map(quoteIdent).join(', ')}) VALUES (${ph}) ${def.conflict}`,
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

async function printCounts(client, tenantId, label) {
  const tables = ['accounts', 'contacts', 'invoices', 'bills', 'transactions', 'rental_agreements', 'project_agreements', 'users'];
  console.log(`\n${label} (${tenantId}):`);
  for (const t of tables) {
    try {
      const col = t === 'tenants' ? 'id' : 'tenant_id';
      const r = await client.query(
        `SELECT COUNT(*)::int AS n FROM ${quoteIdent(t)} WHERE ${quoteIdent(col)} = $1`,
        [tenantId]
      );
      console.log(`  ${t.padEnd(24)} ${r.rows[0].n}`);
    } catch {
      console.log(`  ${t.padEnd(24)} —`);
    }
  }
}

async function main() {
  const opts = parseArgs();

  if (!opts.sourceUrl) {
    console.error('ERROR: SOURCE_DATABASE_URL (or DATABASE_URL in .env) is required.');
    process.exit(1);
  }
  if (!opts.targetUrl) {
    console.error('ERROR: TARGET_DATABASE_URL is required (Render external URL).');
    console.error('  $env:TARGET_DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"');
    process.exit(1);
  }

  console.log('='.repeat(70));
  console.log('  PostgreSQL tenant copy');
  console.log('='.repeat(70));
  console.log('  Source:', maskUrl(opts.sourceUrl));
  console.log('  Target:', maskUrl(opts.targetUrl));
  console.log('  Source tenant:', opts.sourceTenant);
  console.log('  Target tenant:', opts.targetTenant);
  if (opts.dryRun) console.log('  Mode: DRY RUN');
  if (opts.wipe) console.log('  Wipe target tenant first: YES');
  console.log('='.repeat(70));

  const source = new Client({ connectionString: opts.sourceUrl, ssl: clientSsl(opts.sourceUrl) });
  const target = new Client({ connectionString: opts.targetUrl, ssl: clientSsl(opts.targetUrl) });

  await source.connect();
  await target.connect();

  try {
    const srcTenant = await source.query('SELECT id, name FROM tenants WHERE id = $1', [opts.sourceTenant]);
    if (!srcTenant.rows.length) {
      throw new Error(`No tenant "${opts.sourceTenant}" on source database.`);
    }
    console.log(`\nSource tenant: ${srcTenant.rows[0].id} (${srcTenant.rows[0].name})`);

    const sourceMeta = await loadPgColumnMeta(source);
    const targetMeta = await loadPgColumnMeta(target);
    const targetTables = await loadPgTables(target);

    await ensureTargetTenant(target, {
      sourceTenant: opts.sourceTenant,
      targetTenant: opts.targetTenant,
      createTenant: opts.createTenant,
      dryRun: opts.dryRun,
      source,
    });

    if (opts.wipe) {
      console.log('\nWiping existing data for target tenant...');
      await wipeTargetTenant(target, opts.targetTenant, targetTables, opts.dryRun);
    }

    let grand = 0;
    console.log('\nCopying tables...');
    for (const table of INSERT_TABLE_ORDER) {
      process.stdout.write(`  ${table.padEnd(36)} `);
      const r = await copyTable({
        source,
        target,
        table,
        sourceTenant: opts.sourceTenant,
        targetTenant: opts.targetTenant,
        sourceMeta,
        targetMeta,
        targetTables,
        dryRun: opts.dryRun,
      });
      if (r.skipped) console.log(`skip (${r.skipped})`);
      else console.log(`${String(r.n).padStart(6)} rows`);
      grand += r.n;
    }

    console.log('\n  Junction tables...');
    const jn = await copyJunctionTables({
      source,
      target,
      sourceTenant: opts.sourceTenant,
      targetTenant: opts.targetTenant,
      targetMeta,
      targetTables,
      dryRun: opts.dryRun,
    });
    console.log(`  total junction rows: ${jn}`);

    await printCounts(source, opts.sourceTenant, 'Source counts');
    await printCounts(target, opts.targetTenant, 'Target counts');

    console.log('\nDone.');
    if (opts.dryRun) {
      console.log('Dry run only — no data written. Remove --dry-run to apply.');
    } else {
      console.log(`Copied ${grand + jn} row(s) into tenant ${opts.targetTenant}.`);
    }
  } finally {
    await source.end();
    await target.end();
  }
}

main().catch((err) => {
  console.error('\nFATAL:', err.message || err);
  process.exit(1);
});
