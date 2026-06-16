/**
 * Full organization data reset for a tenant (preserves users, RBAC, subscriptions).
 * Fixes gaps in Settings → Factory Reset (procurement PO/GRN, workflow, reports, etc.).
 *
 * Usage:
 *   node scripts/reset-tenant-data.mjs --tenant pakland --env production --dry-run
 *   node scripts/reset-tenant-data.mjs --tenant pakland --env production --confirm
 *
 * Env: `.env.production.render` (cloud) or `.env.production` / `.env.staging` when --env is set.
 */
import dotenv from 'dotenv';
import pg from 'pg';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}
const hasFlag = (name) => args.includes(name);

const tenantQuery = flag('--tenant');
const envName = flag('--env') || 'staging';
const dryRun = hasFlag('--dry-run');
const confirm = hasFlag('--confirm');

if (!tenantQuery) {
  console.error(
    'Usage: node scripts/reset-tenant-data.mjs --tenant <name-or-id> [--env production|staging] [--dry-run] [--confirm]'
  );
  process.exit(1);
}

if (!dryRun && !confirm) {
  console.error('Pass --dry-run to preview counts, or --confirm to execute the reset.');
  process.exit(1);
}

const envFile =
  envName === 'production'
    ? existsSync(resolve(process.cwd(), '.env.production.render'))
      ? '.env.production.render'
      : '.env.production'
    : '.env.staging';
const envPath = resolve(process.cwd(), envFile);
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const url = process.env.DATABASE_URL || process.env.PG_URL;
if (!url) {
  console.error(`DATABASE_URL missing — set ${envFile} or export DATABASE_URL`);
  process.exit(1);
}

const COUNT_TABLES = [
  'purchase_orders',
  'purchase_order_lines',
  'goods_receipts',
  'goods_receipt_lines',
  'bill_po_lines',
  'transactions',
  'invoices',
  'bills',
  'projects',
  'vendors',
  'contacts',
  'users',
];

const pool = new pg.Pool({ connectionString: url });

try {
  const tenants = await pool.query(
    `SELECT id, COALESCE(NULLIF(TRIM(company_name), ''), name) AS display_name, name, company_name, email
     FROM tenants
     WHERE id ILIKE $1
        OR name ILIKE $1
        OR company_name ILIKE $1
     ORDER BY LOWER(COALESCE(NULLIF(TRIM(company_name), ''), name))`,
    [`%${tenantQuery}%`]
  );

  if (tenants.rows.length === 0) {
    console.error(`No tenant matching "${tenantQuery}"`);
    process.exit(1);
  }
  if (tenants.rows.length > 1) {
    console.log('Multiple tenants matched — use exact tenant id:');
    for (const t of tenants.rows) {
      console.log(`  ${t.id}  ${t.display_name}  (${t.email || 'no company email'})`);
    }
    process.exit(1);
  }

  const tenant = tenants.rows[0];
  const tenantId = tenant.id;
  console.log(`Tenant: ${tenant.display_name} (${tenantId})`);
  console.log(`Environment: ${envName} via ${envFile}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'RESET'}`);

  const users = await pool.query(
    `SELECT username, email, role FROM users WHERE tenant_id = $1 AND COALESCE(is_active, TRUE) = TRUE ORDER BY username`,
    [tenantId]
  );
  console.log(`\nUsers preserved (${users.rows.length}):`);
  for (const u of users.rows) {
    console.log(`  - ${u.username} <${u.email || 'no email'}> (${u.role})`);
  }

  console.log('\nRow counts before reset:');
  for (const table of COUNT_TABLES) {
    try {
      const r = await pool.query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE tenant_id = $1`, [
        tenantId,
      ]);
      console.log(`  ${table}: ${r.rows[0].n}`);
    } catch {
      console.log(`  ${table}: (table missing)`);
    }
  }

  if (dryRun) {
    console.log('\nDry run complete — re-run with --confirm to wipe and re-bootstrap chart of accounts.');
    process.exit(0);
  }

  console.log('\nRunning factory reset via backend service…');
  const resetScript = resolve(process.cwd(), 'backend/src/scripts/resetTenantDataCli.ts');
  const child = spawnSync(
    process.execPath,
    [
      resolve(process.cwd(), 'node_modules/tsx/dist/cli.mjs'),
      resetScript,
      '--tenant-id',
      tenantId,
      '--env-file',
      envFile,
    ],
    { stdio: 'inherit', cwd: process.cwd(), env: process.env }
  );
  if (child.status !== 0) {
    process.exit(child.status ?? 1);
  }

  console.log('\nRow counts after reset:');
  for (const table of COUNT_TABLES) {
    try {
      const r = await pool.query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE tenant_id = $1`, [
        tenantId,
      ]);
      console.log(`  ${table}: ${r.rows[0].n}`);
    } catch {
      console.log(`  ${table}: (table missing)`);
    }
  }

  console.log('\nDone. Users unchanged; organization data wiped and chart re-bootstrapped.');
  console.log('Log out and back in on all sessions before seeding demo data.');
} finally {
  await pool.end();
}
