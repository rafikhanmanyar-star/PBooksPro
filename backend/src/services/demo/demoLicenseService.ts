import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import {
  DEMO_LICENSE_MODULES,
  DEMO_PUBLIC_TENANT_ID,
  getDemoMaxProjects,
  getDemoMaxTransactions,
  getDemoTrialDays,
  isDemoEnvironmentEnabled,
  isDemoPublicTenant,
} from '../../constants/demoEnvironment.js';
import type { LicenseEnforcementPayload } from '../billing/licenseEnforcementService.js';
import { computeCurrentUsage } from '../billing/subscriptionUsageService.js';
import { getBillingPlanByCode } from '../billing/billingPlanService.js';
import {
  getActiveSubscription,
  type SubscriptionRow,
} from '../billing/subscriptionService.js';
import { DemoEnvironmentRepository, newDemoId } from '../../modules/demo/repositories/DemoRepository.js';

const demoRepo = new DemoEnvironmentRepository();

function addDays(from: Date, days: number): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d;
}

function mapSub(row: pg.QueryResultRow): SubscriptionRow {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    plan_id: row.plan_id,
    status: row.status,
    billing_cycle: row.billing_cycle,
    start_date: row.start_date,
    renewal_date: row.renewal_date,
    trial_end_date: row.trial_end_date,
    canceled_at: row.canceled_at,
    cancel_at_period_end: row.cancel_at_period_end,
    paddle_customer_id: row.paddle_customer_id,
    paddle_subscription_id: row.paddle_subscription_id,
    pending_plan_id: row.pending_plan_id,
    past_due_at: row.past_due_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    plan_code: row.plan_code,
    plan_name: row.plan_name,
  };
}

async function getLatestSubscription(
  client: pg.PoolClient,
  tenantId: string
): Promise<SubscriptionRow | null> {
  const row = await demoRepo.getLatestSubscriptionWithPlan(client, tenantId);
  return row ? mapSub(row) : null;
}

export async function syncPublicDemoTrialSubscription(client: pg.PoolClient): Promise<void> {
  if (!isDemoEnvironmentEnabled()) return;

  const trialDays = getDemoTrialDays();
  const createdAt = await demoRepo.getTenantCreatedAt(client, DEMO_PUBLIC_TENANT_ID);
  if (!createdAt) return;

  const startDate = new Date(createdAt);
  const trialEnd = addDays(startDate, trialDays);
  const expired = trialEnd.getTime() < Date.now();
  const status = expired ? 'expired' : 'trialing';

  const existing = await getLatestSubscription(client, DEMO_PUBLIC_TENANT_ID);
  if (existing) {
    await demoRepo.updatePublicDemoTrial(client, {
      subscriptionId: existing.id,
      startDate: startDate.toISOString(),
      trialEnd: trialEnd.toISOString(),
      status,
    });
    return;
  }

  const trialPlan = await getBillingPlanByCode(client, 'trial');
  if (!trialPlan) return;

  await demoRepo.insertPublicDemoTrial(client, {
    id: newDemoId(),
    tenantId: DEMO_PUBLIC_TENANT_ID,
    planId: trialPlan.id,
    status,
    startDate: startDate.toISOString(),
    trialEnd: trialEnd.toISOString(),
  });
}

export async function isPublicDemoTrialExpired(client: pg.PoolClient): Promise<boolean> {
  if (!isDemoEnvironmentEnabled()) return true;
  await syncPublicDemoTrialSubscription(client);
  const sub = await getActiveSubscription(client, DEMO_PUBLIC_TENANT_ID);
  if (!sub?.trial_end_date) return true;
  return new Date(sub.trial_end_date).getTime() < Date.now();
}

export async function assertPublicDemoLoginAllowed(client: pg.PoolClient): Promise<void> {
  if (!isDemoEnvironmentEnabled()) {
    throw new DemoLoginBlockedError('Live demo is not available right now.');
  }
  await syncPublicDemoTrialSubscription(client);
  if (await isPublicDemoTrialExpired(client)) {
    throw new DemoLoginBlockedError(
      'The live demo period has ended. Start a free trial or contact us for access.'
    );
  }
}

export class DemoLoginBlockedError extends Error {
  readonly code = 'DEMO_TRIAL_EXPIRED';

  constructor(message: string) {
    super(message);
    this.name = 'DemoLoginBlockedError';
  }
}

export class DemoMutationLimitError extends Error {
  readonly code = 'DEMO_LIMIT_REACHED';

  constructor(message: string) {
    super(message);
    this.name = 'DemoMutationLimitError';
  }
}

export async function countTenantTransactions(
  client: pg.PoolClient,
  tenantId: string
): Promise<number> {
  return demoRepo.countTenantTransactions(client, tenantId);
}

export async function assertDemoCanCreateTransaction(
  client: pg.PoolClient,
  tenantId: string
): Promise<void> {
  if (!isDemoEnvironmentEnabled() || !isDemoPublicTenant(tenantId)) return;
  const max = getDemoMaxTransactions();
  const count = await countTenantTransactions(client, tenantId);
  if (count >= max) {
    throw new DemoMutationLimitError(
      `Live demo limit: up to ${max} transactions for exploration. Start a free trial for unlimited access.`
    );
  }
}

export async function assertDemoCanCreateProject(
  client: pg.PoolClient,
  tenantId: string
): Promise<void> {
  if (!isDemoEnvironmentEnabled() || !isDemoPublicTenant(tenantId)) return;
  const max = getDemoMaxProjects();
  const usage = await computeCurrentUsage(client, tenantId);
  if (usage.projectsCount >= max) {
    throw new DemoMutationLimitError(
      `Live demo limit: up to ${max} projects for exploration. Start a free trial to add more.`
    );
  }
}

export function applyPublicDemoLicenseProfile(
  payload: LicenseEnforcementPayload,
  usage: Awaited<ReturnType<typeof computeCurrentUsage>>,
  txCount: number
): LicenseEnforcementPayload {
  const maxProjects = getDemoMaxProjects();
  const maxTx = getDemoMaxTransactions();
  const remainingTx = Math.max(0, maxTx - txCount);

  const warnings = [...payload.warnings];
  warnings.unshift({
    code: 'demo_explore',
    severity: 'info',
    message:
      remainingTx > 0
        ? `Live demo — Rental, Project selling, and Construction are unlocked. Add up to ${remainingTx} more transaction${remainingTx === 1 ? '' : 's'} to try the ledger.`
        : 'Live demo — transaction limit reached. Start a free trial for full access.',
  });

  return {
    ...payload,
    allowed: payload.isValid && payload.tenantActive && !payload.isExpired,
    modules: [...DEMO_LICENSE_MODULES],
    licenseType: 'demo',
    blockReasons: payload.isExpired ? payload.blockReasons : [],
    usage: {
      current: usage,
      limits: {
        maxUsers: 20,
        maxProjects,
        maxStorageGb: 10,
      },
      withinLimits: !payload.isExpired,
      violations: [],
      usersPercent: 0,
      projectsPercent: Math.min(
        100,
        maxProjects > 0 ? Math.round((usage.projectsCount / maxProjects) * 100) : 0
      ),
    },
    warnings,
  };
}
