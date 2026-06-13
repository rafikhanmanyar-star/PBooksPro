import type pg from 'pg';
import { randomUUID } from 'crypto';
import { formatPgDateToYyyyMmDd, parseApiDateToYyyyMmDd, parseApiDateToYyyyMmDdOptional } from '../utils/dateOnly.js';
import { enforceLockForSave } from './recordLocksService.js';
import { syncBillJournalMirror, reverseBillJournalMirror } from './billJournalPostingService.js';
import { recordDomainMutation } from '../core/recordDomainMutation.js';
import { checkEntityLwwConflict } from '../core/entityMutation.js';
import { BillRepository, type BillWriteFields } from '../modules/vendors/repositories/BillRepository.js';
import { ContractRepository } from '../modules/vendors/repositories/ContractRepository.js';
import { validateContractBillAmount } from '../contractBilling/contractBillingCore.js';

export type BillRow = {
  id: string;
  tenant_id: string;
  bill_number: string;
  contact_id: string | null;
  vendor_id: string | null;
  amount: string;
  paid_amount: string;
  status: string;
  issue_date: Date;
  due_date: Date | null;
  description: string | null;
  category_id: string | null;
  project_id: string | null;
  building_id: string | null;
  property_id: string | null;
  project_agreement_id: string | null;
  contract_id: string | null;
  staff_id: string | null;
  expense_bearer_type: string | null;
  expense_category_items: string | null;
  document_path: string | null;
  document_id: string | null;
  user_id: string | null;
  version: number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

function parseDate(label: string, v: unknown): string {
  if (v == null || v === '') throw new Error(`${label} is required.`);
  try {
    return parseApiDateToYyyyMmDd(v);
  } catch {
    throw new Error(`Invalid ${label}.`);
  }
}

function optDate(v: unknown): string | null {
  return parseApiDateToYyyyMmDdOptional(v);
}

function expenseItemsToDb(body: Record<string, unknown>): string | null {
  const raw = body.expenseCategoryItems ?? body.expense_category_items;
  if (raw == null) return null;
  if (typeof raw === 'string') return raw.trim() || null;
  try {
    return JSON.stringify(raw);
  } catch {
    return null;
  }
}

/** For mirrored expense transactions when header category_id is null but line items exist (PostgreSQL bills). */
export function resolveBillRowCategoryIdForExpenseMirror(bill: BillRow): string | undefined {
  const h = bill.category_id?.trim();
  if (h) return h;
  const raw = bill.expense_category_items;
  if (!raw?.trim()) return undefined;
  try {
    const items = JSON.parse(raw) as Array<{
      categoryId?: string;
      category_id?: string;
      netValue?: number;
      net_value?: number;
    }>;
    if (!Array.isArray(items)) return undefined;
    let bestId = '';
    let bestNv = -1;
    for (const it of items) {
      const id = String(it.categoryId ?? it.category_id ?? '').trim();
      if (!id) continue;
      const nv = Number(it.netValue ?? it.net_value ?? 0);
      if (!Number.isFinite(nv)) continue;
      if (nv > bestNv) {
        bestNv = nv;
        bestId = id;
      }
    }
    return bestId || undefined;
  } catch {
    return undefined;
  }
}

export function rowToBillApi(row: BillRow): Record<string, unknown> {
  let expenseCategoryItems: unknown = undefined;
  if (row.expense_category_items?.trim()) {
    try {
      expenseCategoryItems = JSON.parse(row.expense_category_items);
    } catch {
      expenseCategoryItems = undefined;
    }
  }
  const base: Record<string, unknown> = {
    id: row.id,
    billNumber: row.bill_number,
    contactId: row.contact_id ?? undefined,
    vendorId: row.vendor_id ?? undefined,
    amount: Number(row.amount),
    paidAmount: Number(row.paid_amount),
    status: row.status,
    issueDate: formatPgDateToYyyyMmDd(row.issue_date),
    dueDate: row.due_date ? formatPgDateToYyyyMmDd(row.due_date) : undefined,
    description: row.description ?? undefined,
    categoryId: row.category_id ?? undefined,
    projectId: row.project_id ?? undefined,
    buildingId: row.building_id ?? undefined,
    propertyId: row.property_id ?? undefined,
    projectAgreementId: row.project_agreement_id ?? undefined,
    contractId: row.contract_id ?? undefined,
    staffId: row.staff_id ?? undefined,
    expenseBearerType: row.expense_bearer_type ?? undefined,
    expenseCategoryItems,
    documentPath: row.document_path ?? undefined,
    documentId: row.document_id ?? undefined,
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

function pickBody(body: Record<string, unknown>) {
  const issueDate = parseDate('issueDate', body.issueDate ?? body.issue_date);
  const dueRaw = body.dueDate ?? body.due_date;
  const dueDate = dueRaw != null && dueRaw !== '' ? parseDate('dueDate', dueRaw) : null;

  const cid = body.contactId ?? body.contact_id;
  const vid = body.vendorId ?? body.vendor_id;

  return {
    bill_number: String(body.billNumber ?? body.bill_number ?? '').trim(),
    contact_id: cid != null && String(cid).trim() ? String(cid).trim() : null,
    vendor_id: vid != null && String(vid).trim() ? String(vid).trim() : null,
    amount: Number(body.amount ?? 0),
    paid_amount: body.paidAmount != null || body.paid_amount != null ? Number(body.paidAmount ?? body.paid_amount) : 0,
    status: String(body.status ?? 'Unpaid'),
    issue_date: issueDate,
    due_date: dueDate,
    description:
      body.description === undefined ? undefined : body.description === null ? null : String(body.description),
    category_id: (body.categoryId ?? body.category_id) as string | null | undefined,
    project_id: (body.projectId ?? body.project_id) as string | null | undefined,
    building_id: (body.buildingId ?? body.building_id) as string | null | undefined,
    property_id: (body.propertyId ?? body.property_id) as string | null | undefined,
    project_agreement_id: (body.projectAgreementId ?? body.project_agreement_id) as string | null | undefined,
    contract_id: (body.contractId ?? body.contract_id) as string | null | undefined,
    staff_id: (body.staffId ?? body.staff_id) as string | null | undefined,
    expense_bearer_type: (body.expenseBearerType ?? body.expense_bearer_type) as string | null | undefined,
    expense_category_items: expenseItemsToDb(body),
    document_path: (body.documentPath ?? body.document_path) as string | null | undefined,
    document_id: (body.documentId ?? body.document_id) as string | null | undefined,
    user_id: (body.userId ?? body.user_id) as string | null | undefined,
    version: typeof body.version === 'number' ? body.version : undefined,
  };
}

function trimOptId(v: string | null | undefined): string | null {
  return v != null && String(v).trim() ? String(v).trim() : null;
}

function billWriteFieldsFromPick(p: ReturnType<typeof pickBody>): BillWriteFields {
  return {
    bill_number: p.bill_number,
    contact_id: p.contact_id,
    vendor_id: p.vendor_id,
    amount: p.amount,
    paid_amount: p.paid_amount,
    status: p.status,
    issue_date: p.issue_date,
    due_date: p.due_date,
    description: p.description ?? null,
    category_id: trimOptId(p.category_id),
    project_id: trimOptId(p.project_id),
    building_id: trimOptId(p.building_id),
    property_id: trimOptId(p.property_id),
    project_agreement_id: trimOptId(p.project_agreement_id),
    contract_id: trimOptId(p.contract_id),
    staff_id: trimOptId(p.staff_id),
    expense_bearer_type: trimOptId(p.expense_bearer_type),
    expense_category_items: p.expense_category_items,
    document_path: trimOptId(p.document_path),
    document_id: trimOptId(p.document_id),
  };
}

export async function listBills(
  client: pg.PoolClient,
  tenantId: string,
  filters?: { status?: string; projectId?: string; propertyId?: string }
): Promise<BillRow[]> {
  return new BillRepository(tenantId).list(client, filters);
}

export async function getBillById(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<BillRow | null> {
  return new BillRepository(tenantId).getById(client, id);
}

export async function getBillByIdIncludingDeleted(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<BillRow | null> {
  return new BillRepository(tenantId).getByIdIncludingDeleted(client, id);
}

/** Server-authoritative paid_amount/status from payment transactions and advance clearings. */
async function finalizeBillSaveFromLedger(
  client: pg.PoolClient,
  tenantId: string,
  billId: string,
  opts?: { action?: 'create' | 'update'; actorUserId?: string | null }
): Promise<BillRow> {
  await recalculateBillPaymentAggregates(client, tenantId, billId);
  const row = await getBillById(client, tenantId, billId);
  if (!row) throw new Error('Bill not found after save.');
  await syncBillJournalMirror(client, tenantId, row, row.user_id);
  const action = opts?.action ?? 'update';
  await recordDomainMutation(client, {
    tenantId,
    userId: opts?.actorUserId ?? row.user_id,
    module: 'bills',
    entityType: 'bill',
    entityId: row.id,
    action,
    summary: action === 'create' ? `Bill ${row.bill_number} created` : `Bill ${row.bill_number} updated`,
    newValue: rowToBillApi(row),
    version: row.version,
  });
  return row;
}

/** Unique index is on (tenant_id, bill_number) for all rows; used to reconcile POST upserts when client id drifts. */
export async function getBillByTenantAndBillNumberIncludingDeleted(
  client: pg.PoolClient,
  tenantId: string,
  billNumber: string
): Promise<BillRow | null> {
  return new BillRepository(tenantId).getByTenantAndBillNumberIncludingDeleted(client, billNumber);
}

function isDuplicateBillNumberConstraint(e: unknown): boolean {
  const msg =
    e && typeof e === 'object' && 'message' in e && typeof (e as { message?: string }).message === 'string'
      ? (e as { message: string }).message
      : e instanceof Error
        ? e.message
        : String(e);
  const lower = msg.toLowerCase();
  const code =
    e && typeof e === 'object' && 'code' in e ? String((e as { code?: string }).code ?? '') : '';
  const constraint =
    e && typeof e === 'object' && 'constraint' in e
      ? String((e as { constraint?: string }).constraint ?? '')
      : '';
  if (constraint === 'bills_tenant_id_bill_number_key') return true;
  if (lower.includes('bills_tenant_id_bill_number')) return true;
  return (
    code === '23505' &&
    (lower.includes('bill_number') || lower.includes('(tenant_id, bill_number)')) &&
    (lower.includes('unique constraint') || lower.includes('duplicate key'))
  );
}

async function assertContractBillWithinLimit(
  client: pg.PoolClient,
  tenantId: string,
  contractId: string | null | undefined,
  billAmount: number,
  excludeBillId?: string
): Promise<void> {
  const cid = contractId?.trim();
  if (!cid) return;

  const contract = await new ContractRepository(tenantId).getById(client, cid);
  if (!contract) throw new Error('Linked contract not found.');

  const alreadyBilled = await new BillRepository(tenantId).sumBilledForContract(
    client,
    cid,
    excludeBillId
  );
  const validation = validateContractBillAmount({
    contractValue: Number(contract.total_amount),
    alreadyBilled,
    billAmount,
    contractNumber: contract.contract_number,
  });
  if (validation.exceeds) {
    throw new Error(validation.message ?? 'Bill amount exceeds remaining contract value.');
  }
}

export async function createBill(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>,
  actorUserId: string | null
): Promise<BillRow> {
  const p = pickBody(body);
  if (!p.bill_number) throw new Error('billNumber is required.');
  const id =
    typeof body.id === 'string' && body.id.trim() ? body.id.trim() : `bill_${randomUUID().replace(/-/g, '')}`;

  await assertContractBillWithinLimit(client, tenantId, p.contract_id, p.amount, id);

  return new BillRepository(tenantId).insertBill(
    client,
    id,
    billWriteFieldsFromPick(p),
    p.user_id && String(p.user_id).trim() ? String(p.user_id).trim() : actorUserId
  );
}

export async function updateBill(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  body: Record<string, unknown>
): Promise<{ row: BillRow | null; conflict: boolean }> {
  const p = pickBody(body);
  if (!p.bill_number) throw new Error('billNumber is required.');
  const expectedVersion = p.version;
  const fields = billWriteFieldsFromPick(p);
  const billRepo = new BillRepository(tenantId);

  await assertContractBillWithinLimit(client, tenantId, p.contract_id, p.amount, id);

  if (expectedVersion !== undefined) {
    const u = await billRepo.updateActiveWithExpectedVersion(client, id, fields, expectedVersion);
    if (!u.row) {
      const exists = await getBillById(client, tenantId, id);
      if (!exists) return { row: null, conflict: false };
      return { row: null, conflict: u.conflict };
    }
    const finalized = await finalizeBillSaveFromLedger(client, tenantId, id);
    return { row: finalized, conflict: false };
  }

  const row = await billRepo.updateActive(client, id, fields);
  if (!row) return { row: null, conflict: false };
  const finalized = await finalizeBillSaveFromLedger(client, tenantId, id);
  return { row: finalized, conflict: false };
}

/**
 * Single-statement reconcile on UNIQUE (tenant_id, bill_number). Avoids losing races vs SELECT-then-INSERT,
 * so POST /bills never fails duplicate_key when the payload is logically an upsert of the same bill number.
 */
async function upsertBillByTenantAndBillNumber(
  client: pg.PoolClient,
  tenantId: string,
  proposeId: string,
  p: ReturnType<typeof pickBody>,
  actorUserId: string | null
): Promise<{ row: BillRow; conflict: boolean; wasInsert: boolean }> {
  const userIdResolved =
    p.user_id && String(p.user_id).trim() ? String(p.user_id).trim() : actorUserId ?? null;

  const expectedVer =
    typeof p.version === 'number' && Number.isFinite(p.version) ? Math.trunc(p.version) : null;

  const billRepo = new BillRepository(tenantId);
  const existingByNumber = await billRepo.getByTenantAndBillNumberIncludingDeleted(client, p.bill_number);

  if (existingByNumber) {
    await enforceLockForSave(client, tenantId, 'bill', existingByNumber.id, actorUserId);
    const locked = await billRepo.lockByIdIncludingDeletedForUpdate(client, existingByNumber.id);
    if (!locked) throw new Error('Bill not found for update.');
    if (expectedVer != null) {
      const lww = await checkEntityLwwConflict(client, {
        tenantId,
        table: 'bills',
        entityId: existingByNumber.id,
        clientVersion: expectedVer,
      });
      if (lww.conflict) return { row: existingByNumber, conflict: true, wasInsert: false };
    }
  }

  const u = await billRepo.upsertOnTenantBillNumber(
    client,
    proposeId,
    billWriteFieldsFromPick(p),
    userIdResolved,
    expectedVer
  );

  const row = u.row;
  if (!row) {
    const stale = await getBillByTenantAndBillNumberIncludingDeleted(client, tenantId, p.bill_number);
    if (!stale) throw new Error('Bill upsert failed: conflict on version.');
    return { row: stale, conflict: true, wasInsert: false };
  }

  const wasInsert = !existingByNumber;
  const finalized = await finalizeBillSaveFromLedger(client, tenantId, row.id, {
    action: wasInsert ? 'create' : 'update',
    actorUserId,
  });
  return { row: finalized, conflict: false, wasInsert };
}

export async function upsertBill(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>,
  actorUserId: string | null
): Promise<{ row: BillRow; conflict: boolean; wasInsert: boolean }> {
  const p = pickBody(body);
  if (!p.bill_number) throw new Error('billNumber is required.');

  const id =
    typeof body.id === 'string' && body.id.trim() ? body.id.trim() : `bill_${randomUUID().replace(/-/g, '')}`;

  const existingById = await getBillByIdIncludingDeleted(client, tenantId, id);

  await assertContractBillWithinLimit(client, tenantId, p.contract_id, p.amount, existingById?.id ?? id);

  /**
   * Legacy clients used `Date.now()` for new bill ids. That can match an unrelated existing row PK,
   * so the handler would UPDATE that row with a new `bill_number` and hit UNIQUE(tenant_id, bill_number).
   */
  const looksLikeLegacyNumericBillId = /^\d{10,15}$/.test(id);
  if (
    existingById &&
    looksLikeLegacyNumericBillId &&
    p.version === undefined &&
    existingById.bill_number.trim() !== p.bill_number.trim()
  ) {
    return upsertBillByTenantAndBillNumber(
      client,
      tenantId,
      `bill_${randomUUID().replace(/-/g, '')}`,
      p,
      actorUserId
    );
  }

  /** No PK yet in DB → merge purely on UNIQUE (tenant_id, bill_number) so duplicate_key cannot occur. */
  if (!existingById) {
    try {
      return await upsertBillByTenantAndBillNumber(client, tenantId, id, p, actorUserId);
    } catch (e) {
      /** Plain INSERT races or mismatched arbiter inference; reconcile by canonical (tenant_id, bill_number). */
      if (!isDuplicateBillNumberConstraint(e)) throw e;
      const sibling = await getBillByTenantAndBillNumberIncludingDeleted(client, tenantId, p.bill_number);
      if (!sibling) throw e instanceof Error ? e : new Error(String(e));
      return upsertBill(client, tenantId, { ...body, id: sibling.id }, actorUserId);
    }
  }

  const expectedVersion = p.version;
  if (expectedVersion !== undefined) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'bills',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { row: existingById, conflict: true, wasInsert: false };
  }

  await enforceLockForSave(client, tenantId, 'bill', id, actorUserId);

  const locked = await new BillRepository(tenantId).lockByIdIncludingDeletedForUpdate(client, id);
  if (!locked) return { row: existingById, conflict: false, wasInsert: false };

  const userIdResolved =
    p.user_id && String(p.user_id).trim() ? String(p.user_id).trim() : actorUserId;

  try {
    const row = await new BillRepository(tenantId).updateActive(client, id, billWriteFieldsFromPick(p), {
      userId: userIdResolved,
      restoreDeleted: true,
    });
    if (!row) throw new Error('Bill upsert failed.');
    const finalized = await finalizeBillSaveFromLedger(client, tenantId, row.id, {
      action: 'update',
      actorUserId,
    });
    return { row: finalized, conflict: false, wasInsert: false };
  } catch (e) {
    if (!isDuplicateBillNumberConstraint(e)) throw e;
    throw new Error(
      'That bill number is already used by another bill for this organisation. Refresh the list, open the existing bill, or choose another number.'
    );
  }
}

export async function softDeleteBill(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  expectedVersion?: number,
  actorUserId?: string | null
): Promise<{ ok: boolean; conflict: boolean }> {
  const before = await getBillById(client, tenantId, id);
  if (!before) return { ok: false, conflict: false };

  await enforceLockForSave(client, tenantId, 'bill', id, actorUserId);

  if (expectedVersion !== undefined) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'bills',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { ok: false, conflict: true };
  }

  const billRepo = new BillRepository(tenantId);
  const deleted = await billRepo.markDeleted(client, id);
  if (!deleted) return { ok: false, conflict: false };

  await reverseBillJournalMirror(client, tenantId, id, actorUserId ?? null);
  const after = await getBillByIdIncludingDeleted(client, tenantId, id);
  if (after) {
    await recordDomainMutation(client, {
      tenantId,
      userId: actorUserId ?? after.user_id,
      module: 'bills',
      entityType: 'bill',
      entityId: id,
      action: 'delete',
      summary: `Bill ${after.bill_number} deleted`,
      oldValue: rowToBillApi(before),
      newValue: rowToBillApi(after),
      version: after.version,
    });
  }
  return { ok: true, conflict: false };
}

export async function listBillsChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<BillRow[]> {
  return new BillRepository(tenantId).listChangedSince(client, since);
}

/** Recompute paid_amount + status from ledger (matches client applyTxToBillCopy). */
export async function recalculateBillPaymentAggregates(
  client: pg.PoolClient,
  tenantId: string,
  billId: string
): Promise<void> {
  const b = await getBillById(client, tenantId, billId);
  if (!b) return;

  /** Income + Expense rows with bill_id (matches client applyTransactionEffect; Income = security-deposit bill payment). */
  const sumR = await client.query<{ sum: string | null }>(
    `SELECT COALESCE(SUM(amount), 0)::text AS sum FROM transactions
     WHERE tenant_id = $1 AND bill_id = $2 AND deleted_at IS NULL
       AND LOWER(TRIM(type)) IN ('expense', 'income')`,
    [tenantId, billId]
  );
  const txnPaid = Math.max(0, Number(sumR.rows[0]?.sum ?? 0));
  /** Advance slices only; cash/bank leg is mirrored on `transactions` (settlement_kind = 'cash' rows stay for JE audit). */
  const clr = await client.query<{ sum: string | null }>(
    `SELECT COALESCE(SUM(amount), 0)::text AS sum FROM vendor_bill_advance_clearings
     WHERE tenant_id = $1 AND bill_id = $2
       AND COALESCE(NULLIF(TRIM(settlement_kind), ''), 'advance') <> 'cash'`,
    [tenantId, billId]
  );
  const clearingPaid = Math.max(0, Number(clr.rows[0]?.sum ?? 0));
  const paidRaw = txnPaid + clearingPaid;
  const paid = Math.round(paidRaw * 100) / 100;
  const amt = Number(b.amount);
  const threshold = 0.01;
  let newStatus: string;
  if (paid >= amt - threshold) newStatus = 'Paid';
  else if (paid > threshold) newStatus = 'Partially Paid';
  else newStatus = 'Unpaid';

  await new BillRepository(tenantId).setPaymentAggregates(client, billId, paid, newStatus);
}
