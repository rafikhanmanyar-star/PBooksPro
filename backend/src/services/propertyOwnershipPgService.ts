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

  return {
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
    ...(row.deleted_at
      ? { deletedAt: row.deleted_at instanceof Date ? row.deleted_at.toISOString() : row.deleted_at }
      : {}),
  };
}

export async function listPropertyOwnership(
  client: pg.PoolClient,
  tenantId: string
): Promise<PropertyOwnershipRow[]> {
  const r = await client.query<PropertyOwnershipRow>(
    `SELECT id, tenant_id, property_id, owner_id, ownership_percentage, start_date, end_date, is_active,
            version, deleted_at, created_at, updated_at
     FROM property_ownership
     WHERE tenant_id = $1 AND deleted_at IS NULL
     ORDER BY property_id, start_date ASC`,
    [tenantId]
  );
  return r.rows;
}
