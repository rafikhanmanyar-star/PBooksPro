import type pg from 'pg';
import { randomUUID } from 'crypto';
import { formatPgDateToYyyyMmDd, parseApiDateToYyyyMmDd } from '../utils/dateOnly.js';
import { recordDomainMutation } from '../core/recordDomainMutation.js';
import { checkEntityLwwConflict } from '../core/entityMutation.js';
import { QuotationRepository } from '../modules/vendors/repositories/QuotationRepository.js';

export type QuotationRow = {
  id: string;
  tenant_id: string;
  vendor_id: string;
  name: string;
  date: Date;
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
    date: formatPgDateToYyyyMmDd(row.date) ?? '',
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

  return {
    vendor_id: String(body.vendorId ?? body.vendor_id ?? '').trim(),
    name: String(body.name ?? '').trim(),
    date: dateStr,
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

const SELECT_COLS = `id, tenant_id, vendor_id, name, date, items, total_amount::text, document_id, user_id, version, deleted_at, created_at, updated_at`;

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

async function insertQuotation(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  p: ReturnType<typeof pickBody>,
  actorUserId: string | null
): Promise<QuotationRow> {
  const r = await client.query<QuotationRow>(
    `INSERT INTO quotations (id, tenant_id, vendor_id, name, date, items, total_amount, document_id, user_id, version, deleted_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5::date, $6::jsonb, $7, $8, $9, 1, NULL, NOW(), NOW())
     RETURNING ${SELECT_COLS}`,
    [
      id,
      tenantId,
      p.vendor_id,
      p.name,
      p.date,
      JSON.stringify(p.items),
      p.total_amount,
      p.document_id ?? null,
      p.user_id ?? actorUserId,
    ]
  );
  const row = r.rows[0]!;
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
  const r = await client.query<QuotationRow>(
    `UPDATE quotations SET
       vendor_id = $3, name = $4, date = $5::date, items = $6::jsonb, total_amount = $7,
       document_id = $8, user_id = COALESCE($9, user_id), version = version + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     RETURNING ${SELECT_COLS}`,
    [
      id,
      tenantId,
      p.vendor_id,
      p.name,
      p.date,
      JSON.stringify(p.items),
      p.total_amount,
      p.document_id ?? null,
      p.user_id ?? null,
    ]
  );
  if (!r.rows[0]) throw new Error('Quotation not found.');
  return r.rows[0];
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
    await client.query(
      `UPDATE quotations SET deleted_at = NULL, version = 1, updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
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

  await client.query(
    `UPDATE quotations SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, tenantId]
  );
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
