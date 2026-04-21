import type pg from 'pg';
import { formatPgDateToYyyyMmDd } from '../utils/dateOnly.js';

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
  const r = await client.query<{ invoice_type: string | null }>(
    `SELECT invoice_type FROM invoices WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [invoiceId, tenantId]
  );
  const t = r.rows[0]?.invoice_type;
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
    await client.query(
      `INSERT INTO owner_balances (tenant_id, owner_id, property_id, balance, last_updated)
       VALUES ($1, $2, $3, $4::numeric, NOW())
       ON CONFLICT (tenant_id, owner_id, property_id)
       DO UPDATE SET
         balance = owner_balances.balance + $4::numeric,
         last_updated = NOW()`,
      [tenantId, oid, pid, balanceDelta]
    );
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

  await client.query(
    `INSERT INTO monthly_owner_summary (
       tenant_id, owner_id, property_id, month, total_rent, total_expense, net_amount
     ) VALUES ($1, $2, $3, $4::date, $5::numeric, $6::numeric, ($5::numeric - $6::numeric))
     ON CONFLICT (tenant_id, owner_id, property_id, month)
     DO UPDATE SET
       total_rent = monthly_owner_summary.total_rent + $5::numeric,
       total_expense = monthly_owner_summary.total_expense + $6::numeric,
       net_amount =
         (monthly_owner_summary.total_rent + $5::numeric) - (monthly_owner_summary.total_expense + $6::numeric)`,
    [tenantId, oid, pid, monthStart, rentDelta, expenseDelta]
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

export type OwnerBalanceRow = {
  owner_id: string;
  property_id: string;
  balance: string;
  last_updated: Date;
};

export async function listOwnerBalancesForOwner(
  client: pg.PoolClient,
  tenantId: string,
  ownerId: string,
  propertyId?: string | null
): Promise<OwnerBalanceRow[]> {
  const params: unknown[] = [tenantId, ownerId];
  let where = `WHERE tenant_id = $1 AND owner_id = $2`;
  if (propertyId && String(propertyId).trim() !== '') {
    params.push(propertyId);
    where += ` AND property_id = $${params.length}`;
  }
  const r = await client.query<OwnerBalanceRow>(
    `SELECT owner_id, property_id, balance::text AS balance, last_updated
     FROM owner_balances
     ${where}
     ORDER BY owner_id ASC, property_id ASC`,
    params
  );
  return r.rows;
}

/** All owner/property balance rows for the tenant (paginated). */
export async function listAllOwnerBalancesForTenant(
  client: pg.PoolClient,
  tenantId: string,
  options?: { propertyId?: string | null; limit?: number }
): Promise<OwnerBalanceRow[]> {
  const lim = Math.min(Math.max(options?.limit ?? 8000, 1), 20_000);
  const params: unknown[] = [tenantId];
  let where = 'WHERE tenant_id = $1';
  if (options?.propertyId && String(options.propertyId).trim() !== '') {
    params.push(options.propertyId);
    where += ` AND property_id = $${params.length}`;
  }
  params.push(lim);
  const limIdx = params.length;
  const r = await client.query<OwnerBalanceRow>(
    `SELECT owner_id, property_id, balance::text AS balance, last_updated
     FROM owner_balances
     ${where}
     ORDER BY owner_id ASC, property_id ASC
     LIMIT $${limIdx}`,
    params
  );
  return r.rows;
}
