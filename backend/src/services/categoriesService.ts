import type pg from 'pg';
import { randomUUID } from 'crypto';
import { GLOBAL_SYSTEM_TENANT_ID } from '../constants/globalSystemChart.js';

const ALLOWED_PL_TYPES = new Set([
  'revenue',
  'cost_of_sales',
  'operating_expense',
  'other_income',
  'finance_cost',
  'tax',
]);

/** `preserve` = body did not include plSubType — leave DB unchanged. */
export type PlSubTypePick = 'preserve' | string | null;

export function pickPlSubType(body: Record<string, unknown>): PlSubTypePick {
  if (!('plSubType' in body) && !('pl_sub_type' in body)) return 'preserve';
  const v = body.plSubType ?? body.pl_sub_type;
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim();
  if (!s) return null;
  if (!ALLOWED_PL_TYPES.has(s)) {
    throw new Error(`Invalid plSubType: ${s}`);
  }
  return s;
}

export async function syncPlCategoryMappingFromPick(
  client: pg.PoolClient,
  tenantId: string,
  categoryId: string,
  pick: PlSubTypePick
): Promise<void> {
  if (pick === 'preserve') return;
  if (pick === null) {
    await client.query(
      `DELETE FROM pl_category_mapping WHERE tenant_id = $1 AND category_id = $2`,
      [tenantId, categoryId]
    );
    return;
  }
  await client.query(
    `INSERT INTO pl_category_mapping (tenant_id, category_id, pl_type, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (tenant_id, category_id) DO UPDATE SET pl_type = EXCLUDED.pl_type, updated_at = NOW()`,
    [tenantId, categoryId, pick]
  );
}

/** Tenant row wins over global system tenant when both exist. */
export async function fetchPlSubTypesForTenant(
  client: pg.PoolClient,
  tenantId: string
): Promise<Map<string, string>> {
  const r = await client.query<{ category_id: string; pl_type: string; tenant_id: string }>(
    `SELECT category_id, pl_type, tenant_id FROM pl_category_mapping WHERE tenant_id = $1 OR tenant_id = $2`,
    [tenantId, GLOBAL_SYSTEM_TENANT_ID]
  );
  const fromGlobal = new Map<string, string>();
  const fromTenant = new Map<string, string>();
  for (const row of r.rows) {
    if (row.tenant_id === tenantId) {
      fromTenant.set(row.category_id, row.pl_type);
    } else {
      fromGlobal.set(row.category_id, row.pl_type);
    }
  }
  const merged = new Map<string, string>(fromGlobal);
  for (const [k, v] of fromTenant) {
    merged.set(k, v);
  }
  return merged;
}

export async function getPlSubTypeForCategory(
  client: pg.PoolClient,
  tenantId: string,
  categoryId: string
): Promise<string | undefined> {
  const r = await client.query<{ pl_type: string }>(
    `SELECT pl_type FROM pl_category_mapping
     WHERE category_id = $1 AND (tenant_id = $2 OR tenant_id = $3)
     ORDER BY CASE WHEN tenant_id = $2 THEN 0 ELSE 1 END
     LIMIT 1`,
    [categoryId, tenantId, GLOBAL_SYSTEM_TENANT_ID]
  );
  return r.rows[0]?.pl_type;
}

export type CategoryRow = {
  id: string;
  tenant_id: string;
  name: string;
  type: string;
  description: string | null;
  is_permanent: boolean;
  is_rental: boolean;
  is_hidden: boolean;
  parent_category_id: string | null;
  version: number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export function rowToCategoryApi(row: CategoryRow, plSubType?: string | null): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: row.id,
    name: row.name,
    type: row.type,
    isPermanent: row.is_permanent,
    isRental: row.is_rental,
    isHidden: row.is_hidden,
    description: row.description ?? undefined,
    parentCategoryId: row.parent_category_id ?? undefined,
    version: row.version,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
  if (row.deleted_at) {
    base.deletedAt =
      row.deleted_at instanceof Date ? row.deleted_at.toISOString() : row.deleted_at;
  }
  if (plSubType) {
    base.plSubType = plSubType;
  }
  return base;
}

function pickBody(body: Record<string, unknown>) {
  return {
    name: String(body.name ?? '').trim(),
    type: String(body.type ?? '').trim(),
    description:
      body.description === undefined ? undefined : body.description === null ? null : String(body.description),
    is_permanent:
      body.isPermanent === true ||
      body.isPermanent === 1 ||
      body.is_permanent === true ||
      body.is_permanent === 1,
    is_rental:
      body.isRental === true || body.isRental === 1 || body.is_rental === true || body.is_rental === 1,
    is_hidden:
      body.isHidden === true || body.isHidden === 1 || body.is_hidden === true || body.is_hidden === 1,
    parent_category_id: (body.parentCategoryId ?? body.parent_category_id) as string | null | undefined,
    version: typeof body.version === 'number' ? body.version : undefined,
  };
}

