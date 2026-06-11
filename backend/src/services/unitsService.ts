import type pg from 'pg';
import { randomUUID } from 'crypto';
import { getContactById } from './contactsService.js';
import { getProjectById } from './projectsService.js';
import { recordDomainMutation } from '../core/recordDomainMutation.js';
import { checkEntityLwwConflict } from '../core/entityMutation.js';
import { UnitRepository } from '../modules/project-selling/repositories/UnitRepository.js';

export const UNIT_STATUSES = ['available', 'sold', 'rented', 'blocked'] as const;
export type UnitStatus = (typeof UNIT_STATUSES)[number];

export type UnitRow = {
  id: string;
  tenant_id: string;
  project_id: string;
  unit_number: string;
  floor: string | null;
  unit_type: string | null;
  size: string | null;
  status: string;
  owner_contact_id: string | null;
  sale_price: string | number | null;
  description: string | null;
  area: string | number | null;
  user_id: string | null;
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

export function rowToUnitApi(row: UnitRow): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: row.id,
    name: row.unit_number,
    unitNumber: row.unit_number,
    projectId: row.project_id,
    contactId: row.owner_contact_id ?? undefined,
    ownerContactId: row.owner_contact_id ?? undefined,
    status: row.status,
    salePrice: numToApi(row.sale_price),
    description: row.description ?? undefined,
    type: row.unit_type ?? undefined,
    unitType: row.unit_type ?? undefined,
    area: numToApi(row.area),
    size: row.size ?? undefined,
    floor: row.floor ?? undefined,
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

function normalizeStatus(raw: unknown): UnitStatus {
  const s = String(raw ?? 'available').toLowerCase();
  if (UNIT_STATUSES.includes(s as UnitStatus)) return s as UnitStatus;
  return 'available';
}

function pickBody(body: Record<string, unknown>) {
  const unitNumber = String(
    body.unitNumber ?? body.unit_number ?? body.name ?? ''
  ).trim();
  const projectId = String(body.projectId ?? body.project_id ?? '').trim();
  const floor = body.floor != null && body.floor !== '' ? String(body.floor) : undefined;
  const unitType = (body.unitType ?? body.type ?? body.unit_type) as string | undefined;
  const size = body.size != null && body.size !== '' ? String(body.size) : undefined;
  const status = normalizeStatus(body.status);
  const ownerContactId = (body.ownerContactId ?? body.contactId ?? body.owner_contact_id ?? body.contact_id) as
    | string
    | undefined
    | null;
  let description: string | null | undefined;
  if (body.description === undefined) description = undefined;
  else if (body.description === null) description = null;
  else description = String(body.description);

  const salePrice =
    body.salePrice != null || body.sale_price != null
      ? Number(body.salePrice ?? body.sale_price)
      : undefined;
  const area =
    body.area != null ? Number(body.area) : undefined;
  const version = typeof body.version === 'number' ? body.version : undefined;

  return {
    unit_number: unitNumber,
    project_id: projectId,
    floor: floor === undefined ? undefined : floor,
    unit_type: unitType != null && unitType !== '' ? String(unitType) : undefined,
    size: size === undefined ? undefined : size,
    status,
    owner_contact_id: ownerContactId === undefined ? undefined : ownerContactId === null || ownerContactId === '' ? null : String(ownerContactId),
    description,
    sale_price: salePrice !== undefined && Number.isFinite(salePrice) ? salePrice : undefined,
    area: area !== undefined && Number.isFinite(area) ? area : undefined,
    version,
  };
}

export async function listUnits(
  client: pg.PoolClient,
  tenantId: string,
  filters?: { projectId?: string }
): Promise<UnitRow[]> {
  return new UnitRepository(tenantId).list(client, filters);
}

export async function getUnitById(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<UnitRow | null> {
  return new UnitRepository(tenantId).getById(client, id);
}

export async function createUnit(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>
): Promise<UnitRow> {
  const p = pickBody(body);
  if (!p.unit_number) throw new Error('unit_number (or name) is required.');
  if (!p.project_id) throw new Error('project_id is required.');

  const project = await getProjectById(client, tenantId, p.project_id);
  if (!project) throw new Error('Project not found.');

  if (p.owner_contact_id) {
    const contact = await getContactById(client, tenantId, p.owner_contact_id);
    if (!contact) throw new Error('Owner contact not found.');
  }

  const id = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : randomUUID();

  const r = await client.query<UnitRow>(
    `INSERT INTO units (
      id, tenant_id, project_id, unit_number, floor, unit_type, size, status, owner_contact_id, sale_price, description, area, user_id, version, deleted_at, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 1, NULL, NOW(), NOW()
    )
    RETURNING id, tenant_id, project_id, unit_number, floor, unit_type, size, status, owner_contact_id, sale_price, description, area, user_id, version, deleted_at, created_at, updated_at`,
    [
      id,
      tenantId,
      p.project_id,
      p.unit_number,
      p.floor ?? null,
      p.unit_type ?? null,
      p.size ?? null,
      p.status,
      p.owner_contact_id ?? null,
      p.sale_price !== undefined ? p.sale_price : null,
      p.description ?? null,
      p.area !== undefined ? p.area : null,
      (body.userId ?? body.user_id) as string | null ?? null,
    ]
  );
  const row = r.rows[0];
  await recordDomainMutation(client, {
    tenantId,
    userId: row.user_id,
    module: 'units',
    entityType: 'unit',
    entityId: row.id,
    action: 'create',
    summary: `Unit ${row.unit_number} created`,
    newValue: rowToUnitApi(row),
    version: row.version,
  });
  return row;
}

export async function updateUnit(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  body: Record<string, unknown>
): Promise<{ row: UnitRow | null; conflict: boolean }> {
  const existing = await getUnitById(client, tenantId, id);
  if (!existing) {
    return { row: null, conflict: false };
  }

  const existingApi = rowToUnitApi(existing);
  // Client often sends `name` (new label) without `unitNumber`. Merging existingApi first would keep
  // stale unitNumber, and pickBody prefers unitNumber over name — renames would never persist.
  const patch: Record<string, unknown> = { ...body };
  const hasExplicitUnitNumber =
    Object.prototype.hasOwnProperty.call(body, 'unitNumber') ||
    Object.prototype.hasOwnProperty.call(body, 'unit_number');
  if (!hasExplicitUnitNumber && Object.prototype.hasOwnProperty.call(body, 'name')) {
    const nm = String(body.name ?? '').trim();
    if (nm) {
      patch.unitNumber = nm;
    }
  }
  const merged: Record<string, unknown> = { ...existingApi, ...patch };
  const p = pickBody(merged);
  const expectedVersion = p.version;

  if (!p.unit_number) throw new Error('unit_number (or name) is required.');
  if (!p.project_id) throw new Error('project_id is required.');

  const project = await getProjectById(client, tenantId, p.project_id);
  if (!project) throw new Error('Project not found.');

  if (p.owner_contact_id) {
    const contact = await getContactById(client, tenantId, p.owner_contact_id);
    if (!contact) throw new Error('Owner contact not found.');
  }

  const vals = [
    p.project_id,
    p.unit_number,
    p.floor ?? null,
    p.unit_type ?? null,
    p.size ?? null,
    p.status,
    p.owner_contact_id ?? null,
    p.sale_price !== undefined ? p.sale_price : null,
    p.description ?? null,
    p.area !== undefined ? p.area : null,
  ];

  if (expectedVersion !== undefined) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'units',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { row: existing, conflict: true };

    const r = await client.query<UnitRow>(
      `UPDATE units SET
        project_id = $1,
        unit_number = $2,
        floor = $3,
        unit_type = $4,
        size = $5,
        status = $6,
        owner_contact_id = $7,
        sale_price = $8,
        description = $9,
        area = $10,
        version = version + 1,
        updated_at = NOW()
      WHERE id = $11 AND tenant_id = $12 AND deleted_at IS NULL
      RETURNING id, tenant_id, project_id, unit_number, floor, unit_type, size, status, owner_contact_id, sale_price, description, area, user_id, version, deleted_at, created_at, updated_at`,
      [...vals, id, tenantId]
    );
    const row = r.rows[0] ?? null;
    if (!row) return { row: null, conflict: false };
    await recordDomainMutation(client, {
      tenantId,
      userId: row.user_id,
      module: 'units',
      entityType: 'unit',
      entityId: row.id,
      action: 'update',
      summary: `Unit ${row.unit_number} updated`,
      newValue: rowToUnitApi(row),
      version: row.version,
    });
    return { row, conflict: false };
  }

  const r = await client.query<UnitRow>(
    `UPDATE units SET
      project_id = $1,
      unit_number = $2,
      floor = $3,
      unit_type = $4,
      size = $5,
      status = $6,
      owner_contact_id = $7,
      sale_price = $8,
      description = $9,
      area = $10,
      version = version + 1,
      updated_at = NOW()
    WHERE id = $11 AND tenant_id = $12 AND deleted_at IS NULL
    RETURNING id, tenant_id, project_id, unit_number, floor, unit_type, size, status, owner_contact_id, sale_price, description, area, user_id, version, deleted_at, created_at, updated_at`,
    [...vals, id, tenantId]
  );
  const row = r.rows[0] ?? null;
  if (row) {
    await recordDomainMutation(client, {
      tenantId,
      userId: row.user_id,
      module: 'units',
      entityType: 'unit',
      entityId: row.id,
      action: 'update',
      summary: `Unit ${row.unit_number} updated`,
      newValue: rowToUnitApi(row),
      version: row.version,
    });
  }
  return { row, conflict: false };
}

export async function softDeleteUnit(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  expectedVersion?: number
): Promise<{ ok: boolean; conflict: boolean }> {
  const before = await getUnitById(client, tenantId, id);
  if (expectedVersion !== undefined) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'units',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { ok: false, conflict: true };

    const r = await client.query(
      `UPDATE units SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING id, tenant_id, project_id, unit_number, floor, unit_type, size, status, owner_contact_id, sale_price, description, area, user_id, version, deleted_at, created_at, updated_at`,
      [id, tenantId]
    );
    if (r.rowCount === 0) return { ok: false, conflict: false };
    const row = r.rows[0] as UnitRow;
    await recordDomainMutation(client, {
      tenantId,
      userId: row.user_id,
      module: 'units',
      entityType: 'unit',
      entityId: row.id,
      action: 'delete',
      summary: `Unit ${row.unit_number} deleted`,
      oldValue: before ? rowToUnitApi(before) : null,
      version: row.version,
    });
    return { ok: true, conflict: false };
  }

  const r = await client.query(
    `UPDATE units SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     RETURNING id, tenant_id, project_id, unit_number, floor, unit_type, size, status, owner_contact_id, sale_price, description, area, user_id, version, deleted_at, created_at, updated_at`,
    [id, tenantId]
  );
  const ok = (r.rowCount ?? 0) > 0;
  if (ok && r.rows[0]) {
    const row = r.rows[0] as UnitRow;
    await recordDomainMutation(client, {
      tenantId,
      userId: row.user_id,
      module: 'units',
      entityType: 'unit',
      entityId: row.id,
      action: 'delete',
      summary: `Unit ${row.unit_number} deleted`,
      oldValue: before ? rowToUnitApi(before) : null,
      version: row.version,
    });
  }
  return { ok, conflict: false };
}

/** Incremental sync: units created/updated/deleted since `since` (includes soft-deleted rows). */
export async function listUnitsChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<UnitRow[]> {
  return new UnitRepository(tenantId).listChangedSince(client, since);
}
