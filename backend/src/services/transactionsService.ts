import type pg from 'pg';
import { randomUUID } from 'crypto';
import { formatPgDateToYyyyMmDd, parseApiDateToYyyyMmDd } from '../utils/dateOnly.js';
import { recalculateBillPaymentAggregates } from './billsService.js';
import { recalculateInvoicePaymentAggregates } from './invoicesService.js';
import {
  assertExpenseProjectCashAvailable,
  type ExpenseCashValidationBatchContext,
  type ProjectCashTxRow,
} from '../financial/expenseCashValidation.js';

/** Keep invoice/bill paid_amount + status aligned with ledger (also when client saveInvoice fails, e.g. LOCK_HELD). */
async function recalculateAggregatesForLinkedIds(
  client: pg.PoolClient,
  tenantId: string,
  invoiceIds: (string | null | undefined)[],
  billIds: (string | null | undefined)[]
): Promise<void> {
  const inv = [...new Set(invoiceIds.filter((x): x is string => !!x && String(x).trim() !== ''))];
  const bills = [...new Set(billIds.filter((x): x is string => !!x && String(x).trim() !== ''))];
  await Promise.all([
    ...inv.map((id) => recalculateInvoicePaymentAggregates(client, tenantId, id)),
    ...bills.map((id) => recalculateBillPaymentAggregates(client, tenantId, id)),
  ]);
}

export type TransactionRow = {
  id: string;
  tenant_id: string;
  user_id: string | null;
  type: string;
  subtype: string | null;
  amount: string;
  date: Date;
  description: string | null;
  reference: string | null;
  account_id: string;
  from_account_id: string | null;
  to_account_id: string | null;
  category_id: string | null;
  contact_id: string | null;
  vendor_id: string | null;
  project_id: string | null;
  building_id: string | null;
  property_id: string | null;
  unit_id: string | null;
  invoice_id: string | null;
  bill_id: string | null;
  payslip_id: string | null;
  contract_id: string | null;
  agreement_id: string | null;
  batch_id: string | null;
  project_asset_id: string | null;
  owner_id: string | null;
  is_system: boolean;
  version: number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type ListTransactionFilters = {
  projectId?: string;
  startDate?: string;
  endDate?: string;
  type?: string;
  invoiceId?: string;
  /** Only rows linked to invoices with rental module types (Rental, Security Deposit, Service Charge). */
  rentalInvoiceOnly?: boolean;
  limit?: number;
  offset?: number;
};

function dateToApi(d: Date | string | null | undefined): string {
  return formatPgDateToYyyyMmDd(d);
}

export function rowToTransactionApi(row: TransactionRow): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: row.id,
    type: row.type,
    subtype: row.subtype ?? undefined,
    amount: Number(row.amount),
    date: dateToApi(row.date),
    description: row.description ?? undefined,
    reference: row.reference ?? undefined,
    accountId: row.account_id,
    fromAccountId: row.from_account_id ?? undefined,
    toAccountId: row.to_account_id ?? undefined,
    categoryId: row.category_id ?? undefined,
    contactId: row.contact_id ?? undefined,
    vendorId: row.vendor_id ?? undefined,
    projectId: row.project_id ?? undefined,
    buildingId: row.building_id ?? undefined,
    propertyId: row.property_id ?? undefined,
    unitId: row.unit_id ?? undefined,
    invoiceId: row.invoice_id ?? undefined,
    billId: row.bill_id ?? undefined,
    payslipId: row.payslip_id ?? undefined,
    contractId: row.contract_id ?? undefined,
    agreementId: row.agreement_id ?? undefined,
    batchId: row.batch_id ?? undefined,
    projectAssetId: row.project_asset_id ?? undefined,
    ownerId: row.owner_id ?? undefined,
    isSystem: row.is_system,
    userId: row.user_id ?? undefined,
    version: row.version,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
  if (row.deleted_at) {
    base.deletedAt =
      row.deleted_at instanceof Date ? row.deleted_at.toISOString() : row.deleted_at;
  }
  return base;
}

