import type pg from 'pg';
import { formatPgDateToYyyyMmDd, parseApiDateToYyyyMmDd, parseApiDateToYyyyMmDdOptional } from '../utils/dateOnly.js';
import { randomUUID } from 'crypto';

export type ProjectReceivedAssetRow = {
  id: string;
  tenant_id: string;
  project_id: string;
  contact_id: string;
  invoice_id: string | null;
  description: string;
  asset_type: string;
  recorded_value: string;
  received_date: Date;
  sold_date: Date | null;
  sale_amount: string | null;
  sale_account_id: string | null;
  notes: string | null;
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

export function rowToProjectReceivedAssetApi(row: ProjectReceivedAssetRow): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: row.id,
    projectId: row.project_id,
    contactId: row.contact_id,
    invoiceId: row.invoice_id ?? undefined,
    description: row.description,
    assetType: row.asset_type,
    recordedValue: Number(row.recorded_value),
    receivedDate: formatPgDateToYyyyMmDd(row.received_date),
    soldDate: row.sold_date ? formatPgDateToYyyyMmDd(row.sold_date) : undefined,
    saleAmount: row.sale_amount != null ? Number(row.sale_amount) : undefined,
    saleAccountId: row.sale_account_id ?? undefined,
    notes: row.notes ?? undefined,
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
  const receivedDate = parseDate('receivedDate', body.receivedDate ?? body.received_date);
  const soldRaw = body.soldDate ?? body.sold_date;
  const soldDate = optDate(soldRaw);

  return {
    project_id: String(body.projectId ?? body.project_id ?? '').trim(),
    contact_id: String(body.contactId ?? body.contact_id ?? '').trim(),
    invoice_id:
      body.invoiceId === undefined && body.invoice_id === undefined
        ? undefined
        : body.invoiceId === null || body.invoice_id === null
          ? null
          : String(body.invoiceId ?? body.invoice_id).trim() || null,
    description: String(body.description ?? '').trim(),
    asset_type: String(body.assetType ?? body.asset_type ?? 'Other').trim(),
    recorded_value: Number(body.recordedValue ?? body.recorded_value ?? 0),
    received_date: receivedDate,
    sold_date: soldDate,
    sale_amount:
      body.saleAmount != null || body.sale_amount != null
        ? Number(body.saleAmount ?? body.sale_amount)
        : null,
    sale_account_id:
      body.saleAccountId === undefined && body.sale_account_id === undefined
        ? undefined
        : body.saleAccountId === null || body.sale_account_id === null
          ? null
          : String(body.saleAccountId ?? body.sale_account_id).trim() || null,
    notes:
      body.notes === undefined ? undefined : body.notes === null ? null : String(body.notes),
    user_id: (body.userId ?? body.user_id) as string | null | undefined,
    version: typeof body.version === 'number' ? body.version : undefined,
  };
}

export async function listProjectReceivedAssets(
  client: pg.PoolClient,
  tenantId: string,
  filters?: { projectId?: string }
): Promise<ProjectReceivedAssetRow[]> {
  const params: unknown[] = [tenantId];
  let q = `SELECT id, tenant_id, project_id, contact_id, invoice_id, description, asset_type, recorded_value,
                  received_date, sold_date, sale_amount, sale_account_id, notes, user_id, version, deleted_at, created_at, updated_at
           FROM project_received_assets WHERE tenant_id = $1 AND deleted_at IS NULL`;
  if (filters?.projectId) {
    params.push(filters.projectId);
    q += ` AND project_id = $${params.length}`;
  }
  q += ' ORDER BY received_date DESC, id ASC';
  const r = await client.query<ProjectReceivedAssetRow>(q, params);
  return r.rows;
}

export async function listProjectReceivedAssetsChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<ProjectReceivedAssetRow[]> {
  const r = await client.query<ProjectReceivedAssetRow>(
    `SELECT id, tenant_id, project_id, contact_id, invoice_id, description, asset_type, recorded_value,
            received_date, sold_date, sale_amount, sale_account_id, notes, user_id, version, deleted_at, created_at, updated_at
     FROM project_received_assets WHERE tenant_id = $1 AND updated_at > $2
     ORDER BY updated_at ASC`,
    [tenantId, since]
  );
  return r.rows;
}

