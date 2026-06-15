import type pg from 'pg';
import { formatPgDateToYyyyMmDd, parseApiDateToYyyyMmDd } from '../../../utils/dateOnly.js';
import { randomUUID } from 'crypto';
import {
  reconcileChangedLike,
  reconcileRentalAgreementsListLike,
  type ReconcileRentalAgreementLike,
} from '../../../rentalAgreementReconcile.js';
import { getPropertyById } from '../../properties/services/propertiesService.js';
import { createInvoice, rowToInvoiceApi } from '../../customers/services/invoicesService.js';
import { CategoryRepository } from '../../accounting/repositories/CategoryRepository.js';
import { enforceLockForSave } from '../../accounting/services/recordLocksService.js';
import { recordDomainMutation } from '../../../core/recordDomainMutation.js';
import { checkEntityLwwConflict } from '../../../core/entityMutation.js';
import {
  RentalAgreementRepository,
  type RentalAgreementWriteFields,
} from '../repositories/RentalAgreementRepository.js';

export type RentalAgreementRow = {
  id: string;
  tenant_id: string;
  agreement_number: string;
  contact_id: string;
  property_id: string;
  start_date: Date;
  end_date: Date;
  monthly_rent: string;
  rent_due_date: number | null;
  status: string;
  description: string | null;
  security_deposit: string | null;
  broker_id: string | null;
  broker_fee: string | null;
  owner_id: string | null;
  previous_agreement_id: string | null;
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

export function rowToRentalAgreementApi(row: RentalAgreementRow): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: row.id,
    agreementNumber: row.agreement_number,
    contactId: row.contact_id,
    propertyId: row.property_id,
    startDate: formatPgDateToYyyyMmDd(row.start_date),
    endDate: formatPgDateToYyyyMmDd(row.end_date),
    monthlyRent: Number(row.monthly_rent),
    rentDueDate: row.rent_due_date ?? 1,
    status: row.status,
    description: row.description ?? undefined,
    securityDeposit: numToApi(row.security_deposit),
    brokerId: row.broker_id ?? undefined,
    brokerFee: numToApi(row.broker_fee),
    ownerId: row.owner_id ?? undefined,
    previousAgreementId: row.previous_agreement_id ?? undefined,
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

/** Rental agreements created/updated/deleted since `since` (for incremental sync). Includes soft-deleted rows. */
export async function listRentalAgreementsChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<RentalAgreementRow[]> {
  return new RentalAgreementRepository(tenantId).listChangedSince(client, since);
}

function parseIsoDate(label: string, v: unknown): string {
  if (v == null || v === '') throw new Error(`${label} is required.`);
  try {
    return parseApiDateToYyyyMmDd(v);
  } catch {
    throw new Error(`Invalid ${label}.`);
  }
}

function pickBody(body: Record<string, unknown>) {
  return {
    agreement_number: String(body.agreementNumber ?? body.agreement_number ?? '').trim(),
    // Legacy bug: client sent tenant contact id in `tenantId` (wrong field name).
    contact_id: String(body.contactId ?? body.contact_id ?? body.tenantId ?? '').trim(),
    property_id: String(body.propertyId ?? body.property_id ?? '').trim(),
    start_date: parseIsoDate('startDate', body.startDate ?? body.start_date),
    end_date: parseIsoDate('endDate', body.endDate ?? body.end_date),
    monthly_rent: Number(body.monthlyRent ?? body.monthly_rent ?? 0),
    rent_due_date:
      body.rentDueDate != null || body.rent_due_date != null
        ? Number(body.rentDueDate ?? body.rent_due_date)
        : 1,
    status: String(body.status ?? 'Active'),
    description:
      body.description === undefined ? undefined : body.description === null ? null : String(body.description),
    security_deposit:
      body.securityDeposit != null || body.security_deposit != null
        ? Number(body.securityDeposit ?? body.security_deposit)
        : undefined,
    broker_id: (body.brokerId ?? body.broker_id) as string | undefined | null,
    broker_fee:
      body.brokerFee != null || body.broker_fee != null
        ? Number(body.brokerFee ?? body.broker_fee)
        : undefined,
    owner_id: (body.ownerId ?? body.owner_id) as string | undefined | null,
    previous_agreement_id: (body.previousAgreementId ?? body.previous_agreement_id) as string | undefined | null,
    version: typeof body.version === 'number' ? body.version : undefined,
  };
}

function toRentalWriteFields(p: ReturnType<typeof pickBody>): RentalAgreementWriteFields {
  return {
    agreement_number: p.agreement_number,
    contact_id: p.contact_id,
    property_id: p.property_id,
    start_date: p.start_date,
    end_date: p.end_date,
    monthly_rent: p.monthly_rent,
    rent_due_date: Number.isFinite(p.rent_due_date) ? p.rent_due_date : 1,
    status: p.status,
    description: p.description ?? null,
    security_deposit:
      p.security_deposit != null && Number.isFinite(p.security_deposit) ? p.security_deposit : null,
    broker_id: p.broker_id && String(p.broker_id).trim() ? String(p.broker_id).trim() : null,
    broker_fee: p.broker_fee != null && Number.isFinite(p.broker_fee) ? p.broker_fee : null,
    owner_id: p.owner_id && String(p.owner_id).trim() ? String(p.owner_id).trim() : null,
    previous_agreement_id:
      p.previous_agreement_id && String(p.previous_agreement_id).trim()
        ? String(p.previous_agreement_id).trim()
        : null,
  };
}

export async function listRentalAgreements(
  client: pg.PoolClient,
  tenantId: string,
  filters?: { status?: string; propertyId?: string }
): Promise<RentalAgreementRow[]> {
  return new RentalAgreementRepository(tenantId).list(client, filters);
}

export async function getRentalAgreementById(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<RentalAgreementRow | null> {
  return new RentalAgreementRepository(tenantId).getById(client, id);
}

export async function createRentalAgreement(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>
): Promise<RentalAgreementRow> {
  const p = pickBody(body);
  if (!p.agreement_number) throw new Error('agreementNumber is required.');
  if (!p.contact_id) throw new Error('contactId is required.');
  if (!p.property_id) throw new Error('propertyId is required.');
  const id =
    typeof body.id === 'string' && body.id.trim() ? body.id.trim() : `ra_${randomUUID().replace(/-/g, '')}`;

  const statusNorm = String(p.status || '').trim().toLowerCase();
  if (statusNorm === 'active') {
    const repo = new RentalAgreementRepository(tenantId);
    if (await repo.hasActiveForProperty(client, p.property_id)) {
      throw new Error(
        'This property already has an active agreement. Use Renew agreement, or end the existing lease, before creating another active lease.'
      );
    }
  }

  const row = await new RentalAgreementRepository(tenantId).insertAgreement(
    client,
    id,
    toRentalWriteFields(p)
  );
  await recordDomainMutation(client, {
    tenantId,
    userId: null,
    module: 'rental_agreements',
    entityType: 'rental_agreement',
    entityId: row.id,
    action: 'create',
    summary: `Rental agreement ${row.agreement_number} created`,
    newValue: rowToRentalAgreementApi(row),
    version: row.version,
  });
  return row;
}

export async function updateRentalAgreement(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  body: Record<string, unknown>,
  actorUserId?: string | null
): Promise<{ row: RentalAgreementRow | null; conflict: boolean }> {
  await enforceLockForSave(client, tenantId, 'rental', id, actorUserId);
  const p = pickBody(body);
  const expectedVersion = p.version;
  const repo = new RentalAgreementRepository(tenantId);
  const fields = toRentalWriteFields(p);

  if (expectedVersion !== undefined) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'rental_agreements',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { row: null, conflict: true };

    const row = await repo.updateActive(client, id, fields);
    if (!row) {
      return { row: null, conflict: false };
    }
    await recordDomainMutation(client, {
      tenantId,
      userId: actorUserId,
      module: 'rental_agreements',
      entityType: 'rental_agreement',
      entityId: row.id,
      action: 'update',
      summary: `Rental agreement ${row.agreement_number} updated`,
      newValue: rowToRentalAgreementApi(row),
      version: row.version,
    });
    return { row, conflict: false };
  }

  const row = await repo.updateActive(client, id, fields);
  if (row) {
    await recordDomainMutation(client, {
      tenantId,
      userId: actorUserId,
      module: 'rental_agreements',
      entityType: 'rental_agreement',
      entityId: row.id,
      action: 'update',
      summary: `Rental agreement ${row.agreement_number} updated`,
      newValue: rowToRentalAgreementApi(row),
      version: row.version,
    });
  }
  return { row, conflict: false };
}

/** After create/update, enforce one Active per property and single broker fee on first agreement in each renewal chain. */
export async function syncReconcileRentalAgreementsForTenant(
  client: pg.PoolClient,
  tenantId: string
): Promise<void> {
  const rows = await listRentalAgreements(client, tenantId);
  const asApi: ReconcileRentalAgreementLike[] = rows.map((r) => {
    const o = rowToRentalAgreementApi(r) as Record<string, unknown>;
    return {
      id: String(o.id),
      propertyId: String(o.propertyId),
      contactId: String(o.contactId),
      startDate: String(o.startDate),
      endDate: String(o.endDate),
      status: String(o.status),
      brokerFee: o.brokerFee != null ? Number(o.brokerFee) : undefined,
      previousAgreementId: o.previousAgreementId != null ? String(o.previousAgreementId) : undefined,
    };
  });
  const fixed = reconcileRentalAgreementsListLike(asApi);
  if (!reconcileChangedLike(asApi, fixed)) return;

  const repo = new RentalAgreementRepository(tenantId);
  const origById = new Map(asApi.map((a) => [a.id, a]));
  for (const f of fixed) {
    const o = origById.get(f.id);
    if (!o) continue;
    if (
      o.status === f.status &&
      (o.previousAgreementId ?? '') === (f.previousAgreementId ?? '') &&
      Math.abs((o.brokerFee ?? 0) - (f.brokerFee ?? 0)) <= 0.005
    ) {
      continue;
    }
    await repo.updateReconcile(
      client,
      f.id,
      f.status,
      f.previousAgreementId && String(f.previousAgreementId).trim() ? String(f.previousAgreementId).trim() : null,
      f.brokerFee != null && Number.isFinite(f.brokerFee) ? f.brokerFee : null
    );
  }
}

/**
 * Copy contact_id from the linked previous agreement when contact_id is empty
 * (e.g. property transfer renewed agreement with wrong field in old client).
 */
export async function repairMissingContactIdsFromPreviousAgreement(
  client: pg.PoolClient,
  tenantId: string
): Promise<{ updated: number; ids: string[] }> {
  return new RentalAgreementRepository(tenantId).repairMissingContactIdsFromPrevious(client);
}

function proRataFirstMonthRentLikeForm(monthlyRent: number, startYmd: string): number {
  const parts = startYmd.split('-').map((x) => parseInt(x, 10));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return monthlyRent;
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  const daysInMonth = new Date(y, m, 0).getDate();
  const remainingDays = daysInMonth - d + 1;
  if (remainingDays >= daysInMonth) return monthlyRent;
  return Math.ceil((monthlyRent / daysInMonth) * remainingDays / 100) * 100;
}

/**
 * Mark the current term as Renewed and create a new active agreement (no security or broker; optional first-month rent invoice).
 * Caller must run inside a transaction; calls syncReconcileRentalAgreementsForTenant.
 */
export async function renewRentalAgreement(
  client: pg.PoolClient,
  tenantId: string,
  oldAgreementId: string,
  body: Record<string, unknown>,
  actorUserId: string | null
): Promise<{
  oldRow: RentalAgreementRow;
  newRow: RentalAgreementRow;
  generatedInvoices: Record<string, unknown>[];
  nextInvoiceNumber?: number;
}> {
  const old = await getRentalAgreementById(client, tenantId, oldAgreementId);
  if (!old) throw new Error('Agreement not found.');
  if (String(old.status).trim().toLowerCase() !== 'active') {
    throw new Error('Only an active agreement can be renewed.');
  }

  const expectedVersion = body.oldVersion ?? body.serverVersion;
  if (typeof expectedVersion !== 'number' || !Number.isFinite(expectedVersion)) {
    throw new Error('oldVersion (current agreement version) is required to renew safely.');
  }

  const repo = new RentalAgreementRepository(tenantId);
  const uOldRow = await repo.markRenewed(client, oldAgreementId, expectedVersion);
  if (!uOldRow) {
    const again = await getRentalAgreementById(client, tenantId, oldAgreementId);
    if (!again) throw new Error('Agreement not found.');
    throw new Error('This agreement was updated elsewhere. Please refresh and try again.');
  }

  const newId =
    typeof body.newAgreementId === 'string' && body.newAgreementId.trim()
      ? body.newAgreementId.trim()
      : `ra_${randomUUID().replace(/-/g, '')}`;
  const agreementNumber = String(body.agreementNumber ?? body.agreement_number ?? '').trim();
  if (!agreementNumber) throw new Error('agreementNumber is required.');

  const startDate = parseIsoDate('startDate', body.startDate ?? body.start_date);
  const endDate = parseIsoDate('endDate', body.endDate ?? body.end_date);
  const monthlyRent = Number(body.monthlyRent ?? body.monthly_rent ?? 0);
  const rentDueDate =
    body.rentDueDate != null || body.rent_due_date != null
      ? Number(body.rentDueDate ?? body.rent_due_date)
      : 1;
  const description =
    body.description === undefined ? undefined : body.description === null ? null : String(body.description);
  const ownerForNew =
    body.ownerId != null && String(body.ownerId).trim()
      ? String(body.ownerId).trim()
      : body.owner_id != null && String(body.owner_id).trim()
        ? String(body.owner_id).trim()
        : old.owner_id && String(old.owner_id).trim()
          ? String(old.owner_id).trim()
          : null;

  const newRowInserted = await createRentalAgreement(client, tenantId, {
    id: newId,
    agreementNumber,
    contactId: old.contact_id,
    propertyId: old.property_id,
    startDate,
    endDate,
    monthlyRent,
    rentDueDate: Number.isFinite(rentDueDate) ? rentDueDate : 1,
    status: 'Active',
    description: description ?? undefined,
    securityDeposit: 0,
    brokerId: undefined,
    brokerFee: undefined,
    ownerId: ownerForNew || undefined,
    previousAgreementId: oldAgreementId,
  });
  let newRow = (await getRentalAgreementById(client, tenantId, newRowInserted.id)) ?? newRowInserted;
  await syncReconcileRentalAgreementsForTenant(client, tenantId);
  newRow = (await getRentalAgreementById(client, tenantId, newId)) ?? newRow;
  const oldRow = (await getRentalAgreementById(client, tenantId, oldAgreementId)) ?? uOldRow;

  const generated: Record<string, unknown>[] = [];
  let nextInvoiceNumber: number | undefined;

  const wantInvoice =
    body.generateFirstMonthRentInvoice === true ||
    body.generateInvoices === true ||
    body.generateFirstMonthRent === true;
  if (wantInvoice && monthlyRent > 0) {
    const property = await getPropertyById(client, tenantId, old.property_id);
    const invPrefix = String(body.invoicePrefix ?? 'INV-');
    const invPadding = Number((body as { invoicePadding?: unknown }).invoicePadding ?? 5);
    let invNext = Number((body as { invoiceNextNumber?: unknown }).invoiceNextNumber ?? 1);
    if (!Number.isFinite(invNext)) invNext = 1;
    const pad = Number.isFinite(invPadding) && invPadding >= 1 ? Math.floor(invPadding) : 5;

    const numPart = (n: number) => String(n).padStart(pad, '0');
    const invoiceNumber = `${invPrefix}${numPart(invNext)}`;
    const categoryId = await new CategoryRepository(tenantId).findTenantCategoryIdByLowerName(
      client,
      'rental income'
    );
    const amount = proRataFirstMonthRentLikeForm(monthlyRent, startDate);
    const startNorm = /^\d{4}-\d{2}-\d{2}/.test(startDate) ? startDate : startDate;
    const monthName = new Date(
      startNorm.length >= 10 ? `${startNorm.slice(0, 10)}T12:00:00` : startNorm
    ).toLocaleString('default', { month: 'long', year: 'numeric' });
    const inv = await createInvoice(
      client,
      tenantId,
      {
        invoiceNumber,
        contactId: old.contact_id,
        amount,
        paidAmount: 0,
        status: 'Unpaid',
        issueDate: startDate,
        dueDate: startDate,
        invoiceType: 'Rental',
        description: `Rent for ${monthName} [Rental]`,
        buildingId: property?.building_id ?? undefined,
        propertyId: old.property_id,
        categoryId: categoryId ?? undefined,
        agreementId: newId,
        rentalMonth: startDate.slice(0, 7),
        userId: actorUserId ?? undefined,
      },
      actorUserId
    );
    nextInvoiceNumber = invNext + 1;
    generated.push(rowToInvoiceApi(inv));
  }

  return { oldRow, newRow, generatedInvoices: generated, nextInvoiceNumber };
}

export async function softDeleteRentalAgreement(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  expectedVersion?: number
): Promise<{ ok: boolean; conflict: boolean }> {
  const before = await getRentalAgreementById(client, tenantId, id);
  const repo = new RentalAgreementRepository(tenantId);
  if (expectedVersion !== undefined) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'rental_agreements',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { ok: false, conflict: true };

    const row = await repo.markDeleted(client, id);
    if (!row) {
      if (!before) return { ok: false, conflict: false };
      return { ok: false, conflict: false };
    }
    await recordDomainMutation(client, {
      tenantId,
      userId: null,
      module: 'rental_agreements',
      entityType: 'rental_agreement',
      entityId: row.id,
      action: 'delete',
      summary: `Rental agreement ${row.agreement_number} deleted`,
      oldValue: before ? rowToRentalAgreementApi(before) : null,
      version: row.version,
    });
    return { ok: true, conflict: false };
  }
  const row = await repo.markDeleted(client, id);
  const ok = row != null;
  if (ok && row) {
    await recordDomainMutation(client, {
      tenantId,
      userId: null,
      module: 'rental_agreements',
      entityType: 'rental_agreement',
      entityId: row.id,
      action: 'delete',
      summary: `Rental agreement ${row.agreement_number} deleted`,
      oldValue: before ? rowToRentalAgreementApi(before) : null,
      version: row.version,
    });
  }
  return { ok, conflict: false };
}
