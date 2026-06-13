import type pg from 'pg';
import bcrypt from 'bcryptjs';
import { getPool, withTransaction } from '../../db/pool.js';
import { logger } from '../../utils/logger.js';
import {
  DEMO_DEFAULT_USERNAME,
  DEMO_PRESENTATION_EMAIL,
  DEMO_PRESENTATION_TENANT_ID,
  DEMO_PRESENTATION_TENANT_NAME,
  DEMO_PRESENTATION_USER_ID,
  configuredPresentationTenantId,
} from '../../constants/demoEnvironment.js';
import { resetDemoTenantFromTemplate } from './demoSeedService.js';
import { validatePassword } from '../../utils/passwordPolicy.js';
import { DemoEnvironmentRepository } from '../../modules/demo/repositories/DemoRepository.js';

const demoRepo = new DemoEnvironmentRepository();

/** Presentation org trial — long-lived; not the 7-day public sandbox window. */
const PRESENTATION_TRIAL_YEARS = 10;

function presentationPassword(): string {
  return (
    process.env.DEMO_PRESENTATION_PASSWORD?.trim() ||
    process.env.DEMO_USER_PASSWORD?.trim() ||
    'Demo@2024!'
  );
}

function presentationTrialEndIso(): string {
  const end = new Date();
  end.setFullYear(end.getFullYear() + PRESENTATION_TRIAL_YEARS);
  return end.toISOString();
}

/** Resolve cloud/local presentation tenant (e.g. demo-company-7dcf84 on production). */
export async function resolvePresentationTenantId(client: pg.PoolClient): Promise<string> {
  const fromEnv = configuredPresentationTenantId();
  if (fromEnv) return fromEnv;

  const byEmail = await client.query<{ tenant_id: string }>(
    `SELECT tenant_id FROM users
     WHERE lower(trim(email)) = lower(trim($1)) AND is_active = TRUE
     ORDER BY updated_at DESC
     LIMIT 1`,
    [DEMO_PRESENTATION_EMAIL]
  );
  if (byEmail.rows[0]?.tenant_id) return byEmail.rows[0].tenant_id;

  const byPrefix = await client.query<{ id: string }>(
    `SELECT id FROM tenants
     WHERE id LIKE 'demo-company%' AND status = 'ACTIVE'
     ORDER BY created_at
     LIMIT 1`
  );
  if (byPrefix.rows[0]?.id) return byPrefix.rows[0].id;

  return DEMO_PRESENTATION_TENANT_ID;
}

async function upsertPresentationTenantAndUser(
  client: pg.PoolClient,
  tenantId: string
): Promise<{ tenantId: string; username: string }> {
  const password = presentationPassword();
  const passwordError = validatePassword(password);
  if (passwordError && process.env.NODE_ENV === 'production') {
    throw new Error(`Presentation demo password rejected: ${passwordError}`);
  }

  const tenantExists = await client.query<{ id: string }>(
    `SELECT id FROM tenants WHERE id = $1`,
    [tenantId]
  );
  if (!tenantExists.rows.length) {
    await demoRepo.upsertDemoTenant(
      client,
      tenantId,
      DEMO_PRESENTATION_TENANT_NAME,
      'Al Noor Properties'
    );
  }

  await client.query(
    `UPDATE tenants
     SET company_name = $2, status = 'ACTIVE', is_active = TRUE, email = $3, updated_at = NOW()
     WHERE id = $1`,
    [tenantId, 'Al Noor Properties', DEMO_PRESENTATION_EMAIL]
  );

  const passwordHash = await bcrypt.hash(password, 10);
  const existingUser = await client.query<{ id: string; username: string; tenant_id: string }>(
    `SELECT id, username, tenant_id FROM users
     WHERE lower(trim(email)) = lower(trim($1))
     LIMIT 1`,
    [DEMO_PRESENTATION_EMAIL]
  );

  if (existingUser.rows[0]) {
    const row = existingUser.rows[0];
    await client.query(
      `UPDATE users SET password_hash = $2, is_active = TRUE, updated_at = NOW() WHERE id = $1`,
      [row.id, passwordHash]
    );
    return { tenantId: row.tenant_id, username: row.username };
  }

  await demoRepo.upsertDemoUser(client, {
    userId: DEMO_PRESENTATION_USER_ID,
    tenantId,
    username: DEMO_DEFAULT_USERNAME,
    name: 'Demo Presenter',
    passwordHash,
    email: DEMO_PRESENTATION_EMAIL,
  });

  return { tenantId, username: DEMO_DEFAULT_USERNAME };
}

async function ensurePresentationSubscription(
  client: pg.PoolClient,
  tenantId: string
): Promise<void> {
  await demoRepo.ensurePresentationDemoSubscription(
    client,
    tenantId,
    presentationTrialEndIso()
  );
}

export type PresentationDemoSeedResult = {
  tenantId: string;
  email: string;
  username: string;
  reseeded: boolean;
  durationMs: number;
};

/**
 * Create/update the in-person presentation org and apply the Al Noor sample dataset.
 * Does not run on login/logout and is never included in the public sandbox daily reset.
 */
export async function seedPresentationDemoOrg(options?: {
  reseed?: boolean;
  pool?: pg.Pool;
}): Promise<PresentationDemoSeedResult> {
  const started = Date.now();
  const reseed = options?.reseed !== false;
  const db = options?.pool ?? getPool();

  let resolvedTenantId: string = DEMO_PRESENTATION_TENANT_ID;
  let loginUsername = DEMO_DEFAULT_USERNAME;

  await withTransaction(async (client) => {
    resolvedTenantId = await resolvePresentationTenantId(client);
    const login = await upsertPresentationTenantAndUser(client, resolvedTenantId);
    loginUsername = login.username;

    const existing = await client.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM contacts WHERE tenant_id = $1 AND deleted_at IS NULL`,
      [resolvedTenantId]
    );
    const hasData = (existing.rows[0]?.c ?? 0) > 0;

    if (reseed || !hasData) {
      await resetDemoTenantFromTemplate(client, resolvedTenantId);
      await client.query(
        `UPDATE tenants SET name = $2, company_name = $3, updated_at = NOW() WHERE id = $1`,
        [resolvedTenantId, DEMO_PRESENTATION_TENANT_NAME, 'Al Noor Properties']
      );
    }

    await ensurePresentationSubscription(client, resolvedTenantId);
  });

  const result: PresentationDemoSeedResult = {
    tenantId: resolvedTenantId,
    email: DEMO_PRESENTATION_EMAIL,
    username: loginUsername,
    reseeded: reseed,
    durationMs: Date.now() - started,
  };

  logger.info('Presentation demo org seeded', result);
  return result;
}
