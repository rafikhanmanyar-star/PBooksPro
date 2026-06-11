import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { BillRow } from '../../../services/billsService.js';

/** Strangler: vendors domain bill data access. */
export class BillRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async getById(client: pg.PoolClient, id: string): Promise<BillRow | null> {
    const r = await client.query<BillRow>(
      `SELECT * FROM bills WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [this.tenantId, id]
    );
    return r.rows[0] ?? null;
  }

  async listActive(client: pg.PoolClient, limit = 500): Promise<BillRow[]> {
    const r = await client.query<BillRow>(
      `SELECT * FROM bills WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT $2`,
      [this.tenantId, limit]
    );
    return r.rows;
  }
}
