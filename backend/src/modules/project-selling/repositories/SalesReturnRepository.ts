import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { SalesReturnRow } from '../../../services/salesReturnsService.js';

const SALES_RETURN_COLUMNS = `id, tenant_id, return_number, agreement_id, return_date, reason, reason_notes,
  penalty_percentage::text, penalty_amount::text, refund_amount::text, status,
  processed_date, refunded_date, refund_bill_id, created_by, notes, user_id, version,
  deleted_at, created_at, updated_at`;

export type SalesReturnListFilters = {
  status?: string;
  agreementId?: string;
};

export class SalesReturnRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async getById(client: pg.PoolClient, id: string): Promise<SalesReturnRow | null> {
    const r = await client.query<SalesReturnRow>(
      `SELECT ${SALES_RETURN_COLUMNS}
       FROM sales_returns WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async getByIdIncludingDeleted(client: pg.PoolClient, id: string): Promise<SalesReturnRow | null> {
    const r = await client.query<SalesReturnRow>(
      `SELECT ${SALES_RETURN_COLUMNS}
       FROM sales_returns WHERE id = $1 AND tenant_id = $2`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async listActive(client: pg.PoolClient, filters?: SalesReturnListFilters): Promise<SalesReturnRow[]> {
    const params: unknown[] = [this.tenantId];
    let q = `SELECT ${SALES_RETURN_COLUMNS}
             FROM sales_returns WHERE tenant_id = $1 AND deleted_at IS NULL`;
    if (filters?.status) {
      params.push(filters.status);
      q += ` AND status = $${params.length}`;
    }
    if (filters?.agreementId) {
      params.push(filters.agreementId);
      q += ` AND agreement_id = $${params.length}`;
    }
    q += ' ORDER BY return_date DESC, id ASC';
    const r = await client.query<SalesReturnRow>(q, params);
    return r.rows;
  }

  async listChangedSince(client: pg.PoolClient, since: Date): Promise<SalesReturnRow[]> {
    const r = await client.query<SalesReturnRow>(
      `SELECT ${SALES_RETURN_COLUMNS}
       FROM sales_returns WHERE tenant_id = $1 AND updated_at > $2
       ORDER BY updated_at ASC`,
      [this.tenantId, since]
    );
    return r.rows;
  }
}
