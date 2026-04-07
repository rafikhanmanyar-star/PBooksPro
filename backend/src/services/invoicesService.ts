import type pg from 'pg';
import { randomUUID } from 'crypto';
import { formatPgDateToYyyyMmDd, parseApiDateToYyyyMmDd } from '../utils/dateOnly.js';
import { enforceLockForSave } from './recordLocksService.js';

export type InvoiceRow = {
  id: string;
  tenant_id: string;
  invoice_number: string;
  contact_id: string;
  amount: string;
  paid_amount: string;
  status: string;
  issue_date: Date;
  due_date: Date;
  invoice_type: string;
  description: string | null;
  project_id: string | null;
  building_id: string | null;
  property_id: string | null;
  unit_id: string | null;
  category_id: string | null;
  agreement_id: string | null;
  security_deposit_charge: string | null;
  service_charges: string | null;
  rental_month: string | null;
  user_id: string | null;
  version: number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

function numToApi(n: string | null | undefined): number | undefined {
  if (n == null || n === '') return undefined;
  const v = Number(n);
  return Number.isFinite(v) ? v : undefined;
}

function parseDate(label: string, v: unknown): string {
  if (v == null || v === '') throw new Error(`${label} is required.`);
  try {
    return parseApiDateToYyyyMmDd(v);
  } catch {
    throw new Error(`Invalid ${label}.`);
  }
}

export function rowToInvoiceApi(row: InvoiceRow): Record<string, unknown> {
  const issue =
    row.issue_date instanceof Date ? row.issue_date : new Date(row.issue_date as unknown as string);
  const due = row.due_date instanceof Date ? row.due_date : new Date(row.due_date as unknown as string);
  const base: Record<string, unknown> = {
    id: row.id,
    invoiceNumber: row.invoice_number,
    contactId: row.contact_id,
    amount: Number(row.amount),
    paidAmount: Number(row.paid_amount),
    status: row.status,
    issueDate: formatPgDateToYyyyMmDd(issue),
    dueDate: formatPgDateToYyyyMmDd(due),
    invoiceType: row.invoice_type,
    description: row.description ?? undefined,
    projectId: row.project_id ?? undefined,
    buildingId: row.building_id ?? undefined,
    propertyId: row.property_id ?? undefined,
    unitId: row.unit_id ?? undefined,
    categoryId: row.category_id ?? undefined,
    agreementId: row.agreement_id ?? undefined,
    securityDepositCharge: numToApi(row.security_deposit_charge),
    serviceCharges: numToApi(row.service_charges),
    rentalMonth: row.rental_month ?? undefined,
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
  const dueDate = dueRaw != null && dueRaw !== '' ? parseDate('dueDate', dueRaw) : issueDate;

  return {
    invoice_number: String(body.invoiceNumber ?? body.invoice_number ?? '').trim(),
    contact_id: String(body.contactId ?? body.contact_id ?? '').trim(),
    amount: Number(body.amount ?? 0),
    paid_amount: body.paidAmount != null || body.paid_amount != null ? Number(body.paidAmount ?? body.paid_amount) : 0,
    status: String(body.status ?? 'Unpaid'),
    issue_date: issueDate,
    due_date: dueDate,
    invoice_type: String(body.invoiceType ?? body.invoice_type ?? 'Rental'),
    description:
      body.description === undefined ? undefined : body.description === null ? null : String(body.description),
    project_id: (body.projectId ?? body.project_id) as string | null | undefined,
    building_id: (body.buildingId ?? body.building_id) as string | null | undefined,
    property_id: (body.propertyId ?? body.property_id) as string | null | undefined,
    unit_id: (body.unitId ?? body.unit_id) as string | null | undefined,
    category_id: (body.categoryId ?? body.category_id) as string | null | undefined,
    agreement_id: (body.agreementId ?? body.agreement_id) as string | null | undefined,
    security_deposit_charge:
      body.securityDepositCharge != null || body.security_deposit_charge != null
        ? Number(body.securityDepositCharge ?? body.security_deposit_charge)
        : undefined,
    service_charges:
      body.serviceCharges != null || body.service_charges != null
        ? Number(body.serviceCharges ?? body.service_charges)
        : undefined,
    rental_month:
      body.rentalMonth != null || body.rental_month != null
        ? String(body.rentalMonth ?? body.rental_month)
        : undefined,
    user_id: (body.userId ?? body.user_id) as string | null | undefined,
    version: typeof body.version === 'number' ? body.version : undefined,
  };
}

export async function listInvoices(
  client: pg.PoolClient,
  tenantId: string,
  filters?: {
    status?: string;
    invoiceType?: string;
    projectId?: string;
    agreementId?: string;
    /** When true, include soft-deleted rows. Needed for invoice number allocation: UNIQUE(tenant_id, invoice_number) applies even when deleted_at IS NOT NULL. */
    includeDeleted?: boolean;
  }
): Promise<InvoiceRow[]> {
  const params: unknown[] = [tenantId];
  let q = `SELECT id, tenant_id, invoice_number, contact_id, amount, paid_amount, status, issue_date, due_date,
           invoice_type, description, project_id, building_id, property_id, unit_id, category_id, agreement_id,
           security_deposit_charge, service_charges, rental_month, user_id, version, deleted_at, created_at, updated_at
           FROM invoices WHERE tenant_id = $1`;
  if (!filters?.includeDeleted) {
    q += ` AND deleted_at IS NULL`;
  }
  if (filters?.status) {
    params.push(filters.status);
    q += ` AND status = $${params.length}`;
  }
  if (filters?.invoiceType) {
    params.push(filters.invoiceType);
    q += ` AND invoice_type = $${params.length}`;
  }
  if (filters?.projectId) {
    params.push(filters.projectId);
    q += ` AND project_id = $${params.length}`;
  }
  if (filters?.agreementId) {
    params.push(filters.agreementId);
    q += ` AND agreement_id = $${params.length}`;
  }
  q += ' ORDER BY issue_date DESC, invoice_number ASC';
  const r = await client.query<InvoiceRow>(q, params);
  return r.rows;
}

export async function getInvoiceById(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<InvoiceRow | null> {
  const r = await client.query<InvoiceRow>(
    `SELECT id, tenant_id, invoice_number, contact_id, amount, paid_amount, status, issue_date, due_date,
            invoice_type, description, project_id, building_id, property_id, unit_id, category_id, agreement_id,
            security_deposit_charge, service_charges, rental_month, user_id, version, deleted_at, created_at, updated_at
     FROM invoices WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, tenantId]
  );
  return r.rows[0] ?? null;
}

/** Active or soft-deleted row (for POST upsert). */
export async function getInvoiceByIdIncludingDeleted(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<InvoiceRow | null> {
  const r = await client.query<InvoiceRow>(
    `SELECT id, tenant_id, invoice_number, contact_id, amount, paid_amount, status, issue_date, due_date,
            invoice_type, description, project_id, building_id, property_id, unit_id, category_id, agreement_id,
            security_deposit_charge, service_charges, rental_month, user_id, version, deleted_at, created_at, updated_at
     FROM invoices WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  return r.rows[0] ?? null;
}

/**
 * POST /invoices: insert or update by id (matches client saveInvoice always using POST).
 * Restores soft-deleted rows when updating by id.
 */
export async function upsertInvoice(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>,
  actorUserId: string | null
): Promise<{ row: InvoiceRow; conflict: boolean; wasInsert: boolean }> {
  const p = pickBody(body);
  if (!p.invoice_number) throw new Error('invoiceNumber is required.');
  if (!p.contact_id) throw new Error('contactId is required.');

  const id =
    typeof body.id === 'string' && body.id.trim() ? body.id.trim() : `inv_${randomUUID().replace(/-/g, '')}`;

  const existing = await getInvoiceByIdIncludingDeleted(client, tenantId, id);
  if (!existing) {
    const row = await createInvoice(client, tenantId, { ...body, id }, actorUserId);
    return { row, conflict: false, wasInsert: true };
  }

  await enforceLockForSave(client, tenantId, 'invoice', id, actorUserId);

  const expectedVersion = p.version;
  if (expectedVersion !== undefined && existing.version !== expectedVersion) {
    return { row: existing, conflict: true, wasInsert: false };
  }

  const vals = [
    p.invoice_number,
    p.contact_id,
    p.amount,
    p.paid_amount,
    p.status,
    p.issue_date,
    p.due_date,
    p.invoice_type,
    p.description ?? null,
    p.project_id && String(p.project_id).trim() ? String(p.project_id).trim() : null,
    p.building_id && String(p.building_id).trim() ? String(p.building_id).trim() : null,
    p.property_id && String(p.property_id).trim() ? String(p.property_id).trim() : null,
    p.unit_id && String(p.unit_id).trim() ? String(p.unit_id).trim() : null,
    p.category_id && String(p.category_id).trim() ? String(p.category_id).trim() : null,
    p.agreement_id && String(p.agreement_id).trim() ? String(p.agreement_id).trim() : null,
    p.security_deposit_charge != null && Number.isFinite(p.security_deposit_charge)
      ? p.security_deposit_charge
      : null,
    p.service_charges != null && Number.isFinite(p.service_charges) ? p.service_charges : null,
    p.rental_month && String(p.rental_month).trim() ? String(p.rental_month).trim() : null,
  ];

  const u = await client.query<InvoiceRow>(
    `UPDATE invoices SET
       invoice_number = $3, contact_id = $4, amount = $5, paid_amount = $6, status = $7,
       issue_date = $8::date, due_date = $9::date, invoice_type = $10, description = $11,
       project_id = $12, building_id = $13, property_id = $14, unit_id = $15, category_id = $16, agreement_id = $17,
       security_deposit_charge = $18, service_charges = $19, rental_month = $20,
       deleted_at = NULL, version = version + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2
     RETURNING id, tenant_id, invoice_number, contact_id, amount, paid_amount, status, issue_date, due_date,
               invoice_type, description, project_id, building_id, property_id, unit_id, category_id, agreement_id,
               security_deposit_charge, service_charges, rental_month, user_id, version, deleted_at, created_at, updated_at`,
    [id, tenantId, ...vals]
  );
  const row = u.rows[0];
  if (!row) throw new Error('Upsert failed.');
  return { row, conflict: false, wasInsert: false };
}

export async function createInvoice(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>,
  actorUserId: string | null
): Promise<InvoiceRow> {
  const p = pickBody(body);
  if (!p.invoice_number) throw new Error('invoiceNumber is required.');
  if (!p.contact_id) throw new Error('contactId is required.');
  const id =
    typeof body.id === 'string' && body.id.trim() ? body.id.trim() : `inv_${randomUUID().replace(/-/g, '')}`;

  const r = await client.query<InvoiceRow>(
    `INSERT INTO invoices (
       id, tenant_id, invoice_number, contact_id, amount, paid_amount, status, issue_date, due_date, invoice_type,
       description, project_id, building_id, property_id, unit_id, category_id, agreement_id,
       security_deposit_charge, service_charges, rental_month, user_id, version, deleted_at, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8::date, $9::date, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, 1, NULL, NOW(), NOW()
     )
     RETURNING id, tenant_id, invoice_number, contact_id, amount, paid_amount, status, issue_date, due_date,
               invoice_type, description, project_id, building_id, property_id, unit_id, category_id, agreement_id,
               security_deposit_charge, service_charges, rental_month, user_id, version, deleted_at, created_at, updated_at`,
    [
      id,
      tenantId,
      p.invoice_number,
      p.contact_id,
      p.amount,
      p.paid_amount,
      p.status,
      p.issue_date,
      p.due_date,
      p.invoice_type,
      p.description ?? null,
      p.project_id && String(p.project_id).trim() ? String(p.project_id).trim() : null,
      p.building_id && String(p.building_id).trim() ? String(p.building_id).trim() : null,
      p.property_id && String(p.property_id).trim() ? String(p.property_id).trim() : null,
      p.unit_id && String(p.unit_id).trim() ? String(p.unit_id).trim() : null,
      p.category_id && String(p.category_id).trim() ? String(p.category_id).trim() : null,
      p.agreement_id && String(p.agreement_id).trim() ? String(p.agreement_id).trim() : null,
      p.security_deposit_charge != null && Number.isFinite(p.security_deposit_charge)
        ? p.security_deposit_charge
        : null,
      p.service_charges != null && Number.isFinite(p.service_charges) ? p.service_charges : null,
      p.rental_month && String(p.rental_month).trim() ? String(p.rental_month).trim() : null,
      p.user_id && String(p.user_id).trim() ? String(p.user_id).trim() : actorUserId,
    ]
  );
  return r.rows[0];
}

export async function updateInvoice(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  body: Record<string, unknown>,
  actorUserId?: string | null
): Promise<{ row: InvoiceRow | null; conflict: boolean }> {
  await enforceLockForSave(client, tenantId, 'invoice', id, actorUserId);
  const p = pickBody(body);
  const expectedVersion = p.version;

  if (!p.invoice_number) throw new Error('invoiceNumber is required.');
  if (!p.contact_id) throw new Error('contactId is required.');

  const vals = [
    p.invoice_number,
    p.contact_id,
    p.amount,
    p.paid_amount,
    p.status,
    p.issue_date,
    p.due_date,
    p.invoice_type,
    p.description ?? null,
    p.project_id && String(p.project_id).trim() ? String(p.project_id).trim() : null,
    p.building_id && String(p.building_id).trim() ? String(p.building_id).trim() : null,
    p.property_id && String(p.property_id).trim() ? String(p.property_id).trim() : null,
    p.unit_id && String(p.unit_id).trim() ? String(p.unit_id).trim() : null,
    p.category_id && String(p.category_id).trim() ? String(p.category_id).trim() : null,
    p.agreement_id && String(p.agreement_id).trim() ? String(p.agreement_id).trim() : null,
    p.security_deposit_charge != null && Number.isFinite(p.security_deposit_charge)
      ? p.security_deposit_charge
      : null,
    p.service_charges != null && Number.isFinite(p.service_charges) ? p.service_charges : null,
    p.rental_month && String(p.rental_month).trim() ? String(p.rental_month).trim() : null,
  ];

  if (expectedVersion !== undefined) {
    const u = await client.query<InvoiceRow>(
      `UPDATE invoices SET
         invoice_number = $3, contact_id = $4, amount = $5, paid_amount = $6, status = $7,
         issue_date = $8::date, due_date = $9::date, invoice_type = $10, description = $11,
         project_id = $12, building_id = $13, property_id = $14, unit_id = $15, category_id = $16, agreement_id = $17,
         security_deposit_charge = $18, service_charges = $19, rental_month = $20,
         version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL AND version = $21
       RETURNING id, tenant_id, invoice_number, contact_id, amount, paid_amount, status, issue_date, due_date,
                 invoice_type, description, project_id, building_id, property_id, unit_id, category_id, agreement_id,
                 security_deposit_charge, service_charges, rental_month, user_id, version, deleted_at, created_at, updated_at`,
      [id, tenantId, ...vals, expectedVersion]
    );
    if (u.rows.length === 0) {
      const exists = await getInvoiceById(client, tenantId, id);
      if (!exists) return { row: null, conflict: false };
      return { row: null, conflict: true };
    }
    return { row: u.rows[0], conflict: false };
  }

  const u = await client.query<InvoiceRow>(
    `UPDATE invoices SET
       invoice_number = $3, contact_id = $4, amount = $5, paid_amount = $6, status = $7,
       issue_date = $8::date, due_date = $9::date, invoice_type = $10, description = $11,
       project_id = $12, building_id = $13, property_id = $14, unit_id = $15, category_id = $16, agreement_id = $17,
       security_deposit_charge = $18, service_charges = $19, rental_month = $20,
       version = version + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     RETURNING id, tenant_id, invoice_number, contact_id, amount, paid_amount, status, issue_date, due_date,
               invoice_type, description, project_id, building_id, property_id, unit_id, category_id, agreement_id,
               security_deposit_charge, service_charges, rental_month, user_id, version, deleted_at, created_at, updated_at`,
    [id, tenantId, ...vals]
  );
  return { row: u.rows[0] ?? null, conflict: false };
}

export async function softDeleteInvoice(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  expectedVersion?: number,
  actorUserId?: string | null
): Promise<{ ok: boolean; conflict: boolean }> {
  await enforceLockForSave(client, tenantId, 'invoice', id, actorUserId);
  if (expectedVersion !== undefined) {
    const r = await client.query(
      `UPDATE invoices SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL AND version = $3`,
      [id, tenantId, expectedVersion]
    );
    if (r.rowCount === 0) {
      const ex = await getInvoiceById(client, tenantId, id);
      if (!ex) return { ok: false, conflict: false };
      return { ok: false, conflict: true };
    }
    return { ok: true, conflict: false };
  }
  const r = await client.query(
    `UPDATE invoices SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, tenantId]
  );
  return { ok: (r.rowCount ?? 0) > 0, conflict: false };
}

/** Includes soft-deleted rows (for incremental sync tombstones). */
export async function listInvoicesChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<InvoiceRow[]> {
  const r = await client.query<InvoiceRow>(
    `SELECT id, tenant_id, invoice_number, contact_id, amount, paid_amount, status, issue_date, due_date,
            invoice_type, description, project_id, building_id, property_id, unit_id, category_id, agreement_id,
            security_deposit_charge, service_charges, rental_month, user_id, version, deleted_at, created_at, updated_at
     FROM invoices WHERE tenant_id = $1 AND updated_at > $2
     ORDER BY updated_at ASC`,
    [tenantId, since]
  );
  return r.rows;
}

/**
 * Recompute paid_amount + status from the ledger (matches client applyTransactionEffect / applyTxToInvoiceCopy).
 * Call after a linked payment transaction is soft-deleted so denormalized invoice fields cannot drift.
 */
export async function recalculateInvoicePaymentAggregates(
  client: pg.PoolClient,
  tenantId: string,
  invoiceId: string
): Promise<void> {
  const invR = await client.query<Pick<InvoiceRow, 'amount' | 'status'>>(
    `SELECT amount, status FROM invoices WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [invoiceId, tenantId]
  );
  const inv = invR.rows[0];
  if (!inv) return;
  if (inv.status === 'Draft') return;

  /** Only Income rows count as invoice payments (same as utils/buildLedgerPaidByInvoiceMap). */
  const sumR = await client.query<{ sum: string | null }>(
    `SELECT COALESCE(SUM(amount), 0)::text AS sum FROM transactions
     WHERE tenant_id = $1 AND invoice_id = $2 AND deleted_at IS NULL
       AND LOWER(TRIM(type)) = 'income'`,
    [tenantId, invoiceId]
  );
  const paid = Math.max(0, Number(sumR.rows[0]?.sum ?? 0));
  const amt = Number(inv.amount);
  let newStatus: string;
  if (paid >= amt - 0.1) newStatus = 'Paid';
  else if (paid > 0.1) newStatus = 'Partially Paid';
  else newStatus = 'Unpaid';

  await client.query(
    `UPDATE invoices SET paid_amount = $3, status = $4, version = version + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [invoiceId, tenantId, paid, newStatus]
  );
}
