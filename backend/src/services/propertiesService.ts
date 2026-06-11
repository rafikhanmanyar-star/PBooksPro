import type pg from 'pg';
import { randomUUID } from 'crypto';
import { getBuildingById } from './buildingsService.js';
import { getContactById } from './contactsService.js';
import { recordDomainMutation } from '../core/recordDomainMutation.js';
import { checkEntityLwwConflict } from '../core/entityMutation.js';
import { PropertyRepository } from '../modules/properties/repositories/PropertyRepository.js';

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
  filters?: { buildingId?: string }
): Promise<PropertyRow[]> {
  return new PropertyRepository(tenantId).list(client, filters);
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
  const r = await client.query<PropertyRow>(
    `INSERT INTO properties (
      id, tenant_id, name, owner_id, building_id, description, monthly_service_charge, version, deleted_at, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 1, NULL, NOW(), NOW())
    RETURNING id, tenant_id, name, owner_id, building_id, description, monthly_service_charge, version, deleted_at, created_at, updated_at`,
    [
      id,
      tenantId,
      p.name,
      p.owner_id,
      p.building_id,
      p.description ?? null,
      p.monthly_service_charge !== undefined ? p.monthly_service_charge : null,
    ]
  );
  const row = r.rows[0];
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

    const r = await client.query<PropertyRow>(
      `UPDATE properties SET
        name = $3, owner_id = $4, building_id = $5, description = $6, monthly_service_charge = $7,
        version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING id, tenant_id, name, owner_id, building_id, description, monthly_service_charge, version, deleted_at, created_at, updated_at`,
      [id, tenantId, p.name, p.owner_id, p.building_id, p.description ?? null, mscVal]
    );
    const row = r.rows[0] ?? null;
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

  const r = await client.query<PropertyRow>(
    `UPDATE properties SET
      name = $3, owner_id = $4, building_id = $5, description = $6, monthly_service_charge = $7,
      version = version + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     RETURNING id, tenant_id, name, owner_id, building_id, description, monthly_service_charge, version, deleted_at, created_at, updated_at`,
    [id, tenantId, p.name, p.owner_id, p.building_id, p.description ?? null, mscVal]
  );
  const row = r.rows[0] ?? null;
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

    const r = await client.query(
      `UPDATE properties SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING id, tenant_id, name, owner_id, building_id, description, monthly_service_charge, version, deleted_at, created_at, updated_at`,
      [id, tenantId]
    );
    if (r.rowCount === 0) return { ok: false, conflict: false };
    const row = r.rows[0] as PropertyRow;
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
  const r = await client.query(
    `UPDATE properties SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     RETURNING id, tenant_id, name, owner_id, building_id, description, monthly_service_charge, version, deleted_at, created_at, updated_at`,
    [id, tenantId]
  );
  const ok = (r.rowCount ?? 0) > 0;
  if (ok && r.rows[0]) {
    const row = r.rows[0] as PropertyRow;
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
