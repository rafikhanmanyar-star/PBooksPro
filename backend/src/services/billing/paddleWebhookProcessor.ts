/**
 * Idempotent Paddle webhook processor with retry support.
 */

import type pg from 'pg';
import { parsePaddleWebhook } from './paddleService.js';
import { logSubscriptionEvent } from './subscriptionEventService.js';
import { activatePaidSubscription } from './subscriptionService.js';
import { getBillingPlanByCode } from './billingPlanService.js';
import { updateCustomerFromPaddleWebhook } from './paddleCustomerService.js';
import { syncSubscriptionFromPaddle } from './paddleSubscriptionService.js';
import {
  markWebhookDelivery,
  syncInvoiceFromTransaction,
  upsertWebhookDelivery,
} from './paddleInvoiceSyncService.js';
import { logBillingAudit } from './billingAuditService.js';
import { SubscriptionRepository } from '../../modules/billing/repositories/SubscriptionRepository.js';

const subRepo = new SubscriptionRepository();

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function customData(data: Record<string, unknown>): Record<string, unknown> {
  const cd = data.custom_data;
  return cd && typeof cd === 'object' ? (cd as Record<string, unknown>) : {};
}

function extractAmount(data: Record<string, unknown>): number {
  const details = data.details;
  if (details && typeof details === 'object') {
    const totals = (details as Record<string, unknown>).totals;
    if (totals && typeof totals === 'object') {
      const t = totals as Record<string, unknown>;
      const raw = t.total ?? t.grand_total;
      if (typeof raw === 'string' || typeof raw === 'number') {
        const n = Number(raw);
        return n > 1000 ? n / 100 : n;
      }
    }
  }
  return 0;
}

const HANDLED_EVENTS = new Set([
  'transaction.completed',
  'transaction.updated',
  'transaction.paid',
  'transaction.payment_failed',
  'payment.succeeded',
  'payment.failed',
  'subscription.created',
  'subscription.updated',
  'subscription.activated',
  'subscription.canceled',
  'subscription.past_due',
  'subscription.resumed',
  'customer.created',
  'customer.updated',
]);

function normalizeEventType(eventType: string): string {
  if (eventType === 'payment.succeeded') return 'transaction.paid';
  if (eventType === 'payment.failed') return 'transaction.payment_failed';
  return eventType;
}

async function markSubscriptionPastDue(
  client: pg.PoolClient,
  paddleSubId: string | undefined
): Promise<void> {
  if (!paddleSubId) return;
  const tenantId = await subRepo.markPastDueByPaddleSubId(client, paddleSubId);
  if (tenantId) {
    const { captureMonitoringEvent } = await import('../monitoring/monitoringCapture.js');
    captureMonitoringEvent({
      category: 'payment',
      severity: 'error',
      message: `Subscription past due (Paddle ${paddleSubId})`,
      code: 'PAYMENT_PAST_DUE',
      tenantId,
      metadata: { paddleSubscriptionId: paddleSubId },
    });
  }
}

async function clearPastDueOnPayment(
  client: pg.PoolClient,
  paddleSubId: string | undefined
): Promise<void> {
  if (!paddleSubId) return;
  await subRepo.clearPastDueByPaddleSubId(client, paddleSubId);
}

