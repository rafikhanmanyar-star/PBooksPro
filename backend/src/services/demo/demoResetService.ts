import type pg from 'pg';
import bcrypt from 'bcryptjs';
import { getPool, withTransaction } from '../../db/pool.js';
import { logger } from '../../utils/logger.js';
import {
  DEMO_DEFAULT_USER_ID,
  DEMO_DEFAULT_USERNAME,
  DEMO_MASTER_TENANT_ID,
  DEMO_MASTER_TENANT_NAME,
  DEMO_PUBLIC_TENANT_ID,
  DEMO_PUBLIC_TENANT_NAME,
  isDemoEnvironmentEnabled,
} from '../../constants/demoEnvironment.js';
import {
  ensureDemoMasterSeeded,
  resetDemoTenantFromTemplate,
} from './demoSeedService.js';
import { validatePassword } from '../../utils/passwordPolicy.js';

export type DemoResetResult = {
  tenantId: string;
  resetAt: string;
  durationMs: number;
};

async function upsertDemoTenantAndUser(
  client: pg.PoolClient,
  tenantId: string,
  tenantName: string,
  password: string,
  userId: string
): Promise<void> {
  const companyName =
    tenantId === DEMO_PUBLIC_TENANT_ID ? 'Al Noor Properties' : tenantName;
  await client.query(
    `INSERT INTO tenants (id, name, company_name) VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, company_name = EXCLUDED.company_name, updated_at = NOW()`,
    [tenantId, tenantName, companyName]
  );

  const passwordHash = await bcrypt.hash(password, 10);
  await client.query(
    `INSERT INTO users (id, tenant_id, username, name, role, password_hash, is_active)
     VALUES ($1, $2, $3, $4, 'Admin', $5, TRUE)
     ON CONFLICT (tenant_id, username) DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       name = EXCLUDED.name,
       role = EXCLUDED.role,
       is_active = TRUE,
       updated_at = NOW()`,
    [userId, tenantId, DEMO_DEFAULT_USERNAME, 'Demo User', passwordHash]
  );
}

export async function provisionDemoEnvironment(pool?: pg.Pool): Promise<void> {
  if (!isDemoEnvironmentEnabled()) return;

  const db = pool ?? getPool();
  const publicPassword = process.env.DEMO_USER_PASSWORD || 'Demo@2024!';
  const passwordError = validatePassword(publicPassword);
  if (passwordError && process.env.NODE_ENV === 'production') {
    throw new Error(`Demo user password rejected: ${passwordError}`);
  }

  await withTransaction(async (client) => {
    await upsertDemoTenantAndUser(
      client,
      DEMO_PUBLIC_TENANT_ID,
      DEMO_PUBLIC_TENANT_NAME,
      publicPassword,
      DEMO_DEFAULT_USER_ID
    );

    if (process.env.DEMO_SEED_MASTER === 'true') {
      await upsertDemoTenantAndUser(
        client,
        DEMO_MASTER_TENANT_ID,
        DEMO_MASTER_TENANT_NAME,
        process.env.DEMO_MASTER_PASSWORD || publicPassword,
        'user_demo_master'
      );
      await ensureDemoMasterSeeded(client);
    }

    await resetDemoTenantFromTemplate(client, DEMO_PUBLIC_TENANT_ID);
  });

  logger.info('Demo environment provisioned', {
    publicTenant: DEMO_PUBLIC_TENANT_ID,
    masterSeeded: process.env.DEMO_SEED_MASTER === 'true',
  });
}

export async function resetPublicDemoTenant(pool?: pg.Pool): Promise<DemoResetResult> {
  if (!isDemoEnvironmentEnabled()) {
    throw new Error('Demo environment is not enabled (DEMO_ENVIRONMENT_ENABLED=true)');
  }

  const started = Date.now();
  const db = pool ?? getPool();

  await withTransaction(async (client) => {
    await resetDemoTenantFromTemplate(client, DEMO_PUBLIC_TENANT_ID);
  });

  const result: DemoResetResult = {
    tenantId: DEMO_PUBLIC_TENANT_ID,
    resetAt: new Date().toISOString(),
    durationMs: Date.now() - started,
  };

  logger.info('Public demo tenant reset complete', result);
  return result;
}
