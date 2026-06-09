/**
 * Compare tenant row counts between source and target PostgreSQL.
 * Usage:
 *   node scripts/verify-tenant-pg-counts.cjs
 *   SOURCE_DATABASE_URL=... TARGET_DATABASE_URL=... node scripts/verify-tenant-pg-counts.cjs --tenant rk-builders-284d6d
 */
'use strict';

const path = require('path');
const { Client } = require('pg');

const projectRoot = path.join(__dirname, '..');
try {
  const dotenv = require('dotenv');
  dotenv.config({ path: path.join(projectRoot, '.env') });
  dotenv.config({ path: path.join(projectRoot, 'backend', '.env') });
  dotenv.config({ path: path.join(projectRoot, '.env.production.render') });
} catch (_) {}

const DEFAULT_TENANT = 'rk-builders-284d6d';

const TABLES = [
  'users', 'accounts', 'contacts', 'vendors', 'categories', 'projects', 'buildings', 'properties', 'units',
  'documents', 'plan_amenities', 'installment_plans', 'budgets', 'rental_agreements', 'project_agreements',
  'sales_returns', 'project_received_assets', 'contracts', 'pm_cycle_allocations', 'invoices', 'bills',
  'transactions', 'quotations', 'recurring_invoice_templates', 'purchase_orders', 'registered_suppliers',
  'payroll_tenant_config', 'payroll_departments', 'payroll_grades', 'payroll_projects', 'payroll_employees',
  'payroll_runs', 'payslips', 'payroll_salary_components', 'personal_categories', 'personal_transactions',
  'journal_entries', 'journal_lines', 'journal_reversals', 'accounting_audit_log', 'app_settings',
];

const JUNCTION = [
  {
    name: 'project_agreement_units',
    sql: `SELECT COUNT(*)::int AS n FROM project_agreement_units pau
          JOIN project_agreements pa ON pa.id = pau.agreement_id WHERE pa.tenant_id = $1`,
  },
  {
    name: 'contract_categories',
    sql: `SELECT COUNT(*)::int AS n FROM contract_categories cc
          JOIN contracts c ON c.id = cc.contract_id WHERE c.tenant_id = $1`,
  },
];

function parseArgs() {
  const args = process.argv.slice(2);
  let tenant = DEFAULT_TENANT;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--tenant' && args[i + 1]) tenant = args[++i];
  }
  const source = (process.env.SOURCE_DATABASE_URL || process.env.DATABASE_URL || process.env.PG_URL || '').trim();
  const target = (process.env.TARGET_DATABASE_URL || '').trim();
  return { tenant, source, target };
}

function clientSsl(url) {
  try {
    const host = new URL(url.replace(/^postgresql:\/\//, 'http://')).hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') return false;
  } catch (_) {}
  return { rejectUnauthorized: false };
}

function maskUrl(url) {
  return url.replace(/:([^:@/]+)@/, ':****@');
}

async function tableCount(client, table, tenantId) {
  try {
    const r = await client.query(
      `SELECT COUNT(*)::int AS n FROM "${table}" WHERE tenant_id = $1`,
      [tenantId]
    );
    return r.rows[0].n;
  } catch (e) {
    if (String(e.message).includes('does not exist')) return null;
    throw e;
  }
}

async function loadCounts(client, tenantId) {
  const out = {};
  for (const t of TABLES) out[t] = await tableCount(client, t, tenantId);
  for (const j of JUNCTION) {
    try {
      const r = await client.query(j.sql, [tenantId]);
      out[j.name] = r.rows[0].n;
    } catch (e) {
      out[j.name] = String(e.message).includes('does not exist') ? null : (() => { throw e; })();
    }
  }
  return out;
}

async function main() {
  const { tenant, source, target } = parseArgs();
  if (!source) {
    console.error('ERROR: SOURCE_DATABASE_URL or DATABASE_URL required.');
    process.exit(1);
  }
  if (!target) {
    console.error('ERROR: TARGET_DATABASE_URL required.');
    process.exit(1);
  }

  const src = new Client({ connectionString: source, ssl: clientSsl(source) });
  const tgt = new Client({ connectionString: target, ssl: clientSsl(target) });
  await src.connect();
  await tgt.connect();

  try {
    const s = await loadCounts(src, tenant);
    const t = await loadCounts(tgt, tenant);
    const keys = [...TABLES, ...JUNCTION.map((j) => j.name)];

    console.log('Tenant:', tenant);
    console.log('Local :', maskUrl(source));
    console.log('Render:', maskUrl(target));
    console.log();
    console.log(`${'TABLE'.padEnd(32)}${'LOCAL'.padStart(8)}${'RENDER'.padStart(8)}  STATUS`);
    console.log('-'.repeat(56));

    let ok = 0;
    let mismatches = [];

    for (const k of keys) {
      const a = s[k];
      const b = t[k];
      let status;
      if (a === null && b === null) status = 'n/a';
      else if (a === null || b === null) status = 'TABLE MISSING';
      else if (a === b) status = 'OK';
      else status = 'MISMATCH';

      if (status === 'OK') ok++;
      else mismatches.push({ k, a, b, status });

      const la = a === null ? '—' : String(a);
      const lb = b === null ? '—' : String(b);
      const mark = status === 'OK' ? '' : '  ' + status;
      if (status !== 'OK') {
        console.log(`${k.padEnd(32)}${la.padStart(8)}${lb.padStart(8)}${mark}`);
      }
    }

    console.log('-'.repeat(56));
    console.log(`Tables in sync: ${ok} / ${keys.length}`);
    if (mismatches.length === 0) {
      console.log('\nAll comparable tables match between local and Render.');
    } else {
      console.log(`\n${mismatches.length} table(s) differ or are missing — see rows above.`);
    }

    console.log('\nCore business data:');
    const core = [
      'users', 'accounts', 'contacts', 'invoices', 'bills', 'transactions',
      'rental_agreements', 'project_agreements', 'units', 'properties', 'projects',
    ];
    let coreOk = true;
    for (const k of core) {
      const a = s[k];
      const b = t[k];
      const match = a === b;
      if (!match) coreOk = false;
      console.log(`  ${k.padEnd(24)} ${String(a ?? '—').padStart(6)}  ${String(b ?? '—').padStart(6)}  ${match ? 'OK' : 'DIFF'}`);
    }
    console.log(coreOk ? '\nCore business data: VERIFIED OK' : '\nCore business data: REVIEW DIFFERENCES');
  } finally {
    await src.end();
    await tgt.end();
  }
}

main().catch((e) => {
  console.error('FATAL:', e.message || e);
  process.exit(1);
});
