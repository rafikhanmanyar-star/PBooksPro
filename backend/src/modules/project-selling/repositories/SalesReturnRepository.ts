import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { SalesReturnRow } from '../../../services/salesReturnsService.js';

const SALES_RETURN_COLUMNS = `id, tenant_id, return_number, agreement_id, return_date, reason, reason_notes,
  penalty_percentage::text, penalty_amount::text, refund_amount::text, status,
  processed_date, refunded_date, refund_bill_id, created_by, notes, user_id, version,
  deleted_at, created_at, updated_at`;

export type SalesReturnWriteFields = {
  return_number: string;
  agreement_id: string;
  return_date: string;
  reason: string;
  reason_notes: string | null;
  penalty_percentage: number;
  penalty_amount: number;
  refund_amount: number;
  status: string;
  processed_date: string | null;
  refunded_date: string | null;
  refund_bill_id: string | null;
  created_by: string | null;
  notes: string | null;
};

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

  async insertSalesReturn(
    client: pg.PoolClient,
    id: string,
    fields: SalesReturnWriteFields,
    userId: string | null
  ): Promise<SalesReturnRow> {
    const r = await client.query<SalesReturnRow>(
      `INSERT INTO sales_returns (
         id, tenant_id, return_number, agreement_id, return_date, reason, reason_notes,
         penalty_percentage, penalty_amount, refund_amount, status,
         processed_date, refunded_date, refund_bill_id, created_by, notes, user_id, version, deleted_at, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5::date, $6, $7, $8, $9, $10, $11, $12::date, $13::date, $14, $15, $16, $17, 1, NULL, NOW(), NOW()
       )
       RETURNING ${SALES_RETURN_COLUMNS}`,
      [
        id,
        this.tenantId,
        fields.return_number,
        fields.agreement_id,
        fields.return_date,
        fields.reason,
        fields.reason_notes,
        fields.penalty_percentage,
        fields.penalty_amount,
        fields.refund_amount,
        fields.status,
        fields.processed_date,
        fields.refunded_date,
        fields.refund_bill_id,
        fields.created_by,
        fields.notes,
        userId,
      ]
    );
    return r.rows[0]!;
  }

  async updateUpsert(client: pg.PoolClient, id: string, fields: SalesReturnWriteFields): Promise<SalesReturnRow | null> {
    const r = await client.query<SalesReturnRow>(
      `UPDATE sales_returns SET
         return_number = $3, agreement_id = $4, return_date = $5::date, reason = $6, reason_notes = $7,
         penalty_percentage = $8, penalty_amount = $9, refund_amount = $10, status = $11,
         processed_date = $12::date, refunded_date = $13::date, refund_bill_id = $14,
         created_by = COALESCE($15, created_by), notes = $16,
         deleted_at = NULL, version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING ${SALES_RETURN_COLUMNS}`,
      [
        id,
        this.tenantId,
        fields.return_number,
        fields.agreement_id,
        fields.return_date,
        fields.reason,
        fields.reason_notes,
        fields.penalty_percentage,
        fields.penalty_amount,
        fields.refund_amount,
        fields.status,
        fields.processed_date,
        fields.refunded_date,
        fields.refund_bill_id,
        fields.created_by,
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
      `UPDATE sales_returns SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL${versionClause}`,
      params
    );
    return (r.rowCount ?? 0) > 0;
  }
}
