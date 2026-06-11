import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';

export class RentalAgreementRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async listActive(client: pg.PoolClient): Promise<Record<string, unknown>[]> {
    const r = await client.query(
      `SELECT * FROM rental_agreements WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY start_date DESC`,
      [this.tenantId]
    );
    return r.rows as Record<string, unknown>[];
  }
}
