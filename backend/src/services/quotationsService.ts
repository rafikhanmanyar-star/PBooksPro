import type pg from 'pg';
import { randomUUID } from 'crypto';
import { formatPgDateToYyyyMmDd, parseApiDateToYyyyMmDd } from '../utils/dateOnly.js';
import { recordDomainMutation } from '../core/recordDomainMutation.js';
import { checkEntityLwwConflict } from '../core/entityMutation.js';
import {
  QuotationRepository,
  type QuotationWriteFields,
} from '../modules/vendors/repositories/QuotationRepository.js';

export type QuotationRow = {
  id: string;
  tenant_id: string;
  vendor_id: string;
  name: string;
  quotation_number: string | null;
  date: Date;
  expiry_date: Date | null;
  enable_price_validation: boolean;
  validation_scope: string;
  is_active: boolean;
  items: unknown;
  total_amount: string;
  document_id: string | null;
  user_id: string | null;
  version: number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

function parseItems(v: unknown): unknown[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

function computeTotalFromItems(items: unknown[], fallback: number): number {
  if (!items.length) return fallback;
  let sum = 0;
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const qty = Number(item.quantity ?? 0);
    const price = Number(item.pricePerQuantity ?? item.price_per_quantity ?? 0);
    if (Number.isFinite(qty) && Number.isFinite(price)) sum += qty * price;
  }
  return sum > 0 ? sum : fallback;
}

export function rowToQuotationApi(row: QuotationRow): Record<string, unknown> {
  const items = parseItems(row.items);
  const totalAmount = Number(row.total_amount) || computeTotalFromItems(items, 0);
  const base: Record<string, unknown> = {
    id: row.id,
    vendorId: row.vendor_id,
    name: row.name,
    quotationNumber: row.quotation_number ?? undefined,
    date: formatPgDateToYyyyMmDd(row.date) ?? '',
    expiryDate: formatPgDateToYyyyMmDd(row.expiry_date) ?? undefined,
    enablePriceValidation: row.enable_price_validation !== false,
    validationScope: row.validation_scope ?? 'CATEGORY',
    isActive: row.is_active !== false,
    items,
    totalAmount,
    documentId: row.document_id ?? undefined,
    userId: row.user_id ?? undefined,
    version: row.version,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
  if (row.deleted_at) {
    base.deletedAt = row.deleted_at instanceof Date ? row.deleted_at.toISOString() : row.deleted_at;
  }
  return base;
}

function pickBody(body: Record<string, unknown>) {
  const dateRaw = body.date;
  if (dateRaw == null || dateRaw === '') throw new Error('date is required.');
  let dateStr: string;
  try {
    dateStr = parseApiDateToYyyyMmDd(dateRaw);
  } catch {
    throw new Error('Invalid date.');
  }

  const items = parseItems(body.items);
  const totalRaw = body.totalAmount ?? body.total_amount;
  const totalFallback = Number(totalRaw);
  const total_amount = computeTotalFromItems(
    items,
    Number.isFinite(totalFallback) ? totalFallback : 0
  );

  const validationScopeRaw = String(body.validationScope ?? body.validation_scope ?? 'CATEGORY').toUpperCase();
  const validation_scope = validationScopeRaw === 'ITEM' ? 'ITEM' : 'CATEGORY';

  let expiryStr: string | null = null;
  const expiryRaw = body.expiryDate ?? body.expiry_date;
  if (expiryRaw != null && expiryRaw !== '') {
    try {
      expiryStr = parseApiDateToYyyyMmDd(expiryRaw);
    } catch {
      throw new Error('Invalid expiry date.');
    }
  }

  return {
    vendor_id: String(body.vendorId ?? body.vendor_id ?? '').trim(),
    name: String(body.name ?? '').trim(),
    quotation_number:
      body.quotationNumber === undefined && body.quotation_number === undefined
        ? null
        : body.quotationNumber === null || body.quotation_number === null
          ? null
          : String(body.quotationNumber ?? body.quotation_number).trim() || null,
    date: dateStr,
    expiry_date: expiryStr,
    enable_price_validation: body.enablePriceValidation === false || body.enable_price_validation === false ? false : true,
    validation_scope,
    is_active: body.isActive === false || body.is_active === false ? false : true,
    items,
    total_amount,
    document_id:
      body.documentId === undefined && body.document_id === undefined
        ? undefined
        : body.documentId === null || body.document_id === null
          ? null
          : String(body.documentId ?? body.document_id),
    user_id: (body.userId ?? body.user_id) as string | null | undefined,
    version: typeof body.version === 'number' ? body.version : undefined,
  };
}

export async function listQuotations(client: pg.PoolClient, tenantId: string): Promise<QuotationRow[]> {
  return new QuotationRepository(tenantId).listActive(client);
}

export async function getQuotationById(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<QuotationRow | null> {
  return new QuotationRepository(tenantId).getById(client, id);
}

async function getQuotationByIdIncludingDeleted(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<QuotationRow | null> {
  return new QuotationRepository(tenantId).getByIdIncludingDeleted(client, id);
}

export async function listQuotationsChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<QuotationRow[]> {
  return new QuotationRepository(tenantId).listChangedSince(client, since);
}

function quotationWriteFields(p: ReturnType<typeof pickBody>): QuotationWriteFields {
  return {
    vendor_id: p.vendor_id,
    name: p.name,
    quotation_number: p.quotation_number,
    date: p.date,
    expiry_date: p.expiry_date,
    enable_price_validation: p.enable_price_validation,
    validation_scope: p.validation_scope,
    is_active: p.is_active,
    items_json: JSON.stringify(p.items),
    total_amount: p.total_amount,
    document_id: p.document_id ?? null,
  };
}

async function insertQuotation(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  p: ReturnType<typeof pickBody>,
  actorUserId: string | null
): Promise<QuotationRow> {
  const row = await new QuotationRepository(tenantId).insertQuotation(
    client,
    id,
    quotationWriteFields(p),
    p.user_id ?? actorUserId
  );
  await recordDomainMutation(client, {
    tenantId,
    userId: row.user_id,
    module: 'quotations',
    entityType: 'quotation',
    entityId: row.id,
    action: 'create',
    summary: `Quotation ${row.name} created`,
    newValue: rowToQuotationApi(row),
    version: row.version,
  });
  return row;
}

async function updateQuotationRow(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  p: ReturnType<typeof pickBody>
): Promise<QuotationRow> {
  const row = await new QuotationRepository(tenantId).updateActive(
    client,
    id,
    quotationWriteFields(p),
    p.user_id ?? null
  );
  if (!row) throw new Error('Quotation not found.');
  return row;
}

export async function upsertQuotation(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>,
  actorUserId: string | null
): Promise<{ row: QuotationRow; conflict: boolean; wasInsert: boolean }> {
  const p = pickBody(body);
  if (!p.vendor_id) throw new Error('vendorId is required.');
  if (!p.name) throw new Error('name is required.');

  const id =
    typeof body.id === 'string' && body.id.trim()
      ? body.id.trim()
      : `quotation_${randomUUID().replace(/-/g, '')}`;

  const existing = await getQuotationByIdIncludingDeleted(client, tenantId, id);
  if (!existing) {
    const row = await insertQuotation(client, tenantId, id, p, actorUserId);
    return { row, conflict: false, wasInsert: true };
  }

  let existingRow = existing;
  if (existingRow.deleted_at) {
    await new QuotationRepository(tenantId).reviveDeleted(client, id);
    existingRow = { ...existingRow, deleted_at: null, version: 1 };
  }

  if (p.version != null) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'quotations',
      entityId: id,
      clientVersion: p.version,
    });
    if (lww.conflict) return { row: existingRow, conflict: true, wasInsert: false };
  }

  const oldApi = rowToQuotationApi(existingRow);
  const row = await updateQuotationRow(client, tenantId, id, p);
  await recordDomainMutation(client, {
    tenantId,
    userId: row.user_id,
    module: 'quotations',
    entityType: 'quotation',
    entityId: row.id,
    action: 'update',
    summary: `Quotation ${row.name} updated`,
    newValue: rowToQuotationApi(row),
    oldValue: oldApi,
    version: row.version,
  });
  return { row, conflict: false, wasInsert: false };
}

export async function softDeleteQuotation(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  expectedVersion?: number
): Promise<{ ok: boolean; conflict: boolean }> {
  const ex = await getQuotationByIdIncludingDeleted(client, tenantId, id);
  if (!ex || ex.deleted_at) return { ok: false, conflict: false };
  const oldApi = rowToQuotationApi(ex);

  if (expectedVersion != null) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'quotations',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { ok: false, conflict: true };
  }

  await new QuotationRepository(tenantId).markDeleted(client, id);
  await recordDomainMutation(client, {
    tenantId,
    userId: ex.user_id,
    module: 'quotations',
    entityType: 'quotation',
    entityId: id,
    action: 'delete',
    summary: `Quotation ${ex.name} deleted`,
    oldValue: oldApi,
  });
  return { ok: true, conflict: false };
}
