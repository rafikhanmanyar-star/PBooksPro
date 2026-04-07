import type pg from 'pg';
import { randomUUID } from 'crypto';
import { formatPgDateToYyyyMmDd, parseApiDateToYyyyMmDd, parseApiDateToYyyyMmDdOptional } from '../utils/dateOnly.js';

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

export function rowToBillApi(row: BillRow): Record<string, unknown> {
  const issue =
    row.issue_date instanceof Date ? row.issue_date : new Date(row.issue_date as unknown as string);
  const due = row.due_date
    ? row.due_date instanceof Date
      ? row.due_date
      : new Date(row.due_date as unknown as string)
    : null;
  const base: Record<string, unknown> = {
    id: row.id,
    billNumber: row.bill_number,
    contactId: row.contact_id ?? undefined,
    vendorId: row.vendor_id ?? undefined,
    amount: Number(row.amount),
    paidAmount: Number(row.paid_amount),
    status: row.status,
    issueDate: formatPgDateToYyyyMmDd(issue),
    dueDate: due ? formatPgDateToYyyyMmDd(due) : undefined,
    description: row.description ?? undefined,
    categoryId: row.category_id ?? undefined,
    projectId: row.project_id ?? undefined,
    buildingId: row.building_id ?? undefined,
    propertyId: row.property_id ?? undefined,
    projectAgreementId: row.project_agreement_id ?? undefined,
    contractId: row.contract_id ?? undefined,
    staffId: row.staff_id ?? undefined,
    expenseBearerType: row.expense_bearer_type ?? undefined,
    expenseCategoryItems: row.expense_category_items ?? undefined,
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

export async function listBills(
  client: pg.PoolClient,
  tenantId: string,
  filters?: { status?: string; projectId?: string; propertyId?: string }
): Promise<BillRow[]> {
  const params: unknown[] = [tenantId];
  let q = `SELECT id, tenant_id, bill_number, contact_id, vendor_id, amount, paid_amount, status, issue_date, due_date,
           description, category_id, project_id, building_id, property_id, project_agreement_id, contract_id, staff_id,
           expense_bearer_type, expense_category_items, document_path, document_id, user_id, version, deleted_at, created_at, updated_at
           FROM bills WHERE tenant_id = $1 AND deleted_at IS NULL`;
  if (filters?.status) {
    params.push(filters.status);
    q += ` AND status = $${params.length}`;
  }
  if (filters?.projectId) {
    params.push(filters.projectId);
    q += ` AND project_id = $${params.length}`;
  }
  if (filters?.propertyId) {
    params.push(filters.propertyId);
    q += ` AND property_id = $${params.length}`;
  }
  q += ' ORDER BY issue_date DESC, bill_number ASC';
  const r = await client.query<BillRow>(q, params);
  return r.rows;
}

export async function getBillById(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<BillRow | null> {
  const r = await client.query<BillRow>(
    `SELECT id, tenant_id, bill_number, contact_id, vendor_id, amount, paid_amount, status, issue_date, due_date,
            description, category_id, project_id, building_id, property_id, project_agreement_id, contract_id, staff_id,
            expense_bearer_type, expense_category_items, document_path, document_id, user_id, version, deleted_at, created_at, updated_at
     FROM bills WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, tenantId]
  );
  return r.rows[0] ?? null;
}

export async function getBillByIdIncludingDeleted(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<BillRow | null> {
  const r = await client.query<BillRow>(
    `SELECT id, tenant_id, bill_number, contact_id, vendor_id, amount, paid_amount, status, issue_date, due_date,
            description, category_id, project_id, building_id, property_id, project_agreement_id, contract_id, staff_id,
            expense_bearer_type, expense_category_items, document_path, document_id, user_id, version, deleted_at, created_at, updated_at
     FROM bills WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  return r.rows[0] ?? null;
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

  const r = await client.query<BillRow>(
    `INSERT INTO bills (
       id, tenant_id, bill_number, contact_id, vendor_id, amount, paid_amount, status, issue_date, due_date,
       description, category_id, project_id, building_id, property_id, project_agreement_id, contract_id, staff_id,
       expense_bearer_type, expense_category_items, document_path, document_id, user_id, version, deleted_at, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10::date, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, 1, NULL, NOW(), NOW()
     )
     RETURNING id, tenant_id, bill_number, contact_id, vendor_id, amount, paid_amount, status, issue_date, due_date,
               description, category_id, project_id, building_id, property_id, project_agreement_id, contract_id, staff_id,
               expense_bearer_type, expense_category_items, document_path, document_id, user_id, version, deleted_at, created_at, updated_at`,
    [
      id,
      tenantId,
      p.bill_number,
      p.contact_id,
      p.vendor_id,
      p.amount,
      p.paid_amount,
      p.status,
      p.issue_date,
      p.due_date,
      p.description ?? null,
      p.category_id && String(p.category_id).trim() ? String(p.category_id).trim() : null,
      p.project_id && String(p.project_id).trim() ? String(p.project_id).trim() : null,
      p.building_id && String(p.building_id).trim() ? String(p.building_id).trim() : null,
      p.property_id && String(p.property_id).trim() ? String(p.property_id).trim() : null,
      p.project_agreement_id && String(p.project_agreement_id).trim() ? String(p.project_agreement_id).trim() : null,
      p.contract_id && String(p.contract_id).trim() ? String(p.contract_id).trim() : null,
      p.staff_id && String(p.staff_id).trim() ? String(p.staff_id).trim() : null,
      p.expense_bearer_type && String(p.expense_bearer_type).trim() ? String(p.expense_bearer_type).trim() : null,
      p.expense_category_items,
      p.document_path && String(p.document_path).trim() ? String(p.document_path).trim() : null,
      p.document_id && String(p.document_id).trim() ? String(p.document_id).trim() : null,
      p.user_id && String(p.user_id).trim() ? String(p.user_id).trim() : actorUserId,
    ]
  );
  return r.rows[0];
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

  const vals = [
    p.bill_number,
    p.contact_id,
    p.vendor_id,
    p.amount,
    p.paid_amount,
    p.status,
    p.issue_date,
    p.due_date,
    p.description ?? null,
    p.category_id && String(p.category_id).trim() ? String(p.category_id).trim() : null,
    p.project_id && String(p.project_id).trim() ? String(p.project_id).trim() : null,
    p.building_id && String(p.building_id).trim() ? String(p.building_id).trim() : null,
    p.property_id && String(p.property_id).trim() ? String(p.property_id).trim() : null,
    p.project_agreement_id && String(p.project_agreement_id).trim() ? String(p.project_agreement_id).trim() : null,
    p.contract_id && String(p.contract_id).trim() ? String(p.contract_id).trim() : null,
    p.staff_id && String(p.staff_id).trim() ? String(p.staff_id).trim() : null,
    p.expense_bearer_type && String(p.expense_bearer_type).trim() ? String(p.expense_bearer_type).trim() : null,
    p.expense_category_items,
    p.document_path && String(p.document_path).trim() ? String(p.document_path).trim() : null,
    p.document_id && String(p.document_id).trim() ? String(p.document_id).trim() : null,
  ];

  if (expectedVersion !== undefined) {
    const u = await client.query<BillRow>(
      `UPDATE bills SET
         bill_number = $3, contact_id = $4, vendor_id = $5, amount = $6, paid_amount = $7, status = $8,
         issue_date = $9::date, due_date = $10::date, description = $11,
         category_id = $12, project_id = $13, building_id = $14, property_id = $15, project_agreement_id = $16,
         contract_id = $17, staff_id = $18, expense_bearer_type = $19, expense_category_items = $20,
         document_path = $21, document_id = $22,
         version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL AND version = $23
       RETURNING id, tenant_id, bill_number, contact_id, vendor_id, amount, paid_amount, status, issue_date, due_date,
                 description, category_id, project_id, building_id, property_id, project_agreement_id, contract_id, staff_id,
                 expense_bearer_type, expense_category_items, document_path, document_id, user_id, version, deleted_at, created_at, updated_at`,
      [id, tenantId, ...vals, expectedVersion]
    );
    if (u.rows.length === 0) {
      const exists = await getBillById(client, tenantId, id);
      if (!exists) return { row: null, conflict: false };
      return { row: null, conflict: true };
    }
    return { row: u.rows[0], conflict: false };
  }

  const u = await client.query<BillRow>(
    `UPDATE bills SET
       bill_number = $3, contact_id = $4, vendor_id = $5, amount = $6, paid_amount = $7, status = $8,
       issue_date = $9::date, due_date = $10::date, description = $11,
       category_id = $12, project_id = $13, building_id = $14, property_id = $15, project_agreement_id = $16,
       contract_id = $17, staff_id = $18, expense_bearer_type = $19, expense_category_items = $20,
       document_path = $21, document_id = $22,
       version = version + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     RETURNING id, tenant_id, bill_number, contact_id, vendor_id, amount, paid_amount, status, issue_date, due_date,
               description, category_id, project_id, building_id, property_id, project_agreement_id, contract_id, staff_id,
               expense_bearer_type, expense_category_items, document_path, document_id, user_id, version, deleted_at, created_at, updated_at`,
    [id, tenantId, ...vals]
  );
  return { row: u.rows[0] ?? null, conflict: false };
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

  const existing = await getBillByIdIncludingDeleted(client, tenantId, id);
  if (!existing) {
    const row = await createBill(client, tenantId, { ...body, id }, actorUserId);
    return { row, conflict: false, wasInsert: true };
  }

  const expectedVersion = p.version;
  if (expectedVersion !== undefined && existing.version !== expectedVersion) {
    return { row: existing, conflict: true, wasInsert: false };
  }

  const vals = [
    p.bill_number,
    p.contact_id,
    p.vendor_id,
    p.amount,
    p.paid_amount,
    p.status,
    p.issue_date,
    p.due_date,
    p.description ?? null,
    p.category_id && String(p.category_id).trim() ? String(p.category_id).trim() : null,
    p.project_id && String(p.project_id).trim() ? String(p.project_id).trim() : null,
    p.building_id && String(p.building_id).trim() ? String(p.building_id).trim() : null,
    p.property_id && String(p.property_id).trim() ? String(p.property_id).trim() : null,
    p.project_agreement_id && String(p.project_agreement_id).trim() ? String(p.project_agreement_id).trim() : null,
    p.contract_id && String(p.contract_id).trim() ? String(p.contract_id).trim() : null,
    p.staff_id && String(p.staff_id).trim() ? String(p.staff_id).trim() : null,
    p.expense_bearer_type && String(p.expense_bearer_type).trim() ? String(p.expense_bearer_type).trim() : null,
    p.expense_category_items,
    p.document_path && String(p.document_path).trim() ? String(p.document_path).trim() : null,
    p.document_id && String(p.document_id).trim() ? String(p.document_id).trim() : null,
    p.user_id && String(p.user_id).trim() ? String(p.user_id).trim() : null,
  ];

  const u = await client.query<BillRow>(
    `UPDATE bills SET
       bill_number = $3, contact_id = $4, vendor_id = $5, amount = $6, paid_amount = $7, status = $8,
       issue_date = $9::date, due_date = $10::date, description = $11,
       category_id = $12, project_id = $13, building_id = $14, property_id = $15, project_agreement_id = $16,
       contract_id = $17, staff_id = $18, expense_bearer_type = $19, expense_category_items = $20,
       document_path = $21, document_id = $22,
       user_id = COALESCE($23, user_id),
       deleted_at = NULL, version = version + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2
     RETURNING id, tenant_id, bill_number, contact_id, vendor_id, amount, paid_amount, status, issue_date, due_date,
               description, category_id, project_id, building_id, property_id, project_agreement_id, contract_id, staff_id,
               expense_bearer_type, expense_category_items, document_path, document_id, user_id, version, deleted_at, created_at, updated_at`,
    [id, tenantId, ...vals]
  );
  const row = u.rows[0];
  if (!row) throw new Error('Bill upsert failed.');
  return { row, conflict: false, wasInsert: false };
}

export async function softDeleteBill(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  expectedVersion?: number
): Promise<{ ok: boolean; conflict: boolean }> {
  if (expectedVersion !== undefined) {
    const r = await client.query(
      `UPDATE bills SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL AND version = $3`,
      [id, tenantId, expectedVersion]
    );
    if (r.rowCount === 0) {
      const ex = await getBillById(client, tenantId, id);
      if (!ex) return { ok: false, conflict: false };
      return { ok: false, conflict: true };
    }
    return { ok: true, conflict: false };
  }
  const r = await client.query(
    `UPDATE bills SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, tenantId]
  );
  return { ok: (r.rowCount ?? 0) > 0, conflict: false };
}

export async function listBillsChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<BillRow[]> {
  const r = await client.query<BillRow>(
    `SELECT id, tenant_id, bill_number, contact_id, vendor_id, amount, paid_amount, status, issue_date, due_date,
            description, category_id, project_id, building_id, property_id, project_agreement_id, contract_id, staff_id,
            expense_bearer_type, expense_category_items, document_path, document_id, user_id, version, deleted_at, created_at, updated_at
     FROM bills WHERE tenant_id = $1 AND updated_at > $2
     ORDER BY updated_at ASC`,
    [tenantId, since]
  );
  return r.rows;
}

/** Recompute paid_amount + status from ledger (matches client applyTxToBillCopy). */
export async function recalculateBillPaymentAggregates(
  client: pg.PoolClient,
  tenantId: string,
  billId: string
): Promise<void> {
  const bR = await client.query<Pick<BillRow, 'amount' | 'status'>>(
    `SELECT amount, status FROM bills WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [billId, tenantId]
  );
  const b = bR.rows[0];
  if (!b) return;

  /** Only Expense rows count as bill payments (same as utils/sumLinkedExpensePaymentsForBill). */
  const sumR = await client.query<{ sum: string | null }>(
    `SELECT COALESCE(SUM(amount), 0)::text AS sum FROM transactions
     WHERE tenant_id = $1 AND bill_id = $2 AND deleted_at IS NULL
       AND LOWER(TRIM(type)) = 'expense'`,
    [tenantId, billId]
  );
  const paid = Math.max(0, Number(sumR.rows[0]?.sum ?? 0));
  const amt = Number(b.amount);
  const threshold = 0.01;
  let newStatus: string;
  if (paid >= amt - threshold) newStatus = 'Paid';
  else if (paid > threshold) newStatus = 'Partially Paid';
  else newStatus = 'Unpaid';

  await client.query(
    `UPDATE bills SET paid_amount = $3, status = $4, version = version + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [billId, tenantId, paid, newStatus]
  );
}
