import type pg from 'pg';
import { randomUUID } from 'crypto';

export type PersonalCategoryRow = {
  id: string;
  tenant_id: string;
  name: string;
  type: string;
  sort_order: number;
  version: number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export function rowToPersonalCategoryApi(row: PersonalCategoryRow): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: row.id,
    name: row.name,
    type: row.type,
    sortOrder: row.sort_order,
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

export async function listPersonalCategoriesChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<PersonalCategoryRow[]> {
  const r = await client.query<PersonalCategoryRow>(
    `SELECT id, tenant_id, name, type, sort_order, version, deleted_at, created_at, updated_at
     FROM personal_categories WHERE tenant_id = $1 AND updated_at > $2
     ORDER BY updated_at ASC`,
    [tenantId, since]
  );
  return r.rows;
}

export async function listPersonalCategories(
  client: pg.PoolClient,
  tenantId: string
): Promise<PersonalCategoryRow[]> {
  const r = await client.query<PersonalCategoryRow>(
    `SELECT id, tenant_id, name, type, sort_order, version, deleted_at, created_at, updated_at
     FROM personal_categories WHERE tenant_id = $1 AND deleted_at IS NULL
     ORDER BY type ASC, sort_order ASC, name ASC`,
    [tenantId]
  );
  return r.rows;
}

export async function getPersonalCategoryById(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<PersonalCategoryRow | null> {
  const r = await client.query<PersonalCategoryRow>(
    `SELECT id, tenant_id, name, type, sort_order, version, deleted_at, created_at, updated_at
     FROM personal_categories WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, tenantId]
  );
  return r.rows[0] ?? null;
}

export async function createPersonalCategory(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>
): Promise<PersonalCategoryRow> {
  const name = String(body.name ?? '').trim();
  const type = String(body.type ?? body.Type ?? '').trim();
  if (!name) throw new Error('name is required.');
  if (type !== 'Income' && type !== 'Expense') throw new Error('type must be Income or Expense.');
  const sortOrder =
    body.sortOrder != null || body.sort_order != null
      ? Number(body.sortOrder ?? body.sort_order)
      : 0;
  const id =
    typeof body.id === 'string' && body.id.trim()
      ? body.id.trim()
      : `pc_${randomUUID().replace(/-/g, '')}`;

  const r = await client.query<PersonalCategoryRow>(
    `INSERT INTO personal_categories (
       id, tenant_id, name, type, sort_order, version, deleted_at, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, 1, NULL, NOW(), NOW())
     RETURNING id, tenant_id, name, type, sort_order, version, deleted_at, created_at, updated_at`,
    [id, tenantId, name, type, Number.isFinite(sortOrder) ? sortOrder : 0]
  );
  return r.rows[0];
}

export async function updatePersonalCategory(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  body: Record<string, unknown>
): Promise<PersonalCategoryRow | null> {
  const existing = await getPersonalCategoryById(client, tenantId, id);
  if (!existing) return null;
  const ver =
    typeof body.version === 'number'
      ? body.version
      : typeof body.version === 'string'
        ? parseInt(body.version, 10)
        : existing.version;
  if (ver !== existing.version) throw new Error('Conflict: category was modified by another user.');

  const name = body.name !== undefined ? String(body.name).trim() : existing.name;
  const type =
    body.type !== undefined ? String(body.type) : existing.type;
  if (type !== 'Income' && type !== 'Expense') throw new Error('type must be Income or Expense.');
  const sortOrder =
    body.sortOrder != null || body.sort_order != null
      ? Number(body.sortOrder ?? body.sort_order)
      : existing.sort_order;

  const r = await client.query<PersonalCategoryRow>(
    `UPDATE personal_categories SET
       name = $2, type = $3, sort_order = $4, version = version + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $5 AND deleted_at IS NULL
     RETURNING id, tenant_id, name, type, sort_order, version, deleted_at, created_at, updated_at`,
    [id, name, type, Number.isFinite(sortOrder) ? sortOrder : 0, tenantId]
  );
  return r.rows[0] ?? null;
}

export async function softDeletePersonalCategory(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  version?: number
): Promise<PersonalCategoryRow | null> {
  const existing = await client.query<PersonalCategoryRow>(
    `SELECT id, tenant_id, name, type, sort_order, version, deleted_at, created_at, updated_at
     FROM personal_categories WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, tenantId]
  );
  const row = existing.rows[0];
  if (!row) return null;
  if (version != null && version !== row.version) {
    throw new Error('Conflict: category was modified by another user.');
  }
  const r = await client.query<PersonalCategoryRow>(
    `UPDATE personal_categories SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     RETURNING id, tenant_id, name, type, sort_order, version, deleted_at, created_at, updated_at`,
    [id, tenantId]
  );
  return r.rows[0] ?? null;
}