function optStr(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/** Bill payments should inherit bills.category_id when the client sends null (migration / legacy clients). */
async function resolveExpenseCategoryFromBill(
  client: pg.PoolClient,
  tenantId: string,
  type: string,
  billId: string | null | undefined,
  incomingCategory: string | null | undefined
): Promise<string | null | undefined> {
  if (type !== 'Expense') return incomingCategory;
  if (!billId || String(billId).trim() === '') return incomingCategory;
  if (incomingCategory != null && String(incomingCategory).trim() !== '') return incomingCategory;
  const r = await client.query<{ category_id: string | null }>(
    `SELECT category_id FROM bills WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [billId, tenantId]
  );
  const fromBill = r.rows[0]?.category_id;
  return fromBill != null && String(fromBill).trim() !== '' ? fromBill : incomingCategory;
}

function pickBody(body: Record<string, unknown>) {
  const dateRaw = body.date;
  let dateStr: string;
  try {
    dateStr = parseApiDateToYyyyMmDd(dateRaw);
  } catch {
    throw new Error('Invalid date.');
  }

  return {
    type: String(body.type ?? '').trim(),
    subtype: optStr(body.subtype ?? body.subtype) as string | null | undefined,
    amount: Number(body.amount ?? 0),
    date: dateStr,
    description: optStr(body.description) as string | null | undefined,
    reference: optStr(body.reference) as string | null | undefined,
    account_id: String(body.accountId ?? body.account_id ?? '').trim(),
    from_account_id: optStr(body.fromAccountId ?? body.from_account_id) as string | null | undefined,
    to_account_id: optStr(body.toAccountId ?? body.to_account_id) as string | null | undefined,
    category_id: optStr(body.categoryId ?? body.category_id) as string | null | undefined,
    contact_id: optStr(body.contactId ?? body.contact_id) as string | null | undefined,
    vendor_id: optStr(body.vendorId ?? body.vendor_id) as string | null | undefined,
    project_id: optStr(body.projectId ?? body.project_id) as string | null | undefined,
    building_id: optStr(body.buildingId ?? body.building_id) as string | null | undefined,
    property_id: optStr(body.propertyId ?? body.property_id) as string | null | undefined,
    unit_id: optStr(body.unitId ?? body.unit_id) as string | null | undefined,
    invoice_id: optStr(body.invoiceId ?? body.invoice_id) as string | null | undefined,
    bill_id: optStr(body.billId ?? body.bill_id) as string | null | undefined,
    payslip_id: optStr(body.payslipId ?? body.payslip_id) as string | null | undefined,
    contract_id: optStr(body.contractId ?? body.contract_id) as string | null | undefined,
    agreement_id: optStr(body.agreementId ?? body.agreement_id) as string | null | undefined,
    batch_id: optStr(body.batchId ?? body.batch_id) as string | null | undefined,
    project_asset_id: optStr(body.projectAssetId ?? body.project_asset_id) as string | null | undefined,
    owner_id: optStr(body.ownerId ?? body.owner_id) as string | null | undefined,
    is_system:
      body.isSystem === true ||
      body.isSystem === 1 ||
      body.is_system === true ||
      body.is_system === 1,
    user_id: optStr(body.userId ?? body.user_id) as string | null | undefined,
    version: typeof body.version === 'number' ? body.version : undefined,
  };
}

const SELECT_ROW = `SELECT t.id, t.tenant_id, t.user_id, t.type, t.subtype, t.amount, t.date, t.description, t.reference,
    t.account_id, t.from_account_id, t.to_account_id, t.category_id, t.contact_id, t.vendor_id, t.project_id,
    t.building_id, t.property_id, t.unit_id, t.invoice_id, t.bill_id, t.payslip_id, t.contract_id, t.agreement_id,
    t.batch_id, t.project_asset_id, t.owner_id, t.is_system, t.version, t.deleted_at, t.created_at, t.updated_at`;

export async function listTransactions(
  client: pg.PoolClient,
  tenantId: string,
  filters: ListTransactionFilters = {}
): Promise<TransactionRow[]> {
  const params: unknown[] = [tenantId];
  const rentalOnly = filters.rentalInvoiceOnly === true;
  let fromClause = 'FROM transactions t';
  if (rentalOnly) {
    fromClause += ` INNER JOIN invoices i ON i.id = t.invoice_id AND i.tenant_id = t.tenant_id`;
  }
  let where = ' WHERE t.tenant_id = $1 AND t.deleted_at IS NULL';
  if (rentalOnly) {
    where += ` AND i.deleted_at IS NULL AND i.invoice_type IN ('Rental', 'Security Deposit', 'Service Charge')`;
  }

  if (filters.projectId) {
    params.push(filters.projectId);
    where += ` AND t.project_id = $${params.length}`;
  }
  if (filters.startDate) {
    params.push(filters.startDate);
    where += ` AND t.date >= $${params.length}::date`;
  }
  if (filters.endDate) {
    params.push(filters.endDate);
    where += ` AND t.date <= $${params.length}::date`;
  }
  if (filters.type) {
    params.push(filters.type);
    where += ` AND t.type = $${params.length}`;
  }
  if (filters.invoiceId) {
    params.push(filters.invoiceId);
    where += ` AND t.invoice_id = $${params.length}`;
  }

  const limit = Math.min(filters.limit ?? 10000, 500000);
  const offset = Math.max(filters.offset ?? 0, 0);
  params.push(limit);
  params.push(offset);
  const limitIdx = params.length - 1;
  const offsetIdx = params.length;

  const q = `${SELECT_ROW} ${fromClause} ${where} ORDER BY t.date DESC, t.id ASC LIMIT $${limitIdx} OFFSET $${offsetIdx}`;

  const r = await client.query<TransactionRow>(q, params);
  return r.rows;
}

export async function getTransactionById(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<TransactionRow | null> {
  const r = await client.query<TransactionRow>(
    `${SELECT_ROW} FROM transactions t WHERE t.id = $1 AND t.tenant_id = $2 AND t.deleted_at IS NULL`,
    [id, tenantId]
  );
  return r.rows[0] ?? null;
}

export async function getTransactionByIdIncludingDeleted(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<TransactionRow | null> {
  const r = await client.query<TransactionRow>(
    `${SELECT_ROW} FROM transactions t WHERE t.id = $1 AND t.tenant_id = $2`,
    [id, tenantId]
  );
  return r.rows[0] ?? null;
}

function rowToProjectCashTxRow(row: TransactionRow): ProjectCashTxRow {
  return {
    id: row.id,
    type: row.type,
    subtype: row.subtype,
    amount: row.amount,
    date: row.date,
    account_id: row.account_id,
    from_account_id: row.from_account_id,
    to_account_id: row.to_account_id,
    project_id: row.project_id,
  };
}

export async function createTransaction(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>,
  actorUserId: string | null,
  expenseCashBatchCtx?: ExpenseCashValidationBatchContext | null
): Promise<TransactionRow> {
  const p = pickBody(body);
  if (!p.type) throw new Error('type is required.');
  if (!p.account_id) throw new Error('accountId is required.');
  const id =
    typeof body.id === 'string' && body.id.trim() ? body.id.trim() : `tx_${randomUUID().replace(/-/g, '')}`;

  const categoryResolved = await resolveExpenseCategoryFromBill(
    client,
    tenantId,
    p.type,
    p.bill_id,
    p.category_id
  );

  await assertExpenseProjectCashAvailable(
    client,
    tenantId,
    {
      type: p.type,
      amount: Number.isFinite(p.amount) ? p.amount : 0,
      date: p.date,
      account_id: p.account_id,
      project_id: p.project_id,
      bill_id: p.bill_id,
    },
    expenseCashBatchCtx ?? undefined
  );

  const r = await client.query<TransactionRow>(
    `INSERT INTO transactions (
       id, tenant_id, user_id, type, subtype, amount, date, description, reference, account_id, from_account_id, to_account_id,
       category_id, contact_id, vendor_id, project_id, building_id, property_id, unit_id, invoice_id, bill_id, payslip_id,
       contract_id, agreement_id, batch_id, project_asset_id, owner_id, is_system, version, deleted_at, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7::date, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, 1, NULL, NOW(), NOW()
     )
     RETURNING id, tenant_id, user_id, type, subtype, amount, date, description, reference, account_id, from_account_id, to_account_id,
               category_id, contact_id, vendor_id, project_id, building_id, property_id, unit_id, invoice_id, bill_id, payslip_id,
               contract_id, agreement_id, batch_id, project_asset_id, owner_id, is_system, version, deleted_at, created_at, updated_at`,
    [
      id,
      tenantId,
      p.user_id && String(p.user_id).trim() ? String(p.user_id).trim() : actorUserId,
      p.type,
      p.subtype ?? null,
      Number.isFinite(p.amount) ? p.amount : 0,
      p.date,
      p.description ?? null,
      p.reference ?? null,
      p.account_id,
      p.from_account_id ?? null,
      p.to_account_id ?? null,
      categoryResolved ?? null,
      p.contact_id ?? null,
      p.vendor_id ?? null,
      p.project_id ?? null,
      p.building_id ?? null,
      p.property_id ?? null,
      p.unit_id ?? null,
      p.invoice_id ?? null,
      p.bill_id ?? null,
      p.payslip_id ?? null,
      p.contract_id ?? null,
      p.agreement_id ?? null,
      p.batch_id ?? null,
      p.project_asset_id ?? null,
      p.owner_id ?? null,
      p.is_system,
    ]
  );
  const row = r.rows[0];
  if (expenseCashBatchCtx && row.project_id && row.type === 'Expense') {
    expenseCashBatchCtx.recordInsertedTransaction(rowToProjectCashTxRow(row));
  }
  await recalculateAggregatesForLinkedIds(client, tenantId, [row.invoice_id], [row.bill_id]);
  return row;
}

export async function updateTransaction(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  body: Record<string, unknown>
): Promise<{
  row: TransactionRow | null;
  conflict: boolean;
  affectedInvoiceIds: string[];
  affectedBillIds: string[];
}> {
  const before = await getTransactionById(client, tenantId, id);
  const p = pickBody(body);
  if (!p.type) throw new Error('type is required.');
  if (!p.account_id) throw new Error('accountId is required.');
  const expectedVersion = p.version;

  const categoryResolved = await resolveExpenseCategoryFromBill(
    client,
    tenantId,
    p.type,
    p.bill_id,
    p.category_id
  );

  await assertExpenseProjectCashAvailable(client, tenantId, {
    type: p.type,
    amount: Number.isFinite(p.amount) ? p.amount : 0,
    date: p.date,
    account_id: p.account_id,
    project_id: p.project_id,
    bill_id: p.bill_id,
    exclude_transaction_id: id,
  });

  const fieldVals = [
    p.type,
    p.subtype ?? null,
    Number.isFinite(p.amount) ? p.amount : 0,
    p.date,
    p.description ?? null,
    p.reference ?? null,
    p.account_id,
    p.from_account_id ?? null,
    p.to_account_id ?? null,
    categoryResolved ?? null,
    p.contact_id ?? null,
    p.vendor_id ?? null,
    p.project_id ?? null,
    p.building_id ?? null,
    p.property_id ?? null,
    p.unit_id ?? null,
    p.invoice_id ?? null,
    p.bill_id ?? null,
    p.payslip_id ?? null,
    p.contract_id ?? null,
    p.agreement_id ?? null,
    p.batch_id ?? null,
    p.project_asset_id ?? null,
    p.owner_id ?? null,
    p.is_system,
  ];

  if (expectedVersion !== undefined) {
    const u = await client.query<TransactionRow>(
      `UPDATE transactions SET
         type = $3, subtype = $4, amount = $5, date = $6::date, description = $7, reference = $8,
         account_id = $9, from_account_id = $10, to_account_id = $11, category_id = $12, contact_id = $13, vendor_id = $14,
         project_id = $15, building_id = $16, property_id = $17, unit_id = $18, invoice_id = $19, bill_id = $20, payslip_id = $21,
         contract_id = $22, agreement_id = $23, batch_id = $24, project_asset_id = $25, owner_id = $26, is_system = $27,
         version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL AND version = $28
       RETURNING id, tenant_id, user_id, type, subtype, amount, date, description, reference, account_id, from_account_id, to_account_id,
                 category_id, contact_id, vendor_id, project_id, building_id, property_id, unit_id, invoice_id, bill_id, payslip_id,
                 contract_id, agreement_id, batch_id, project_asset_id, owner_id, is_system, version, deleted_at, created_at, updated_at`,
      [id, tenantId, ...fieldVals, expectedVersion]
    );
    if (u.rows.length === 0) {
      const exists = await getTransactionById(client, tenantId, id);
      if (!exists) return { row: null, conflict: false, affectedInvoiceIds: [], affectedBillIds: [] };
      return { row: null, conflict: true, affectedInvoiceIds: [], affectedBillIds: [] };
    }
    const row = u.rows[0];
    await recalculateAggregatesForLinkedIds(client, tenantId, [before?.invoice_id, row.invoice_id], [before?.bill_id, row.bill_id]);
    const affectedInvoiceIds = [...new Set([before?.invoice_id, row.invoice_id].filter(Boolean))] as string[];
    const affectedBillIds = [...new Set([before?.bill_id, row.bill_id].filter(Boolean))] as string[];
    return { row, conflict: false, affectedInvoiceIds, affectedBillIds };
  }

  const u = await client.query<TransactionRow>(
    `UPDATE transactions SET
       type = $3, subtype = $4, amount = $5, date = $6::date, description = $7, reference = $8,
       account_id = $9, from_account_id = $10, to_account_id = $11, category_id = $12, contact_id = $13, vendor_id = $14,
       project_id = $15, building_id = $16, property_id = $17, unit_id = $18, invoice_id = $19, bill_id = $20, payslip_id = $21,
       contract_id = $22, agreement_id = $23, batch_id = $24, project_asset_id = $25, owner_id = $26, is_system = $27,
       version = version + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     RETURNING id, tenant_id, user_id, type, subtype, amount, date, description, reference, account_id, from_account_id, to_account_id,
               category_id, contact_id, vendor_id, project_id, building_id, property_id, unit_id, invoice_id, bill_id, payslip_id,
               contract_id, agreement_id, batch_id, project_asset_id, owner_id, is_system, version, deleted_at, created_at, updated_at`,
    [id, tenantId, ...fieldVals]
  );
  const row = u.rows[0] ?? null;
  if (!row) {
    return { row: null, conflict: false, affectedInvoiceIds: [], affectedBillIds: [] };
  }
  await recalculateAggregatesForLinkedIds(client, tenantId, [before?.invoice_id, row.invoice_id], [before?.bill_id, row.bill_id]);
  const affectedInvoiceIds = [...new Set([before?.invoice_id, row.invoice_id].filter(Boolean))] as string[];
  const affectedBillIds = [...new Set([before?.bill_id, row.bill_id].filter(Boolean))] as string[];
  return { row, conflict: false, affectedInvoiceIds, affectedBillIds };
}

export async function upsertTransaction(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>,
  actorUserId: string | null
): Promise<{
  row: TransactionRow;
  conflict: boolean;
  wasInsert: boolean;
  affectedInvoiceIds: string[];
  affectedBillIds: string[];
}> {
  const p = pickBody(body);
  if (!p.type) throw new Error('type is required.');
  if (!p.account_id) throw new Error('accountId is required.');

  const id =
    typeof body.id === 'string' && body.id.trim() ? body.id.trim() : `tx_${randomUUID().replace(/-/g, '')}`;

  const existing = await getTransactionByIdIncludingDeleted(client, tenantId, id);
  if (!existing) {
    const row = await createTransaction(client, tenantId, { ...body, id }, actorUserId);
    return {
      row,
      conflict: false,
      wasInsert: true,
      affectedInvoiceIds: row.invoice_id ? [row.invoice_id] : [],
      affectedBillIds: row.bill_id ? [row.bill_id] : [],
    };
  }

  const expectedVersion = p.version;
  if (expectedVersion !== undefined && existing.version !== expectedVersion) {
    return {
      row: existing,
      conflict: true,
      wasInsert: false,
      affectedInvoiceIds: [],
      affectedBillIds: [],
    };
  }

  const categoryResolvedUpsert = await resolveExpenseCategoryFromBill(
    client,
    tenantId,
    p.type,
    p.bill_id,
    p.category_id
  );

  await assertExpenseProjectCashAvailable(client, tenantId, {
    type: p.type,
    amount: Number.isFinite(p.amount) ? p.amount : 0,
    date: p.date,
    account_id: p.account_id,
    project_id: p.project_id,
    bill_id: p.bill_id,
    exclude_transaction_id: id,
  });

  const fieldVals = [
    p.type,
    p.subtype ?? null,
    Number.isFinite(p.amount) ? p.amount : 0,
    p.date,
    p.description ?? null,
    p.reference ?? null,
    p.account_id,
    p.from_account_id ?? null,
    p.to_account_id ?? null,
    categoryResolvedUpsert ?? null,
    p.contact_id ?? null,
    p.vendor_id ?? null,
    p.project_id ?? null,
    p.building_id ?? null,
    p.property_id ?? null,
    p.unit_id ?? null,
    p.invoice_id ?? null,
    p.bill_id ?? null,
    p.payslip_id ?? null,
    p.contract_id ?? null,
    p.agreement_id ?? null,
    p.batch_id ?? null,
    p.project_asset_id ?? null,
    p.owner_id ?? null,
    p.is_system,
  ];

  const u = await client.query<TransactionRow>(
    `UPDATE transactions SET
       type = $3, subtype = $4, amount = $5, date = $6::date, description = $7, reference = $8,
       account_id = $9, from_account_id = $10, to_account_id = $11, category_id = $12, contact_id = $13, vendor_id = $14,
       project_id = $15, building_id = $16, property_id = $17, unit_id = $18, invoice_id = $19, bill_id = $20, payslip_id = $21,
       contract_id = $22, agreement_id = $23, batch_id = $24, project_asset_id = $25, owner_id = $26, is_system = $27,
       user_id = COALESCE($28, user_id),
       deleted_at = NULL, version = version + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2
     RETURNING id, tenant_id, user_id, type, subtype, amount, date, description, reference, account_id, from_account_id, to_account_id,
               category_id, contact_id, vendor_id, project_id, building_id, property_id, unit_id, invoice_id, bill_id, payslip_id,
               contract_id, agreement_id, batch_id, project_asset_id, owner_id, is_system, version, deleted_at, created_at, updated_at`,
    [id, tenantId, ...fieldVals, p.user_id && String(p.user_id).trim() ? String(p.user_id).trim() : actorUserId]
  );
  const row = u.rows[0];
  if (!row) throw new Error('Transaction upsert failed.');
  await recalculateAggregatesForLinkedIds(client, tenantId, [existing.invoice_id, row.invoice_id], [existing.bill_id, row.bill_id]);
  const affectedInvoiceIds = [...new Set([existing.invoice_id, row.invoice_id].filter(Boolean))] as string[];
  const affectedBillIds = [...new Set([existing.bill_id, row.bill_id].filter(Boolean))] as string[];
  return { row, conflict: false, wasInsert: false, affectedInvoiceIds, affectedBillIds };
}

export async function softDeleteTransaction(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  expectedVersion?: number
): Promise<{
  ok: boolean;
  conflict: boolean;
  recalculatedInvoiceId?: string | null;
  recalculatedBillId?: string | null;
}> {
  const row = await getTransactionById(client, tenantId, id);
  if (!row) return { ok: false, conflict: false };

  const invoiceId = row.invoice_id;
  const billId = row.bill_id;

  if (expectedVersion !== undefined) {
    const r = await client.query(
      `UPDATE transactions SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL AND version = $3`,
      [id, tenantId, expectedVersion]
    );
    if (r.rowCount === 0) {
      const ex = await getTransactionById(client, tenantId, id);
      if (!ex) return { ok: false, conflict: false };
      return { ok: false, conflict: true };
    }
  } else {
    const r = await client.query(
      `UPDATE transactions SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, tenantId]
    );
    if ((r.rowCount ?? 0) === 0) return { ok: false, conflict: false };
  }

  let recalculatedInvoiceId: string | null = null;
  let recalculatedBillId: string | null = null;
  if (invoiceId) {
    await recalculateInvoicePaymentAggregates(client, tenantId, invoiceId);
    recalculatedInvoiceId = invoiceId;
  }
  if (billId) {
    await recalculateBillPaymentAggregates(client, tenantId, billId);
    recalculatedBillId = billId;
  }

  return { ok: true, conflict: false, recalculatedInvoiceId, recalculatedBillId };
}

export async function listTransactionsChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<TransactionRow[]> {
  const r = await client.query<TransactionRow>(
    `${SELECT_ROW} FROM transactions t
     WHERE t.tenant_id = $1 AND t.updated_at > $2
     ORDER BY t.updated_at ASC`,
    [tenantId, since]
  );
  return r.rows;
}
