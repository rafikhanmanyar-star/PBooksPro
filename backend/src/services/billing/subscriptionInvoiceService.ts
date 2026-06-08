/**
 * Subscription invoices.
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';

export type SubscriptionInvoiceRow = {
  id: string;
  tenant_id: string;
  subscription_id: string | null;
  invoice_number: string;
  amount: string;
  currency: string;
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  invoice_date: string;
  paid_date: string | null;
  paddle_transaction_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

function mapInvoice(row: pg.QueryResultRow): SubscriptionInvoiceRow {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    subscription_id: row.subscription_id,
    invoice_number: row.invoice_number,
    amount: String(row.amount),
    currency: row.currency,
    status: row.status,
    invoice_date: row.invoice_date,
    paid_date: row.paid_date,
    paddle_transaction_id: row.paddle_transaction_id,
    metadata:
      row.metadata && typeof row.metadata === 'object'
        ? (row.metadata as Record<string, unknown>)
        : {},
    created_at: row.created_at,
  };
}

function nextInvoiceNumber(): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  return `INV-${stamp}-${suffix}`;
}

export async function createInvoice(
  client: pg.PoolClient,
  input: {
    tenantId: string;
    subscriptionId?: string | null;
    amount: number;
    currency?: string;
    status?: SubscriptionInvoiceRow['status'];
    paddleTransactionId?: string | null;
    metadata?: Record<string, unknown>;
    paidDate?: string | null;
  }
): Promise<SubscriptionInvoiceRow> {
  const id = randomUUID();
  const invoiceNumber = nextInvoiceNumber();
  await client.query(
    `INSERT INTO subscription_invoices (
       id, tenant_id, subscription_id, invoice_number, amount, currency, status,
       invoice_date, paid_date, paddle_transaction_id, metadata
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9, $10::jsonb)`,
    [
      id,
      input.tenantId,
      input.subscriptionId ?? null,
      invoiceNumber,
      input.amount,
      input.currency ?? 'USD',
      input.status ?? 'open',
      input.paidDate ?? null,
      input.paddleTransactionId ?? null,
      JSON.stringify(input.metadata ?? {}),
    ]
  );
  const { rows } = await client.query(`SELECT * FROM subscription_invoices WHERE id = $1`, [id]);
  return mapInvoice(rows[0]);
}

export async function markInvoicePaid(
  client: pg.PoolClient,
  invoiceId: string,
  paddleTransactionId?: string
): Promise<SubscriptionInvoiceRow | null> {
  await client.query(
    `UPDATE subscription_invoices SET
       status = 'paid',
       paid_date = COALESCE(paid_date, NOW()),
       paddle_transaction_id = COALESCE($2, paddle_transaction_id)
     WHERE id = $1`,
    [invoiceId, paddleTransactionId ?? null]
  );
  const { rows } = await client.query(`SELECT * FROM subscription_invoices WHERE id = $1`, [
    invoiceId,
  ]);
  return rows.length ? mapInvoice(rows[0]) : null;
}

export async function getInvoiceByPaddleTransaction(
  client: pg.PoolClient,
  transactionId: string
): Promise<SubscriptionInvoiceRow | null> {
  const { rows } = await client.query(
    `SELECT * FROM subscription_invoices WHERE paddle_transaction_id = $1 LIMIT 1`,
    [transactionId]
  );
  return rows.length ? mapInvoice(rows[0]) : null;
}

export async function listInvoicesForTenant(
  client: pg.PoolClient,
  tenantId: string,
  limit = 50
): Promise<SubscriptionInvoiceRow[]> {
  const { rows } = await client.query(
    `SELECT * FROM subscription_invoices WHERE tenant_id = $1 ORDER BY invoice_date DESC LIMIT $2`,
    [tenantId, limit]
  );
  return rows.map(mapInvoice);
}

export async function getInvoiceById(
  client: pg.PoolClient,
  invoiceId: string
): Promise<SubscriptionInvoiceRow | null> {
  const { rows } = await client.query(`SELECT * FROM subscription_invoices WHERE id = $1`, [
    invoiceId,
  ]);
  return rows.length ? mapInvoice(rows[0]) : null;
}
