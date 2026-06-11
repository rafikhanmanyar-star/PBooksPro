/**
 * Paddle subscription operations (API + local DB sync).
 */

import type pg from 'pg';
import {
  cancelPaddleSubscription,
  changePaddleSubscriptionPlan,
  resumePaddleSubscription,
} from './paddleService.js';
import { getBillingPlanByCode } from './billingPlanService.js';
import {
  cancelSubscription,
  downgradeSubscription,
  getActiveSubscription,
  reactivateSubscription,
  upgradeSubscription,
  type SubscriptionRow,
} from './subscriptionService.js';
import { logBillingAudit } from './billingAuditService.js';
import { SubscriptionRepository } from '../../modules/billing/repositories/SubscriptionRepository.js';

const subRepo = new SubscriptionRepository();

export async function changeSubscriptionPlan(
  client: pg.PoolClient,
  input: {
    tenantId: string;
    planCode: string;
    billingCycle?: 'monthly' | 'annual';
    atPeriodEnd?: boolean;
    userId?: string | null;
  }
): Promise<SubscriptionRow> {
  const sub = await getActiveSubscription(client, input.tenantId);
  if (!sub) throw new Error('No active subscription found.');

  const newPlan = await getBillingPlanByCode(client, input.planCode);
  if (!newPlan) throw new Error(`Plan "${input.planCode}" not found.`);

  const currentPlan = await getBillingPlanByCode(client, sub.plan_code ?? '');
  const currentPrice =
    sub.billing_cycle === 'annual'
      ? Number(currentPlan?.annual_price ?? 0)
      : Number(currentPlan?.monthly_price ?? 0);
  const newPrice =
    (input.billingCycle ?? sub.billing_cycle) === 'annual'
      ? Number(newPlan.annual_price)
      : Number(newPlan.monthly_price);

  const billingCycle =
    input.billingCycle ??
    (sub.billing_cycle === 'annual' ? ('annual' as const) : ('monthly' as const));

  if (sub.paddle_subscription_id) {
    await changePaddleSubscriptionPlan({
      paddleSubscriptionId: sub.paddle_subscription_id,
      planCode: input.planCode,
      billingCycle,
    });
  }

  let updated: SubscriptionRow;
  if (newPrice >= currentPrice) {
    updated = await upgradeSubscription(client, input.tenantId, input.planCode);
  } else {
    updated = await downgradeSubscription(
      client,
      input.tenantId,
      input.planCode,
      input.atPeriodEnd !== false
    );
  }

  await logBillingAudit(client, {
    tenantId: input.tenantId,
    userId: input.userId,
    action: 'subscription_changed',
    summary: `Subscription plan changed to ${input.planCode}`,
    details: { planCode: input.planCode, billingCycle, atPeriodEnd: input.atPeriodEnd },
  });

  return updated;
}

export async function cancelTenantSubscription(
  client: pg.PoolClient,
  input: {
    tenantId: string;
    atPeriodEnd?: boolean;
    userId?: string | null;
  }
): Promise<SubscriptionRow> {
  const sub = await getActiveSubscription(client, input.tenantId);
  if (!sub) throw new Error('No active subscription to cancel.');

  const atPeriodEnd = input.atPeriodEnd !== false;
  if (sub.paddle_subscription_id) {
    await cancelPaddleSubscription(
      sub.paddle_subscription_id,
      atPeriodEnd ? 'next_billing_period' : 'immediately'
    );
  }

  const updated = await cancelSubscription(client, input.tenantId, atPeriodEnd);

  await logBillingAudit(client, {
    tenantId: input.tenantId,
    userId: input.userId,
    action: 'subscription_canceled',
    summary: atPeriodEnd ? 'Subscription cancel scheduled' : 'Subscription canceled',
    details: { atPeriodEnd },
  });

  return updated;
}

export async function reactivateTenantSubscription(
  client: pg.PoolClient,
  input: { tenantId: string; userId?: string | null }
): Promise<SubscriptionRow> {
  const sub = await getActiveSubscription(client, input.tenantId);
  if (sub?.paddle_subscription_id) {
    await resumePaddleSubscription(sub.paddle_subscription_id);
  }

  const updated = await reactivateSubscription(client, input.tenantId);

  await logBillingAudit(client, {
    tenantId: input.tenantId,
    userId: input.userId,
    action: 'subscription_reactivated',
    summary: 'Subscription reactivated',
    details: { subscriptionId: updated.id },
  });

  return updated;
}

export async function syncSubscriptionFromPaddle(
  client: pg.PoolClient,
  data: Record<string, unknown>
): Promise<void> {
  const paddleSubId = typeof data.id === 'string' ? data.id : null;
  if (!paddleSubId) return;

  const custom = data.custom_data;
  const tenantId =
    custom && typeof custom === 'object' && typeof (custom as Record<string, unknown>).tenant_id === 'string'
      ? ((custom as Record<string, unknown>).tenant_id as string)
      : null;

  const status = typeof data.status === 'string' ? data.status : null;
  const mapped =
    status === 'active'
      ? 'active'
      : status === 'canceled'
        ? 'canceled'
        : status === 'past_due'
          ? 'past_due'
          : status === 'paused'
            ? 'paused'
            : status === 'trialing'
              ? 'trialing'
              : null;

  const customerId = typeof data.customer_id === 'string' ? data.customer_id : null;

  let renewalDate: string | null = null;
  const billingPeriod = data.current_billing_period;
  if (billingPeriod && typeof billingPeriod === 'object') {
    const endsAt = (billingPeriod as Record<string, unknown>).ends_at;
    if (typeof endsAt === 'string') renewalDate = endsAt;
  }
  const planCode =
    custom && typeof custom === 'object' && typeof (custom as Record<string, unknown>).plan_code === 'string'
      ? ((custom as Record<string, unknown>).plan_code as string)
      : null;

  const existingId = await subRepo.getIdByPaddleSubscriptionId(client, paddleSubId);

  if (existingId) {
    const updates: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [existingId];
    let idx = 2;

    if (mapped) {
      updates.push(`status = $${idx++}`);
      params.push(mapped);
    }
    if (customerId) {
      updates.push(`paddle_customer_id = $${idx++}`);
      params.push(customerId);
    }
    if (mapped === 'canceled') {
      updates.push(`canceled_at = COALESCE(canceled_at, NOW())`);
    }
    if (renewalDate) {
      updates.push(`renewal_date = $${idx++}`);
      params.push(renewalDate);
    }
    if (mapped === 'active') {
      updates.push(`past_due_at = NULL`);
    }

    await subRepo.patchFromPaddle(client, existingId, updates, params);
    return;
  }

  if (!tenantId || !planCode) return;

  const plan = await getBillingPlanByCode(client, planCode);
  if (!plan) return;

  const billingCycleRaw =
    custom && typeof custom === 'object'
      ? (custom as Record<string, unknown>).billing_cycle
      : 'monthly';
  const billingCycle = billingCycleRaw === 'annual' ? 'annual' : 'monthly';

  const existing = await getActiveSubscription(client, tenantId);
  if (existing) {
    await subRepo.linkPaddleToExisting(
      client,
      existing.id,
      paddleSubId,
      customerId,
      mapped ?? 'active'
    );
  } else {
    const { randomUUID } = await import('node:crypto');
    await subRepo.insertFromPaddle(client, {
      id: randomUUID(),
      tenantId,
      planId: plan.id,
      status: mapped ?? 'active',
      billingCycle,
      paddleCustomerId: customerId,
      paddleSubscriptionId: paddleSubId,
    });
  }
}
