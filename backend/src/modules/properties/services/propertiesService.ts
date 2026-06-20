import type pg from 'pg';
import { randomUUID } from 'crypto';
import { getBuildingById } from './buildingsService.js';
import { getContactById } from '../../crm/services/contactsService.js';
import { recordDomainMutation } from '../../../core/recordDomainMutation.js';
import { checkEntityLwwConflict } from '../../../core/entityMutation.js';
import { PropertyRepository } from '../repositories/PropertyRepository.js';

export type PropertyRow = {
  id: string;
  tenant_id: string;
  name: string;
  owner_id: string;
  building_id: string;
  description: string | null;
  /** pg returns NUMERIC as string */
  monthly_service_charge: string | number | null;
  version: number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

function numToApi(n: string | number | null | undefined): number | undefined {
  if (n == null || n === '') return undefined;
  const v = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(v) ? v : undefined;
}

export function rowToPropertyApi(row: PropertyRow): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    buildingId: row.building_id,
    description: row.description ?? undefined,
    monthlyServiceCharge: numToApi(row.monthly_service_charge),
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
  let description: string | null | undefined;
  if (body.description === undefined) description = undefined;
  else if (body.description === null) description = null;
  else description = String(body.description);

  const msc =
    body.monthlyServiceCharge != null || body.monthly_service_charge != null
      ? Number(body.monthlyServiceCharge ?? body.monthly_service_charge)
      : undefined;

  const rawVer = body.version ?? (body as Record<string, unknown>).Version;
  let version: number | undefined;
  if (typeof rawVer === 'number' && Number.isFinite(rawVer)) {
    version = Math.trunc(rawVer);
  } else if (typeof rawVer === 'string' && rawVer.trim() !== '') {
    const n = parseInt(rawVer.trim(), 10);
    if (Number.isFinite(n)) version = n;
  }

  return {
    name: String(body.name ?? ''),
    owner_id: String(body.ownerId ?? body.owner_id ?? '').trim(),
    building_id: String(body.buildingId ?? body.building_id ?? '').trim(),
    description,
    monthly_service_charge: msc !== undefined && Number.isFinite(msc) ? msc : undefined,
    version,
  };
}

export async function listProperties(
  client: pg.PoolClient,
  tenantId: string,
  filters?: { buildingId?: string },
  scopeCtx?: import('../../../auth/tenantRepositoryScope.js').DataScopeEnforcementContext
): Promise<PropertyRow[]> {
  return new PropertyRepository(tenantId).list(client, filters, scopeCtx);
}

export type PropertyListPageQuery = {
  page: number;
  pageSize: number;
  limit: number;
  offset: number;
  buildingId?: string;
  search?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
};

export async function listPropertiesPage(
  client: pg.PoolClient,
  tenantId: string,
  query: PropertyListPageQuery
): Promise<{ rows: PropertyRow[]; total: number; page: number; pageSize: number }> {
  const { rows, total } = await new PropertyRepository(tenantId).listPage(client, {
    limit: query.limit,
    offset: query.offset,
    buildingId: query.buildingId,
    search: query.search,
    sortBy: query.sortBy,
    sortDir: query.sortDir,
  });
  return { rows, total, page: query.page, pageSize: query.pageSize };
}

