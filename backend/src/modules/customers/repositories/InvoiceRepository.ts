import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { InvoiceRow } from '../../../services/invoicesService.js';

const INVOICE_COLUMNS = `id, tenant_id, invoice_number, contact_id, amount, paid_amount, status, issue_date, due_date,
  invoice_type, description, project_id, building_id, property_id, unit_id, category_id, agreement_id,
  security_deposit_charge, service_charges, rental_month, user_id, version, deleted_at, created_at, updated_at`;

export type InvoiceListFilters = {
  status?: string;
  invoiceType?: string;
  projectId?: string;
  agreementId?: string;
  includeDeleted?: boolean;
};

export class InvoiceRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async getById(client: pg.PoolClient, id: string): Promise<InvoiceRow | null> {
    const r = await client.query<InvoiceRow>(
      `SELECT ${INVOICE_COLUMNS}
       FROM invoices WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async getByIdIncludingDeleted(client: pg.PoolClient, id: string): Promise<InvoiceRow | null> {
    const r = await client.query<InvoiceRow>(
      `SELECT ${INVOICE_COLUMNS}
       FROM invoices WHERE id = $1 AND tenant_id = $2`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async list(client: pg.PoolClient, filters?: InvoiceListFilters): Promise<InvoiceRow[]> {
    const params: unknown[] = [this.tenantId];
    let q = `SELECT ${INVOICE_COLUMNS} FROM invoices WHERE tenant_id = $1`;
    if (!filters?.includeDeleted) {
      q += ` AND deleted_at IS NULL`;
    }
    if (filters?.status) {
      params.push(filters.status);
      q += ` AND status = $${params.length}`;
    }
    if (filters?.invoiceType) {
      params.push(filters.invoiceType);
      q += ` AND invoice_type = $${params.length}`;
    }
    if (filters?.projectId) {
      params.push(filters.projectId);
      q += ` AND project_id = $${params.length}`;
    }
    if (filters?.agreementId) {
      params.push(filters.agreementId);
      q += ` AND agreement_id = $${params.length}`;
    }
    q += ' ORDER BY issue_date DESC, invoice_number ASC';
    const r = await client.query<InvoiceRow>(q, params);
    return r.rows;
  }
}
