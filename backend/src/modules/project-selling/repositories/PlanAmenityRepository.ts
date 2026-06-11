import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { PlanAmenityRow } from '../../../services/planAmenitiesService.js';

const AMENITY_COLUMNS = `id, tenant_id, name, price::text, is_percentage, is_active, description, version, deleted_at, created_at, updated_at`;

export type PlanAmenityListFilters = {
  activeOnly?: boolean;
};

export class PlanAmenityRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async getById(client: pg.PoolClient, id: string): Promise<PlanAmenityRow | null> {
    const r = await client.query<PlanAmenityRow>(
      `SELECT ${AMENITY_COLUMNS}
       FROM plan_amenities WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async getByIdIncludingDeleted(client: pg.PoolClient, id: string): Promise<PlanAmenityRow | null> {
    const r = await client.query<PlanAmenityRow>(
      `SELECT ${AMENITY_COLUMNS}
       FROM plan_amenities WHERE id = $1 AND tenant_id = $2`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async listActive(client: pg.PoolClient, filters?: PlanAmenityListFilters): Promise<PlanAmenityRow[]> {
    let q = `SELECT ${AMENITY_COLUMNS}
             FROM plan_amenities WHERE tenant_id = $1 AND deleted_at IS NULL`;
    const params: unknown[] = [this.tenantId];
    if (filters?.activeOnly) {
      q += ` AND is_active = 1`;
    }
    q += ` ORDER BY name ASC`;
    const r = await client.query<PlanAmenityRow>(q, params);
    return r.rows;
  }

  async listChangedSince(client: pg.PoolClient, since: Date): Promise<PlanAmenityRow[]> {
    const r = await client.query<PlanAmenityRow>(
      `SELECT ${AMENITY_COLUMNS}
       FROM plan_amenities WHERE tenant_id = $1 AND updated_at > $2
       ORDER BY updated_at ASC`,
      [this.tenantId, since]
    );
    return r.rows;
  }
}
