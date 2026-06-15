import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { RecurringInvoiceTemplateRow } from '../services/recurringInvoiceTemplatesService.js';

const RECURRING_TEMPLATE_COLUMNS = `id, tenant_id, user_id, contact_id, property_id, building_id, amount, description_template, day_of_month,
  next_due_date, active, agreement_id, invoice_type, frequency, auto_generate, max_occurrences,
  generated_count, last_generated_date, version, deleted_at, created_at, updated_at`;

export type RecurringInvoiceTemplateWriteFields = {
  contact_id: string;
  property_id: string;
  building_id: string;
  amount: number;
  description_template: string;
  day_of_month: number;
  next_due_date: string;
  active: boolean;
  agreement_id: string | null;
  invoice_type: string;
  frequency: string | null;
  auto_generate: boolean;
  max_occurrences: number | null;
  generated_count: number;
  last_generated_date: string | null;
};

export class RecurringInvoiceTemplateRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async getById(client: pg.PoolClient, id: string): Promise<RecurringInvoiceTemplateRow | null> {
    const r = await client.query<RecurringInvoiceTemplateRow>(
      `SELECT ${RECURRING_TEMPLATE_COLUMNS}
       FROM recurring_invoice_templates
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async getByIdIncludingDeleted(client: pg.PoolClient, id: string): Promise<RecurringInvoiceTemplateRow | null> {
    const r = await client.query<RecurringInvoiceTemplateRow>(
      `SELECT ${RECURRING_TEMPLATE_COLUMNS}
       FROM recurring_invoice_templates WHERE id = $1 AND tenant_id = $2`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async listActive(client: pg.PoolClient): Promise<RecurringInvoiceTemplateRow[]> {
    const r = await client.query<RecurringInvoiceTemplateRow>(
      `SELECT ${RECURRING_TEMPLATE_COLUMNS}
       FROM recurring_invoice_templates
       WHERE tenant_id = $1 AND deleted_at IS NULL
       ORDER BY next_due_date ASC, id ASC`,
      [this.tenantId]
    );
    return r.rows;
  }

  async listChangedSince(client: pg.PoolClient, since: Date): Promise<RecurringInvoiceTemplateRow[]> {
    const r = await client.query<RecurringInvoiceTemplateRow>(
      `SELECT ${RECURRING_TEMPLATE_COLUMNS}
       FROM recurring_invoice_templates WHERE tenant_id = $1 AND updated_at > $2
       ORDER BY updated_at ASC`,
      [this.tenantId, since]
    );
    return r.rows;
  }

  async insertTemplate(
    client: pg.PoolClient,
    id: string,
    fields: RecurringInvoiceTemplateWriteFields,
    userId: string | null
  ): Promise<RecurringInvoiceTemplateRow> {
    const r = await client.query<RecurringInvoiceTemplateRow>(
      `INSERT INTO recurring_invoice_templates (
         id, tenant_id, user_id, contact_id, property_id, building_id, amount, description_template, day_of_month,
         next_due_date, active, agreement_id, invoice_type, frequency, auto_generate, max_occurrences,
         generated_count, last_generated_date, version, deleted_at, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::date, $11, $12, $13, $14, $15, $16, $17, $18, 1, NULL, NOW(), NOW()
       )
       RETURNING ${RECURRING_TEMPLATE_COLUMNS}`,
      [
        id,
        this.tenantId,
        userId,
        fields.contact_id,
        fields.property_id,
        fields.building_id,
        fields.amount,
        fields.description_template,
        fields.day_of_month,
        fields.next_due_date,
        fields.active,
        fields.agreement_id,
        fields.invoice_type,
        fields.frequency,
        fields.auto_generate,
        fields.max_occurrences,
        fields.generated_count,
        fields.last_generated_date,
      ]
    );
    return r.rows[0]!;
  }

  async updateUpsert(
    client: pg.PoolClient,
    id: string,
    fields: RecurringInvoiceTemplateWriteFields,
    userId: string | null
  ): Promise<RecurringInvoiceTemplateRow | null> {
    const r = await client.query<RecurringInvoiceTemplateRow>(
      `UPDATE recurring_invoice_templates SET
         user_id = COALESCE($3, user_id),
         contact_id = $4, property_id = $5, building_id = $6, amount = $7, description_template = $8,
         day_of_month = $9, next_due_date = $10::date, active = $11, agreement_id = $12, invoice_type = $13,
         frequency = $14, auto_generate = $15, max_occurrences = $16, generated_count = $17,
         last_generated_date = $18::date, deleted_at = NULL, version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING ${RECURRING_TEMPLATE_COLUMNS}`,
      [
        id,
        this.tenantId,
        userId,
        fields.contact_id,
        fields.property_id,
        fields.building_id,
        fields.amount,
        fields.description_template,
        fields.day_of_month,
        fields.next_due_date,
        fields.active,
        fields.agreement_id,
        fields.invoice_type,
        fields.frequency,
        fields.auto_generate,
        fields.max_occurrences,
        fields.generated_count,
        fields.last_generated_date,
      ]
    );
    return r.rows[0] ?? null;
  }

  async markDeleted(client: pg.PoolClient, id: string, expectedVersion?: number): Promise<boolean> {
    const versionClause = expectedVersion !== undefined ? ' AND version = $3' : '';
    const params =
      expectedVersion !== undefined ? [id, this.tenantId, expectedVersion] : [id, this.tenantId];
    const r = await client.query(
      `UPDATE recurring_invoice_templates SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL${versionClause}`,
      params
    );
    return (r.rowCount ?? 0) > 0;
  }
}
