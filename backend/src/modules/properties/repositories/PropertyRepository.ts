import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { PropertyRow } from '../../../services/propertiesService.js';

const PROPERTY_COLUMNS = `id, tenant_id, name, owner_id, building_id, description, monthly_service_charge, version, deleted_at, created_at, updated_at`;

export type PropertyWriteFields = {
  name: string;
  owner_id: string;
  building_id: string;
  description: string | null;
  monthly_service_charge: number | null;
};

export type PropertyListFilters = {
  buildingId?: string;
};

export class PropertyRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async getById(client: pg.PoolClient, id: string): Promise<PropertyRow | null> {
    const r = await client.query<PropertyRow>(
      `SELECT ${PROPERTY_COLUMNS}
       FROM properties WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async list(client: pg.PoolClient, filters?: PropertyListFilters): Promise<PropertyRow[]> {
    const params: unknown[] = [this.tenantId];
    let where = 'tenant_id = $1 AND deleted_at IS NULL';
    if (filters?.buildingId) {
      params.push(filters.buildingId);
      where += ` AND building_id = $${params.length}`;
    }
    const r = await client.query<PropertyRow>(
      `SELECT ${PROPERTY_COLUMNS} FROM properties WHERE ${where} ORDER BY name ASC`,
      params
    );
    return r.rows;
  }

  async listChangedSince(client: pg.PoolClient, since: Date): Promise<PropertyRow[]> {
    const r = await client.query<PropertyRow>(
      `SELECT ${PROPERTY_COLUMNS}
       FROM properties WHERE tenant_id = $1 AND updated_at > $2 ORDER BY updated_at ASC`,
      [this.tenantId, since]
    );
    return r.rows;
  }

  async insertProperty(client: pg.PoolClient, id: string, fields: PropertyWriteFields): Promise<PropertyRow> {
    const r = await client.query<PropertyRow>(
      `INSERT INTO properties (
         id, tenant_id, name, owner_id, building_id, description, monthly_service_charge, version, deleted_at, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 1, NULL, NOW(), NOW())
       RETURNING ${PROPERTY_COLUMNS}`,
      [
        id,
        this.tenantId,
        fields.name,
        fields.owner_id,
        fields.building_id,
        fields.description,
        fields.monthly_service_charge,
      ]
    );
    return r.rows[0]!;
  }

  async updateActive(client: pg.PoolClient, id: string, fields: PropertyWriteFields): Promise<PropertyRow | null> {
    const r = await client.query<PropertyRow>(
      `UPDATE properties SET
         name = $3, owner_id = $4, building_id = $5, description = $6, monthly_service_charge = $7,
         version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING ${PROPERTY_COLUMNS}`,
      [
        id,
        this.tenantId,
        fields.name,
        fields.owner_id,
        fields.building_id,
        fields.description,
        fields.monthly_service_charge,
      ]
    );
    return r.rows[0] ?? null;
  }

  async markDeleted(client: pg.PoolClient, id: string): Promise<{ ok: boolean; row: PropertyRow | null }> {
    const r = await client.query<PropertyRow>(
      `UPDATE properties SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING ${PROPERTY_COLUMNS}`,
      [id, this.tenantId]
    );
    return { ok: (r.rowCount ?? 0) > 0, row: r.rows[0] ?? null };
  }
}
