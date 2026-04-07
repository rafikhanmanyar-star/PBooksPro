/**
 * Upsert user Rafi / Rafi123 for the RK Builders tenant in PostgreSQL (LAN API login).
 *
 * Run from repo root (loads .env):
 *   node scripts/seed-rk-builders-rafi.cjs
 *
 * Env:
 *   DATABASE_URL or PG_URL
 *   PG_TARGET_TENANT_ID  (default: rk-builders-284d6d)
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
  const password = 'Rafi123';
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
    const t = await client.query('SELECT id, name FROM tenants WHERE id = $1', [tenantId]);
    if (!t.rows.length) {
      console.error(`ERROR: No tenant with id "${tenantId}". Create the organization first.`);
      process.exit(1);
    }
    console.log(`Tenant: ${t.rows[0].name} (${tenantId})`);

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
    console.log(`Login: username ${username} / password ${password}`);
    console.log(`Select this organization (tenant id ${tenantId}) in the app when signing in.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('FATAL:', err.message || err);
  process.exit(1);
});
