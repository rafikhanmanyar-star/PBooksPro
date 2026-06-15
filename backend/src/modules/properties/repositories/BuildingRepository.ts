import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { BuildingRow } from '../services/buildingsService.js';

const BUILDING_COLUMNS = `id, tenant_id, name, description, color, version, deleted_at, created_at, updated_at`;

export type BuildingWriteFields = {
  name: string;
  description: string | null;
  color: string | null;
};

export class BuildingRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async getById(client: pg.PoolClient, id: string): Promise<BuildingRow | null> {
    const r = await client.query<BuildingRow>(
      `SELECT ${BUILDING_COLUMNS}
       FROM buildings WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async listActive(client: pg.PoolClient): Promise<BuildingRow[]> {
    const r = await client.query<BuildingRow>(
      `SELECT ${BUILDING_COLUMNS}
       FROM buildings WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY name ASC`,
      [this.tenantId]
    );
    return r.rows;
  }

  async listChangedSince(client: pg.PoolClient, since: Date): Promise<BuildingRow[]> {
    const r = await client.query<BuildingRow>(
      `SELECT ${BUILDING_COLUMNS}
       FROM buildings WHERE tenant_id = $1 AND updated_at > $2 ORDER BY updated_at ASC`,
      [this.tenantId, since]
    );
    return r.rows;
  }

  async insertBuilding(client: pg.PoolClient, id: string, fields: BuildingWriteFields): Promise<BuildingRow> {
    const r = await client.query<BuildingRow>(
      `INSERT INTO buildings (id, tenant_id, name, description, color, version, deleted_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 1, NULL, NOW(), NOW())
       RETURNING ${BUILDING_COLUMNS}`,
      [id, this.tenantId, fields.name, fields.description, fields.color]
    );
    return r.rows[0]!;
  }

  async updateActive(client: pg.PoolClient, id: string, fields: BuildingWriteFields): Promise<BuildingRow | null> {
    const r = await client.query<BuildingRow>(
      `UPDATE buildings SET
         name = $3, description = $4, color = $5,
         version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING ${BUILDING_COLUMNS}`,
      [id, this.tenantId, fields.name, fields.description, fields.color]
    );
    return r.rows[0] ?? null;
  }

  async markDeleted(client: pg.PoolClient, id: string): Promise<{ ok: boolean; row: BuildingRow | null }> {
    const r = await client.query<BuildingRow>(
      `UPDATE buildings SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING ${BUILDING_COLUMNS}`,
      [id, this.tenantId]
    );
    return { ok: (r.rowCount ?? 0) > 0, row: r.rows[0] ?? null };
  }
}
