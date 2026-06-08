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

const ACTIVE_STATUSES: SubscriptionStatus[] = [
  'trialing',
  'active',
  'past_due',
  'paused',
  'pending',
];

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
  const { rows } = await client.query(
    `SELECT s.*, p.plan_code, p.name AS plan_name
     FROM subscriptions s
     INNER JOIN billing_plans p ON p.id = s.plan_id
     WHERE s.tenant_id = $1 AND s.status = ANY($2::text[])
     ORDER BY s.updated_at DESC
     LIMIT 1`,
    [tenantId, ACTIVE_STATUSES]
  );
  return rows.length ? mapSub(rows[0]) : null;
}

export async function getSubscriptionById(
  client: pg.PoolClient,
  subscriptionId: string
): Promise<SubscriptionRow | null> {
  const { rows } = await client.query(
    `SELECT s.*, p.plan_code, p.name AS plan_name
     FROM subscriptions s
     INNER JOIN billing_plans p ON p.id = s.plan_id
     WHERE s.id = $1`,
    [subscriptionId]
  );
  return rows.length ? mapSub(rows[0]) : null;
}

export async function getSubscriptionByPaddleId(
  client: pg.PoolClient,
  paddleSubscriptionId: string
): Promise<SubscriptionRow | null> {
  const { rows } = await client.query(
    `SELECT s.*, p.plan_code, p.name AS plan_name
     FROM subscriptions s
     INNER JOIN billing_plans p ON p.id = s.plan_id
     WHERE s.paddle_subscription_id = $1`,
    [paddleSubscriptionId]
  );
  return rows.length ? mapSub(rows[0]) : null;
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

  await client.query(
    `UPDATE subscriptions SET trial_end_date = $2, renewal_date = $2, updated_at = NOW()
     WHERE id = $1 AND status IN ('trialing', 'active', 'past_due', 'paused', 'pending')`,
    [sub.id, extended.toISOString()]
  );

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

  await client.query(
    `INSERT INTO subscriptions (
       id, tenant_id, plan_id, status, billing_cycle, start_date, trial_end_date, renewal_date
     ) VALUES ($1, $2, $3, 'trialing', 'trial', $4, $5, $5)`,
    [id, tenantId, trialPlan.id, now.toISOString(), trialEnd.toISOString()]
  );

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
    await client.query(
      `UPDATE subscriptions SET
         plan_id = $2,
         status = 'active',
         billing_cycle = $3,
         renewal_date = $4,
         trial_end_date = NULL,
         canceled_at = NULL,
         cancel_at_period_end = FALSE,
         pending_plan_id = NULL,
         past_due_at = NULL,
         paddle_customer_id = COALESCE($5, paddle_customer_id),
         paddle_subscription_id = COALESCE($6, paddle_subscription_id),
         updated_at = NOW()
       WHERE id = $1`,
      [
        subscriptionId,
        input.planId,
        input.billingCycle,
        renewal.toISOString(),
        input.paddleCustomerId ?? null,
        input.paddleSubscriptionId ?? null,
      ]
    );
  } else {
    subscriptionId = randomUUID();
    await client.query(
      `INSERT INTO subscriptions (
         id, tenant_id, plan_id, status, billing_cycle, start_date, renewal_date,
         paddle_customer_id, paddle_subscription_id
       ) VALUES ($1, $2, $3, 'active', $4, $5, $6, $7, $8)`,
      [
        subscriptionId,
        input.tenantId,
        input.planId,
        input.billingCycle,
        now.toISOString(),
        renewal.toISOString(),
        input.paddleCustomerId ?? null,
        input.paddleSubscriptionId ?? null,
      ]
    );
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

  await client.query(
    `UPDATE subscriptions SET plan_id = $2, pending_plan_id = NULL, updated_at = NOW() WHERE id = $1`,
    [sub.id, newPlan.id]
  );

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
    await client.query(
      `UPDATE subscriptions SET pending_plan_id = $2, updated_at = NOW() WHERE id = $1`,
      [sub.id, newPlan.id]
    );
  } else {
    await client.query(
      `UPDATE subscriptions SET plan_id = $2, pending_plan_id = NULL, updated_at = NOW() WHERE id = $1`,
      [sub.id, newPlan.id]
    );
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
    await client.query(
      `UPDATE subscriptions SET cancel_at_period_end = TRUE, updated_at = NOW() WHERE id = $1`,
      [sub.id]
    );
  } else {
    await client.query(
      `UPDATE subscriptions SET
         status = 'canceled',
         canceled_at = NOW(),
         cancel_at_period_end = FALSE,
         renewal_date = NULL,
         updated_at = NOW()
       WHERE id = $1`,
      [sub.id]
    );
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
  const { rows } = await client.query(
    `SELECT s.*, p.plan_code, p.name AS plan_name
     FROM subscriptions s
     INNER JOIN billing_plans p ON p.id = s.plan_id
     WHERE s.tenant_id = $1
     ORDER BY s.updated_at DESC
     LIMIT 1`,
    [tenantId]
  );
  if (rows.length === 0) throw new Error('No subscription found.');

  const sub = mapSub(rows[0]);
  if (sub.status === 'active' || sub.status === 'trialing') {
    if (sub.cancel_at_period_end) {
      await client.query(
        `UPDATE subscriptions SET cancel_at_period_end = FALSE, canceled_at = NULL, updated_at = NOW()
         WHERE id = $1`,
        [sub.id]
      );
    } else {
      return sub;
    }
  } else if (sub.status === 'canceled' || sub.status === 'expired') {
    const renewal = computeRenewalDate(new Date(), sub.billing_cycle === 'trial' ? 'monthly' : sub.billing_cycle);
    await client.query(
      `UPDATE subscriptions SET
         status = 'active',
         canceled_at = NULL,
         cancel_at_period_end = FALSE,
         renewal_date = $2,
         updated_at = NOW()
       WHERE id = $1`,
      [sub.id, renewal.toISOString()]
    );
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

export async function expireTrialsAndCanceled(client: pg.PoolClient): Promise<number> {
  const r1 = await client.query(
    `UPDATE subscriptions SET status = 'expired', updated_at = NOW()
     WHERE status = 'trialing' AND trial_end_date IS NOT NULL AND trial_end_date < NOW()
     RETURNING id`
  );
  const r2 = await client.query(
    `UPDATE subscriptions SET status = 'canceled', canceled_at = COALESCE(canceled_at, NOW()), updated_at = NOW()
     WHERE cancel_at_period_end = TRUE AND renewal_date IS NOT NULL AND renewal_date < NOW() AND status IN ('active', 'trialing')
     RETURNING id`
  );
  return (r1.rowCount ?? 0) + (r2.rowCount ?? 0);
}

export { planModules };
