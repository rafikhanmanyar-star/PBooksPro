import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { BuildingRow } from '../../../services/buildingsService.js';

const BUILDING_COLUMNS = `id, tenant_id, name, description, color, version, deleted_at, created_at, updated_at`;

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
}
