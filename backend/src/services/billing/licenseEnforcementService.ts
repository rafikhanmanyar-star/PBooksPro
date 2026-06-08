/**
 * Enterprise license validation, quotas, and enforcement helpers.
 */

import type pg from 'pg';
import { getBillingPlanById, isUnlimited } from './billingPlanService.js';
import {
  getActiveSubscription,
  planModules,
  type SubscriptionRow,
} from './subscriptionService.js';
import {
  computeCurrentUsage,
  evaluateUsageAgainstPlan,
  type UsageStatus,
} from './subscriptionUsageService.js';
import {
  getPastDueGraceDays,
  gracePeriodEndsAt,
  isWithinPastDueGrace,
} from './subscriptionLifecycleService.js';

export type EnforcedResource =
  | 'users'
  | 'projects'
  | 'invoices'
  | 'payroll_runs'
  | 'companies';

export type LicenseWarning = {
  code: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
};

export type LicenseEnforcementPayload = {
  allowed: boolean;
  isValid: boolean;
  daysRemaining: number;
  licenseType: string;
  licenseStatus: string;
  isExpired: boolean;
  expiryDate: string | null;
  tenantActive: boolean;
  paymentValid: boolean;
  modules: string[];
  warnings: LicenseWarning[];
  blockReasons: string[];
  gracePeriodDays?: number;
  gracePeriodEndsAt?: string | null;
  inGracePeriod?: boolean;
  subscription?: {
    id: string;
    planCode: string;
    planName: string;
    billingCycle: string;
    status: string;
    renewalDate: string | null;
    trialEndDate: string | null;
    cancelAtPeriodEnd: boolean;
  };
  usage?: {
    current: UsageStatus['current'];
    limits: UsageStatus['limits'];
    withinLimits: boolean;
    violations: string[];
    usersPercent: number;
    projectsPercent: number;
  };
};

export class LicenseEnforcementError extends Error {
  code: string;
  statusCode: number;

