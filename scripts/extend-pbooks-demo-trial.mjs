/**
 * Extend pbooks-demo public sandbox trial on cloud production PostgreSQL.
 *
 * Usage:
 *   node scripts/extend-pbooks-demo-trial.mjs --days 30
 *   node scripts/extend-pbooks-demo-trial.mjs --days 30 --confirm
 *
 * Env: DATABASE_URL or PG_URL from .env.production.render (default) or --env-file
 */
import dotenv from 'dotenv';
import pg from 'pg';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const TENANT_ID = 'pbooks-demo';
const args = process.argv.slice(2);
const confirm = args.includes('--confirm');
const dryRun = args.includes('--dry-run');
const daysIdx = args.indexOf('--days');
const extendDays = daysIdx >= 0 ? Number(args[daysIdx + 1]) : 30;

if (!Number.isFinite(extendDays) || extendDays <= 0) {
  console.error('Invalid --days value');
  process.exit(1);
}

const envFileArgIdx = args.indexOf('--env-file');
const envFiles =
  envFileArgIdx >= 0 && args[envFileArgIdx + 1]
    ? [args[envFileArgIdx + 1]]
    : ['.env.production.render', '.env.production', '.env'];

for (const f of envFiles) {
  const p = resolve(process.cwd(), f);
  if (existsSync(p)) {
    dotenv.config({ path: p });
    break;
  }
}

const url = process.env.DATABASE_URL || process.env.PG_URL;
if (!url) {
  console.error('No DATABASE_URL/PG_URL found. Use .env.production.render or --env-file.');
  process.exit(1);
}

const ssl =
  /render\.com|amazonaws\.com|rds\./i.test(url) ? { rejectUnauthorized: false } : undefined;

function addDays(from, days) {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d;
}

function daysBetween(a, b) {
  return Math.ceil((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
}

const pool = new pg.Pool({ connectionString: url, ssl });
const client = await pool.connect();

try {
  const tenantRow = await client.query(
    `SELECT id, created_at FROM tenants WHERE id = $1`,
    [TENANT_ID]
  );
  if (!tenantRow.rows[0]) {
    console.error(`Tenant ${TENANT_ID} not found`);
    process.exit(1);
  }

  const createdAt = new Date(tenantRow.rows[0].created_at);
  const subs = await client.query(
    `SELECT id, status, start_date, trial_end_date, renewal_date, updated_at
     FROM subscriptions
     WHERE tenant_id = $1
     ORDER BY updated_at DESC`,
    [TENANT_ID]
  );

  const trialEnd = addDays(new Date(), extendDays);
  const minDemoTrialDays = daysBetween(createdAt, trialEnd);
  // Production API sync uses tenant.created_at + DEMO_TRIAL_DAYS (env, default 7).
  // Backdate created_at so sync keeps trial_end at least extendDays from now.
  const serverDemoTrialDays = Number(process.env.DEMO_TRIAL_DAYS_SERVER) || 7;
  const alignedCreatedAt = addDays(trialEnd, -serverDemoTrialDays);

  console.log('Tenant created_at:', createdAt.toISOString());
  console.log('Current subscriptions:');
  for (const row of subs.rows) {
    console.log(
      `  ${row.id} status=${row.status} trial_end=${row.trial_end_date} renewal=${row.renewal_date}`
    );
  }
  console.log(`Planned trial_end_date: ${trialEnd.toISOString()} (+${extendDays} days from now)`);
  console.log(
    `Aligned tenant created_at for server DEMO_TRIAL_DAYS=${serverDemoTrialDays}: ${alignedCreatedAt.toISOString()}`
  );
  console.log(
    `Minimum DEMO_TRIAL_DAYS on API server to avoid auto re-expiry (if created_at unchanged): ${minDemoTrialDays}`
  );

  const targetSub = subs.rows[0];
  if (!targetSub) {
    console.error('No subscription row found for pbooks-demo');
    process.exit(1);
  }

  if (!confirm && !dryRun) {
    console.log('\nDry-run only. Re-run with --confirm to apply, or pass --dry-run explicitly.');
    process.exit(0);
  }

  if (dryRun) {
    console.log('\nDry-run — no changes applied.');
    process.exit(0);
  }

  await client.query('BEGIN');
  await client.query(
    `UPDATE tenants SET created_at = $2, updated_at = NOW() WHERE id = $1`,
    [TENANT_ID, alignedCreatedAt.toISOString()]
  );
  await client.query(
    `UPDATE subscriptions
     SET status = 'trialing',
         start_date = $2,
         trial_end_date = $3,
         renewal_date = $3,
         updated_at = NOW()
     WHERE id = $1`,
    [targetSub.id, alignedCreatedAt.toISOString(), trialEnd.toISOString()]
  );
  await client.query('COMMIT');

  const verifyTenant = await client.query(
    `SELECT created_at FROM tenants WHERE id = $1`,
    [TENANT_ID]
  );
  const verify = await client.query(
    `SELECT id, status, start_date, trial_end_date, renewal_date FROM subscriptions WHERE id = $1`,
    [targetSub.id]
  );
  console.log('\nUpdated tenant created_at:', verifyTenant.rows[0]?.created_at);
  console.log('Updated subscription:', verify.rows[0]);
  console.log(
    `\nTip: set DEMO_TRIAL_DAYS=${extendDays} (or ${minDemoTrialDays}+) on production API when you can — avoids relying on created_at alignment.`
  );
} catch (e) {
  await client.query('ROLLBACK');
  console.error(e);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
