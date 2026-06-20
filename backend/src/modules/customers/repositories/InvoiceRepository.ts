import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { InvoiceRow } from '../services/invoicesService.js';
import type { DataScopeEnforcementContext } from '../../../auth/tenantRepositoryScope.js';
import { appendFinancialRbacScopeSql } from '../../accounting/services/financialReportScope.js';

const INVOICE_COLUMNS = `id, tenant_id, invoice_number, contact_id, amount, paid_amount, status, issue_date, due_date,
  invoice_type, description, project_id, building_id, property_id, unit_id, category_id, agreement_id,
  security_deposit_charge, service_charges, rental_month, user_id, version, deleted_at, created_at, updated_at`;

export type InvoiceWriteFields = {
  invoice_number: string;
  contact_id: string;
  amount: number;
  paid_amount: number;
  status: string;
  issue_date: string;
  due_date: string;
  invoice_type: string;
  description: string | null;
  project_id: string | null;
  building_id: string | null;
  property_id: string | null;
  unit_id: string | null;
  category_id: string | null;
  agreement_id: string | null;
  security_deposit_charge: number | null;
  service_charges: number | null;
  rental_month: string | null;
};

function invoiceFieldParams(fields: InvoiceWriteFields): unknown[] {
  return [
    fields.invoice_number,
    fields.contact_id,
    fields.amount,
    fields.paid_amount,
    fields.status,
    fields.issue_date,
    fields.due_date,
    fields.invoice_type,
    fields.description,
    fields.project_id,
    fields.building_id,
    fields.property_id,
    fields.unit_id,
    fields.category_id,
    fields.agreement_id,
    fields.security_deposit_charge,
    fields.service_charges,
    fields.rental_month,
  ];
}

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

  async getByIdForUpdate(client: pg.PoolClient, id: string): Promise<InvoiceRow | null> {
    const r = await client.query<InvoiceRow>(
      `SELECT ${INVOICE_COLUMNS}
       FROM invoices WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       FOR UPDATE`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  /** Lock active or soft-deleted row (upsert restore). */
  async lockByIdIncludingDeletedForUpdate(client: pg.PoolClient, id: string): Promise<InvoiceRow | null> {
    const r = await client.query<InvoiceRow>(
      `SELECT ${INVOICE_COLUMNS}
       FROM invoices WHERE id = $1 AND tenant_id = $2
       FOR UPDATE`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async list(
    client: pg.PoolClient,
    filters?: InvoiceListFilters,
    scopeCtx?: DataScopeEnforcementContext
  ): Promise<InvoiceRow[]> {
    const params: unknown[] = [this.tenantId];
    const conditions = ['tenant_id = $1'];
    if (!filters?.includeDeleted) {
      conditions.push('deleted_at IS NULL');
    }
    if (filters?.status) {
      params.push(filters.status);
      conditions.push(`status = $${params.length}`);
    }
    if (filters?.invoiceType) {
      params.push(filters.invoiceType);
      conditions.push(`invoice_type = $${params.length}`);
    }
    if (filters?.projectId) {
      params.push(filters.projectId);
      conditions.push(`project_id = $${params.length}`);
    }
    if (filters?.agreementId) {
      params.push(filters.agreementId);
      conditions.push(`agreement_id = $${params.length}`);
    }
    appendFinancialRbacScopeSql(conditions, params, scopeCtx, {
      project: 'project_id',
      property: 'property_id',
    });
    const q = `SELECT ${INVOICE_COLUMNS} FROM invoices WHERE ${conditions.join(' AND ')} ORDER BY issue_date DESC, invoice_number ASC`;
    const r = await client.query<InvoiceRow>(q, params);
    return r.rows;
  }

  async listChangedSince(client: pg.PoolClient, since: Date): Promise<InvoiceRow[]> {
    const r = await client.query<InvoiceRow>(
      `SELECT ${INVOICE_COLUMNS}
       FROM invoices WHERE tenant_id = $1 AND updated_at > $2
       ORDER BY updated_at ASC`,
      [this.tenantId, since]
    );
    return r.rows;
  }

  async insertInvoice(
    client: pg.PoolClient,
    id: string,
    fields: InvoiceWriteFields,
    userId: string | null
  ): Promise<InvoiceRow> {
    const r = await client.query<InvoiceRow>(
      `INSERT INTO invoices (
         id, tenant_id, invoice_number, contact_id, amount, paid_amount, status, issue_date, due_date, invoice_type,
         description, project_id, building_id, property_id, unit_id, category_id, agreement_id,
         security_deposit_charge, service_charges, rental_month, user_id, version, deleted_at, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8::date, $9::date, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, 1, NULL, NOW(), NOW()
       )
       RETURNING ${INVOICE_COLUMNS}`,
      [id, this.tenantId, ...invoiceFieldParams(fields), userId]
    );
    return r.rows[0]!;
  }

  async updateActive(
    client: pg.PoolClient,
    id: string,
    fields: InvoiceWriteFields,
    options?: { restoreDeleted?: boolean }
  ): Promise<InvoiceRow | null> {
    const restore = options?.restoreDeleted === true;
    const deletedClause = restore ? ', deleted_at = NULL' : '';
    const whereDeleted = restore ? '' : ' AND deleted_at IS NULL';

    const r = await client.query<InvoiceRow>(
      `UPDATE invoices SET
         invoice_number = $3, contact_id = $4, amount = $5, paid_amount = $6, status = $7,
         issue_date = $8::date, due_date = $9::date, invoice_type = $10, description = $11,
         project_id = $12, building_id = $13, property_id = $14, unit_id = $15, category_id = $16, agreement_id = $17,
         security_deposit_charge = $18, service_charges = $19, rental_month = $20,
         version = version + 1, updated_at = NOW()${deletedClause}
       WHERE id = $1 AND tenant_id = $2${whereDeleted}
       RETURNING ${INVOICE_COLUMNS}`,
      [id, this.tenantId, ...invoiceFieldParams(fields)]
    );
    return r.rows[0] ?? null;
  }

  async markDeleted(client: pg.PoolClient, id: string): Promise<boolean> {
    const r = await client.query(
      `UPDATE invoices SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, this.tenantId]
    );
    return (r.rowCount ?? 0) > 0;
  }

  async setPaymentAggregates(
    client: pg.PoolClient,
    id: string,
    paidAmount: number,
    status: string
  ): Promise<void> {
    await client.query(
      `UPDATE invoices SET paid_amount = $3, status = $4, version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, this.tenantId, paidAmount, status]
    );
  }
}
