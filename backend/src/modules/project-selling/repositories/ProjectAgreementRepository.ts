import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';

export class ProjectAgreementRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async getById(client: pg.PoolClient, id: string): Promise<Record<string, unknown> | null> {
    const r = await client.query(
      `SELECT * FROM project_agreements WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [this.tenantId, id]
    );
    return (r.rows[0] as Record<string, unknown>) ?? null;
  }
}
