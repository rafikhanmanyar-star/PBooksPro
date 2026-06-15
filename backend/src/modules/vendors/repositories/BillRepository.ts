import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { BillRow } from '../services/billsService.js';

const BILL_COLUMNS = `id, tenant_id, bill_number, contact_id, vendor_id, amount, paid_amount, status, issue_date, due_date,
  description, category_id, project_id, building_id, property_id, project_agreement_id, contract_id, staff_id,
  expense_bearer_type, expense_category_items, document_path, document_id, purchase_order_id, user_id, version, deleted_at, created_at, updated_at`;

export type BillWriteFields = {
  bill_number: string;
  contact_id: string | null;
  vendor_id: string | null;
  amount: number;
  paid_amount: number;
  status: string;
  issue_date: string;
  due_date: string | null;
  description: string | null;
  category_id: string | null;
  project_id: string | null;
  building_id: string | null;
  property_id: string | null;
  project_agreement_id: string | null;
  contract_id: string | null;
  staff_id: string | null;
  expense_bearer_type: string | null;
  expense_category_items: string | null;
  document_path: string | null;
  document_id: string | null;
  purchase_order_id: string | null;
};

function billFieldParams(fields: BillWriteFields): unknown[] {
  return [
    fields.bill_number,
    fields.contact_id,
    fields.vendor_id,
    fields.amount,
    fields.paid_amount,
    fields.status,
    fields.issue_date,
    fields.due_date,
    fields.description,
    fields.category_id,
    fields.project_id,
    fields.building_id,
    fields.property_id,
    fields.project_agreement_id,
    fields.contract_id,
    fields.staff_id,
    fields.expense_bearer_type,
    fields.expense_category_items,
    fields.document_path,
    fields.document_id,
    fields.purchase_order_id,
  ];
}

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

  async getByIdForUpdate(client: pg.PoolClient, id: string): Promise<BillRow | null> {
    const r = await client.query<BillRow>(
      `SELECT ${BILL_COLUMNS}
       FROM bills WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       FOR UPDATE`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  /** Lock active or soft-deleted row (upsert restore / bill-number merge). */
  async lockByIdIncludingDeletedForUpdate(client: pg.PoolClient, id: string): Promise<BillRow | null> {
    const r = await client.query<BillRow>(
      `SELECT ${BILL_COLUMNS}
       FROM bills WHERE id = $1 AND tenant_id = $2
       FOR UPDATE`,
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

  /** Unique index is on (tenant_id, bill_number) for all rows including soft-deleted. */
  async getByTenantAndBillNumberIncludingDeleted(
    client: pg.PoolClient,
    billNumber: string
  ): Promise<BillRow | null> {
    const num = billNumber.trim();
    if (!num) return null;
    const r = await client.query<BillRow>(
      `SELECT ${BILL_COLUMNS}
       FROM bills WHERE tenant_id = $1 AND bill_number = $2
       ORDER BY CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END
       LIMIT 1`,
      [this.tenantId, num]
    );
    return r.rows[0] ?? null;
  }

  async sumBilledForContract(
    client: pg.PoolClient,
    contractId: string,
    excludeBillId?: string
  ): Promise<number> {
    const params: unknown[] = [this.tenantId, contractId];
    let q = `SELECT COALESCE(SUM(amount), 0)::numeric AS total
             FROM bills
             WHERE tenant_id = $1 AND contract_id = $2 AND deleted_at IS NULL`;
    if (excludeBillId?.trim()) {
      params.push(excludeBillId.trim());
      q += ` AND id <> $${params.length}`;
    }
    const r = await client.query<{ total: string }>(q, params);
    return Number(r.rows[0]?.total ?? 0);
  }

  async listChangedSince(client: pg.PoolClient, since: Date): Promise<BillRow[]> {
    const r = await client.query<BillRow>(
      `SELECT ${BILL_COLUMNS}
       FROM bills WHERE tenant_id = $1 AND updated_at > $2
       ORDER BY updated_at ASC`,
      [this.tenantId, since]
    );
    return r.rows;
  }

  async insertBill(
    client: pg.PoolClient,
    id: string,
    fields: BillWriteFields,
    userId: string | null
  ): Promise<BillRow> {
    const r = await client.query<BillRow>(
      `INSERT INTO bills (
         id, tenant_id, bill_number, contact_id, vendor_id, amount, paid_amount, status, issue_date, due_date,
         description, category_id, project_id, building_id, property_id, project_agreement_id, contract_id, staff_id,
         expense_bearer_type, expense_category_items, document_path, document_id, purchase_order_id, user_id, version, deleted_at, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10::date, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, 1, NULL, NOW(), NOW()
       )
       RETURNING ${BILL_COLUMNS}`,
      [id, this.tenantId, ...billFieldParams(fields), userId]
    );
    return r.rows[0]!;
  }

  async updateActive(
    client: pg.PoolClient,
    id: string,
    fields: BillWriteFields,
    options?: { userId?: string | null; restoreDeleted?: boolean }
  ): Promise<BillRow | null> {
    const restore = options?.restoreDeleted === true;
    const userClause = restore ? ', user_id = COALESCE($24, user_id)' : '';
    const deletedClause = restore ? ', deleted_at = NULL' : '';
    const whereDeleted = restore ? '' : ' AND deleted_at IS NULL';
    const params: unknown[] = [id, this.tenantId, ...billFieldParams(fields)];
    if (restore) params.push(options?.userId ?? null);

    const r = await client.query<BillRow>(
      `UPDATE bills SET
         bill_number = $3, contact_id = $4, vendor_id = $5, amount = $6, paid_amount = $7, status = $8,
         issue_date = $9::date, due_date = $10::date, description = $11,
         category_id = $12, project_id = $13, building_id = $14, property_id = $15, project_agreement_id = $16,
         contract_id = $17, staff_id = $18, expense_bearer_type = $19, expense_category_items = $20,
         document_path = $21, document_id = $22, purchase_order_id = $23${userClause},
         version = version + 1, updated_at = NOW()${deletedClause}
       WHERE id = $1 AND tenant_id = $2${whereDeleted}
       RETURNING ${BILL_COLUMNS}`,
      params
    );
    return r.rows[0] ?? null;
  }

  async updateActiveWithExpectedVersion(
    client: pg.PoolClient,
    id: string,
    fields: BillWriteFields,
    expectedVersion: number
  ): Promise<{ row: BillRow | null; conflict: boolean }> {
    const r = await client.query<BillRow>(
      `UPDATE bills SET
         bill_number = $3, contact_id = $4, vendor_id = $5, amount = $6, paid_amount = $7, status = $8,
         issue_date = $9::date, due_date = $10::date, description = $11,
         category_id = $12, project_id = $13, building_id = $14, property_id = $15, project_agreement_id = $16,
         contract_id = $17, staff_id = $18, expense_bearer_type = $19, expense_category_items = $20,
         document_path = $21, document_id = $22, purchase_order_id = $23,
         version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL AND version = $24
       RETURNING ${BILL_COLUMNS}`,
      [id, this.tenantId, ...billFieldParams(fields), expectedVersion]
    );
    if (r.rows[0]) return { row: r.rows[0], conflict: false };
    return { row: null, conflict: true };
  }

  async upsertOnTenantBillNumber(
    client: pg.PoolClient,
    proposeId: string,
    fields: BillWriteFields,
    userId: string | null,
    expectedVersion: number | null
  ): Promise<{ row: BillRow | null; versionConflict: boolean }> {
    const r = await client.query<BillRow>(
      `INSERT INTO bills (
         id, tenant_id, bill_number, contact_id, vendor_id, amount, paid_amount, status, issue_date, due_date,
         description, category_id, project_id, building_id, property_id, project_agreement_id, contract_id, staff_id,
         expense_bearer_type, expense_category_items, document_path, document_id, purchase_order_id, user_id, version, deleted_at, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10::date, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24,
         1, NULL, NOW(), NOW()
       )
       ON CONFLICT ON CONSTRAINT bills_tenant_id_bill_number_key
       DO UPDATE SET
         bill_number = EXCLUDED.bill_number,
         contact_id = EXCLUDED.contact_id,
         vendor_id = EXCLUDED.vendor_id,
         amount = EXCLUDED.amount,
         paid_amount = EXCLUDED.paid_amount,
         status = EXCLUDED.status,
         issue_date = EXCLUDED.issue_date,
         due_date = EXCLUDED.due_date,
         description = EXCLUDED.description,
         category_id = EXCLUDED.category_id,
         project_id = EXCLUDED.project_id,
         building_id = EXCLUDED.building_id,
         property_id = EXCLUDED.property_id,
         project_agreement_id = EXCLUDED.project_agreement_id,
         contract_id = EXCLUDED.contract_id,
         staff_id = EXCLUDED.staff_id,
         expense_bearer_type = EXCLUDED.expense_bearer_type,
         expense_category_items = EXCLUDED.expense_category_items,
         document_path = EXCLUDED.document_path,
         document_id = EXCLUDED.document_id,
         purchase_order_id = EXCLUDED.purchase_order_id,
         user_id = COALESCE(EXCLUDED.user_id, bills.user_id),
         deleted_at = NULL,
         version = bills.version + 1,
         updated_at = NOW()
       WHERE $25::integer IS NULL OR bills.version = $25::integer
       RETURNING ${BILL_COLUMNS}`,
      [proposeId, this.tenantId, ...billFieldParams(fields), userId, expectedVersion]
    );
    if (r.rows[0]) return { row: r.rows[0], versionConflict: false };
    return { row: null, versionConflict: expectedVersion != null };
  }

  async markDeleted(client: pg.PoolClient, id: string): Promise<boolean> {
    const r = await client.query(
      `UPDATE bills SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
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
      `UPDATE bills SET paid_amount = $3, status = $4, version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, this.tenantId, paidAmount, status]
    );
  }

  /** Append settlement/payment note to bill description (vendor prepaid settlement flow). */
  async appendPaymentNote(client: pg.PoolClient, id: string, note: string): Promise<void> {
    await client.query(
      `UPDATE bills SET
         description =
           CASE
             WHEN trim(COALESCE(description, '')) = '' THEN $3::text
             ELSE trim(description) || E'\n' || $3::text
           END,
         version = version + 1, updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [this.tenantId, id, note]
    );
  }
}
