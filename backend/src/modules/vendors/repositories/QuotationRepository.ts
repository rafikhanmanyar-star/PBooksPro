import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { QuotationRow } from '../../../services/quotationsService.js';

const QUOTATION_COLUMNS = `id, tenant_id, vendor_id, name, date, items, total_amount::text, document_id, user_id, version, deleted_at, created_at, updated_at`;

export class QuotationRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async getById(client: pg.PoolClient, id: string): Promise<QuotationRow | null> {
    const r = await client.query<QuotationRow>(
      `SELECT ${QUOTATION_COLUMNS}
       FROM quotations WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async getByIdIncludingDeleted(client: pg.PoolClient, id: string): Promise<QuotationRow | null> {
    const r = await client.query<QuotationRow>(
      `SELECT ${QUOTATION_COLUMNS}
       FROM quotations WHERE id = $1 AND tenant_id = $2`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async listActive(client: pg.PoolClient): Promise<QuotationRow[]> {
    const r = await client.query<QuotationRow>(
      `SELECT ${QUOTATION_COLUMNS}
       FROM quotations WHERE tenant_id = $1 AND deleted_at IS NULL
       ORDER BY date DESC, id ASC`,
      [this.tenantId]
    );
    return r.rows;
  }

  async listChangedSince(client: pg.PoolClient, since: Date): Promise<QuotationRow[]> {
    const r = await client.query<QuotationRow>(
      `SELECT ${QUOTATION_COLUMNS}
       FROM quotations WHERE tenant_id = $1 AND updated_at > $2
       ORDER BY updated_at ASC`,
      [this.tenantId, since]
    );
    return r.rows;
  }
}
