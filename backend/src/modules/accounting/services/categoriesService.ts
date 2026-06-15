import type pg from 'pg';
import { randomUUID } from 'crypto';
import { GLOBAL_SYSTEM_TENANT_ID } from '../../../constants/globalSystemChart.js';
import { recordDomainMutation } from '../../../core/recordDomainMutation.js';
import { checkEntityLwwConflict } from '../../../core/entityMutation.js';
import {
  CategoryRepository,
  type CategoryWriteFields,
} from '../repositories/CategoryRepository.js';

/**
 * When only pl_category_mapping changes, categories.updated_at may not move — incremental sync
 * (/state/changes) would omit the row and clients keep stale plSubType. Bump updated_at for
 * tenant-owned category rows so the category appears in listCategoriesChangedSince.
 * System (global) category rows are not updated here; stateChangesService supplements those.
 */
export async function touchCategoryRowAfterPlMappingChange(
  client: pg.PoolClient,
  tenantId: string,
  categoryId: string
): Promise<void> {
  await new CategoryRepository(tenantId).touchUpdatedAt(client, categoryId);
}

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
  const repo = new CategoryRepository(tenantId);
  if (pick === null) {
    await repo.deletePlMapping(client, categoryId);
    await touchCategoryRowAfterPlMappingChange(client, tenantId, categoryId);
    return;
  }
  await repo.upsertPlMapping(client, categoryId, pick);
  await touchCategoryRowAfterPlMappingChange(client, tenantId, categoryId);
}

