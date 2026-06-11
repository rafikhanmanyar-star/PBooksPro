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
import { syncPublicDemoTrialSubscription } from './demoLicenseService.js';
import { DemoEnvironmentRepository } from '../../modules/demo/repositories/DemoRepository.js';

export type DemoResetResult = {
  tenantId: string;
  resetAt: string;
  durationMs: number;
};

const demoRepo = new DemoEnvironmentRepository();

async function upsertDemoTenantAndUser(
  client: pg.PoolClient,
  tenantId: string,
  tenantName: string,
  password: string,
  userId: string
): Promise<void> {
  const companyName =
    tenantId === DEMO_PUBLIC_TENANT_ID ? 'Al Noor Properties' : tenantName;
  await demoRepo.upsertDemoTenant(client, tenantId, tenantName, companyName);

  const passwordHash = await bcrypt.hash(password, 10);
  await demoRepo.upsertDemoUser(client, {
    userId,
    tenantId,
    username: DEMO_DEFAULT_USERNAME,
    name: 'Demo User',
    passwordHash,
  });
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
    await syncPublicDemoTrialSubscription(client);
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
