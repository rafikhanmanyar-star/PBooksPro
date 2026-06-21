/**
 * Create or update a Super Admin user on staging PostgreSQL.
 *
 * Usage:
 *   node scripts/create-staging-super-admin.mjs --tenant test-company --username SAdmin --password SAdmin123
 */
import dotenv from 'dotenv';
import pg from 'pg';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const require = createRequire(import.meta.url);
const bcrypt = require(
  existsSync(join(process.cwd(), 'backend', 'node_modules', 'bcryptjs'))
    ? join(process.cwd(), 'backend', 'node_modules', 'bcryptjs')
    : 'bcryptjs'
);

const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

const envName = flag('--env') || 'staging';
const envFile = envName === 'production' ? '.env.production' : '.env.staging';
const envPath = resolve(process.cwd(), envFile);
if (existsSync(envPath)) dotenv.config({ path: envPath });
else dotenv.config();

const tenantId = flag('--tenant') || 'test-company';
const username = flag('--username') || 'SAdmin';
const name = flag('--name') || username;
const password = flag('--password') || 'SAdmin123';
const email = flag('--email') || `${username.toLowerCase()}@company.local`;
const userId = flag('--user-id') || `user_${username.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${tenantId.replace(/[^a-z0-9]+/g, '_')}`;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(`DATABASE_URL missing — set ${envFile}`);
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url });
const client = await pool.connect();

try {
  await client.query('BEGIN');

  const tenant = await client.query('SELECT id, name FROM tenants WHERE id = $1', [tenantId]);
  if (!tenant.rows[0]) {
    console.error(`Tenant "${tenantId}" not found`);
    process.exit(1);
  }

  const superRole = await client.query(
    `SELECT id FROM rbac_roles WHERE tenant_id = $1 AND slug = 'super_admin' LIMIT 1`,
    [tenantId]
  );
  if (!superRole.rows[0]) {
    console.error('RBAC super_admin role not seeded — run migrations');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 10);
  await client.query(
    `INSERT INTO users (id, tenant_id, username, name, role, password_hash, email, is_active, email_verified)
     VALUES ($1, $2, $3, $4, 'SUPER_ADMIN', $5, $6, TRUE, FALSE)
     ON CONFLICT (tenant_id, username) DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       name = EXCLUDED.name,
       role = 'SUPER_ADMIN',
       email = EXCLUDED.email,
       is_active = TRUE,
       updated_at = NOW()`,
    [userId, tenantId, username, name, hash, email]
  );

  await client.query(
    `INSERT INTO user_tenants (id, user_id, tenant_id, role, is_default)
     VALUES ($1, $2, $3, 'SUPER_ADMIN', FALSE)
     ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = 'SUPER_ADMIN'`,
    [`ut_${userId}`, userId, tenantId]
  );

  await client.query(`DELETE FROM rbac_user_roles WHERE tenant_id = $1 AND user_id = $2`, [
    tenantId,
    userId,
  ]);
  await client.query(
    `INSERT INTO rbac_user_roles (tenant_id, user_id, role_id, assigned_by)
     VALUES ($1, $2, $3, NULL)
     ON CONFLICT (user_id, role_id) DO NOTHING`,
    [tenantId, userId, superRole.rows[0].id]
  );

  await client.query('COMMIT');
  console.log(`Tenant: ${tenant.rows[0].name} (${tenantId})`);
  console.log(`Super Admin created/updated: ${username} / ${password}`);
  console.log(`Email: ${email}`);
  console.log(`User ID: ${userId}`);
  console.log('Sign in on staging desktop client (API :3001) with username or email.');
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  client.release();
  await pool.end();
}