/** Tenant row wins over global system tenant when both exist. */
export async function fetchPlSubTypesForTenant(
  client: pg.PoolClient,
  tenantId: string
): Promise<Map<string, string>> {
  const rows = await new CategoryRepository(tenantId).listPlMappings(client, GLOBAL_SYSTEM_TENANT_ID);
  const fromGlobal = new Map<string, string>();
  const fromTenant = new Map<string, string>();
  for (const row of rows) {
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
  return new CategoryRepository(tenantId).getPlSubTypeForCategory(client, categoryId, GLOBAL_SYSTEM_TENANT_ID);
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

function toCategoryWriteFields(p: ReturnType<typeof pickBody>): CategoryWriteFields {
  return {
    name: p.name,
    type: p.type,
    description: p.description ?? null,
    is_permanent: p.is_permanent,
    is_rental: p.is_rental,
    is_hidden: p.is_hidden,
    parent_category_id:
      p.parent_category_id && String(p.parent_category_id).trim() ? String(p.parent_category_id).trim() : null,
  };
}

async function categoryApiSnapshot(
  client: pg.PoolClient,
  tenantId: string,
  row: CategoryRow
): Promise<Record<string, unknown>> {
  const pl = await getPlSubTypeForCategory(client, tenantId, row.id);
  return rowToCategoryApi(row, pl);
}

async function auditCategoryMutation(
  client: pg.PoolClient,
  tenantId: string,
  categoryId: string,
  action: 'create' | 'update' | 'delete',
  opts?: { summary?: string; oldValue?: Record<string, unknown> }
): Promise<void> {
  if (action === 'delete') {
    await recordDomainMutation(client, {
      tenantId,
      userId: null,
      module: 'categories',
      entityType: 'category',
      entityId: categoryId,
      action,
      summary: opts?.summary ?? `Category ${categoryId} deleted`,
      oldValue: opts?.oldValue,
    });
    return;
  }
  const row = await getCategoryById(client, tenantId, categoryId);
  if (!row) return;
  const snapshot = await categoryApiSnapshot(client, tenantId, row);
  await recordDomainMutation(client, {
    tenantId,
    userId: null,
    module: 'categories',
    entityType: 'category',
    entityId: categoryId,
    action,
    summary: opts?.summary ?? `Category ${row.name} ${action}`,
    newValue: snapshot,
    oldValue: opts?.oldValue,
    version: row.version,
  });
}

export async function listCategories(client: pg.PoolClient, tenantId: string): Promise<CategoryRow[]> {
  return new CategoryRepository(tenantId).listActive(client);
}

export async function getCategoryById(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<CategoryRow | null> {
  return new CategoryRepository(tenantId).getById(client, id);
}

export async function getCategoryByIdIncludingDeleted(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<CategoryRow | null> {
  return new CategoryRepository(tenantId).getByIdIncludingDeleted(client, id);
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

  const row = await new CategoryRepository(tenantId).insertCategory(client, id, toCategoryWriteFields(p));
  const plPick = pickPlSubType(body);
  if (plPick !== 'preserve') {
    await syncPlCategoryMappingFromPick(client, tenantId, row.id, plPick);
  }
  await auditCategoryMutation(client, tenantId, row.id, 'create');
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
  if (!prior) {
    return { row: null, conflict: false };
  }
  const oldApi = await categoryApiSnapshot(client, tenantId, prior);

  if (expectedVersion !== undefined) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'categories',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { row: null, conflict: true };
  }

  const repo = new CategoryRepository(tenantId);
  const fields = toCategoryWriteFields(p);

  const updated = await repo.updateActive(client, id, fields, expectedVersion);
  if (!updated) {
    if (expectedVersion !== undefined) {
      const exists = await getCategoryById(client, tenantId, id);
      if (!exists) return { row: null, conflict: false };
      return { row: null, conflict: true };
    }
    return { row: null, conflict: false };
  }
  if (updated) {
    const plPick = pickPlSubType(body);
    if (plPick !== 'preserve') {
      await syncPlCategoryMappingFromPick(client, tenantId, id, plPick);
    }
    await auditCategoryMutation(client, tenantId, id, 'update', { oldValue: oldApi });
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
    const oldApi = await categoryApiSnapshot(client, tenantId, row);
    const plPick = pickPlSubType(body as Record<string, unknown>);
    if (plPick !== 'preserve') {
      await syncPlCategoryMappingFromPick(client, tenantId, id, plPick);
      await auditCategoryMutation(client, tenantId, id, 'update', {
        oldValue: oldApi,
        summary: `Category ${row.name} plSubType updated`,
      });
    }
    return { row, conflict: false, wasInsert: false };
  }

  const expectedVersion = p.version;
  if (expectedVersion !== undefined) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'categories',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { row: existing, conflict: true, wasInsert: false };
  }

  const oldApi = await categoryApiSnapshot(client, tenantId, existing);

  const row = await new CategoryRepository(tenantId).updateUpsertRestore(client, id, toCategoryWriteFields(p));
  if (!row) throw new Error('Category upsert failed.');
  const plPick = pickPlSubType(body as Record<string, unknown>);
  if (plPick !== 'preserve') {
    await syncPlCategoryMappingFromPick(client, tenantId, id, plPick);
  }
  await auditCategoryMutation(client, tenantId, id, 'update', { oldValue: oldApi });
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
  const oldApi = ex ? await categoryApiSnapshot(client, tenantId, ex) : undefined;

  if (expectedVersion !== undefined) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'categories',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { ok: false, conflict: true };

    const repo = new CategoryRepository(tenantId);
    const ok = await repo.markDeleted(client, id, expectedVersion);
    if (!ok) {
      const ex = await getCategoryById(client, tenantId, id);
      if (!ex) return { ok: false, conflict: false };
      return { ok: false, conflict: true };
    }
    await auditCategoryMutation(client, tenantId, id, 'delete', { oldValue: oldApi });
    return { ok: true, conflict: false };
  }
  const ok = await new CategoryRepository(tenantId).markDeleted(client, id);
  if (ok) {
    await auditCategoryMutation(client, tenantId, id, 'delete', { oldValue: oldApi });
  }
  return { ok, conflict: false };
}

export async function listCategoriesChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<CategoryRow[]> {
  return new CategoryRepository(tenantId).listChangedSince(client, since);
}
