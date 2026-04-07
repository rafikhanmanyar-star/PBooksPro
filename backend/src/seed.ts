import bcrypt from 'bcryptjs';
import { getPool } from './db/pool.js';
import { bootstrapTenantChart } from './services/tenantBootstrap.js';

/**
 * Idempotent dev seed: default tenant, admin user (admin/admin), system accounts.
 */
export async function seedDevIfEnabled(): Promise<void> {
  if (process.env.SEED_DEV_USER !== '1' && process.env.NODE_ENV !== 'development') {
    return;
  }
  const pool = getPool();
  const passwordHash = await bcrypt.hash(process.env.DEV_ADMIN_PASSWORD || 'admin', 10);

  await pool.query(
    `INSERT INTO tenants (id, name) VALUES ('default', 'Default tenant')
     ON CONFLICT (id) DO NOTHING`
  );

  const userCount = await pool.query(`SELECT 1 FROM users WHERE tenant_id = 'default' AND username = 'admin' LIMIT 1`);
  if (userCount.rows.length === 0) {
    await pool.query(
      `INSERT INTO users (id, tenant_id, username, name, role, password_hash, is_active)
       VALUES ('user_admin_default', 'default', 'admin', 'Administrator', 'Admin', $1, TRUE)`,
      [passwordHash]
    );
  }

  const rafiPassword = process.env.DEV_RAFI_PASSWORD ?? 'Rafi123';
  const rafiHash = await bcrypt.hash(rafiPassword, 10);
  const rafiCount = await pool.query(`SELECT 1 FROM users WHERE tenant_id = 'default' AND LOWER(username) = LOWER('Rafi') LIMIT 1`);
  if (rafiCount.rows.length === 0) {
    await pool.query(
      `INSERT INTO users (id, tenant_id, username, name, role, password_hash, is_active)
       VALUES ('user_rafi_default', 'default', 'Rafi', 'Rafi', 'Admin', $1, TRUE)`,
      [rafiHash]
    );
  }

  await bootstrapTenantChart(pool, 'default', { legacyIds: true });

  console.log('[seed] Dev logins — tenant=default | admin / (DEV_ADMIN_PASSWORD or "admin") | Rafi / (DEV_RAFI_PASSWORD or "Rafi123")');
}