export async function listCategories(client: pg.PoolClient, tenantId: string): Promise<CategoryRow[]> {
  const r = await client.query<CategoryRow>(
    `SELECT id, tenant_id, name, type, description, is_permanent, is_rental, is_hidden, parent_category_id, version, deleted_at, created_at, updated_at
     FROM categories WHERE (tenant_id = $1 OR tenant_id = $2) AND deleted_at IS NULL ORDER BY name ASC`,
    [tenantId, GLOBAL_SYSTEM_TENANT_ID]
  );
  return r.rows;
}

export async function getCategoryById(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<CategoryRow | null> {
  const r = await client.query<CategoryRow>(
    `SELECT id, tenant_id, name, type, description, is_permanent, is_rental, is_hidden, parent_category_id, version, deleted_at, created_at, updated_at
     FROM categories WHERE id = $1 AND (tenant_id = $2 OR tenant_id = $3) AND deleted_at IS NULL`,
    [id, tenantId, GLOBAL_SYSTEM_TENANT_ID]
  );
  return r.rows[0] ?? null;
}

export async function getCategoryByIdIncludingDeleted(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<CategoryRow | null> {
  const r = await client.query<CategoryRow>(
    `SELECT id, tenant_id, name, type, description, is_permanent, is_rental, is_hidden, parent_category_id, version, deleted_at, created_at, updated_at
     FROM categories WHERE id = $1 AND (tenant_id = $2 OR tenant_id = $3)`,
    [id, tenantId, GLOBAL_SYSTEM_TENANT_ID]
  );
  return r.rows[0] ?? null;
}

export async function createCategory(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>
): Promise<CategoryRow> {
  const p = pickBody(body);
  if (!p.name) throw new Error('name is required.');
  if (!p.type) throw new Error('type is required.');
  const id =
    typeof body.id === 'string' && body.id.trim() ? body.id.trim() : `cat_${randomUUID().replace(/-/g, '')}`;

  const r = await client.query<CategoryRow>(
    `INSERT INTO categories (
       id, tenant_id, name, type, description, is_permanent, is_rental, is_hidden, parent_category_id, version, deleted_at, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, 1, NULL, NOW(), NOW()
     )
     RETURNING id, tenant_id, name, type, description, is_permanent, is_rental, is_hidden, parent_category_id, version, deleted_at, created_at, updated_at`,
    [
      id,
      tenantId,
      p.name,
      p.type,
      p.description ?? null,
      p.is_permanent,
      p.is_rental,
      p.is_hidden,
      p.parent_category_id && String(p.parent_category_id).trim() ? String(p.parent_category_id).trim() : null,
    ]
  );
  const row = r.rows[0];
  const plPick = pickPlSubType(body);
  if (plPick !== 'preserve') {
    await syncPlCategoryMappingFromPick(client, tenantId, row.id, plPick);
  }
  return row;
}

export async function updateCategory(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  body: Record<string, unknown>
): Promise<{ row: CategoryRow | null; conflict: boolean }> {
  const p = pickBody(body);
  if (!p.name) throw new Error('name is required.');
  if (!p.type) throw new Error('type is required.');
  const expectedVersion = p.version;

  const prior = await getCategoryByIdIncludingDeleted(client, tenantId, id);
  if (prior?.tenant_id === GLOBAL_SYSTEM_TENANT_ID) {
    return { row: null, conflict: false };
  }

  const vals = [
    p.name,
    p.type,
    p.description ?? null,
    p.is_permanent,
    p.is_rental,
    p.is_hidden,
    p.parent_category_id && String(p.parent_category_id).trim() ? String(p.parent_category_id).trim() : null,
  ];

  if (expectedVersion !== undefined) {
    const u = await client.query<CategoryRow>(
      `UPDATE categories SET
         name = $3, type = $4, description = $5, is_permanent = $6, is_rental = $7, is_hidden = $8, parent_category_id = $9,
         version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL AND version = $10
       RETURNING id, tenant_id, name, type, description, is_permanent, is_rental, is_hidden, parent_category_id, version, deleted_at, created_at, updated_at`,
      [id, tenantId, ...vals, expectedVersion]
    );
    if (u.rows.length === 0) {
      const exists = await getCategoryById(client, tenantId, id);
      if (!exists) return { row: null, conflict: false };
      return { row: null, conflict: true };
    }
    const updated = u.rows[0];
    const plPick = pickPlSubType(body);
    if (plPick !== 'preserve') {
      await syncPlCategoryMappingFromPick(client, tenantId, id, plPick);
    }
    return { row: updated, conflict: false };
  }

  const u = await client.query<CategoryRow>(
    `UPDATE categories SET
       name = $3, type = $4, description = $5, is_permanent = $6, is_rental = $7, is_hidden = $8, parent_category_id = $9,
       version = version + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     RETURNING id, tenant_id, name, type, description, is_permanent, is_rental, is_hidden, parent_category_id, version, deleted_at, created_at, updated_at`,
    [id, tenantId, ...vals]
  );
  const updated = u.rows[0] ?? null;
  if (updated) {
    const plPick = pickPlSubType(body);
    if (plPick !== 'preserve') {
      await syncPlCategoryMappingFromPick(client, tenantId, id, plPick);
    }
  }
  return { row: updated, conflict: false };
}

export async function upsertCategory(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>
): Promise<{ row: CategoryRow; conflict: boolean; wasInsert: boolean }> {
  const p = pickBody(body);
  if (!p.name) throw new Error('name is required.');
  if (!p.type) throw new Error('type is required.');

  const id =
    typeof body.id === 'string' && body.id.trim() ? body.id.trim() : `cat_${randomUUID().replace(/-/g, '')}`;

  const existing = await getCategoryByIdIncludingDeleted(client, tenantId, id);
  if (!existing) {
    const row = await createCategory(client, tenantId, { ...body, id });
    return { row, conflict: false, wasInsert: true };
  }
  if (existing.tenant_id === GLOBAL_SYSTEM_TENANT_ID) {
    const row = await getCategoryById(client, tenantId, id);
    if (!row) throw new Error('System category not found.');
    const plPick = pickPlSubType(body as Record<string, unknown>);
    if (plPick !== 'preserve') {
      await syncPlCategoryMappingFromPick(client, tenantId, id, plPick);
    }
    return { row, conflict: false, wasInsert: false };
  }

  const expectedVersion = p.version;
  if (expectedVersion !== undefined && existing.version !== expectedVersion) {
    return { row: existing, conflict: true, wasInsert: false };
  }

  const vals = [
    p.name,
    p.type,
    p.description ?? null,
    p.is_permanent,
    p.is_rental,
    p.is_hidden,
    p.parent_category_id && String(p.parent_category_id).trim() ? String(p.parent_category_id).trim() : null,
  ];

  const u = await client.query<CategoryRow>(
    `UPDATE categories SET
       name = $3, type = $4, description = $5, is_permanent = $6, is_rental = $7, is_hidden = $8, parent_category_id = $9,
       deleted_at = NULL, version = version + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2
     RETURNING id, tenant_id, name, type, description, is_permanent, is_rental, is_hidden, parent_category_id, version, deleted_at, created_at, updated_at`,
    [id, tenantId, ...vals]
  );
  const row = u.rows[0];
  if (!row) throw new Error('Category upsert failed.');
  const plPick = pickPlSubType(body as Record<string, unknown>);
  if (plPick !== 'preserve') {
    await syncPlCategoryMappingFromPick(client, tenantId, id, plPick);
  }
  return { row, conflict: false, wasInsert: false };
}

export async function softDeleteCategory(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  expectedVersion?: number
): Promise<{ ok: boolean; conflict: boolean }> {
  const ex = await getCategoryByIdIncludingDeleted(client, tenantId, id);
  if (ex?.tenant_id === GLOBAL_SYSTEM_TENANT_ID) return { ok: false, conflict: false };

  if (expectedVersion !== undefined) {
    const r = await client.query(
      `UPDATE categories SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL AND version = $3`,
      [id, tenantId, expectedVersion]
    );
    if (r.rowCount === 0) {
      const ex = await getCategoryById(client, tenantId, id);
      if (!ex) return { ok: false, conflict: false };
      return { ok: false, conflict: true };
    }
    return { ok: true, conflict: false };
  }
  const r = await client.query(
    `UPDATE categories SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, tenantId]
  );
  return { ok: (r.rowCount ?? 0) > 0, conflict: false };
}

export async function listCategoriesChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<CategoryRow[]> {
  const r = await client.query<CategoryRow>(
    `SELECT id, tenant_id, name, type, description, is_permanent, is_rental, is_hidden, parent_category_id, version, deleted_at, created_at, updated_at
     FROM categories WHERE (tenant_id = $1 OR tenant_id = $2) AND updated_at > $3
     ORDER BY updated_at ASC`,
    [tenantId, GLOBAL_SYSTEM_TENANT_ID, since]
  );
  return r.rows;
}
