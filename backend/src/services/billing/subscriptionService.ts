/**
 * Core subscription lifecycle: trial, upgrade, downgrade, cancel, reactivate.
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import {
  getBillingPlanByCode,
  getBillingPlanById,
  planModules,
  type BillingPlanRow,
} from './billingPlanService.js';
import { logSubscriptionEvent } from './subscriptionEventService.js';
import { createInvoice } from './subscriptionInvoiceService.js';
import { SubscriptionRepository } from '../../modules/billing/repositories/SubscriptionRepository.js';

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'paused'
  | 'expired'
  | 'pending';

export type BillingCycle = 'trial' | 'monthly' | 'annual';

export type SubscriptionRow = {
  id: string;
  tenant_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  billing_cycle: BillingCycle;
  start_date: string;
  renewal_date: string | null;
  trial_end_date: string | null;
  canceled_at: string | null;
  cancel_at_period_end: boolean;
  paddle_customer_id: string | null;
  paddle_subscription_id: string | null;
  pending_plan_id: string | null;
  past_due_at: string | null;
  created_at: string;
  updated_at: string;
  plan_code?: string;
  plan_name?: string;
};

const subRepo = new SubscriptionRepository();

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

function addDays(from: Date, days: number): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d;
}

function addMonths(from: Date, months: number): Date {
  const d = new Date(from);
  d.setMonth(d.getMonth() + months);
  return d;
}

function trialDaysFromPlan(plan: BillingPlanRow): number {
  const raw = plan.features_json.trial_days;
  return typeof raw === 'number' && raw > 0 ? raw : 30;
}

export async function getActiveSubscription(
  client: pg.PoolClient,
  tenantId: string
): Promise<SubscriptionRow | null> {
  const row = await subRepo.getActiveWithPlan(client, tenantId);
  return row ? mapSub(row) : null;
}

export async function getSubscriptionById(
  client: pg.PoolClient,
  subscriptionId: string
): Promise<SubscriptionRow | null> {
  const row = await subRepo.getByIdWithPlan(client, subscriptionId);
  return row ? mapSub(row) : null;
}

export async function getSubscriptionByPaddleId(
  client: pg.PoolClient,
  paddleSubscriptionId: string
): Promise<SubscriptionRow | null> {
  const row = await subRepo.getByPaddleIdWithPlan(client, paddleSubscriptionId);
  return row ? mapSub(row) : null;
}

export async function extendSubscriptionTrialByMonths(
  client: pg.PoolClient,
  tenantId: string,
  months: number
): Promise<void> {
  if (months <= 0) return;
  const sub = await getActiveSubscription(client, tenantId);
  if (!sub) return;

  const base = sub.trial_end_date ? new Date(sub.trial_end_date) : new Date();
  const extended = addMonths(base, months);

  await subRepo.extendTrial(client, sub.id, extended.toISOString());

  await logSubscriptionEvent(client, {
    tenantId,
    eventType: 'referral_trial_extended',
    payload: { subscriptionId: sub.id, months, trialEnd: extended.toISOString() },
  });
}

export async function startTrialSubscription(
  client: pg.PoolClient,
  tenantId: string
): Promise<SubscriptionRow> {
  const existing = await getActiveSubscription(client, tenantId);
  if (existing) return existing;

  const trialPlan = await getBillingPlanByCode(client, 'trial');
  if (!trialPlan) {
    throw new Error('Trial billing plan is not configured.');
  }

  const id = randomUUID();
  const now = new Date();
  const trialDays = trialDaysFromPlan(trialPlan);
  const trialEnd = addDays(now, trialDays);

  await subRepo.insertTrial(client, {
    id,
    tenantId,
    planId: trialPlan.id,
    startDate: now.toISOString(),
    trialEndDate: trialEnd.toISOString(),
  });

  await logSubscriptionEvent(client, {
    tenantId,
    eventType: 'trial_started',
    payload: { subscriptionId: id, trialDays, trialEnd: trialEnd.toISOString() },
  });

  const sub = await getSubscriptionById(client, id);
  if (!sub) throw new Error('Failed to create trial subscription.');
  return sub;
}

function computeRenewalDate(from: Date, cycle: BillingCycle): Date {
  if (cycle === 'annual') return addMonths(from, 12);
  return addMonths(from, 1);
}

export async function activatePaidSubscription(
  client: pg.PoolClient,
  input: {
    tenantId: string;
    planId: string;
    billingCycle: 'monthly' | 'annual';
    paddleCustomerId?: string | null;
    paddleSubscriptionId?: string | null;
    amount: number;
    currency?: string;
    paddleTransactionId?: string;
  }
): Promise<SubscriptionRow> {
  const plan = await getBillingPlanById(client, input.planId);
  if (!plan) throw new Error('Billing plan not found.');

  const existing = await getActiveSubscription(client, input.tenantId);
  const now = new Date();
  const renewal = computeRenewalDate(now, input.billingCycle);

  let subscriptionId: string;

  if (existing) {
    subscriptionId = existing.id;
    await subRepo.updateActivated(client, subscriptionId, {
      planId: input.planId,
      billingCycle: input.billingCycle,
      renewalDate: renewal.toISOString(),
      paddleCustomerId: input.paddleCustomerId ?? null,
      paddleSubscriptionId: input.paddleSubscriptionId ?? null,
    });
  } else {
    subscriptionId = randomUUID();
    await subRepo.insertActivated(client, {
      id: subscriptionId,
      tenantId: input.tenantId,
      planId: input.planId,
      billingCycle: input.billingCycle,
      startDate: now.toISOString(),
      renewalDate: renewal.toISOString(),
      paddleCustomerId: input.paddleCustomerId ?? null,
      paddleSubscriptionId: input.paddleSubscriptionId ?? null,
    });
  }

  const invoice = await createInvoice(client, {
    tenantId: input.tenantId,
    subscriptionId,
    amount: input.amount,
    currency: input.currency ?? 'USD',
    status: 'paid',
    paddleTransactionId: input.paddleTransactionId ?? null,
    paidDate: now.toISOString(),
    metadata: { planCode: plan.plan_code, billingCycle: input.billingCycle },
  });

  await logSubscriptionEvent(client, {
    tenantId: input.tenantId,
    eventType: 'subscription_activated',
    eventSource: input.paddleTransactionId ? 'paddle' : 'system',
    payload: {
      subscriptionId,
      planCode: plan.plan_code,
      billingCycle: input.billingCycle,
      invoiceId: invoice.id,
    },
  });

  const sub = await getSubscriptionById(client, subscriptionId);
  if (!sub) throw new Error('Subscription activation failed.');

  try {
    const { processReferralConversion } = await import('../referrals/referralTrackingService.js');
    await processReferralConversion(client, input.tenantId, { paidConversion: true });
  } catch (referralErr) {
    console.error('[referral] conversion processing failed:', referralErr);
  }
  return sub;
}

export async function upgradeSubscription(
  client: pg.PoolClient,
  tenantId: string,
  newPlanCode: string
): Promise<SubscriptionRow> {
  const sub = await getActiveSubscription(client, tenantId);
  if (!sub) throw new Error('No active subscription to upgrade.');

  const newPlan = await getBillingPlanByCode(client, newPlanCode);
  if (!newPlan) throw new Error(`Plan "${newPlanCode}" not found.`);
  if (newPlan.plan_code === 'trial') {
    throw new Error('Cannot upgrade to trial plan.');
  }

  const currentPlan = await getBillingPlanById(client, sub.plan_id);
  if (!currentPlan) throw new Error('Current plan not found.');

  const currentPrice =
    sub.billing_cycle === 'annual'
      ? Number(currentPlan.annual_price)
      : Number(currentPlan.monthly_price);
  const newPrice =
    sub.billing_cycle === 'annual'
      ? Number(newPlan.annual_price)
      : Number(newPlan.monthly_price);

  if (newPrice <= currentPrice && newPlan.id === currentPlan.id) {
    throw new Error('Select a higher-tier plan to upgrade.');
  }

  await subRepo.updatePlanId(client, sub.id, newPlan.id);

  await logSubscriptionEvent(client, {
    tenantId,
    eventType: 'plan_upgraded',
    payload: {
      subscriptionId: sub.id,
      fromPlan: currentPlan.plan_code,
      toPlan: newPlan.plan_code,
    },
  });

  const updated = await getSubscriptionById(client, sub.id);
  if (!updated) throw new Error('Upgrade failed.');
  return updated;
}

export async function downgradeSubscription(
  client: pg.PoolClient,
  tenantId: string,
  newPlanCode: string,
  atPeriodEnd = true
): Promise<SubscriptionRow> {
  const sub = await getActiveSubscription(client, tenantId);
  if (!sub) throw new Error('No active subscription to downgrade.');

  const newPlan = await getBillingPlanByCode(client, newPlanCode);
  if (!newPlan) throw new Error(`Plan "${newPlanCode}" not found.`);

  const currentPlan = await getBillingPlanById(client, sub.plan_id);
  if (!currentPlan) throw new Error('Current plan not found.');

  if (newPlan.id === currentPlan.id) {
    throw new Error('Already on this plan.');
  }

  if (atPeriodEnd) {
    await subRepo.setPendingPlan(client, sub.id, newPlan.id);
  } else {
    await subRepo.updatePlanId(client, sub.id, newPlan.id);
  }

  await logSubscriptionEvent(client, {
    tenantId,
    eventType: 'plan_downgrade_scheduled',
    payload: {
      subscriptionId: sub.id,
      fromPlan: currentPlan.plan_code,
      toPlan: newPlan.plan_code,
      atPeriodEnd,
    },
  });

  const updated = await getSubscriptionById(client, sub.id);
  if (!updated) throw new Error('Downgrade failed.');
  return updated;
}

export async function cancelSubscription(
  client: pg.PoolClient,
  tenantId: string,
  atPeriodEnd = true
): Promise<SubscriptionRow> {
  const sub = await getActiveSubscription(client, tenantId);
  if (!sub) throw new Error('No active subscription to cancel.');

  if (atPeriodEnd) {
    await subRepo.setCancelAtPeriodEnd(client, sub.id);
  } else {
    await subRepo.cancelImmediately(client, sub.id);
  }

  await logSubscriptionEvent(client, {
    tenantId,
    eventType: atPeriodEnd ? 'cancel_scheduled' : 'subscription_canceled',
    payload: { subscriptionId: sub.id, atPeriodEnd },
  });

  const updated = await getSubscriptionById(client, sub.id);
  if (!updated) throw new Error('Cancel failed.');
  return updated;
}

export async function reactivateSubscription(
  client: pg.PoolClient,
  tenantId: string
): Promise<SubscriptionRow> {
  const row = await subRepo.getLatestWithPlan(client, tenantId);
  if (!row) throw new Error('No subscription found.');

  const sub = mapSub(row);
  if (sub.status === 'active' || sub.status === 'trialing') {
    if (sub.cancel_at_period_end) {
      await subRepo.clearCancelAtPeriodEnd(client, sub.id);
    } else {
      return sub;
    }
  } else if (sub.status === 'canceled' || sub.status === 'expired') {
    const renewal = computeRenewalDate(
      new Date(),
      sub.billing_cycle === 'trial' ? 'monthly' : sub.billing_cycle
    );
    await subRepo.reactivateFromCanceled(client, sub.id, renewal.toISOString());
  } else {
    throw new Error(`Cannot reactivate subscription in status "${sub.status}".`);
  }

  await logSubscriptionEvent(client, {
    tenantId,
    eventType: 'subscription_reactivated',
    payload: { subscriptionId: sub.id },
  });

  const updated = await getSubscriptionById(client, sub.id);
  if (!updated) throw new Error('Reactivate failed.');
  return updated;
}

export async function getLatestSubscription(
  client: pg.PoolClient,
  tenantId: string
): Promise<SubscriptionRow | null> {
  const row = await subRepo.getLatestWithPlan(client, tenantId);
  return row ? mapSub(row) : null;
}

export async function syncManualLicenseToSubscription(
  client: pg.PoolClient,
  tenantId: string,
  licenseType: 'monthly' | 'yearly',
  expiryDate: Date
): Promise<SubscriptionRow> {
  const billingCycle = licenseType === 'yearly' ? 'annual' : 'monthly';
  const plan = await getBillingPlanByCode(client, 'professional');
  if (!plan) {
    throw new Error('Professional billing plan is not configured.');
  }

  const renewalIso = expiryDate.toISOString();
  const now = new Date();
  const existing = await getLatestSubscription(client, tenantId);

  let subscriptionId: string;

  if (existing) {
    subscriptionId = existing.id;
    await subRepo.syncManualLicenseUpdate(client, subscriptionId, {
      planId: plan.id,
      billingCycle,
      renewalDate: renewalIso,
    });
  } else {
    subscriptionId = randomUUID();
    await subRepo.insertManualLicense(client, {
      id: subscriptionId,
      tenantId,
      planId: plan.id,
      billingCycle,
      startDate: now.toISOString(),
      renewalDate: renewalIso,
    });
  }

  await logSubscriptionEvent(client, {
    tenantId,
    eventType: 'manual_license_applied',
    eventSource: 'admin',
    payload: {
      subscriptionId,
      licenseType,
      expiryDate: renewalIso,
      planCode: plan.plan_code,
    },
  });

  const sub = await getSubscriptionById(client, subscriptionId);
  if (!sub) {
    throw new Error('Failed to sync manual license to subscription.');
  }
  return sub;
}

export async function expireTrialsAndCanceled(client: pg.PoolClient): Promise<number> {
  const expiredTrials = await subRepo.expireTrials(client);
  const expiredCanceled = await subRepo.expireCanceledAtPeriodEnd(client);
  return expiredTrials + expiredCanceled;
}

export { planModules };
