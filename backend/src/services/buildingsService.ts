import type pg from 'pg';
import { randomUUID } from 'crypto';
import { recordDomainMutation } from '../core/recordDomainMutation.js';
import { checkEntityLwwConflict } from '../core/entityMutation.js';
import { BuildingRepository } from '../modules/properties/repositories/BuildingRepository.js';

export type BuildingRow = {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  color: string | null;
  version: number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export function rowToBuildingApi(row: BuildingRow): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    color: row.color ?? undefined,
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

  return {
    name: String(body.name ?? ''),
    description,
    color:
      body.color === undefined ? undefined : body.color === null ? null : String(body.color),
    version: typeof body.version === 'number' ? body.version : undefined,
  };
}

export async function listBuildings(client: pg.PoolClient, tenantId: string): Promise<BuildingRow[]> {
  return new BuildingRepository(tenantId).listActive(client);
}

export async function getBuildingById(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<BuildingRow | null> {
  return new BuildingRepository(tenantId).getById(client, id);
}

export async function createBuilding(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>
): Promise<BuildingRow> {
  const p = pickBody(body);
  if (!p.name.trim()) throw new Error('Building name is required.');
  const id = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : randomUUID();
  const r = await client.query<BuildingRow>(
    `INSERT INTO buildings (id, tenant_id, name, description, color, version, deleted_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 1, NULL, NOW(), NOW())
     RETURNING id, tenant_id, name, description, color, version, deleted_at, created_at, updated_at`,
    [id, tenantId, p.name, p.description ?? null, p.color ?? null]
  );
  const row = r.rows[0];
  await recordDomainMutation(client, {
    tenantId,
    userId: null,
    module: 'buildings',
    entityType: 'building',
    entityId: row.id,
    action: 'create',
    summary: `Building ${row.name} created`,
    newValue: rowToBuildingApi(row),
    version: row.version,
  });
  return row;
}

export async function updateBuilding(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  body: Record<string, unknown>
): Promise<{ row: BuildingRow | null; conflict: boolean }> {
  const p = pickBody(body);
  const expectedVersion = p.version;
  if (!p.name.trim()) throw new Error('Building name is required.');

  if (expectedVersion !== undefined) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'buildings',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { row: null, conflict: true };

    const r = await client.query<BuildingRow>(
      `UPDATE buildings SET
        name = $3, description = $4, color = $5,
        version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING id, tenant_id, name, description, color, version, deleted_at, created_at, updated_at`,
      [id, tenantId, p.name, p.description ?? null, p.color ?? null]
    );
    const row = r.rows[0] ?? null;
    if (!row) return { row: null, conflict: false };
    await recordDomainMutation(client, {
      tenantId,
      userId: null,
      module: 'buildings',
      entityType: 'building',
      entityId: row.id,
      action: 'update',
      summary: `Building ${row.name} updated`,
      newValue: rowToBuildingApi(row),
      version: row.version,
    });
    return { row, conflict: false };
  }

  const r = await client.query<BuildingRow>(
    `UPDATE buildings SET
      name = $3, description = $4, color = $5,
      version = version + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     RETURNING id, tenant_id, name, description, color, version, deleted_at, created_at, updated_at`,
    [id, tenantId, p.name, p.description ?? null, p.color ?? null]
  );
  const row = r.rows[0] ?? null;
  if (row) {
    await recordDomainMutation(client, {
      tenantId,
      userId: null,
      module: 'buildings',
      entityType: 'building',
      entityId: row.id,
      action: 'update',
      summary: `Building ${row.name} updated`,
      newValue: rowToBuildingApi(row),
      version: row.version,
    });
  }
  return { row, conflict: false };
}

export async function countPropertiesForBuilding(
  client: pg.PoolClient,
  tenantId: string,
  buildingId: string
): Promise<number> {
  const r = await client.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM properties
     WHERE tenant_id = $1 AND building_id = $2 AND deleted_at IS NULL`,
    [tenantId, buildingId]
  );
  return Number(r.rows[0]?.c ?? 0);
}

export async function softDeleteBuilding(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  expectedVersion?: number
): Promise<{ ok: boolean; conflict: boolean; blocked?: boolean }> {
  const n = await countPropertiesForBuilding(client, tenantId, id);
  if (n > 0) {
    return { ok: false, conflict: false, blocked: true };
  }

  const before = await getBuildingById(client, tenantId, id);
  if (expectedVersion !== undefined) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'buildings',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { ok: false, conflict: true };

    const r = await client.query(
      `UPDATE buildings SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING id, tenant_id, name, description, color, version, deleted_at, created_at, updated_at`,
      [id, tenantId]
    );
    if (r.rowCount === 0) return { ok: false, conflict: false };
    const row = r.rows[0] as BuildingRow;
    await recordDomainMutation(client, {
      tenantId,
      userId: null,
      module: 'buildings',
      entityType: 'building',
      entityId: row.id,
      action: 'delete',
      summary: `Building ${row.name} deleted`,
      oldValue: before ? rowToBuildingApi(before) : null,
      version: row.version,
    });
    return { ok: true, conflict: false };
  }
  const r = await client.query(
    `UPDATE buildings SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     RETURNING id, tenant_id, name, description, color, version, deleted_at, created_at, updated_at`,
    [id, tenantId]
  );
  const ok = (r.rowCount ?? 0) > 0;
  if (ok && r.rows[0]) {
    const row = r.rows[0] as BuildingRow;
    await recordDomainMutation(client, {
      tenantId,
      userId: null,
      module: 'buildings',
      entityType: 'building',
      entityId: row.id,
      action: 'delete',
      summary: `Building ${row.name} deleted`,
      oldValue: before ? rowToBuildingApi(before) : null,
      version: row.version,
    });
  }
  return { ok, conflict: false };
}

/** Incremental sync: buildings created/updated/deleted since `since` (includes soft-deleted rows). */
export async function listBuildingsChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<BuildingRow[]> {
  return new BuildingRepository(tenantId).listChangedSince(client, since);
}
