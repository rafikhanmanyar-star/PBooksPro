import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { UnitRow } from '../../../services/unitsService.js';

const UNIT_COLUMNS = `id, tenant_id, project_id, unit_number, floor, unit_type, size, status, owner_contact_id, sale_price, description, area, user_id, version, deleted_at, created_at, updated_at`;

export type UnitListFilters = {
  projectId?: string;
};

export class UnitRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async getById(client: pg.PoolClient, id: string): Promise<UnitRow | null> {
    const r = await client.query<UnitRow>(
      `SELECT ${UNIT_COLUMNS}
       FROM units WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async list(client: pg.PoolClient, filters?: UnitListFilters): Promise<UnitRow[]> {
    const params: unknown[] = [this.tenantId];
    let where = 'tenant_id = $1 AND deleted_at IS NULL';
    if (filters?.projectId) {
      params.push(filters.projectId);
      where += ` AND project_id = $${params.length}`;
    }
    const r = await client.query<UnitRow>(
      `SELECT ${UNIT_COLUMNS} FROM units WHERE ${where} ORDER BY unit_number ASC`,
      params
    );
    return r.rows;
  }

  async listChangedSince(client: pg.PoolClient, since: Date): Promise<UnitRow[]> {
    const r = await client.query<UnitRow>(
      `SELECT ${UNIT_COLUMNS}
       FROM units WHERE tenant_id = $1 AND updated_at > $2 ORDER BY updated_at ASC`,
      [this.tenantId, since]
    );
    return r.rows;
  }
}