  constructor(message: string, code = 'SUBSCRIPTION_REQUIRED', statusCode = 402) {
    super(message);
    this.name = 'LicenseEnforcementError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function daysUntil(iso: string | null | undefined): number {
  if (!iso) return 0;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

function isSubscriptionExpired(sub: SubscriptionRow): boolean {
  if (sub.status === 'expired' || sub.status === 'canceled') return true;
  if (sub.status === 'trialing' && sub.trial_end_date) {
    return new Date(sub.trial_end_date).getTime() < Date.now();
  }
  if (sub.status === 'active' && sub.cancel_at_period_end && sub.renewal_date) {
    return new Date(sub.renewal_date).getTime() < Date.now();
  }
  return false;
}

function isPaymentValid(sub: SubscriptionRow): boolean {
  if (sub.status === 'past_due') return isWithinPastDueGrace(sub.past_due_at);
  if (sub.status === 'paused' || sub.status === 'pending') return false;
  return true;
}

export async function assertModuleEnabled(
  client: pg.PoolClient,
  tenantId: string,
  moduleKey: string
): Promise<void> {
  const status = await requireActiveSubscription(client, tenantId);
  if (status.modules.includes('all') || status.modules.includes(moduleKey)) return;
  throw new LicenseEnforcementError(
    `Your plan does not include the "${moduleKey}" module. Upgrade to unlock this feature.`,
    'MODULE_NOT_INCLUDED',
    403
  );
}

function usagePercent(current: number, max: number): number {
  if (isUnlimited(max) || max <= 0) return 0;
  return Math.min(100, Math.round((current / max) * 100));
}

async function isTenantActive(client: pg.PoolClient, tenantId: string): Promise<boolean> {
  try {
    const { rows } = await client.query<{ is_active: boolean }>(
      `SELECT is_active FROM tenants WHERE id = $1`,
      [tenantId]
    );
    if (rows.length === 0) return false;
    return rows[0].is_active !== false;
  } catch {
    return true;
  }
}

function buildWarnings(
  sub: SubscriptionRow | null,
  daysRemaining: number,
  usage: UsageStatus | null,
  tenantActive: boolean,
  paymentValid: boolean,
  expired: boolean
): LicenseWarning[] {
  const warnings: LicenseWarning[] = [];

  if (!tenantActive) {
    warnings.push({
      code: 'tenant_inactive',
      severity: 'critical',
      message: 'Your organization account is suspended. Contact support.',
    });
  }

  if (!sub) {
    warnings.push({
      code: 'no_subscription',
      severity: 'critical',
      message: 'No active subscription. Choose a plan to continue.',
    });
    return warnings;
  }

  if (expired) {
    warnings.push({
      code: 'subscription_expired',
      severity: 'critical',
      message:
        sub.status === 'trialing'
          ? 'Your free trial has ended. Upgrade to keep using PBooksPro.'
          : 'Your subscription has expired. Renew to restore access.',
    });
  }

  if (!paymentValid) {
    warnings.push({
      code: 'payment_past_due',
      severity: 'critical',
      message: 'Payment is past due. Update billing to avoid service interruption.',
    });
  } else if (sub.status === 'past_due' && sub.past_due_at) {
    const endsAt = gracePeriodEndsAt(sub.past_due_at);
    const daysLeft = endsAt
      ? Math.max(0, Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86_400_000))
      : 0;
    warnings.push({
      code: 'payment_grace_period',
      severity: daysLeft <= 2 ? 'warning' : 'info',
      message: `Payment failed — grace period ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}. Update billing to avoid lockout.`,
    });
  }

  if (sub.cancel_at_period_end && !expired) {
    warnings.push({
      code: 'cancel_scheduled',
      severity: 'warning',
      message: 'Cancellation is scheduled at the end of the current billing period.',
    });
  }

  if (daysRemaining <= 7 && daysRemaining > 0 && sub.status === 'trialing') {
    warnings.push({
      code: 'trial_ending',
      severity: 'warning',
      message: `Trial ends in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}.`,
    });
  } else if (daysRemaining <= 14 && daysRemaining > 0 && sub.status === 'active') {
    warnings.push({
      code: 'renewal_soon',
      severity: 'info',
      message: `Subscription renews in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}.`,
    });
  }

  if (usage && !usage.withinLimits) {
    for (const v of usage.violations) {
      warnings.push({ code: 'quota_exceeded', severity: 'critical', message: v });
    }
  } else if (usage) {
    const userPct = usagePercent(usage.current.usersCount, usage.limits.maxUsers);
    const projPct = usagePercent(usage.current.projectsCount, usage.limits.maxProjects);
    if (userPct >= 80) {
      warnings.push({
        code: 'users_near_limit',
        severity: userPct >= 95 ? 'warning' : 'info',
        message: `Users at ${userPct}% of plan limit (${usage.current.usersCount}/${usage.limits.maxUsers}).`,
      });
    }
    if (projPct >= 80) {
      warnings.push({
        code: 'projects_near_limit',
        severity: projPct >= 95 ? 'warning' : 'info',
        message: `Projects at ${projPct}% of plan limit (${usage.current.projectsCount}/${usage.limits.maxProjects}).`,
      });
    }
  }

  return warnings;
}

export async function validateTenantLicense(
  client: pg.PoolClient,
  tenantId: string
): Promise<LicenseEnforcementPayload> {
  if (process.env.DEMO_ENVIRONMENT_ENABLED === 'true' && tenantId === 'pbooks-demo') {
    const farFuture = new Date();
    farFuture.setFullYear(farFuture.getFullYear() + 10);
    return {
      allowed: true,
      isValid: true,
      daysRemaining: 3650,
      licenseType: 'demo',
      licenseStatus: 'active',
      isExpired: false,
      expiryDate: farFuture.toISOString(),
      tenantActive: true,
      paymentValid: true,
      modules: ['all'],
      warnings: [],
      blockReasons: [],
    };
  }

  const tenantActive = await isTenantActive(client, tenantId);
  const sub = await getActiveSubscription(client, tenantId);

  if (!sub) {
    const warnings = buildWarnings(null, 0, null, tenantActive, false, true);
    return {
      allowed: false,
      isValid: false,
      daysRemaining: 0,
      licenseType: 'none',
      licenseStatus: 'expired',
      isExpired: true,
      expiryDate: null,
      tenantActive,
      paymentValid: false,
      modules: [],
      warnings,
      blockReasons: ['No active subscription.'],
    };
  }

  const plan = await getBillingPlanById(client, sub.plan_id);
  const modules = plan ? planModules(plan) : [];
  const expired = isSubscriptionExpired(sub);
  const paymentValid = isPaymentValid(sub);
  const expiryIso = sub.status === 'trialing' ? sub.trial_end_date : sub.renewal_date;
  const daysRemaining = daysUntil(expiryIso);

  let usageStatus: UsageStatus | null = null;
  if (plan) {
    const usage = await computeCurrentUsage(client, tenantId);
    usageStatus = evaluateUsageAgainstPlan(usage, plan);
  }

  const isValid = tenantActive && !expired && paymentValid && sub.status !== 'canceled';
  const withinLimits = usageStatus?.withinLimits !== false;
  const allowed = isValid && withinLimits;

  const blockReasons: string[] = [];
  if (!tenantActive) blockReasons.push('Organization account is inactive.');
  if (expired) blockReasons.push('Subscription or trial has expired.');
  if (!paymentValid) blockReasons.push('Payment status is not valid.');
  if (usageStatus && !usageStatus.withinLimits) {
    blockReasons.push(...usageStatus.violations);
  }

  const warnings = buildWarnings(sub, daysRemaining, usageStatus, tenantActive, paymentValid, expired);
  const inGracePeriod = sub.status === 'past_due' && isWithinPastDueGrace(sub.past_due_at);

  return {
    allowed,
    isValid,
    daysRemaining,
    gracePeriodDays: getPastDueGraceDays(),
    gracePeriodEndsAt: sub.status === 'past_due' ? gracePeriodEndsAt(sub.past_due_at) : null,
    inGracePeriod,
    licenseType: sub.status === 'trialing' ? 'trial' : sub.billing_cycle === 'annual' ? 'yearly' : 'monthly',
    licenseStatus: expired ? 'expired' : sub.status,
    isExpired: expired || !isValid,
    expiryDate: expiryIso,
    tenantActive,
    paymentValid,
    modules,
    warnings,
    blockReasons,
    subscription: {
      id: sub.id,
      planCode: sub.plan_code ?? plan?.plan_code ?? '',
      planName: sub.plan_name ?? plan?.name ?? '',
      billingCycle: sub.billing_cycle,
      status: sub.status,
      renewalDate: sub.renewal_date,
      trialEndDate: sub.trial_end_date,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    },
    usage: usageStatus
      ? {
          current: usageStatus.current,
          limits: usageStatus.limits,
          withinLimits: usageStatus.withinLimits,
          violations: usageStatus.violations,
          usersPercent: usagePercent(usageStatus.current.usersCount, usageStatus.limits.maxUsers),
          projectsPercent: usagePercent(
            usageStatus.current.projectsCount,
            usageStatus.limits.maxProjects
          ),
        }
      : undefined,
  };
}

export async function requireActiveSubscription(
  client: pg.PoolClient,
  tenantId: string
): Promise<LicenseEnforcementPayload> {
  const status = await validateTenantLicense(client, tenantId);
  if (!status.isValid || status.isExpired) {
    throw new LicenseEnforcementError(
      status.blockReasons[0] ?? 'Subscription is expired or inactive.',
      'SUBSCRIPTION_REQUIRED',
      402
    );
  }
  if (!status.tenantActive) {
    throw new LicenseEnforcementError('Organization account is inactive.', 'TENANT_INACTIVE', 403);
  }
  if (!status.paymentValid) {
    throw new LicenseEnforcementError('Payment is past due. Update billing to continue.', 'PAYMENT_REQUIRED', 402);
  }
  return status;
}

export async function assertCanCreateResource(
  client: pg.PoolClient,
  tenantId: string,
  resource: EnforcedResource
): Promise<void> {
  const status = await requireActiveSubscription(client, tenantId);
  const usage = status.usage;
  if (!usage) return;

  if (resource === 'users') {
    if (!isUnlimited(usage.limits.maxUsers) && usage.current.usersCount >= usage.limits.maxUsers) {
      throw new LicenseEnforcementError(
        `User limit reached (${usage.limits.maxUsers}). Upgrade your plan to add more users.`,
        'USER_LIMIT_EXCEEDED',
        403
      );
    }
    return;
  }

  if (resource === 'projects') {
    if (!isUnlimited(usage.limits.maxProjects) && usage.current.projectsCount >= usage.limits.maxProjects) {
      throw new LicenseEnforcementError(
        `Project limit reached (${usage.limits.maxProjects}). Upgrade your plan to add more projects.`,
        'PROJECT_LIMIT_EXCEEDED',
        403
      );
    }
    return;
  }

  if (!usage.withinLimits) {
    throw new LicenseEnforcementError(
      status.blockReasons[0] ?? 'Plan limits exceeded. Upgrade to continue.',
      'QUOTA_EXCEEDED',
      403
    );
  }
}

/** @deprecated use validateTenantLicense */
export async function getLicenseStatusForTenant(
  client: pg.PoolClient,
  tenantId: string
) {
  const v = await validateTenantLicense(client, tenantId);
  return {
    isValid: v.isValid,
    daysRemaining: v.daysRemaining,
    licenseType: v.licenseType,
    licenseStatus: v.licenseStatus,
    isExpired: v.isExpired,
    expiryDate: v.expiryDate,
    modules: v.modules,
    subscription: v.subscription,
    usage: v.usage
      ? { withinLimits: v.usage.withinLimits, violations: v.usage.violations }
      : undefined,
    tenantActive: v.tenantActive,
    paymentValid: v.paymentValid,
    warnings: v.warnings,
    allowed: v.allowed,
  };
}