export async function getProjectReceivedAssetById(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<ProjectReceivedAssetRow | null> {
  const r = await client.query<ProjectReceivedAssetRow>(
    `SELECT id, tenant_id, project_id, contact_id, invoice_id, description, asset_type, recorded_value,
            received_date, sold_date, sale_amount, sale_account_id, notes, user_id, version, deleted_at, created_at, updated_at
     FROM project_received_assets WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, tenantId]
  );
  return r.rows[0] ?? null;
}

export async function getProjectReceivedAssetByIdIncludingDeleted(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<ProjectReceivedAssetRow | null> {
  const r = await client.query<ProjectReceivedAssetRow>(
    `SELECT id, tenant_id, project_id, contact_id, invoice_id, description, asset_type, recorded_value,
            received_date, sold_date, sale_amount, sale_account_id, notes, user_id, version, deleted_at, created_at, updated_at
     FROM project_received_assets WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  return r.rows[0] ?? null;
}

export async function upsertProjectReceivedAsset(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>,
  actorUserId: string | null
): Promise<{ row: ProjectReceivedAssetRow; conflict: boolean; wasInsert: boolean }> {
  const p = pickBody(body);
  if (!p.project_id) throw new Error('projectId is required.');
  if (!p.contact_id) throw new Error('contactId is required.');
  if (!p.description) throw new Error('description is required.');

  const id =
    typeof body.id === 'string' && body.id.trim() ? body.id.trim() : `pra_${randomUUID().replace(/-/g, '')}`;

  const existing = await getProjectReceivedAssetByIdIncludingDeleted(client, tenantId, id);
  if (!existing) {
    const row = await insertProjectReceivedAsset(client, tenantId, { ...body, id }, actorUserId);
    return { row, conflict: false, wasInsert: true };
  }

  const expectedVersion = p.version;
  if (expectedVersion !== undefined && existing.version !== expectedVersion) {
    return { row: existing, conflict: true, wasInsert: false };
  }

  const vals = [
    p.project_id,
    p.contact_id,
    p.invoice_id ?? null,
    p.description,
    p.asset_type,
    p.recorded_value,
    p.received_date,
    p.sold_date,
    p.sale_amount != null && Number.isFinite(p.sale_amount) ? p.sale_amount : null,
    p.sale_account_id ?? null,
    p.notes ?? null,
  ];

  const u = await client.query<ProjectReceivedAssetRow>(
    `UPDATE project_received_assets SET
       project_id = $3, contact_id = $4, invoice_id = $5, description = $6, asset_type = $7,
       recorded_value = $8, received_date = $9::date, sold_date = $10::date, sale_amount = $11,
       sale_account_id = $12, notes = $13,
       deleted_at = NULL, version = version + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2
     RETURNING id, tenant_id, project_id, contact_id, invoice_id, description, asset_type, recorded_value,
               received_date, sold_date, sale_amount, sale_account_id, notes, user_id, version, deleted_at, created_at, updated_at`,
    [id, tenantId, ...vals]
  );
  const row = u.rows[0];
  if (!row) throw new Error('Upsert failed.');
  return { row, conflict: false, wasInsert: false };
}

async function insertProjectReceivedAsset(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>,
  actorUserId: string | null
): Promise<ProjectReceivedAssetRow> {
  const p = pickBody(body);
  if (!p.project_id) throw new Error('projectId is required.');
  if (!p.contact_id) throw new Error('contactId is required.');
  if (!p.description) throw new Error('description is required.');
  const id =
    typeof body.id === 'string' && body.id.trim() ? body.id.trim() : `pra_${randomUUID().replace(/-/g, '')}`;

  const r = await client.query<ProjectReceivedAssetRow>(
    `INSERT INTO project_received_assets (
       id, tenant_id, project_id, contact_id, invoice_id, description, asset_type, recorded_value,
       received_date, sold_date, sale_amount, sale_account_id, notes, user_id, version, deleted_at, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10::date, $11, $12, $13, $14, 1, NULL, NOW(), NOW()
     )
     RETURNING id, tenant_id, project_id, contact_id, invoice_id, description, asset_type, recorded_value,
               received_date, sold_date, sale_amount, sale_account_id, notes, user_id, version, deleted_at, created_at, updated_at`,
    [
      id,
      tenantId,
      p.project_id,
      p.contact_id,
      p.invoice_id ?? null,
      p.description,
      p.asset_type,
      p.recorded_value,
      p.received_date,
      p.sold_date,
      p.sale_amount != null && Number.isFinite(p.sale_amount) ? p.sale_amount : null,
      p.sale_account_id ?? null,
      p.notes ?? null,
      p.user_id && String(p.user_id).trim() ? String(p.user_id).trim() : actorUserId,
    ]
  );
  return r.rows[0];
}

export async function softDeleteProjectReceivedAsset(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  expectedVersion?: number
): Promise<{ ok: boolean; conflict: boolean }> {
  if (expectedVersion !== undefined) {
    const r = await client.query(
      `UPDATE project_received_assets SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL AND version = $3`,
      [id, tenantId, expectedVersion]
    );
    if (r.rowCount === 0) {
      const exists = await getProjectReceivedAssetById(client, tenantId, id);
      if (!exists) return { ok: false, conflict: false };
      return { ok: false, conflict: true };
    }
    return { ok: true, conflict: false };
  }
  const r = await client.query(
    `UPDATE project_received_assets SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, tenantId]
  );
  return { ok: (r.rowCount ?? 0) > 0, conflict: false };
}
