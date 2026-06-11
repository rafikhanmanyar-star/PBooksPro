import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { InvoiceRow } from '../../../services/invoicesService.js';

export class InvoiceRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async getById(client: pg.PoolClient, id: string): Promise<InvoiceRow | null> {
    const r = await client.query<InvoiceRow>(
      `SELECT * FROM invoices WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [this.tenantId, id]
    );
    return r.rows[0] ?? null;
  }
}