async function dispatchEvent(
  client: pg.PoolClient,
  eventType: string,
  data: Record<string, unknown>
): Promise<void> {
  const tenantId = str(customData(data).tenant_id) ?? str(data.tenant_id);
  const planCode = str(customData(data).plan_code);
  const billingCycleRaw = str(customData(data).billing_cycle);
  const billingCycle =
    billingCycleRaw === 'annual' ? ('annual' as const) : ('monthly' as const);

  if (eventType === 'customer.created' || eventType === 'customer.updated') {
    await updateCustomerFromPaddleWebhook(client, data);
    return;
  }

  if (eventType === 'transaction.completed' || eventType === 'transaction.paid') {
    await syncInvoiceFromTransaction(client, data);

    const transactionId = str(data.id);
    const customerId = str(data.customer_id);
    const subscriptionId = str(data.subscription_id);
    const amount = extractAmount(data);

    await clearPastDueOnPayment(client, subscriptionId);

    if (!tenantId || !planCode) return;

    const plan = await getBillingPlanByCode(client, planCode);
    if (!plan) return;

    await activatePaidSubscription(client, {
      tenantId,
      planId: plan.id,
      billingCycle,
      paddleCustomerId: customerId,
      paddleSubscriptionId: subscriptionId,
      amount:
        amount ||
        (billingCycle === 'annual' ? Number(plan.annual_price) : Number(plan.monthly_price)),
      currency: str(data.currency_code) ?? 'USD',
      paddleTransactionId: transactionId,
    });
    return;
  }

  if (eventType === 'transaction.payment_failed') {
    await syncInvoiceFromTransaction(client, data);
    await markSubscriptionPastDue(client, str(data.subscription_id));
    return;
  }

  if (eventType === 'transaction.updated') {
    await syncInvoiceFromTransaction(client, data);
    return;
  }

  if (
    eventType === 'subscription.created' ||
    eventType === 'subscription.updated' ||
    eventType === 'subscription.activated'
  ) {
    await syncSubscriptionFromPaddle(client, data);
    const { applyPendingPlanChanges } = await import('./subscriptionLifecycleService.js');
    await applyPendingPlanChanges(client);
    return;
  }

  if (eventType === 'subscription.canceled') {
    const paddleSubId = str(data.id);
    if (paddleSubId) {
      await subRepo.cancelByPaddleSubId(client, paddleSubId);
    }
    return;
  }

  if (eventType === 'subscription.past_due') {
    await markSubscriptionPastDue(client, str(data.id));
    return;
  }

  if (eventType === 'subscription.resumed') {
    const paddleSubId = str(data.id);
    if (paddleSubId) {
      await subRepo.resumeByPaddleSubId(client, paddleSubId);
    }
    return;
  }
}

export async function processPaddleWebhookPayload(
  client: pg.PoolClient,
  body: unknown
): Promise<{ handled: boolean; eventType?: string; eventId?: string; duplicate?: boolean }> {
  const event = parsePaddleWebhook(body);
  if (!event) return { handled: false };

  const { event_id, event_type, data } = event;
  const tenantId = str(customData(data).tenant_id) ?? str(data.tenant_id) ?? null;

  const delivery = await upsertWebhookDelivery(client, {
    eventId: event_id,
    eventType: event_type,
    tenantId,
    payload: data,
  });

  if (delivery.alreadyProcessed) {
    return { handled: true, eventType: event_type, eventId: event_id, duplicate: true };
  }

  await markWebhookDelivery(client, delivery.id, 'processing');

  await logSubscriptionEvent(client, {
    tenantId,
    eventType: event_type,
    eventSource: 'paddle',
    payload: data,
  });

  try {
    const normalizedType = normalizeEventType(event_type);
    if (HANDLED_EVENTS.has(event_type) || HANDLED_EVENTS.has(normalizedType)) {
      await dispatchEvent(client, normalizedType, data);
    }

    await markWebhookDelivery(client, delivery.id, 'processed');

    if (tenantId) {
      await logBillingAudit(client, {
        tenantId,
        action: 'webhook_processed',
        summary: `Processed Paddle webhook ${event_type}`,
        details: { eventId: event_id, eventType: event_type },
      });
    }

    return { handled: true, eventType: event_type, eventId: event_id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markWebhookDelivery(client, delivery.id, 'failed', message);

    if (tenantId) {
      await logBillingAudit(client, {
        tenantId,
        action: 'webhook_failed',
        summary: `Paddle webhook failed: ${event_type}`,
        details: { eventId: event_id, error: message },
      });
    }

    throw err;
  }
}

export async function retryFailedWebhookDeliveries(client: pg.PoolClient): Promise<number> {
  const { listRetryableWebhookDeliveries } = await import('./paddleInvoiceSyncService.js');
  const pending = await listRetryableWebhookDeliveries(client);
  let processed = 0;

  for (const row of pending) {
    const syntheticBody = {
      event_id: row.id,
      event_type: row.event_type,
      data: row.payload,
    };
    try {
      await processPaddleWebhookPayload(client, syntheticBody);
      processed += 1;
    } catch {
      // attempt_count incremented in markWebhookDelivery
    }
  }

  return processed;
}

/** @deprecated use processPaddleWebhookPayload */
export async function handlePaddleWebhookEvent(
  client: pg.PoolClient,
  body: unknown
): Promise<{ handled: boolean; eventType?: string }> {
  const result = await processPaddleWebhookPayload(client, body);
  return { handled: result.handled, eventType: result.eventType };
}
