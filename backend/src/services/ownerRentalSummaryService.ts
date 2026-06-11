import type pg from 'pg';
import { formatPgDateToYyyyMmDd } from '../utils/dateOnly.js';
import { InvoiceRepository } from '../modules/customers/repositories/InvoiceRepository.js';
import {
  OwnerBalanceRepository,
  type OwnerBalanceRow,
} from '../modules/leases/repositories/OwnerBalanceRepository.js';
import { MonthlyOwnerSummaryRepository } from '../modules/leases/repositories/MonthlyOwnerSummaryRepository.js';

/** Minimal transaction shape for rollup (avoids circular import with transactionsService). */
export type TransactionRowForSummary = {
  type: string;
  amount: string;
  date: string | Date;
  owner_id: string | null;
  property_id: string | null;
  invoice_id: string | null;
  deleted_at: Date | null;
};

const RENTAL_INVOICE_TYPES = new Set(['Rental', 'Security Deposit', 'Service Charge']);

async function isRentalIncomeInvoice(
  client: pg.PoolClient,
  tenantId: string,
  invoiceId: string | null | undefined
): Promise<boolean> {
  if (!invoiceId || String(invoiceId).trim() === '') return false;
  const inv = await new InvoiceRepository(tenantId).getById(client, invoiceId);
  const t = inv?.invoice_type;
  return t != null && RENTAL_INVOICE_TYPES.has(String(t));
}

function txDateToMonthStart(row: TransactionRowForSummary): string {
  const d =
    typeof row.date === 'string'
      ? row.date
      : formatPgDateToYyyyMmDd(row.date as Date);
  const day = d.slice(0, 10);
  return `${day.slice(0, 7)}-01`;
}

/**
 * Incremental owner/property balance and monthly rental summary.
 * Balance delta: Income +amount, Expense −amount (owner receivable style).
 * Monthly: rent only for Income tied to rental-module invoices; expense = all Expense on the row.
 */
export async function applyOwnerSummaryDelta(
  client: pg.PoolClient,
  tenantId: string,
  row: TransactionRowForSummary,
  sign: 1 | -1
): Promise<void> {
  if (row.deleted_at) return;
  const oid = row.owner_id;
  const pid = row.property_id;
  if (!oid || !pid || String(oid).trim() === '' || String(pid).trim() === '') return;

  const amt = Number(row.amount);
  if (!Number.isFinite(amt)) return;

  const balanceDelta = sign * (row.type === 'Income' ? amt : row.type === 'Expense' ? -amt : 0);
  if (balanceDelta !== 0) {
    await new OwnerBalanceRepository(tenantId).applyDelta(client, oid, pid, balanceDelta);
  }

  const monthStart = txDateToMonthStart(row);
  let rentDelta = 0;
  let expenseDelta = 0;

  if (row.type === 'Income' && (await isRentalIncomeInvoice(client, tenantId, row.invoice_id))) {
    rentDelta = sign * amt;
  } else if (row.type === 'Expense') {
    expenseDelta = sign * amt;
  }

  if (rentDelta === 0 && expenseDelta === 0) return;

  await new MonthlyOwnerSummaryRepository(tenantId).applyDelta(
    client,
    oid,
    pid,
    monthStart,
    rentDelta,
    expenseDelta
  );
}

export async function syncOwnerSummariesForTransactionChange(
  client: pg.PoolClient,
  tenantId: string,
  before: TransactionRowForSummary | null,
  after: TransactionRowForSummary | null
): Promise<void> {
  if (before) await applyOwnerSummaryDelta(client, tenantId, before, -1);
  if (after) await applyOwnerSummaryDelta(client, tenantId, after, 1);
}

export type { OwnerBalanceRow };

export async function listOwnerBalancesForOwner(
  client: pg.PoolClient,
  tenantId: string,
  ownerId: string,
  propertyId?: string | null
): Promise<OwnerBalanceRow[]> {
  return new OwnerBalanceRepository(tenantId).listForOwner(client, ownerId, propertyId);
}

/** All owner/property balance rows for the tenant (paginated). */
export async function listAllOwnerBalancesForTenant(
  client: pg.PoolClient,
  tenantId: string,
  options?: { propertyId?: string | null; limit?: number }
): Promise<OwnerBalanceRow[]> {
  return new OwnerBalanceRepository(tenantId).listForTenant(client, options);
}
