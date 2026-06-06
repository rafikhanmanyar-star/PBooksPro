import bcrypt from 'bcryptjs';
import { getPool } from './db/pool.js';
import { bootstrapTenantChart } from './services/tenantBootstrap.js';
import { logger } from './utils/logger.js';

export const STAGING_TENANT_ID = 'test-company';
export const STAGING_TENANT_NAME = 'test company';

/**
 * Idempotent staging defaults: organization "test company", admin Rafi / Rafi123.
 * Safe to run on every deploy; upserts tenant, user password, and system chart.
 */
export async function seedStagingDefaults(): Promise<void> {
  const pool = getPool();
  const tenantId = (process.env.STAGING_TENANT_ID || STAGING_TENANT_ID).trim();
  const tenantName = (process.env.STAGING_TENANT_NAME || STAGING_TENANT_NAME).trim();
  const username = (process.env.STAGING_ADMIN_USERNAME || 'Rafi').trim();
  const password = process.env.STAGING_ADMIN_PASSWORD || 'Rafi123';
  const userId = (process.env.STAGING_ADMIN_USER_ID || 'user_rafi_test_company').trim();

  await pool.query(
    `INSERT INTO tenants (id, name) VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()`,
    [tenantId, tenantName]
  );

  const passwordHash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO users (id, tenant_id, username, name, role, password_hash, is_active)
     VALUES ($1, $2, $3, $4, 'Admin', $5, TRUE)
     ON CONFLICT (tenant_id, username) DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       name = EXCLUDED.name,
       role = EXCLUDED.role,
       is_active = TRUE,
       updated_at = NOW()`,
    [userId, tenantId, username, username, passwordHash]
  );

  await bootstrapTenantChart(pool, tenantId, { legacyIds: false });

  logger.info(
    `Staging seed complete — org "${tenantName}" (${tenantId}) | ${username} / ${password}`
  );
}

/** Runs seedStagingDefaults when SEED_STAGING=1 (including NODE_ENV=production staging API). */
export async function seedStagingIfEnabled(): Promise<void> {
  if (process.env.SEED_STAGING !== '1') return;
  await seedStagingDefaults();
}

/**
 * Idempotent dev seed: default tenant, admin user (admin/admin), system accounts.
 * Never runs in production (even when SEED_DEV_USER=1).
 */
export async function seedDevIfEnabled(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    if (process.env.SEED_DEV_USER === '1') {
      logger.warn('Refusing dev seed in production (SEED_DEV_USER is ignored)');
    }
    return;
  }
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

  logger.info('Dev seed complete — tenant=default | admin / (DEV_ADMIN_PASSWORD or "admin") | Rafi / (DEV_RAFI_PASSWORD or "Rafi123")');
}
