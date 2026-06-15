import type pg from 'pg';
import { randomUUID } from 'crypto';
import { formatPgDateToYyyyMmDd, parseApiDateToYyyyMmDd } from '../../../utils/dateOnly.js';
import { recalculateBillPaymentAggregates } from '../../vendors/services/billsService.js';
import { recalculateInvoicePaymentAggregates } from '../../customers/services/invoicesService.js';
import {
  assertExpenseProjectCashAvailable,
  type ExpenseCashValidationBatchContext,
  type ProjectCashTxRow,
} from '../../../financial/expenseCashValidation.js';
import { syncOwnerSummariesForTransactionChange } from '../../leases/services/ownerRentalSummaryService.js';
import {
  isVendorSettlementCashMirrorReference,
} from '../../../constants/vendorSettlement.js';
import {
  reverseTransactionJournalMirror,
  syncTransactionJournalMirror,
} from './transactionJournalPostingService.js';
import { assertAccountingPeriodOpen } from './accountingPeriodService.js';
import { recordDomainMutation } from '../../../core/recordDomainMutation.js';
import { checkEntityLwwConflict } from '../../../core/entityMutation.js';
import { TransactionRepository, type TransactionWriteFields } from '../repositories/TransactionRepository.js';
import { PayslipRepository } from '../../payroll/repositories/PayslipRepository.js';
import { BillRepository } from '../../vendors/repositories/BillRepository.js';
import { InvoiceRepository } from '../../customers/repositories/InvoiceRepository.js';
import { PropertyRepository } from '../../properties/repositories/PropertyRepository.js';
import { RentalAgreementRepository } from '../../leases/repositories/RentalAgreementRepository.js';

/**
 * Recompute payslip paid_amount, is_paid, paid_at, transaction_id from non-deleted ledger rows
 * (mirrors client syncPayslipPaidFromTransactions). Then refreshes payroll run aggregates.
 */
export async function recalculatePayslipPaymentFromLedger(
  client: pg.PoolClient,
  tenantId: string,
  payslipId: string,
  options?: { skipPayrollRunAggregate?: boolean }
): Promise<void> {
  const payslipRepo = new PayslipRepository(tenantId);
  const ps = await payslipRepo.getLedgerRecalcContext(client, payslipId);
  if (!ps) return;

  const txRepo = new TransactionRepository(tenantId);
  const { sum: rawPaidSum, lastDate, cnt } = await txRepo.aggregatePaymentsForPayslip(client, payslipId);
  const net = Number(ps.net_pay);
  const totalPaidTowardNet = Math.min(net, rawPaidSum);
  const isPaid = rawPaidSum >= net - 0.01;

  const singleTxId = cnt === 1 ? await txRepo.getSingleActiveIdForPayslip(client, payslipId) : null;

  const paidAt =
    rawPaidSum > 0 && lastDate
      ? new Date(formatPgDateToYyyyMmDd(lastDate) + 'T12:00:00.000Z')
      : null;

  await payslipRepo.updatePaymentFromLedger(client, payslipId, {
    isPaid,
    paidAmount: totalPaidTowardNet,
    transactionId: singleTxId,
    paidAt,
  });

  const { recalculatePayrollRunAggregates } = await import('../../../services/payrollService.js');
  if (!options?.skipPayrollRunAggregate) {
    await recalculatePayrollRunAggregates(client, tenantId, ps.payroll_run_id);
  }

  const { syncPayrollLedgerForEmployee } = await import('../../../services/payrollLedgerService.js');
  await syncPayrollLedgerForEmployee(client, tenantId, ps.employee_id);
}

