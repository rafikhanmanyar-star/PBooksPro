import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { RecurringInvoiceTemplateRow } from '../../../services/recurringInvoiceTemplatesService.js';

const RECURRING_TEMPLATE_COLUMNS = `id, tenant_id, user_id, contact_id, property_id, building_id, amount, description_template, day_of_month,
  next_due_date, active, agreement_id, invoice_type, frequency, auto_generate, max_occurrences,
  generated_count, last_generated_date, version, deleted_at, created_at, updated_at`;

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
}
