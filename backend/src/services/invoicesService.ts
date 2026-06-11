import type pg from 'pg';
import { randomUUID } from 'crypto';
import { formatPgDateToYyyyMmDd, parseApiDateToYyyyMmDd } from '../utils/dateOnly.js';
import { enforceLockForSave } from './recordLocksService.js';
import { syncInvoiceJournalMirror, reverseInvoiceJournalMirror } from './invoiceJournalPostingService.js';
import { recordDomainMutation } from '../core/recordDomainMutation.js';
import { checkEntityLwwConflict } from '../core/entityMutation.js';
import { InvoiceRepository, type InvoiceWriteFields } from '../modules/customers/repositories/InvoiceRepository.js';

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
  const base: Record<string, unknown> = {
    id: row.id,
    invoiceNumber: row.invoice_number,
    contactId: row.contact_id,
    amount: Number(row.amount),
    paidAmount: Number(row.paid_amount),
    status: row.status,
    issueDate: formatPgDateToYyyyMmDd(row.issue_date),
    dueDate: formatPgDateToYyyyMmDd(row.due_date),
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

function trimOptId(v: string | null | undefined): string | null {
  return v != null && String(v).trim() ? String(v).trim() : null;
}

function invoiceWriteFieldsFromPick(p: ReturnType<typeof pickBody>): InvoiceWriteFields {
  return {
    invoice_number: p.invoice_number,
    contact_id: p.contact_id,
    amount: p.amount,
    paid_amount: p.paid_amount,
    status: p.status,
    issue_date: p.issue_date,
    due_date: p.due_date,
    invoice_type: p.invoice_type,
    description: p.description ?? null,
    project_id: trimOptId(p.project_id),
    building_id: trimOptId(p.building_id),
    property_id: trimOptId(p.property_id),
    unit_id: trimOptId(p.unit_id),
    category_id: trimOptId(p.category_id),
    agreement_id: trimOptId(p.agreement_id),
    security_deposit_charge:
      p.security_deposit_charge != null && Number.isFinite(p.security_deposit_charge)
        ? p.security_deposit_charge
        : null,
    service_charges:
      p.service_charges != null && Number.isFinite(p.service_charges) ? p.service_charges : null,
    rental_month: p.rental_month && String(p.rental_month).trim() ? String(p.rental_month).trim() : null,
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
  return new InvoiceRepository(tenantId).list(client, filters);
}

export async function getInvoiceById(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<InvoiceRow | null> {
  return new InvoiceRepository(tenantId).getById(client, id);
}

/** Active or soft-deleted row (for POST upsert). */
export async function getInvoiceByIdIncludingDeleted(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<InvoiceRow | null> {
  return new InvoiceRepository(tenantId).getByIdIncludingDeleted(client, id);
}

/** Server-authoritative paid_amount/status from payment transactions (ignores client-supplied values). */
async function finalizeInvoiceSaveFromLedger(
  client: pg.PoolClient,
  tenantId: string,
  invoiceId: string,
  opts?: { action?: 'create' | 'update'; actorUserId?: string | null }
): Promise<InvoiceRow> {
  await recalculateInvoicePaymentAggregates(client, tenantId, invoiceId);
  const row = await getInvoiceById(client, tenantId, invoiceId);
  if (!row) throw new Error('Invoice not found after save.');
  await syncInvoiceJournalMirror(client, tenantId, row, row.user_id);
  const action = opts?.action ?? 'update';
  await recordDomainMutation(client, {
    tenantId,
    userId: opts?.actorUserId ?? row.user_id,
    module: 'invoices',
    entityType: 'invoice',
    entityId: row.id,
    action,
    summary:
      action === 'create'
        ? `Invoice ${row.invoice_number} created`
        : `Invoice ${row.invoice_number} updated`,
    newValue: rowToInvoiceApi(row),
    version: row.version,
  });
  return row;
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

  const expectedVersion = p.version;
  if (expectedVersion !== undefined) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'invoices',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { row: existing, conflict: true, wasInsert: false };
  }

  await enforceLockForSave(client, tenantId, 'invoice', id, actorUserId);

  const locked = await new InvoiceRepository(tenantId).lockByIdIncludingDeletedForUpdate(client, id);
  if (!locked) throw new Error('Invoice not found for update.');

  const row = await new InvoiceRepository(tenantId).updateActive(client, id, invoiceWriteFieldsFromPick(p), {
    restoreDeleted: true,
  });
  if (!row) throw new Error('Upsert failed.');
  const finalized = await finalizeInvoiceSaveFromLedger(client, tenantId, id);
  return { row: finalized, conflict: false, wasInsert: false };
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

  await new InvoiceRepository(tenantId).insert(
    client,
    id,
    invoiceWriteFieldsFromPick(p),
    p.user_id && String(p.user_id).trim() ? String(p.user_id).trim() : actorUserId
  );
  const finalized = await finalizeInvoiceSaveFromLedger(client, tenantId, id);
  return finalized;
}

export async function updateInvoice(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  body: Record<string, unknown>,
  actorUserId?: string | null
): Promise<{ row: InvoiceRow | null; conflict: boolean }> {
  const existing = await getInvoiceById(client, tenantId, id);
  if (!existing) return { row: null, conflict: false };

  await enforceLockForSave(client, tenantId, 'invoice', id, actorUserId);
  const p = pickBody(body);
  const expectedVersion = p.version;

  if (expectedVersion !== undefined) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'invoices',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { row: existing, conflict: true };
  }

  const locked = await new InvoiceRepository(tenantId).getByIdForUpdate(client, id);
  if (!locked) return { row: null, conflict: false };

  if (!p.invoice_number) throw new Error('invoiceNumber is required.');
  if (!p.contact_id) throw new Error('contactId is required.');

  const row = await new InvoiceRepository(tenantId).updateActive(client, id, invoiceWriteFieldsFromPick(p));
  if (!row) return { row: null, conflict: false };
  const finalized = await finalizeInvoiceSaveFromLedger(client, tenantId, id, {
    actorUserId: actorUserId ?? null,
  });
  return { row: finalized, conflict: false };
}

export async function softDeleteInvoice(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  expectedVersion?: number,
  actorUserId?: string | null
): Promise<{ ok: boolean; conflict: boolean }> {
  const before = await getInvoiceById(client, tenantId, id);
  if (!before) return { ok: false, conflict: false };

  await enforceLockForSave(client, tenantId, 'invoice', id, actorUserId);

  if (expectedVersion !== undefined) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'invoices',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { ok: false, conflict: true };
  }

  const invoiceRepo = new InvoiceRepository(tenantId);
  const deleted = await invoiceRepo.softDelete(client, id);
  if (!deleted) return { ok: false, conflict: false };

  await reverseInvoiceJournalMirror(client, tenantId, id, actorUserId ?? null);
  const after = await getInvoiceByIdIncludingDeleted(client, tenantId, id);
  if (after) {
    await recordDomainMutation(client, {
      tenantId,
      userId: actorUserId ?? after.user_id,
      module: 'invoices',
      entityType: 'invoice',
      entityId: id,
      action: 'delete',
      summary: `Invoice ${after.invoice_number} deleted`,
      oldValue: rowToInvoiceApi(before),
      newValue: rowToInvoiceApi(after),
      version: after.version,
    });
  }
  return { ok: true, conflict: false };
}

/** Includes soft-deleted rows (for incremental sync tombstones). */
export async function listInvoicesChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<InvoiceRow[]> {
  return new InvoiceRepository(tenantId).listChangedSince(client, since);
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
  const inv = await getInvoiceById(client, tenantId, invoiceId);
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

  await new InvoiceRepository(tenantId).setPaymentAggregates(client, invoiceId, paid, newStatus);
}
