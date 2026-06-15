import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { PlanAmenityRow } from '../services/planAmenitiesService.js';

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

  async insertPlanAmenity(
    client: pg.PoolClient,
    id: string,
    name: string,
    price: number,
    isPercentage: number,
    isActive: number,
    description: string | null
  ): Promise<PlanAmenityRow> {
    const r = await client.query<PlanAmenityRow>(
      `INSERT INTO plan_amenities (
         id, tenant_id, name, price, is_percentage, is_active, description, version, deleted_at, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 1, NULL, NOW(), NOW())
       RETURNING ${AMENITY_COLUMNS}`,
      [id, this.tenantId, name, price, isPercentage, isActive, description]
    );
    return r.rows[0]!;
  }

  async updateActive(
    client: pg.PoolClient,
    id: string,
    name: string,
    price: number,
    isPercentage: number,
    isActive: number,
    description: string | null,
    options?: { restoreDeleted?: boolean }
  ): Promise<PlanAmenityRow | null> {
    const restore = options?.restoreDeleted === true;
    const r = await client.query<PlanAmenityRow>(
      `UPDATE plan_amenities SET
         name = $3, price = $4, is_percentage = $5, is_active = $6, description = $7,
         version = version + 1, updated_at = NOW()${restore ? ', deleted_at = NULL' : ''}
       WHERE id = $1 AND tenant_id = $2${restore ? '' : ' AND deleted_at IS NULL'}
       RETURNING ${AMENITY_COLUMNS}`,
      [id, this.tenantId, name, price, isPercentage, isActive, description]
    );
    return r.rows[0] ?? null;
  }

  async markDeleted(client: pg.PoolClient, id: string, expectedVersion?: number): Promise<boolean> {
    const versionClause = expectedVersion !== undefined ? ' AND version = $3' : '';
    const params =
      expectedVersion !== undefined ? [id, this.tenantId, expectedVersion] : [id, this.tenantId];
    const r = await client.query(
      `UPDATE plan_amenities SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL${versionClause}`,
      params
    );
    return (r.rowCount ?? 0) > 0;
  }
}
