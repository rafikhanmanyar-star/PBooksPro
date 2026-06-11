import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { QuotationRow } from '../../../services/quotationsService.js';

const QUOTATION_COLUMNS = `id, tenant_id, vendor_id, name, date, items, total_amount::text, document_id, user_id, version, deleted_at, created_at, updated_at`;

export type QuotationWriteFields = {
  vendor_id: string;
  name: string;
  date: string;
  items_json: string;
  total_amount: number;
  document_id: string | null;
};

function quotationFieldParams(fields: QuotationWriteFields): unknown[] {
  return [
    fields.vendor_id,
    fields.name,
    fields.date,
    fields.items_json,
    fields.total_amount,
    fields.document_id,
  ];
}

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

  async insertQuotation(
    client: pg.PoolClient,
    id: string,
    fields: QuotationWriteFields,
    userId: string | null
  ): Promise<QuotationRow> {
    const r = await client.query<QuotationRow>(
      `INSERT INTO quotations (id, tenant_id, vendor_id, name, date, items, total_amount, document_id, user_id, version, deleted_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::date, $6::jsonb, $7, $8, $9, 1, NULL, NOW(), NOW())
       RETURNING ${QUOTATION_COLUMNS}`,
      [id, this.tenantId, ...quotationFieldParams(fields), userId]
    );
    return r.rows[0]!;
  }

  async updateActive(
    client: pg.PoolClient,
    id: string,
    fields: QuotationWriteFields,
    userId: string | null
  ): Promise<QuotationRow | null> {
    const r = await client.query<QuotationRow>(
      `UPDATE quotations SET
         vendor_id = $3, name = $4, date = $5::date, items = $6::jsonb, total_amount = $7,
         document_id = $8, user_id = COALESCE($9, user_id), version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING ${QUOTATION_COLUMNS}`,
      [id, this.tenantId, ...quotationFieldParams(fields), userId]
    );
    return r.rows[0] ?? null;
  }

  async reviveDeleted(client: pg.PoolClient, id: string): Promise<void> {
    await client.query(
      `UPDATE quotations SET deleted_at = NULL, version = 1, updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
      [id, this.tenantId]
    );
  }

  async markDeleted(client: pg.PoolClient, id: string): Promise<boolean> {
    const r = await client.query(
      `UPDATE quotations SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, this.tenantId]
    );
    return (r.rowCount ?? 0) > 0;
  }
}
