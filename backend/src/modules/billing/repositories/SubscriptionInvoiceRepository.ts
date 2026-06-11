import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { SubscriptionInvoiceRow } from '../../../services/billing/subscriptionInvoiceService.js';

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

export class SubscriptionInvoiceRepository {
  async insert(
    client: pg.PoolClient,
    input: {
      id: string;
      tenantId: string;
      subscriptionId: string | null;
      invoiceNumber: string;
      amount: number;
      currency: string;
      status: SubscriptionInvoiceRow['status'];
      paidDate: string | null;
      paddleTransactionId: string | null;
      metadata: Record<string, unknown>;
    }
  ): Promise<SubscriptionInvoiceRow> {
    await client.query(
      `INSERT INTO subscription_invoices (
         id, tenant_id, subscription_id, invoice_number, amount, currency, status,
         invoice_date, paid_date, paddle_transaction_id, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9, $10::jsonb)`,
      [
        input.id,
        input.tenantId,
        input.subscriptionId,
        input.invoiceNumber,
        input.amount,
        input.currency,
        input.status,
        input.paidDate,
        input.paddleTransactionId,
        JSON.stringify(input.metadata),
      ]
    );
    const r = await client.query(`SELECT * FROM subscription_invoices WHERE id = $1`, [input.id]);
    return mapInvoice(r.rows[0]!);
  }

  async markPaid(
    client: pg.PoolClient,
    invoiceId: string,
    paddleTransactionId: string | null
  ): Promise<SubscriptionInvoiceRow | null> {
    await client.query(
      `UPDATE subscription_invoices SET
         status = 'paid',
         paid_date = COALESCE(paid_date, NOW()),
         paddle_transaction_id = COALESCE($2, paddle_transaction_id)
       WHERE id = $1`,
      [invoiceId, paddleTransactionId]
    );
    const r = await client.query(`SELECT * FROM subscription_invoices WHERE id = $1`, [invoiceId]);
    return r.rows[0] ? mapInvoice(r.rows[0]) : null;
  }

  async getByPaddleTransaction(
    client: pg.PoolClient,
    transactionId: string
  ): Promise<SubscriptionInvoiceRow | null> {
    const r = await client.query(
      `SELECT * FROM subscription_invoices WHERE paddle_transaction_id = $1 LIMIT 1`,
      [transactionId]
    );
    return r.rows[0] ? mapInvoice(r.rows[0]) : null;
  }

  async listForTenant(
    client: pg.PoolClient,
    tenantId: string,
    limit: number
  ): Promise<SubscriptionInvoiceRow[]> {
    const r = await client.query(
      `SELECT * FROM subscription_invoices WHERE tenant_id = $1 ORDER BY invoice_date DESC LIMIT $2`,
      [tenantId, limit]
    );
    return r.rows.map(mapInvoice);
  }

  async getById(client: pg.PoolClient, invoiceId: string): Promise<SubscriptionInvoiceRow | null> {
    const r = await client.query(`SELECT * FROM subscription_invoices WHERE id = $1`, [invoiceId]);
    return r.rows[0] ? mapInvoice(r.rows[0]) : null;
  }
}

export { randomUUID as newInvoiceId };
