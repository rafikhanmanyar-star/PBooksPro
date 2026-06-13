import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { QuotationRow } from '../../../services/quotationsService.js';

const QUOTATION_COLUMNS = `id, tenant_id, vendor_id, name, quotation_number, date, expiry_date, enable_price_validation, validation_scope, is_active,
  items, total_amount::text, document_id, user_id, version, deleted_at, created_at, updated_at`;

export type QuotationWriteFields = {
  vendor_id: string;
  name: string;
  quotation_number: string | null;
  date: string;
  expiry_date: string | null;
  enable_price_validation: boolean;
  validation_scope: string;
  is_active: boolean;
  items_json: string;
  total_amount: number;
  document_id: string | null;
};

function quotationFieldParams(fields: QuotationWriteFields): unknown[] {
  return [
    fields.vendor_id,
    fields.name,
    fields.quotation_number,
    fields.date,
    fields.expiry_date,
    fields.enable_price_validation,
    fields.validation_scope,
    fields.is_active,
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
      `INSERT INTO quotations (
         id, tenant_id, vendor_id, name, quotation_number, date, expiry_date,
         enable_price_validation, validation_scope, is_active,
         items, total_amount, document_id, user_id, version, deleted_at, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6::date, $7::date, $8, $9, $10, $11::jsonb, $12, $13, $14, 1, NULL, NOW(), NOW())
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
         vendor_id = $3, name = $4, quotation_number = $5, date = $6::date, expiry_date = $7::date,
         enable_price_validation = $8, validation_scope = $9, is_active = $10,
         items = $11::jsonb, total_amount = $12, document_id = $13,
         user_id = COALESCE($14, user_id), version = version + 1, updated_at = NOW()
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

  async listActiveByVendor(client: pg.PoolClient, vendorId: string): Promise<QuotationRow[]> {
    const r = await client.query<QuotationRow>(
      `SELECT ${QUOTATION_COLUMNS}
       FROM quotations
       WHERE tenant_id = $1 AND vendor_id = $2 AND deleted_at IS NULL AND is_active = TRUE
       ORDER BY date DESC, id ASC`,
      [this.tenantId, vendorId]
    );
    return r.rows;
  }
}
