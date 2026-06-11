import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { ProjectReceivedAssetRow } from '../../../services/projectReceivedAssetsService.js';

const ASSET_COLUMNS = `id, tenant_id, project_id, contact_id, invoice_id, description, asset_type, recorded_value,
  received_date, sold_date, sale_amount, sale_account_id, notes, user_id, version, deleted_at, created_at, updated_at`;

export type ProjectReceivedAssetListFilters = {
  projectId?: string;
};

export class ProjectReceivedAssetRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async getById(client: pg.PoolClient, id: string): Promise<ProjectReceivedAssetRow | null> {
    const r = await client.query<ProjectReceivedAssetRow>(
      `SELECT ${ASSET_COLUMNS}
       FROM project_received_assets WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async getByIdIncludingDeleted(client: pg.PoolClient, id: string): Promise<ProjectReceivedAssetRow | null> {
    const r = await client.query<ProjectReceivedAssetRow>(
      `SELECT ${ASSET_COLUMNS}
       FROM project_received_assets WHERE id = $1 AND tenant_id = $2`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async listActive(client: pg.PoolClient, filters?: ProjectReceivedAssetListFilters): Promise<ProjectReceivedAssetRow[]> {
    const params: unknown[] = [this.tenantId];
    let q = `SELECT ${ASSET_COLUMNS}
             FROM project_received_assets WHERE tenant_id = $1 AND deleted_at IS NULL`;
    if (filters?.projectId) {
      params.push(filters.projectId);
      q += ` AND project_id = $${params.length}`;
    }
    q += ' ORDER BY received_date DESC, id ASC';
    const r = await client.query<ProjectReceivedAssetRow>(q, params);
    return r.rows;
  }

  async listChangedSince(client: pg.PoolClient, since: Date): Promise<ProjectReceivedAssetRow[]> {
    const r = await client.query<ProjectReceivedAssetRow>(
      `SELECT ${ASSET_COLUMNS}
       FROM project_received_assets WHERE tenant_id = $1 AND updated_at > $2
       ORDER BY updated_at ASC`,
      [this.tenantId, since]
    );
    return r.rows;
  }
}
