import bcrypt from 'bcryptjs';
import { getPool } from './db/pool.js';
import { bootstrapTenantChart } from './services/tenantBootstrap.js';
import { startTrialSubscription } from './services/billing/subscriptionService.js';
import { logger } from './utils/logger.js';
import { validatePassword } from './utils/passwordPolicy.js';
import { isDemoEnvironmentEnabled } from './constants/demoEnvironment.js';
import { provisionDemoEnvironment } from './services/demo/demoResetService.js';

export const STAGING_TENANT_ID = 'test-company';
export const STAGING_TENANT_NAME = 'test company';
/** Default staging login when STAGING_ADMIN_PASSWORD is unset (min 8 chars per password policy). */
export const STAGING_DEFAULT_ADMIN_PASSWORD = 'Rafi1234';

/** Company email pattern for staging orgs: slugified company name @pbookspro.com */
export function stagingCompanyEmail(companyName: string, tenantId: string): string {
  const slug = (companyName || tenantId).toLowerCase().replace(/[^a-z0-9]+/g, '') || tenantId.replace(/[^a-z0-9]+/g, '');
  return `${slug}@pbookspro.com`;
}

/**
 * Idempotent staging defaults: organization "test company", admin Rafi / Rafi1234.
 * Safe to run on every deploy; upserts tenant, user password, and system chart.
 */
export async function seedStagingDefaults(): Promise<void> {
  const pool = getPool();
  const tenantId = (process.env.STAGING_TENANT_ID || STAGING_TENANT_ID).trim();
  const tenantName = (process.env.STAGING_TENANT_NAME || STAGING_TENANT_NAME).trim();
  const username = (process.env.STAGING_ADMIN_USERNAME || 'Rafi').trim();
  const password = process.env.STAGING_ADMIN_PASSWORD || STAGING_DEFAULT_ADMIN_PASSWORD;
  if (process.env.NODE_ENV === 'production' || process.env.STAGING_ADMIN_PASSWORD) {
    const passwordError = validatePassword(password);
    if (passwordError) {
      throw new Error(`Staging admin password rejected: ${passwordError}`);
    }
  }
  const userId = (process.env.STAGING_ADMIN_USER_ID || 'user_rafi_test_company').trim();
  const companyEmail = stagingCompanyEmail(tenantName, tenantId);

  await pool.query(
    `INSERT INTO tenants (id, name, email, is_active) VALUES ($1, $2, $3, TRUE)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, is_active = TRUE, updated_at = NOW()`,
    [tenantId, tenantName, companyEmail]
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

  const client = await pool.connect();
  try {
    await startTrialSubscription(client, tenantId);
  } catch (e) {
    logger.warn(
      `Staging trial subscription not created for ${tenantId} (billing plans may be missing): ${
        e instanceof Error ? e.message : String(e)
      }`
    );
  } finally {
    client.release();
  }

  logger.info(`Staging seed complete — org "${tenantName}" (${tenantId}) | user "${username}"`);
  if (process.env.NODE_ENV !== 'production') {
    logger.debug('Staging admin credentials applied from environment');
  }
}

/** Runs seedStagingDefaults when SEED_STAGING=1 (requires ALLOW_STAGING_SEED_IN_PRODUCTION=true in production). */
export async function seedStagingIfEnabled(): Promise<void> {
  if (process.env.SEED_STAGING !== '1') return;
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_STAGING_SEED_IN_PRODUCTION !== 'true') {
    logger.warn('Refusing staging seed in production (set ALLOW_STAGING_SEED_IN_PRODUCTION=true to override)');
    return;
  }
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
    `INSERT INTO tenants (id, name, email) VALUES ('default', 'Default tenant', $1)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, updated_at = NOW()`,
    [stagingCompanyEmail('Default tenant', 'default')]
  );

  const userCount = await pool.query(`SELECT 1 FROM users WHERE tenant_id = 'default' AND username = 'admin' LIMIT 1`);
  if (userCount.rows.length === 0) {
    await pool.query(
      `INSERT INTO users (id, tenant_id, username, name, role, password_hash, is_active)
       VALUES ('user_admin_default', 'default', 'admin', 'Administrator', 'Admin', $1, TRUE)`,
      [passwordHash]
    );
  }

  const rafiPassword = process.env.DEV_RAFI_PASSWORD ?? STAGING_DEFAULT_ADMIN_PASSWORD;
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

  logger.info(
    `Dev seed complete — tenant=default | admin / (DEV_ADMIN_PASSWORD or "admin") | Rafi / (DEV_RAFI_PASSWORD or "${STAGING_DEFAULT_ADMIN_PASSWORD}")`
  );
}

/** Public demo sandbox + optional internal master template. */
export async function seedDemoIfEnabled(): Promise<void> {
  if (!isDemoEnvironmentEnabled()) return;
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED_IN_PRODUCTION !== 'true') {
    logger.warn('Refusing demo seed in production (set ALLOW_DEMO_SEED_IN_PRODUCTION=true to override)');
    return;
  }
  await provisionDemoEnvironment();
}
