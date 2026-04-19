import type pg from 'pg';

export type PropertyOwnershipRow = {
  id: string;
  tenant_id: string;
  property_id: string;
  owner_id: string;
  ownership_percentage: string | number;
  start_date: Date | string;
  end_date: Date | string | null;
  is_active: boolean;
  version: number;
  deleted_at: Date | string | null;
  transfer_document?: string | null;
  notes?: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export function rowToPropertyOwnershipApi(row: PropertyOwnershipRow): Record<string, unknown> {
  const pct =
    typeof row.ownership_percentage === 'number'
      ? row.ownership_percentage
      : Number(row.ownership_percentage);
  const sd =
    row.start_date instanceof Date
      ? row.start_date.toISOString().slice(0, 10)
      : String(row.start_date).slice(0, 10);
  const ed =
    row.end_date == null
      ? null
      : row.end_date instanceof Date
        ? row.end_date.toISOString().slice(0, 10)
        : String(row.end_date).slice(0, 10);

  const base: Record<string, unknown> = {
    id: row.id,
    tenantId: row.tenant_id,
    propertyId: row.property_id,
    ownerId: row.owner_id,
    ownershipPercentage: Number.isFinite(pct) ? pct : 0,
    startDate: sd,
    endDate: ed,
    isActive: Boolean(row.is_active),
    version: row.version,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
  if (row.deleted_at) {
    base.deletedAt = row.deleted_at instanceof Date ? row.deleted_at.toISOString() : row.deleted_at;
  }
  if (row.transfer_document != null && String(row.transfer_document).trim() !== '') {
    base.transferDocument = String(row.transfer_document);
  }
  if (row.notes != null && String(row.notes).trim() !== '') {
    base.notes = String(row.notes);
  }
  return base;
}

export async function listPropertyOwnership(
  client: pg.PoolClient,
  tenantId: string
): Promise<PropertyOwnershipRow[]> {
  const r = await client.query<PropertyOwnershipRow>(
    `SELECT id, tenant_id, property_id, owner_id, ownership_percentage, start_date, end_date, is_active,
            version, deleted_at, transfer_document, notes, created_at, updated_at
     FROM property_ownership
     WHERE tenant_id = $1 AND deleted_at IS NULL
     ORDER BY property_id, start_date ASC`,
    [tenantId]
  );
  return r.rows;
}

export async function listPropertyOwnershipChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<PropertyOwnershipRow[]> {
  const r = await client.query<PropertyOwnershipRow>(
    `SELECT id, tenant_id, property_id, owner_id, ownership_percentage, start_date, end_date, is_active,
            version, deleted_at, transfer_document, notes, created_at, updated_at
     FROM property_ownership WHERE tenant_id = $1 AND updated_at > $2
     ORDER BY updated_at ASC`,
    [tenantId, since]
  );
  return r.rows;
}

export type PropertyOwnershipSyncRow = {
  id: string;
  ownerId: string;
  ownershipPercentage: number;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
};

/**
 * Replace ownership rows for one property with the client-computed chain (after transfer).
 * Soft-deletes rows that exist on the server for this property but are not in `rows`, then upserts each row.
 */
export async function syncPropertyOwnershipRowsForProperty(
  client: pg.PoolClient,
  tenantId: string,
  propertyId: string,
  rows: PropertyOwnershipSyncRow[]
): Promise<void> {
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM property_ownership WHERE tenant_id = $1 AND property_id = $2 AND deleted_at IS NULL`,
    [tenantId, propertyId]
  );
  const want = new Set(rows.map((r) => r.id));
  for (const ex of existing.rows) {
    if (!want.has(ex.id)) {
      await client.query(
        `UPDATE property_ownership SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2`,
        [ex.id, tenantId]
      );
    }
  }
  for (const r of rows) {
    const end =
      r.endDate == null || String(r.endDate).trim() === '' ? null : String(r.endDate).slice(0, 10);
    const start = String(r.startDate).slice(0, 10);
    const pct = Number(r.ownershipPercentage);
    await client.query(
      `INSERT INTO property_ownership (
        id, tenant_id, property_id, owner_id, ownership_percentage, start_date, end_date, is_active,
        version, deleted_at, transfer_document, notes, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6::date, $7::date, $8, 1, NULL, NULL, NULL, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        owner_id = EXCLUDED.owner_id,
        ownership_percentage = EXCLUDED.ownership_percentage,
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        is_active = EXCLUDED.is_active,
        version = property_ownership.version + 1,
        deleted_at = NULL,
        transfer_document = COALESCE(EXCLUDED.transfer_document, property_ownership.transfer_document),
        notes = COALESCE(EXCLUDED.notes, property_ownership.notes),
        updated_at = NOW()`,
      [
        r.id,
        tenantId,
        propertyId,
        r.ownerId,
        Number.isFinite(pct) ? pct : 0,
        start,
        end,
        Boolean(r.isActive),
      ]
    );
  }
}
