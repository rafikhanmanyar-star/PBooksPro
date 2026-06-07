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
  const { rows } = await client.query(
    `SELECT id, status FROM paddle_webhook_deliveries WHERE id = $1`,
    [input.eventId]
  );

  if (rows.length) {
    const status = rows[0].status as string;
    return { id: rows[0].id, alreadyProcessed: status === 'processed' };
  }

  await client.query(
    `INSERT INTO paddle_webhook_deliveries (id, event_type, tenant_id, payload, status)
     VALUES ($1, $2, $3, $4::jsonb, 'pending')`,
    [input.eventId, input.eventType, input.tenantId ?? null, JSON.stringify(input.payload)]
  );

  return { id: input.eventId, alreadyProcessed: false };
}

export async function markWebhookDelivery(
  client: pg.PoolClient,
  deliveryId: string,
  status: 'processing' | 'processed' | 'failed',
  error?: string
): Promise<void> {
  const attemptInc = status === 'failed' ? 1 : 0;
  const nextRetry =
    status === 'failed'
      ? new Date(Date.now() + Math.min(3600000, 60000 * Math.pow(2, attemptInc))).toISOString()
      : null;

  await client.query(
    `UPDATE paddle_webhook_deliveries SET
       status = $2,
       attempt_count = attempt_count + $3,
       last_error = $4,
       processed_at = CASE WHEN $2 = 'processed' THEN NOW() ELSE processed_at END,
       next_retry_at = $5,
       updated_at = NOW()
     WHERE id = $1`,
    [deliveryId, status, attemptInc, error ?? null, nextRetry]
  );
}

export async function listRetryableWebhookDeliveries(
  client: pg.PoolClient,
  limit = 20
): Promise<Array<{ id: string; event_type: string; payload: Record<string, unknown>; attempt_count: number }>> {
  const { rows } = await client.query(
    `SELECT id, event_type, payload, attempt_count
     FROM paddle_webhook_deliveries
     WHERE status = 'failed' AND attempt_count < 5
       AND (next_retry_at IS NULL OR next_retry_at <= NOW())
     ORDER BY created_at ASC
     LIMIT $1`,
    [limit]
  );
  return rows.map((r) => ({
    id: r.id,
    event_type: r.event_type,
    payload: r.payload as Record<string, unknown>,
    attempt_count: r.attempt_count,
  }));
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

/** Dev helper: record a mock delivery row */
export async function ensureDeliveryRow(
  client: pg.PoolClient,
  eventId: string,
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> {
  const exists = await client.query(`SELECT 1 FROM paddle_webhook_deliveries WHERE id = $1`, [
    eventId,
  ]);
  if (exists.rows.length) return;
  await client.query(
    `INSERT INTO paddle_webhook_deliveries (id, event_type, payload, status)
     VALUES ($1, $2, $3::jsonb, 'pending')`,
    [eventId, eventType, JSON.stringify(payload)]
  );
}

export { randomUUID as newEventId };
