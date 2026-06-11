import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';

export type PeVStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'posted';

export type ProjectExpenseVoucherRow = {
  id: string;
  tenant_id: string;
  voucher_number: string;
  voucher_date: Date;
  project_id: string;
  expense_category_id: string;
  vendor_id: string | null;
  payment_source_account_id: string;
  amount: string;
  description: string | null;
  document_id: string | null;
  status: PeVStatus;
  journal_entry_id: string | null;
  submitted_at: Date | null;
  submitted_by: string | null;
  approved_at: Date | null;
  approved_by: string | null;
  rejected_at: Date | null;
  rejected_by: string | null;
  rejection_reason: string | null;
  posted_at: Date | null;
  posted_by: string | null;
  created_by: string | null;
  version: number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type PeVoucherWriteFields = {
  voucher_number: string;
  voucher_date: string;
  project_id: string;
  expense_category_id: string;
  vendor_id: string | null;
  payment_source_account_id: string;
  amount: number;
  description: string | null;
  document_id: string | null;
};

export interface ListProjectExpenseVouchersFilters {
  status?: string;
  projectId?: string;
  expenseCategoryId?: string;
  vendorId?: string;
  fromDate?: string;
  toDate?: string;
}

const SELECT_COLS = `id, tenant_id, voucher_number, voucher_date, project_id, expense_category_id,
  vendor_id, payment_source_account_id, amount::text, description, document_id, status,
  journal_entry_id, submitted_at, submitted_by, approved_at, approved_by,
  rejected_at, rejected_by, rejection_reason, posted_at, posted_by, created_by,
  version, deleted_at, created_at, updated_at`;

export class ProjectExpenseVoucherRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async list(
    client: pg.PoolClient,
    filters?: ListProjectExpenseVouchersFilters
  ): Promise<ProjectExpenseVoucherRow[]> {
    const clauses = ['tenant_id = $1', 'deleted_at IS NULL'];
    const params: unknown[] = [this.tenantId];
    let idx = 2;

    if (filters?.status) {
      clauses.push(`status = $${idx++}`);
      params.push(filters.status);
    }
    if (filters?.projectId) {
      clauses.push(`project_id = $${idx++}`);
      params.push(filters.projectId);
    }
    if (filters?.expenseCategoryId) {
      clauses.push(`expense_category_id = $${idx++}`);
      params.push(filters.expenseCategoryId);
    }
    if (filters?.vendorId) {
      clauses.push(`vendor_id = $${idx++}`);
      params.push(filters.vendorId);
    }
    if (filters?.fromDate) {
      clauses.push(`voucher_date >= $${idx++}::date`);
      params.push(filters.fromDate);
    }
    if (filters?.toDate) {
      clauses.push(`voucher_date <= $${idx++}::date`);
      params.push(filters.toDate);
    }

    const r = await client.query<ProjectExpenseVoucherRow>(
      `SELECT ${SELECT_COLS}
       FROM project_expense_vouchers
       WHERE ${clauses.join(' AND ')}
       ORDER BY voucher_date DESC, voucher_number DESC`,
      params
    );
    return r.rows;
  }

  async getById(client: pg.PoolClient, id: string): Promise<ProjectExpenseVoucherRow | null> {
    const r = await client.query<ProjectExpenseVoucherRow>(
      `SELECT ${SELECT_COLS}
       FROM project_expense_vouchers
       WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [this.tenantId, id]
    );
    return r.rows[0] ?? null;
  }

  async getByIdForUpdate(client: pg.PoolClient, id: string): Promise<ProjectExpenseVoucherRow | null> {
    const r = await client.query<ProjectExpenseVoucherRow>(
      `SELECT ${SELECT_COLS}
       FROM project_expense_vouchers
       WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
       FOR UPDATE`,
      [this.tenantId, id]
    );
    return r.rows[0] ?? null;
  }

  async listChangedSince(client: pg.PoolClient, since: Date): Promise<ProjectExpenseVoucherRow[]> {
    const r = await client.query<ProjectExpenseVoucherRow>(
      `SELECT ${SELECT_COLS}
       FROM project_expense_vouchers
       WHERE tenant_id = $1 AND updated_at > $2
       ORDER BY updated_at ASC`,
      [this.tenantId, since]
    );
    return r.rows;
  }

  async insertPosted(
    client: pg.PoolClient,
    id: string,
    fields: PeVoucherWriteFields,
    createdBy: string | null
  ): Promise<void> {
    await client.query(
      `INSERT INTO project_expense_vouchers (
         id, tenant_id, voucher_number, voucher_date, project_id, expense_category_id,
         vendor_id, payment_source_account_id, amount, description, document_id,
         status, posted_at, posted_by, created_by, version, created_at, updated_at
       ) VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8, $9, $10, $11, 'posted', NOW(), $12, $12, 1, NOW(), NOW())`,
      [
        id,
        this.tenantId,
        fields.voucher_number,
        fields.voucher_date,
        fields.project_id,
        fields.expense_category_id,
        fields.vendor_id,
        fields.payment_source_account_id,
        fields.amount,
        fields.description,
        fields.document_id,
        createdBy,
      ]
    );
  }

  async updatePosted(
    client: pg.PoolClient,
    id: string,
    fields: PeVoucherWriteFields,
    actorUserId: string | null
  ): Promise<void> {
    await client.query(
      `UPDATE project_expense_vouchers SET
         voucher_date = $1::date, project_id = $2, expense_category_id = $3,
         vendor_id = $4, payment_source_account_id = $5, amount = $6,
         description = $7, document_id = $8,
         status = 'posted', posted_at = COALESCE(posted_at, NOW()),
         posted_by = COALESCE(posted_by, $9),
         version = version + 1, updated_at = NOW()
       WHERE tenant_id = $10 AND id = $11 AND deleted_at IS NULL`,
      [
        fields.voucher_date,
        fields.project_id,
        fields.expense_category_id,
        fields.vendor_id,
        fields.payment_source_account_id,
        fields.amount,
        fields.description,
        fields.document_id,
        actorUserId,
        this.tenantId,
        id,
      ]
    );
  }

  async setJournalEntryId(client: pg.PoolClient, id: string, journalEntryId: string): Promise<void> {
    await client.query(
      `UPDATE project_expense_vouchers SET journal_entry_id = $1, updated_at = NOW()
       WHERE tenant_id = $2 AND id = $3`,
      [journalEntryId, this.tenantId, id]
    );
  }

  async markSubmitted(client: pg.PoolClient, id: string, actorUserId: string | null): Promise<void> {
    await client.query(
      `UPDATE project_expense_vouchers SET
         status = 'submitted', submitted_at = NOW(), submitted_by = $1,
         version = version + 1, updated_at = NOW()
       WHERE tenant_id = $2 AND id = $3`,
      [actorUserId, this.tenantId, id]
    );
  }

  async markApproved(client: pg.PoolClient, id: string, actorUserId: string | null): Promise<void> {
    await client.query(
      `UPDATE project_expense_vouchers SET
         status = 'approved', approved_at = NOW(), approved_by = $1,
         version = version + 1, updated_at = NOW()
       WHERE tenant_id = $2 AND id = $3`,
      [actorUserId, this.tenantId, id]
    );
  }

  async markRejected(
    client: pg.PoolClient,
    id: string,
    actorUserId: string | null,
    reason: string | null
  ): Promise<void> {
    await client.query(
      `UPDATE project_expense_vouchers SET
         status = 'rejected', rejected_at = NOW(), rejected_by = $1, rejection_reason = $2,
         version = version + 1, updated_at = NOW()
       WHERE tenant_id = $3 AND id = $4`,
      [actorUserId, reason, this.tenantId, id]
    );
  }

  async markPosted(
    client: pg.PoolClient,
    id: string,
    actorUserId: string | null,
    journalEntryId: string
  ): Promise<void> {
    await client.query(
      `UPDATE project_expense_vouchers SET
         status = 'posted', posted_at = NOW(), posted_by = $1, journal_entry_id = $2,
         version = version + 1, updated_at = NOW()
       WHERE tenant_id = $3 AND id = $4`,
      [actorUserId, journalEntryId, this.tenantId, id]
    );
  }

  async markUnposted(client: pg.PoolClient, id: string): Promise<void> {
    await client.query(
      `UPDATE project_expense_vouchers SET
         status = 'approved', journal_entry_id = NULL, posted_at = NULL, posted_by = NULL,
         version = version + 1, updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2`,
      [this.tenantId, id]
    );
  }

  async markDeleted(client: pg.PoolClient, id: string): Promise<void> {
    await client.query(
      `UPDATE project_expense_vouchers SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [this.tenantId, id]
    );
  }
}
