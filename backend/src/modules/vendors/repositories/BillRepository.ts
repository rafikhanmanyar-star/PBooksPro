import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { BillRow } from '../../../services/billsService.js';

const BILL_COLUMNS = `id, tenant_id, bill_number, contact_id, vendor_id, amount, paid_amount, status, issue_date, due_date,
  description, category_id, project_id, building_id, property_id, project_agreement_id, contract_id, staff_id,
  expense_bearer_type, expense_category_items, document_path, document_id, user_id, version, deleted_at, created_at, updated_at`;

export type BillListFilters = {
  status?: string;
  projectId?: string;
  propertyId?: string;
};

/** Strangler: vendors domain bill data access. */
export class BillRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async getById(client: pg.PoolClient, id: string): Promise<BillRow | null> {
    const r = await client.query<BillRow>(
      `SELECT ${BILL_COLUMNS}
       FROM bills WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async getByIdIncludingDeleted(client: pg.PoolClient, id: string): Promise<BillRow | null> {
    const r = await client.query<BillRow>(
      `SELECT ${BILL_COLUMNS}
       FROM bills WHERE id = $1 AND tenant_id = $2`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async list(
    client: pg.PoolClient,
    filters?: BillListFilters
  ): Promise<BillRow[]> {
    const params: unknown[] = [this.tenantId];
    let q = `SELECT ${BILL_COLUMNS}
             FROM bills WHERE tenant_id = $1 AND deleted_at IS NULL`;
    if (filters?.status) {
      params.push(filters.status);
      q += ` AND status = $${params.length}`;
    }
    if (filters?.projectId) {
      params.push(filters.projectId);
      q += ` AND project_id = $${params.length}`;
    }
    if (filters?.propertyId) {
      params.push(filters.propertyId);
      q += ` AND property_id = $${params.length}`;
    }
    q += ' ORDER BY issue_date DESC, bill_number ASC';
    const r = await client.query<BillRow>(q, params);
    return r.rows;
  }
}
