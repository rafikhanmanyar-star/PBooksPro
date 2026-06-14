/**
 * Upsert user Rafi for the RK Builders tenant in PostgreSQL (LAN API login).
 *
 * Run from repo root (loads .env):
 *   node scripts/seed-rk-builders-rafi.cjs
 *
 * Env:
 *   DATABASE_URL or PG_URL
 *   PG_TARGET_TENANT_ID  (default: rk-builders-284d6d)
 *   RK_BUILDERS_RAFI_PASSWORD  (default: Rafi1234 — min 8 chars, letter + number)
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

const DEFAULT_TENANT_ID = 'rk-builders-284d6d';
const USER_ID = 'user_rafi_rkbuilders_seed';

async function main() {
  const bcrypt = loadBcrypt();
  const DATABASE_URL = (process.env.DATABASE_URL || process.env.PG_URL || '').trim();
  if (!DATABASE_URL) {
    console.error('ERROR: DATABASE_URL or PG_URL is required in .env');
    process.exit(1);
  }

  const tenantId = (process.env.PG_TARGET_TENANT_ID || '').trim() || DEFAULT_TENANT_ID;
  const username = 'Rafi';
  const password = (process.env.RK_BUILDERS_RAFI_PASSWORD || '').trim() || 'Rafi1234';
  const name = 'Rafi';
  const role = 'Admin';
  const passwordHash = bcrypt.hashSync(password, 10);

  let ssl = { rejectUnauthorized: false };
  try {
    const u = new URL(DATABASE_URL.replace(/^postgresql:\/\//, 'http://'));
    const host = (u.hostname || '').toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') ssl = false;
  } catch (_) {}

  const client = new Client({ connectionString: DATABASE_URL, ssl });
  await client.connect();

  try {
    const t = await client.query('SELECT id, name, email FROM tenants WHERE id = $1', [tenantId]);
    if (!t.rows.length) {
      console.error(`ERROR: No tenant with id "${tenantId}". Create the organization first.`);
      process.exit(1);
    }
    console.log(`Tenant: ${t.rows[0].name} (${tenantId})`);

    const companyEmail = 'rkbuilders@pbookspro.com';
    await client.query(
      `UPDATE tenants
       SET email = $1,
           company_name = COALESCE(NULLIF(TRIM(company_name), ''), 'RK Builders'),
           updated_at = NOW()
       WHERE id = $2`,
      [companyEmail, tenantId]
    );
    console.log(`OK: organization email set to ${companyEmail}`);

    const r = await client.query(
      `INSERT INTO users (id, tenant_id, username, name, role, password_hash, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)
       ON CONFLICT (tenant_id, username) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         name = EXCLUDED.name,
         role = EXCLUDED.role,
         is_active = TRUE,
         updated_at = NOW()
       RETURNING id, username`,
      [USER_ID, tenantId, username, name, role, passwordHash]
    );

    const row = r.rows[0];
    console.log(`OK: user "${row.username}" (id ${row.id})`);

    await client.query(
      `INSERT INTO user_tenants (id, user_id, tenant_id, role, is_default, created_at)
       VALUES ($1, $2, $3, $4, TRUE, NOW())
       ON CONFLICT (user_id, tenant_id) DO UPDATE SET
         role = EXCLUDED.role,
         is_default = TRUE`,
      [`ut_${row.id}`, row.id, tenantId, role]
    );
    console.log('OK: user_tenants membership ensured');

    const activeSub = await client.query(
      `SELECT id FROM subscriptions
       WHERE tenant_id = $1 AND status = ANY($2::text[])
       LIMIT 1`,
      [tenantId, ['trialing', 'active', 'past_due', 'paused', 'pending']]
    );
    if (!activeSub.rows.length) {
      const plan = await client.query(
        `SELECT id FROM billing_plans WHERE plan_code = 'trial' LIMIT 1`
      );
      if (!plan.rows.length) {
        console.warn('WARN: No trial billing plan found — run API migrations/seed first.');
      } else {
        const { randomUUID } = require('crypto');
        const subId = randomUUID();
        const now = new Date();
        const trialEnd = new Date(now);
        trialEnd.setDate(trialEnd.getDate() + 30);
        await client.query(
          `INSERT INTO subscriptions (
             id, tenant_id, plan_id, status, billing_cycle, start_date, trial_end_date, renewal_date
           ) VALUES ($1, $2, $3, 'trialing', 'trial', $4, $5, $5)`,
          [subId, tenantId, plan.rows[0].id, now.toISOString(), trialEnd.toISOString()]
        );
        console.log(`OK: 30-day trial subscription created (ends ${trialEnd.toISOString().slice(0, 10)})`);
      }
    } else {
      console.log('Trial/subscription already active — skipped trial creation.');
    }

    console.log(`Login: username ${username} / password ${password}`);
    console.log(`Company email: ${companyEmail}`);
    console.log(`Sign in at app.pbookspro.com with company email, username, and password.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('FATAL:', err.message || err);
  process.exit(1);
});
