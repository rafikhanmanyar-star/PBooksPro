/**
 * Subscription invoices.
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import {
  SubscriptionInvoiceRepository,
  newInvoiceId,
} from '../../modules/billing/repositories/SubscriptionInvoiceRepository.js';

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

const invoiceRepo = new SubscriptionInvoiceRepository();

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
  return invoiceRepo.insert(client, {
    id: newInvoiceId(),
    tenantId: input.tenantId,
    subscriptionId: input.subscriptionId ?? null,
    invoiceNumber: nextInvoiceNumber(),
    amount: input.amount,
    currency: input.currency ?? 'USD',
    status: input.status ?? 'open',
    paidDate: input.paidDate ?? null,
    paddleTransactionId: input.paddleTransactionId ?? null,
    metadata: input.metadata ?? {},
  });
}

export async function markInvoicePaid(
  client: pg.PoolClient,
  invoiceId: string,
  paddleTransactionId?: string
): Promise<SubscriptionInvoiceRow | null> {
  return invoiceRepo.markPaid(client, invoiceId, paddleTransactionId ?? null);
}

export async function getInvoiceByPaddleTransaction(
  client: pg.PoolClient,
  transactionId: string
): Promise<SubscriptionInvoiceRow | null> {
  return invoiceRepo.getByPaddleTransaction(client, transactionId);
}

export async function listInvoicesForTenant(
  client: pg.PoolClient,
  tenantId: string,
  limit = 50
): Promise<SubscriptionInvoiceRow[]> {
  return invoiceRepo.listForTenant(client, tenantId, limit);
}

export async function getInvoiceById(
  client: pg.PoolClient,
  invoiceId: string
): Promise<SubscriptionInvoiceRow | null> {
  return invoiceRepo.getById(client, invoiceId);
}
