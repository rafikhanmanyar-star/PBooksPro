import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { ProjectReceivedAssetRow } from '../../../services/projectReceivedAssetsService.js';

const ASSET_COLUMNS = `id, tenant_id, project_id, contact_id, invoice_id, description, asset_type, recorded_value,
  received_date, sold_date, sale_amount, sale_account_id, notes, user_id, version, deleted_at, created_at, updated_at`;

export type ProjectReceivedAssetListFilters = {
  projectId?: string;
};

export type ProjectReceivedAssetWriteFields = {
  project_id: string;
  contact_id: string;
  invoice_id: string | null;
  description: string;
  asset_type: string;
  recorded_value: number;
  received_date: string;
  sold_date: string | null;
  sale_amount: number | null;
  sale_account_id: string | null;
  notes: string | null;
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

  async insertAsset(
    client: pg.PoolClient,
    id: string,
    fields: ProjectReceivedAssetWriteFields,
    userId: string | null
  ): Promise<ProjectReceivedAssetRow> {
    const r = await client.query<ProjectReceivedAssetRow>(
      `INSERT INTO project_received_assets (
         id, tenant_id, project_id, contact_id, invoice_id, description, asset_type, recorded_value,
         received_date, sold_date, sale_amount, sale_account_id, notes, user_id, version, deleted_at, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10::date, $11, $12, $13, $14, 1, NULL, NOW(), NOW()
       )
       RETURNING ${ASSET_COLUMNS}`,
      [
        id,
        this.tenantId,
        fields.project_id,
        fields.contact_id,
        fields.invoice_id,
        fields.description,
        fields.asset_type,
        fields.recorded_value,
        fields.received_date,
        fields.sold_date,
        fields.sale_amount,
        fields.sale_account_id,
        fields.notes,
        userId,
      ]
    );
    return r.rows[0]!;
  }

  async updateUpsert(
    client: pg.PoolClient,
    id: string,
    fields: ProjectReceivedAssetWriteFields
  ): Promise<ProjectReceivedAssetRow | null> {
    const r = await client.query<ProjectReceivedAssetRow>(
      `UPDATE project_received_assets SET
         project_id = $3, contact_id = $4, invoice_id = $5, description = $6, asset_type = $7,
         recorded_value = $8, received_date = $9::date, sold_date = $10::date, sale_amount = $11,
         sale_account_id = $12, notes = $13,
         deleted_at = NULL, version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING ${ASSET_COLUMNS}`,
      [
        id,
        this.tenantId,
        fields.project_id,
        fields.contact_id,
        fields.invoice_id,
        fields.description,
        fields.asset_type,
        fields.recorded_value,
        fields.received_date,
        fields.sold_date,
        fields.sale_amount,
        fields.sale_account_id,
        fields.notes,
      ]
    );
    return r.rows[0] ?? null;
  }

  async markDeleted(client: pg.PoolClient, id: string, expectedVersion?: number): Promise<boolean> {
    const versionClause = expectedVersion !== undefined ? ' AND version = $3' : '';
    const params =
      expectedVersion !== undefined ? [id, this.tenantId, expectedVersion] : [id, this.tenantId];
    const r = await client.query(
      `UPDATE project_received_assets SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL${versionClause}`,
      params
    );
    return (r.rowCount ?? 0) > 0;
  }
}
