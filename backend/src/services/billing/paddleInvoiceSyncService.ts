/**
 * Sync Paddle transactions into subscription_invoices.
 */

import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import {
  createInvoice,
  getInvoiceByPaddleTransaction,
  markInvoicePaid,
} from './subscriptionInvoiceService.js';
import { getActiveSubscription } from './subscriptionService.js';
import { logBillingAudit } from './billingAuditService.js';
import { PaddleWebhookRepository } from '../../modules/billing/repositories/BillingSupportRepository.js';

const webhookRepo = new PaddleWebhookRepository();

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
      const raw = t.total ?? t.grand_total ?? t.subtotal;
      if (typeof raw === 'string' || typeof raw === 'number') {
        const n = Number(raw);
        return n > 1000 ? n / 100 : n;
      }
    }
  }
  const total = data.total ?? data.amount;
  if (typeof total === 'string' || typeof total === 'number') {
    const n = Number(total);
    return n > 1000 ? n / 100 : n;
  }
  return 0;
}

function mapTransactionStatus(status: string | undefined): 'draft' | 'open' | 'paid' | 'void' | 'uncollectible' {
  if (!status) return 'open';
  const s = status.toLowerCase();
  if (s === 'completed' || s === 'paid') return 'paid';
  if (s === 'canceled' || s === 'cancelled') return 'void';
  if (s === 'past_due') return 'uncollectible';
  return 'open';
}

export async function syncInvoiceFromTransaction(
  client: pg.PoolClient,
  data: Record<string, unknown>
): Promise<{ invoiceId: string; created: boolean } | null> {
  const transactionId = str(data.id);
  if (!transactionId) return null;

  const tenantId = str(customData(data).tenant_id) ?? str(data.tenant_id);
  if (!tenantId) return null;

  const existing = await getInvoiceByPaddleTransaction(client, transactionId);
  const amount = extractAmount(data);
  const currency = str(data.currency_code) ?? 'USD';
  const status = mapTransactionStatus(str(data.status));
  const subscription = await getActiveSubscription(client, tenantId);

  if (existing) {
    if (status === 'paid' && existing.status !== 'paid') {
      await markInvoicePaid(client, existing.id, transactionId);
      await logBillingAudit(client, {
        tenantId,
        action: 'invoice_synced',
        summary: 'Invoice marked paid from Paddle transaction update',
        details: { transactionId, invoiceId: existing.id },
      });
    }
    return { invoiceId: existing.id, created: false };
  }

  const invoice = await createInvoice(client, {
    tenantId,
    subscriptionId: subscription?.id ?? null,
    amount: amount || 0,
    currency,
    status,
    paddleTransactionId: transactionId,
    paidDate: status === 'paid' ? new Date().toISOString() : null,
    metadata: {
      paddleStatus: str(data.status),
      subscriptionId: str(data.subscription_id),
      customerId: str(data.customer_id),
    },
  });

  await logBillingAudit(client, {
    tenantId,
    action: 'invoice_synced',
    summary: 'Invoice synced from Paddle transaction',
    details: { transactionId, invoiceId: invoice.id, amount, status },
  });

  return { invoiceId: invoice.id, created: true };
}

export async function upsertWebhookDelivery(
  client: pg.PoolClient,
  input: {
    eventId: string;
    eventType: string;
    tenantId?: string | null;
    payload: Record<string, unknown>;
  }
): Promise<{ id: string; alreadyProcessed: boolean }> {
  const existing = await webhookRepo.getDelivery(client, input.eventId);

  if (existing) {
    return { id: existing.id, alreadyProcessed: existing.status === 'processed' };
  }

  await webhookRepo.insertPending(client, {
    eventId: input.eventId,
    eventType: input.eventType,
    tenantId: input.tenantId ?? null,
    payload: input.payload,
  });

  return { id: input.eventId, alreadyProcessed: false };
}

export async function markWebhookDelivery(
  client: pg.PoolClient,
  deliveryId: string,
  status: 'processing' | 'processed' | 'failed',
  error?: string
): Promise<void> {
  await webhookRepo.markDelivery(client, deliveryId, status, error);
}

export async function listRetryableWebhookDeliveries(
  client: pg.PoolClient,
  limit = 20
): Promise<Array<{ id: string; event_type: string; payload: Record<string, unknown>; attempt_count: number }>> {
  return webhookRepo.listRetryable(client, limit);
}

export async function logWebhookEvent(
  client: pg.PoolClient,
  input: {
    deliveryId: string;
    eventType: string;
    tenantId?: string | null;
    payload: Record<string, unknown>;
  }
): Promise<void> {
  if (input.tenantId) {
    await logBillingAudit(client, {
      tenantId: input.tenantId,
      action: 'webhook_processed',
      summary: `Paddle webhook ${input.eventType}`,
      details: { deliveryId: input.deliveryId, eventType: input.eventType },
    });
  }
}

export async function ensureDeliveryRow(
  client: pg.PoolClient,
  eventId: string,
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> {
  if (await webhookRepo.exists(client, eventId)) return;
  await webhookRepo.insertPendingWithoutTenant(client, eventId, eventType, payload);
}

export { randomUUID as newEventId };
