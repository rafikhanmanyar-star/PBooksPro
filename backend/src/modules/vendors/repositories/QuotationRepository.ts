import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { QuotationRow } from '../services/quotationsService.js';

const QUOTATION_COLUMNS = `id, tenant_id, vendor_id, name, quotation_number, date, expiry_date, enable_price_validation, validation_scope, is_active,
  contact_person, contact_phone, contact_email, currency, project_id, building_id, package_name, quotation_type, status,
  is_approved_rate, payment_terms, delivery_period, warranty_period, retention_percent::text, advance_percent::text, remarks,
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
  contact_person: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  currency: string;
  project_id: string | null;
  building_id: string | null;
  package_name: string | null;
  quotation_type: string | null;
  status: string;
  is_approved_rate: boolean;
  payment_terms: string | null;
  delivery_period: string | null;
  warranty_period: string | null;
  retention_percent: number;
  advance_percent: number;
  remarks: string | null;
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
    fields.contact_person,
    fields.contact_phone,
    fields.contact_email,
    fields.currency,
    fields.project_id,
    fields.building_id,
    fields.package_name,
    fields.quotation_type,
    fields.status,
    fields.is_approved_rate,
    fields.payment_terms,
    fields.delivery_period,
    fields.warranty_period,
    fields.retention_percent,
    fields.advance_percent,
    fields.remarks,
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
         contact_person, contact_phone, contact_email, currency, project_id, building_id,
         package_name, quotation_type, status, is_approved_rate,
         payment_terms, delivery_period, warranty_period, retention_percent, advance_percent, remarks,
         items, total_amount, document_id, user_id, version, deleted_at, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6::date, $7::date, $8, $9, $10,
               $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
               $21, $22, $23, $24, $25, $26, $27::jsonb, $28, $29, $30, 1, NULL, NOW(), NOW())
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
         contact_person = $11, contact_phone = $12, contact_email = $13, currency = $14,
         project_id = $15, building_id = $16, package_name = $17, quotation_type = $18, status = $19,
         is_approved_rate = $20, payment_terms = $21, delivery_period = $22, warranty_period = $23,
         retention_percent = $24, advance_percent = $25, remarks = $26,
         items = $27::jsonb, total_amount = $28, document_id = $29,
         user_id = COALESCE($30, user_id), version = version + 1, updated_at = NOW()
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

  async quotationNumberExists(
    client: pg.PoolClient,
    quotationNumber: string,
    excludeId?: string
  ): Promise<boolean> {
    const params: unknown[] = [this.tenantId, quotationNumber];
    let excludeClause = '';
    if (excludeId) {
      params.push(excludeId);
      excludeClause = ` AND id <> $3`;
    }
    const r = await client.query<{ id: string }>(
      `SELECT id FROM quotations
       WHERE tenant_id = $1 AND quotation_number = $2 AND deleted_at IS NULL${excludeClause}
       LIMIT 1`,
      params
    );
    return r.rows.length > 0;
  }

  async getMaxQuotationSequence(client: pg.PoolClient, prefix: string): Promise<number> {
    const r = await client.query<{ quotation_number: string }>(
      `SELECT quotation_number FROM quotations
       WHERE tenant_id = $1 AND deleted_at IS NULL AND quotation_number IS NOT NULL
         AND quotation_number LIKE $2`,
      [this.tenantId, `${prefix}%`]
    );
    let maxSeq = 0;
    for (const row of r.rows) {
      const num = row.quotation_number;
      if (!num.startsWith(prefix)) continue;
      const seq = parseInt(num.slice(prefix.length), 10);
      if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
    }
    return maxSeq;
  }

  static formatQuotationNumber(prefix: string, padding: number, sequence: number): string {
    const pad = Number.isFinite(padding) && padding > 0 ? Math.trunc(padding) : 4;
    return `${prefix}${String(sequence).padStart(pad, '0')}`;
  }
}