/** Keep invoice/bill paid_amount + status aligned with ledger (also when client saveInvoice fails, e.g. LOCK_HELD). */
async function recalculateAggregatesForLinkedIds(
  client: pg.PoolClient,
  tenantId: string,
  invoiceIds: (string | null | undefined)[],
  billIds: (string | null | undefined)[],
  payslipIds: (string | null | undefined)[] = []
): Promise<void> {
  const inv = [...new Set(invoiceIds.filter((x): x is string => !!x && String(x).trim() !== ''))];
  const bills = [...new Set(billIds.filter((x): x is string => !!x && String(x).trim() !== ''))];
  const slips = [...new Set(payslipIds.filter((x): x is string => !!x && String(x).trim() !== ''))];
  await Promise.all([
    ...inv.map((id) => recalculateInvoicePaymentAggregates(client, tenantId, id)),
    ...bills.map((id) => recalculateBillPaymentAggregates(client, tenantId, id)),
    ...slips.map((id) => recalculatePayslipPaymentFromLedger(client, tenantId, id)),
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
  ownerId?: string;
  propertyId?: string;
  /** Only rows linked to invoices with rental module types (Rental, Security Deposit, Service Charge). */
  rentalInvoiceOnly?: boolean;
  limit?: number;
  offset?: number;
  /** Keyset: next page after (cursorDate, cursorId); use with descending date,id order. */
  cursorDate?: string;
  cursorId?: string;
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
  const bill = await new BillRepository(tenantId).getById(client, billId);
  const fromBill = bill?.category_id;
  return fromBill != null && String(fromBill).trim() !== '' ? fromBill : incomingCategory;
}

/**
 * When owner_id is not provided but property_id is, resolve the owner.
 *
 * 1. Invoice-linked: rental_agreement.owner_id when set on the invoice's agreement.
 * 2. properties.owner_id fallback.
 *
 * Co-ownership (property_ownership) was removed; historical segment-based attribution no longer applies.
 */
async function resolveOwnerIdFromProperty(
  client: pg.PoolClient,
  tenantId: string,
  propertyId: string | null | undefined,
  ownerId: string | null | undefined,
  _txDate: string,
  invoiceId?: string | null
): Promise<string | null | undefined> {
  if (ownerId != null && String(ownerId).trim() !== '') return ownerId;
  if (!propertyId || String(propertyId).trim() === '') return ownerId;

  if (invoiceId && String(invoiceId).trim() !== '') {
    const inv = await new InvoiceRepository(tenantId).getById(client, invoiceId);
    if (inv?.agreement_id) {
      const ownerFromAgreement = await new RentalAgreementRepository(tenantId).getOwnerIdById(
        client,
        inv.agreement_id
      );
      if (ownerFromAgreement) return ownerFromAgreement;
    }
  }

  const property = await new PropertyRepository(tenantId).getById(client, propertyId);
  return property?.owner_id ?? ownerId;
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

function transactionWriteFields(
  p: ReturnType<typeof pickBody>,
  categoryId: string | null | undefined,
  ownerId: string | null | undefined
): TransactionWriteFields {
  return {
    type: p.type,
    subtype: p.subtype ?? null,
    amount: Number.isFinite(p.amount) ? p.amount : 0,
    date: p.date,
    description: p.description ?? null,
    reference: p.reference ?? null,
    account_id: p.account_id,
    from_account_id: p.from_account_id ?? null,
    to_account_id: p.to_account_id ?? null,
    category_id: categoryId ?? null,
    contact_id: p.contact_id ?? null,
    vendor_id: p.vendor_id ?? null,
    project_id: p.project_id ?? null,
    building_id: p.building_id ?? null,
    property_id: p.property_id ?? null,
    unit_id: p.unit_id ?? null,
    invoice_id: p.invoice_id ?? null,
    bill_id: p.bill_id ?? null,
    payslip_id: p.payslip_id ?? null,
    contract_id: p.contract_id ?? null,
    agreement_id: p.agreement_id ?? null,
    batch_id: p.batch_id ?? null,
    project_asset_id: p.project_asset_id ?? null,
    owner_id: ownerId ?? null,
    is_system: p.is_system,
  };
}

export async function listTransactions(
  client: pg.PoolClient,
  tenantId: string,
  filters: ListTransactionFilters = {}
): Promise<TransactionRow[]> {
  return new TransactionRepository(tenantId).list(client, filters);
}

export async function getTransactionById(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<TransactionRow | null> {
  return new TransactionRepository(tenantId).getById(client, id);
}

export async function getTransactionByIdIncludingDeleted(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<TransactionRow | null> {
  return new TransactionRepository(tenantId).getByIdIncludingDeleted(client, id);
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

export type CreateTransactionOptions = {
  expenseCashBatchCtx?: ExpenseCashValidationBatchContext | null;
  /** Skip GL mirror when journal already exists (investor flows, vendor settlement cash leg). */
  skipJournalMirror?: boolean;
};

export async function createTransaction(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>,
  actorUserId: string | null,
  options?: CreateTransactionOptions | null
): Promise<TransactionRow> {
  const expenseCashBatchCtx = options?.expenseCashBatchCtx ?? null;
  const skipJournalMirror = options?.skipJournalMirror === true;
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

  const ownerIdResolved = await resolveOwnerIdFromProperty(client, tenantId, p.property_id, p.owner_id, p.date, p.invoice_id);

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
      payslip_id: p.payslip_id,
    },
    expenseCashBatchCtx ?? undefined
  );

  await assertAccountingPeriodOpen(client, tenantId, p.date);

  const row = await new TransactionRepository(tenantId).insertTransaction(
    client,
    id,
    transactionWriteFields(p, categoryResolved, ownerIdResolved),
    p.user_id && String(p.user_id).trim() ? String(p.user_id).trim() : actorUserId
  );
  if (expenseCashBatchCtx && row.project_id && row.type === 'Expense') {
    expenseCashBatchCtx.recordInsertedTransaction(rowToProjectCashTxRow(row));
  }
  await recalculateAggregatesForLinkedIds(client, tenantId, [row.invoice_id], [row.bill_id], [row.payslip_id]);
  await syncOwnerSummariesForTransactionChange(client, tenantId, null, row);
  if (!skipJournalMirror) {
    await syncTransactionJournalMirror(client, tenantId, row, actorUserId);
  }
  await recordDomainMutation(client, {
    tenantId,
    userId: actorUserId,
    module: 'transactions',
    entityType: 'transaction',
    entityId: row.id,
    action: 'create',
    summary: `${row.type} transaction posted (${row.amount})`,
    newValue: {
      id: row.id,
      type: row.type,
      amount: row.amount,
      date: formatPgDateToYyyyMmDd(row.date as Date | string),
      accountId: row.account_id,
    },
    version: row.version,
  });
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

  if (before && isVendorSettlementCashMirrorReference(before.reference)) {
    const amtBefore = Number(before.amount);
    const amtAfter = Number.isFinite(p.amount) ? p.amount : 0;
    if (Math.abs(amtBefore - amtAfter) > 0.005) {
      throw new Error(
        'This payment mirrors a supplier prepaid settlement journal. To change the amount, use Reverse settlement on the bill payment, then record the payment again.'
      );
    }
    if (String(before.account_id) !== String(p.account_id)) {
      throw new Error(
        'This payment mirrors a supplier prepaid settlement journal. To change the bank/cash account, use Reverse settlement, then pay again.'
      );
    }
    const d0 = formatPgDateToYyyyMmDd(before.date as Date | string);
    if (d0 !== p.date) {
      throw new Error(
        'This payment mirrors a supplier prepaid settlement journal. To change the date, use Reverse settlement, then pay again.'
      );
    }
    const prevRef = String(before.reference ?? '').trim();
    const nextRef = String(p.reference ?? '').trim();
    if (prevRef !== nextRef) {
      throw new Error('Cannot change settlement link reference.');
    }
  }

  const categoryResolved = await resolveExpenseCategoryFromBill(
    client,
    tenantId,
    p.type,
    p.bill_id,
    p.category_id
  );

  const ownerIdResolvedUpdate = await resolveOwnerIdFromProperty(
    client,
    tenantId,
    p.property_id,
    p.owner_id,
    p.date,
    p.invoice_id
  );

  await assertAccountingPeriodOpen(client, tenantId, p.date);
  if (before?.date) {
    const prevDate = formatPgDateToYyyyMmDd(before.date as Date | string);
    if (prevDate !== p.date) {
      await assertAccountingPeriodOpen(client, tenantId, prevDate);
    }
  }

  await assertExpenseProjectCashAvailable(client, tenantId, {
    type: p.type,
    amount: Number.isFinite(p.amount) ? p.amount : 0,
    date: p.date,
    account_id: p.account_id,
    project_id: p.project_id,
    bill_id: p.bill_id,
    payslip_id: p.payslip_id,
    exclude_transaction_id: id,
  });

  const fieldVals = transactionWriteFields(p, categoryResolved, ownerIdResolvedUpdate);

  if (expectedVersion !== undefined) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'transactions',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) {
      return { row: null, conflict: true, affectedInvoiceIds: [], affectedBillIds: [] };
    }
  }

  const locked = await new TransactionRepository(tenantId).getByIdForUpdate(client, id);
  if (!locked) {
    return { row: null, conflict: false, affectedInvoiceIds: [], affectedBillIds: [] };
  }

  const row = await new TransactionRepository(tenantId).updateActive(client, id, fieldVals);
  if (!row) {
    return { row: null, conflict: false, affectedInvoiceIds: [], affectedBillIds: [] };
  }
  await recalculateAggregatesForLinkedIds(client, tenantId, [before?.invoice_id, row.invoice_id], [before?.bill_id, row.bill_id], [
    before?.payslip_id,
    row.payslip_id,
  ]);
  await syncOwnerSummariesForTransactionChange(client, tenantId, before, row);
  if (!isVendorSettlementCashMirrorReference(row.reference)) {
    await syncTransactionJournalMirror(client, tenantId, row, row.user_id);
  }
  const affectedInvoiceIds = [...new Set([before?.invoice_id, row.invoice_id].filter(Boolean))] as string[];
  const affectedBillIds = [...new Set([before?.bill_id, row.bill_id].filter(Boolean))] as string[];
  await recordDomainMutation(client, {
    tenantId,
    userId: row.user_id,
    module: 'transactions',
    entityType: 'transaction',
    entityId: row.id,
    action: 'update',
    auditAction: 'edit',
    summary: `${row.type} transaction updated (${row.amount})`,
    oldValue: before ? { id: before.id, type: before.type, amount: before.amount } : null,
    newValue: { id: row.id, type: row.type, amount: row.amount },
    version: row.version,
  });
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
  if (expectedVersion !== undefined) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'transactions',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) {
      return {
        row: existing,
        conflict: true,
        wasInsert: false,
        affectedInvoiceIds: [],
        affectedBillIds: [],
      };
    }
  }

  const locked = await new TransactionRepository(tenantId).lockByIdIncludingDeletedForUpdate(client, id);
  if (!locked) {
    return {
      row: existing,
      conflict: false,
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

  const ownerIdResolvedUpsert = await resolveOwnerIdFromProperty(client, tenantId, p.property_id, p.owner_id, p.date, p.invoice_id);

  await assertExpenseProjectCashAvailable(client, tenantId, {
    type: p.type,
    amount: Number.isFinite(p.amount) ? p.amount : 0,
    date: p.date,
    account_id: p.account_id,
    project_id: p.project_id,
    bill_id: p.bill_id,
    payslip_id: p.payslip_id,
    exclude_transaction_id: id,
  });

  const upsertFields = transactionWriteFields(p, categoryResolvedUpsert, ownerIdResolvedUpsert);

  const row = await new TransactionRepository(tenantId).updateActive(client, id, upsertFields, {
    userId: p.user_id && String(p.user_id).trim() ? String(p.user_id).trim() : actorUserId,
    restoreDeleted: true,
  });
  if (!row) throw new Error('Transaction upsert failed.');
  await recalculateAggregatesForLinkedIds(client, tenantId, [existing.invoice_id, row.invoice_id], [existing.bill_id, row.bill_id], [
    existing.payslip_id,
    row.payslip_id,
  ]);
  if (existing.deleted_at) {
    await syncOwnerSummariesForTransactionChange(client, tenantId, null, row);
  } else {
    await syncOwnerSummariesForTransactionChange(client, tenantId, existing, row);
  }
  if (!isVendorSettlementCashMirrorReference(row.reference)) {
    await syncTransactionJournalMirror(client, tenantId, row, actorUserId);
  }
  const affectedInvoiceIds = [...new Set([existing.invoice_id, row.invoice_id].filter(Boolean))] as string[];
  const affectedBillIds = [...new Set([existing.bill_id, row.bill_id].filter(Boolean))] as string[];
  await recordDomainMutation(client, {
    tenantId,
    userId: row.user_id,
    module: 'transactions',
    entityType: 'transaction',
    entityId: row.id,
    action: existing.deleted_at ? 'create' : 'update',
    auditAction: existing.deleted_at ? undefined : 'edit',
    summary: existing.deleted_at
      ? `${row.type} transaction restored (${row.amount})`
      : `${row.type} transaction updated (${row.amount})`,
    oldValue: existing.deleted_at
      ? null
      : { id: existing.id, type: existing.type, amount: existing.amount },
    newValue: { id: row.id, type: row.type, amount: row.amount },
    version: row.version,
  });
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

  if (isVendorSettlementCashMirrorReference(row.reference)) {
    throw new Error(
      'This expense mirrors the bank/cash leg of a supplier prepaid settlement. Remove it with Reverse settlement from the Bills payment row so prepaid balance and journal stay aligned.'
    );
  }

  const invoiceId = row.invoice_id;
  const billId = row.bill_id;
  const payslipId = row.payslip_id;

  await syncOwnerSummariesForTransactionChange(client, tenantId, row, null);

  if (expectedVersion !== undefined) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'transactions',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { ok: false, conflict: true };
  }

  const locked = await new TransactionRepository(tenantId).getByIdForUpdate(client, id);
  if (!locked) return { ok: false, conflict: false };

  const txRepo = new TransactionRepository(tenantId);
  const deleted = await txRepo.markDeleted(client, id);
  if (!deleted) return { ok: false, conflict: false };

  await reverseTransactionJournalMirror(client, tenantId, id, row.user_id);

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
  if (payslipId) {
    await recalculatePayslipPaymentFromLedger(client, tenantId, payslipId);
  }

  const after = await getTransactionByIdIncludingDeleted(client, tenantId, id);
  await recordDomainMutation(client, {
    tenantId,
    userId: row.user_id,
    module: 'transactions',
    entityType: 'transaction',
    entityId: row.id,
    action: 'delete',
    summary: `${row.type} transaction deleted (${row.amount})`,
    oldValue: rowToTransactionApi(row),
    newValue: after ? rowToTransactionApi(after) : undefined,
    version: after?.version ?? row.version + 1,
  });

  return { ok: true, conflict: false, recalculatedInvoiceId, recalculatedBillId };
}

export async function listTransactionsChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<TransactionRow[]> {
  return new TransactionRepository(tenantId).listChangedSince(client, since);
}
