import type pg from 'pg';
import { randomUUID } from 'crypto';
import { getContactById } from './contactsService.js';
import { getPropertyById, rowToPropertyApi, type PropertyRow } from './propertiesService.js';
import {
  parseIsoDateOnly,
  primaryOwnerIdFromShares,
  validateOwnershipTransferOwners,
} from '../utils/propertyOwnershipValidation.js';
import { rowToPropertyOwnershipApi, type PropertyOwnershipRow } from './propertyOwnershipPgService.js';

export type OwnershipSegmentListRow = PropertyOwnershipRow & {
  property_name: string;
  owner_name: string;
};

function rowToListApi(row: OwnershipSegmentListRow): Record<string, unknown> {
  const base = rowToPropertyOwnershipApi(row);
  return {
    ...base,
    propertyName: row.property_name,
    ownerName: row.owner_name,
  };
}

export async function listOwnershipSegmentsForTenant(
  client: pg.PoolClient,
  tenantId: string,
  opts?: { includeDeleted?: boolean }
): Promise<OwnershipSegmentListRow[]> {
  const delClause = opts?.includeDeleted ? '' : 'AND po.deleted_at IS NULL';
  const r = await client.query<OwnershipSegmentListRow>(
    `SELECT po.id, po.tenant_id, po.property_id, po.owner_id, po.ownership_percentage,
            po.start_date, po.end_date, po.is_active, po.version, po.deleted_at,
            po.transfer_document, po.notes, po.created_at, po.updated_at,
            p.name AS property_name, c.name AS owner_name
     FROM property_ownership po
     JOIN properties p ON p.id = po.property_id AND p.tenant_id = po.tenant_id
     LEFT JOIN contacts c ON c.id = po.owner_id AND c.tenant_id = po.tenant_id
     WHERE po.tenant_id = $1 ${delClause}
     ORDER BY po.start_date DESC, po.updated_at DESC`,
    [tenantId]
  );
  return r.rows;
}

export async function getOwnershipSegmentById(
  client: pg.PoolClient,
  tenantId: string,
  segmentId: string
): Promise<OwnershipSegmentListRow | null> {
  const r = await client.query<OwnershipSegmentListRow>(
    `SELECT po.id, po.tenant_id, po.property_id, po.owner_id, po.ownership_percentage,
            po.start_date, po.end_date, po.is_active, po.version, po.deleted_at,
            po.transfer_document, po.notes, po.created_at, po.updated_at,
            p.name AS property_name, c.name AS owner_name
     FROM property_ownership po
     JOIN properties p ON p.id = po.property_id AND p.tenant_id = po.tenant_id
     LEFT JOIN contacts c ON c.id = po.owner_id AND c.tenant_id = po.tenant_id
     WHERE po.id = $1 AND po.tenant_id = $2`,
    [segmentId, tenantId]
  );
  return r.rows[0] ?? null;
}

export async function softDeleteOwnershipSegment(
  client: pg.PoolClient,
  tenantId: string,
  segmentId: string
): Promise<boolean> {
  const r = await client.query(
    `UPDATE property_ownership SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [segmentId, tenantId]
  );
  return (r.rowCount ?? 0) > 0;
}

export type TransferOwnershipBody = {
  transferDate: string;
  owners: Array<{ ownerId: string; sharePercent?: number; percentage?: number }>;
  transferDocument?: string;
  notes?: string;
};

/**
 * Atomic ownership transfer: close active open-ended rows, insert new active rows, set property.owner_id.
 */
export async function transferPropertyOwnership(
  client: pg.PoolClient,
  tenantId: string,
  propertyId: string,
  body: TransferOwnershipBody
): Promise<{ property: ReturnType<typeof rowToPropertyApi>; segments: Record<string, unknown>[] }> {
  const prop = await getPropertyById(client, tenantId, propertyId);
  if (!prop) throw new Error('Property not found.');

  const parsed = parseIsoDateOnly(body.transferDate);
  if ('error' in parsed) throw new Error(parsed.error);

  const validated = validateOwnershipTransferOwners(body.owners || []);
  if ('error' in validated) throw new Error(validated.error);

  const ymd = parsed.ymd;
  const owners = validated.owners;
  const primary = primaryOwnerIdFromShares(owners);
  if (!primary) throw new Error('Could not determine primary owner.');

  for (const o of owners) {
    const c = await getContactById(client, tenantId, o.ownerId);
    if (!c) throw new Error(`Owner contact not found: ${o.ownerId}`);
  }

  const doc =
    body.transferDocument != null && String(body.transferDocument).trim() !== ''
      ? String(body.transferDocument).trim()
      : null;
  const notes =
    body.notes != null && String(body.notes).trim() !== '' ? String(body.notes).trim() : null;

  await client.query(
    `UPDATE property_ownership
     SET end_date = $3::date, is_active = FALSE, version = version + 1, updated_at = NOW()
     WHERE tenant_id = $1 AND property_id = $2 AND deleted_at IS NULL
       AND is_active = TRUE AND end_date IS NULL`,
    [tenantId, propertyId, ymd]
  );

  const inserted: Record<string, unknown>[] = [];
  for (const o of owners) {
    const id = randomUUID();
    await client.query(
      `INSERT INTO property_ownership (
        id, tenant_id, property_id, owner_id, ownership_percentage,
        start_date, end_date, is_active, version, deleted_at,
        transfer_document, notes, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6::date, NULL, TRUE, 1, NULL, $7, $8, NOW(), NOW())`,
      [id, tenantId, propertyId, o.ownerId, o.percentage, ymd, doc, notes]
    );
    const sel = await client.query<PropertyOwnershipRow>(
      `SELECT id, tenant_id, property_id, owner_id, ownership_percentage, start_date, end_date, is_active,
              version, deleted_at, transfer_document, notes, created_at, updated_at
       FROM property_ownership WHERE id = $1`,
      [id]
    );
    const row = sel.rows[0];
    if (row) inserted.push(rowToPropertyOwnershipApi(row));
  }

  const up = await client.query<PropertyRow>(
    `UPDATE properties SET owner_id = $3, version = version + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     RETURNING id, tenant_id, name, owner_id, building_id, description, monthly_service_charge, version, deleted_at, created_at, updated_at`,
    [propertyId, tenantId, primary]
  );
  const updatedProp = up.rows[0];
  if (!updatedProp) throw new Error('Property not found after transfer.');

  console.info(
    `[ownership] transfer tenant=${tenantId} property=${propertyId} date=${ymd} owners=${owners
      .map((x) => `${x.ownerId}:${x.percentage}`)
      .join(',')}`
  );

  return {
    property: rowToPropertyApi(updatedProp),
    segments: inserted,
  };
}

export function segmentListToApi(rows: OwnershipSegmentListRow[]): Record<string, unknown>[] {
  return rows.map((r) => rowToListApi(r));
}

export function segmentToDetailApi(row: OwnershipSegmentListRow): Record<string, unknown> {
  return rowToListApi(row);
}
