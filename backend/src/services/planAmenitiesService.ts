import type pg from 'pg';
import { randomUUID } from 'crypto';

export type PlanAmenityRow = {
  id: string;
  tenant_id: string;
  name: string;
  price: string;
  is_percentage: number;
  is_active: number;
  description: string | null;
  version: number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export function rowToPlanAmenityApi(row: PlanAmenityRow): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: row.id,
    name: row.name,
    price: Number(row.price),
    isPercentage: row.is_percentage === 1,
    isActive: row.is_active === 1,
    version: row.version,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
  if (row.description) base.description = row.description;
  if (row.deleted_at) {
    base.deletedAt = row.deleted_at instanceof Date ? row.deleted_at.toISOString() : row.deleted_at;
  }
  return base;
}

function pickBody(body: Record<string, unknown>) {
  const name = String(body.name ?? '').trim();
  const price = Number(body.price ?? 0);
  const isPercentage =
    body.isPercentage === true ||
    body.is_percentage === true ||
    body.isPercentage === 1 ||
    body.is_percentage === 1;
  const isActive =
    body.isActive !== false &&
    body.is_active !== false &&
    body.isActive !== 0 &&
    body.is_active !== 0;
  return {
    name,
    price,
    is_percentage: isPercentage ? 1 : 0,
    is_active: isActive ? 1 : 0,
    description:
      body.description === undefined || body.description === null
        ? null
        : String(body.description),
    version: typeof body.version === 'number' ? body.version : undefined,
  };
}

export async function listPlanAmenities(
  client: pg.PoolClient,
  tenantId: string,
  filters?: { activeOnly?: boolean }
): Promise<PlanAmenityRow[]> {
  let q = `SELECT id, tenant_id, name, price::text, is_percentage, is_active, description, version, deleted_at, created_at, updated_at
     FROM plan_amenities WHERE tenant_id = $1 AND deleted_at IS NULL`;
  const params: unknown[] = [tenantId];
  if (filters?.activeOnly) {
    q += ` AND is_active = 1`;
  }
  q += ` ORDER BY name ASC`;
  const r = await client.query<PlanAmenityRow>(q, params);
  return r.rows;
}

export async function getPlanAmenityById(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<PlanAmenityRow | null> {
  const r = await client.query<PlanAmenityRow>(
    `SELECT id, tenant_id, name, price::text, is_percentage, is_active, description, version, deleted_at, created_at, updated_at
     FROM plan_amenities WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, tenantId]
  );
  return r.rows[0] ?? null;
}

async function getByIdIncludingDeleted(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<PlanAmenityRow | null> {
  const r = await client.query<PlanAmenityRow>(
    `SELECT id, tenant_id, name, price::text, is_percentage, is_active, description, version, deleted_at, created_at, updated_at
     FROM plan_amenities WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  return r.rows[0] ?? null;
}

export async function upsertPlanAmenity(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>
): Promise<{ row: PlanAmenityRow; conflict: boolean; wasInsert: boolean }> {
  const p = pickBody(body);
  if (!p.name) throw new Error('name is required.');

  const id =
    typeof body.id === 'string' && body.id.trim() ? body.id.trim() : `amenity_${randomUUID().replace(/-/g, '')}`;

  const existing = await getByIdIncludingDeleted(client, tenantId, id);
  if (!existing) {
    const ins = await client.query<PlanAmenityRow>(
      `INSERT INTO plan_amenities (
         id, tenant_id, name, price, is_percentage, is_active, description, version, deleted_at, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 1, NULL, NOW(), NOW())
       RETURNING id, tenant_id, name, price::text, is_percentage, is_active, description, version, deleted_at, created_at, updated_at`,
      [id, tenantId, p.name, p.price, p.is_percentage, p.is_active, p.description]
    );
    return { row: ins.rows[0], conflict: false, wasInsert: true };
  }

  if (p.version !== undefined && existing.version !== p.version) {
    return { row: existing, conflict: true, wasInsert: false };
  }

  if (existing.deleted_at) {
    const u = await client.query<PlanAmenityRow>(
      `UPDATE plan_amenities SET
         name = $3, price = $4, is_percentage = $5, is_active = $6, description = $7,
         deleted_at = NULL, version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING id, tenant_id, name, price::text, is_percentage, is_active, description, version, deleted_at, created_at, updated_at`,
      [id, tenantId, p.name, p.price, p.is_percentage, p.is_active, p.description]
    );
    return { row: u.rows[0], conflict: false, wasInsert: false };
  }

  const u = await client.query<PlanAmenityRow>(
    `UPDATE plan_amenities SET
       name = $3, price = $4, is_percentage = $5, is_active = $6, description = $7,
       version = version + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     RETURNING id, tenant_id, name, price::text, is_percentage, is_active, description, version, deleted_at, created_at, updated_at`,
    [id, tenantId, p.name, p.price, p.is_percentage, p.is_active, p.description]
  );
  if (u.rows.length === 0) {
    return { row: existing, conflict: true, wasInsert: false };
  }
  return { row: u.rows[0], conflict: false, wasInsert: false };
}

export async function softDeletePlanAmenity(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  expectedVersion?: number
): Promise<{ ok: boolean; conflict: boolean }> {
  if (expectedVersion !== undefined) {
    const u = await client.query(
      `UPDATE plan_amenities SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL AND version = $3`,
      [id, tenantId, expectedVersion]
    );
    if ((u.rowCount ?? 0) === 0) {
      const ex = await getByIdIncludingDeleted(client, tenantId, id);
      if (!ex || ex.deleted_at) return { ok: false, conflict: false };
      return { ok: false, conflict: true };
    }
    return { ok: true, conflict: false };
  }
  const u = await client.query(
    `UPDATE plan_amenities SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, tenantId]
  );
  return { ok: (u.rowCount ?? 0) > 0, conflict: false };
}

export async function listPlanAmenitiesChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<PlanAmenityRow[]> {
  const r = await client.query<PlanAmenityRow>(
    `SELECT id, tenant_id, name, price::text, is_percentage, is_active, description, version, deleted_at, created_at, updated_at
     FROM plan_amenities WHERE tenant_id = $1 AND updated_at > $2
     ORDER BY updated_at ASC`,
    [tenantId, since]
  );
  return r.rows;
}