export async function getPropertyById(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<PropertyRow | null> {
  return new PropertyRepository(tenantId).getById(client, id);
}

export async function createProperty(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>
): Promise<PropertyRow> {
  const p = pickBody(body);
  if (!p.name.trim()) throw new Error('Property name is required.');
  if (!p.owner_id) throw new Error('ownerId is required.');
  if (!p.building_id) throw new Error('buildingId is required.');

  const owner = await getContactById(client, tenantId, p.owner_id);
  if (!owner) throw new Error('Owner contact not found.');

  const building = await getBuildingById(client, tenantId, p.building_id);
  if (!building) throw new Error('Building not found.');

  const id = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : randomUUID();
  const propertyFields = {
    name: p.name,
    owner_id: p.owner_id,
    building_id: p.building_id,
    description: p.description ?? null,
    monthly_service_charge: p.monthly_service_charge !== undefined ? p.monthly_service_charge : null,
  };
  const row = await new PropertyRepository(tenantId).insertProperty(client, id, propertyFields);
  await recordDomainMutation(client, {
    tenantId,
    userId: null,
    module: 'properties',
    entityType: 'property',
    entityId: row.id,
    action: 'create',
    summary: `Property ${row.name} created`,
    newValue: rowToPropertyApi(row),
    version: row.version,
  });
  return row;
}

export async function updateProperty(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  body: Record<string, unknown>
): Promise<{ row: PropertyRow | null; conflict: boolean }> {
  const p = pickBody(body);
  const expectedVersion = p.version;
  if (!p.name.trim()) throw new Error('Property name is required.');
  if (!p.owner_id) throw new Error('ownerId is required.');
  if (!p.building_id) throw new Error('buildingId is required.');

  const owner = await getContactById(client, tenantId, p.owner_id);
  if (!owner) throw new Error('Owner contact not found.');

  const building = await getBuildingById(client, tenantId, p.building_id);
  if (!building) throw new Error('Building not found.');

  const mscVal = p.monthly_service_charge !== undefined ? p.monthly_service_charge : null;

  if (expectedVersion !== undefined) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'properties',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { row: null, conflict: true };

    const row = await new PropertyRepository(tenantId).updateActive(client, id, {
      name: p.name,
      owner_id: p.owner_id,
      building_id: p.building_id,
      description: p.description ?? null,
      monthly_service_charge: mscVal,
    });
    if (!row) return { row: null, conflict: false };
    await recordDomainMutation(client, {
      tenantId,
      userId: null,
      module: 'properties',
      entityType: 'property',
      entityId: row.id,
      action: 'update',
      summary: `Property ${row.name} updated`,
      newValue: rowToPropertyApi(row),
      version: row.version,
    });
    return { row, conflict: false };
  }

  const row = await new PropertyRepository(tenantId).updateActive(client, id, {
    name: p.name,
    owner_id: p.owner_id,
    building_id: p.building_id,
    description: p.description ?? null,
    monthly_service_charge: mscVal,
  });
  if (row) {
    await recordDomainMutation(client, {
      tenantId,
      userId: null,
      module: 'properties',
      entityType: 'property',
      entityId: row.id,
      action: 'update',
      summary: `Property ${row.name} updated`,
      newValue: rowToPropertyApi(row),
      version: row.version,
    });
  }
  return { row, conflict: false };
}

export async function countRentalAgreementsForProperty(
  client: pg.PoolClient,
  tenantId: string,
  propertyId: string
): Promise<number> {
  const r = await client.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM rental_agreements
     WHERE tenant_id = $1 AND property_id = $2 AND deleted_at IS NULL`,
    [tenantId, propertyId]
  );
  return Number(r.rows[0]?.c ?? 0);
}

export async function softDeleteProperty(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  expectedVersion?: number
): Promise<{ ok: boolean; conflict: boolean; blocked?: boolean }> {
  const n = await countRentalAgreementsForProperty(client, tenantId, id);
  if (n > 0) {
    return { ok: false, conflict: false, blocked: true };
  }

  const before = await getPropertyById(client, tenantId, id);
  if (expectedVersion !== undefined) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'properties',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { ok: false, conflict: true };

    const { ok, row } = await new PropertyRepository(tenantId).markDeleted(client, id);
    if (!ok || !row) return { ok: false, conflict: false };
    await recordDomainMutation(client, {
      tenantId,
      userId: null,
      module: 'properties',
      entityType: 'property',
      entityId: row.id,
      action: 'delete',
      summary: `Property ${row.name} deleted`,
      oldValue: before ? rowToPropertyApi(before) : null,
      version: row.version,
    });
    return { ok: true, conflict: false };
  }
  const { ok, row } = await new PropertyRepository(tenantId).markDeleted(client, id);
  if (ok && row) {
    await recordDomainMutation(client, {
      tenantId,
      userId: null,
      module: 'properties',
      entityType: 'property',
      entityId: row.id,
      action: 'delete',
      summary: `Property ${row.name} deleted`,
      oldValue: before ? rowToPropertyApi(before) : null,
      version: row.version,
    });
  }
  return { ok, conflict: false };
}

/** Incremental sync: properties created/updated/deleted since `since` (includes soft-deleted rows). */
export async function listPropertiesChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<PropertyRow[]> {
  return new PropertyRepository(tenantId).listChangedSince(client, since);
}
