import type pg from 'pg';
import { randomUUID } from 'crypto';
import { recordDomainMutation } from '../../../core/recordDomainMutation.js';
import { checkEntityLwwConflict } from '../../../core/entityMutation.js';
import { PersonalCategoryRepository } from '../repositories/PersonalCategoryRepository.js';

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

function parseClientVersion(body: Record<string, unknown>, fallback?: number): number | undefined {
  if (typeof body.version === 'number') return body.version;
  if (typeof body.version === 'string' && body.version !== '') return parseInt(body.version, 10);
  return fallback;
}

export async function listPersonalCategoriesChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<PersonalCategoryRow[]> {
  return new PersonalCategoryRepository(tenantId).listChangedSince(client, since);
}

export async function listPersonalCategories(
  client: pg.PoolClient,
  tenantId: string
): Promise<PersonalCategoryRow[]> {
  return new PersonalCategoryRepository(tenantId).listActive(client);
}

export async function getPersonalCategoryById(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<PersonalCategoryRow | null> {
  return new PersonalCategoryRepository(tenantId).getById(client, id);
}

export async function createPersonalCategory(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>,
  userId?: string | null
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

  const row = await new PersonalCategoryRepository(tenantId).insertCategory(
    client,
    id,
    name,
    type,
    Number.isFinite(sortOrder) ? sortOrder : 0
  );
  await recordDomainMutation(client, {
    tenantId,
    userId: userId ?? null,
    module: 'personal_finance',
    entityType: 'personal_category',
    entityId: row.id,
    action: 'create',
    summary: `Personal category ${row.name} created`,
    newValue: rowToPersonalCategoryApi(row),
    version: row.version,
  });
  return row;
}

export async function updatePersonalCategory(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  body: Record<string, unknown>,
  userId?: string | null
): Promise<PersonalCategoryRow | null> {
  const existing = await getPersonalCategoryById(client, tenantId, id);
  if (!existing) return null;

  const clientVersion = parseClientVersion(body, existing.version);
  if (clientVersion != null) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'personal_categories',
      entityId: id,
      clientVersion,
    });
    if (lww.conflict) throw new Error('Conflict: category was modified by another user.');
  }

  const name = body.name !== undefined ? String(body.name).trim() : existing.name;
  const type = body.type !== undefined ? String(body.type) : existing.type;
  if (type !== 'Income' && type !== 'Expense') throw new Error('type must be Income or Expense.');
  const sortOrder =
    body.sortOrder != null || body.sort_order != null
      ? Number(body.sortOrder ?? body.sort_order)
      : existing.sort_order;

  const row = await new PersonalCategoryRepository(tenantId).updateActive(
    client,
    id,
    name,
    type,
    Number.isFinite(sortOrder) ? sortOrder : 0
  );
  if (row) {
    await recordDomainMutation(client, {
      tenantId,
      userId: userId ?? null,
      module: 'personal_finance',
      entityType: 'personal_category',
      entityId: row.id,
      action: 'update',
      summary: `Personal category ${row.name} updated`,
      newValue: rowToPersonalCategoryApi(row),
      oldValue: rowToPersonalCategoryApi(existing),
      version: row.version,
    });
  }
  return row;
}

export async function softDeletePersonalCategory(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  version?: number,
  userId?: string | null
): Promise<PersonalCategoryRow | null> {
  const existing = await new PersonalCategoryRepository(tenantId).getById(client, id);
  if (!existing) return null;

  if (version != null) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'personal_categories',
      entityId: id,
      clientVersion: version,
    });
    if (lww.conflict) throw new Error('Conflict: category was modified by another user.');
  }

  const row = await new PersonalCategoryRepository(tenantId).markDeleted(client, id);
  if (row) {
    await recordDomainMutation(client, {
      tenantId,
      userId: userId ?? null,
      module: 'personal_finance',
      entityType: 'personal_category',
      entityId: id,
      action: 'delete',
      summary: `Personal category ${existing.name} deleted`,
      oldValue: rowToPersonalCategoryApi(existing),
      version: row.version,
    });
  }
  return row;
}
