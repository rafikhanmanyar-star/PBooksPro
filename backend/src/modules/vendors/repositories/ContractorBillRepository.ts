import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { ContractorBillRow } from '../../../services/contractorBillingService.js';

const BILL_COLS = `id, tenant_id, contractor_contact_id, bill_number, bill_date, amount::text, status,
  description, project_id, construction_expense_account_id, residual_account_id,
  approval_journal_entry_id, created_by, created_at, updated_at, deleted_at`;

export class ContractorBillRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async getById(client: pg.PoolClient, id: string): Promise<ContractorBillRow | null> {
    const r = await client.query<ContractorBillRow>(
      `SELECT ${BILL_COLS}
       FROM contractor_bills
       WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [this.tenantId, id]
    );
    return r.rows[0] ?? null;
  }

  async getByIdForUpdate(client: pg.PoolClient, id: string): Promise<ContractorBillRow | null> {
    const r = await client.query<ContractorBillRow>(
      `SELECT ${BILL_COLS}
       FROM contractor_bills
       WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
       FOR UPDATE`,
      [this.tenantId, id]
    );
    return r.rows[0] ?? null;
  }

  async listChangedSince(client: pg.PoolClient, since: Date): Promise<ContractorBillRow[]> {
    const r = await client.query<ContractorBillRow>(
      `SELECT ${BILL_COLS}
       FROM contractor_bills
       WHERE tenant_id = $1 AND updated_at > $2
       ORDER BY updated_at ASC`,
      [this.tenantId, since]
    );
    return r.rows;
  }

  async insertBill(
    client: pg.PoolClient,
    input: {
      id: string;
      contractor_contact_id: string;
      bill_number: string | null;
      bill_date: string;
      amount: number;
      description: string | null;
      project_id: string | null;
      construction_expense_account_id: string;
      residual_account_id: string;
      created_by: string | null;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO contractor_bills (
        id, tenant_id, contractor_contact_id, bill_number, bill_date, amount, status, description, project_id,
        construction_expense_account_id, residual_account_id, created_by
      )
      VALUES ($1, $2, $3, $4, $5::date, $6, 'draft', $7, $8, $9, $10, $11)`,
      [
        input.id,
        this.tenantId,
        input.contractor_contact_id,
        input.bill_number,
        input.bill_date,
        input.amount,
        input.description,
        input.project_id,
        input.construction_expense_account_id,
        input.residual_account_id,
        input.created_by,
      ]
    );
  }

  async markApproved(client: pg.PoolClient, id: string, journalEntryId: string): Promise<void> {
    await client.query(
      `UPDATE contractor_bills
       SET status = 'approved', approval_journal_entry_id = $1, updated_at = NOW() WHERE tenant_id = $2 AND id = $3`,
      [journalEntryId, this.tenantId, id]
    );
  }

  async insertBillAdjustment(
    client: pg.PoolClient,
    input: {
      id: string;
      contractor_bill_id: string;
      contractor_advance_id: string;
      amount: number;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO contractor_bill_adjustments (id, tenant_id, contractor_bill_id, contractor_advance_id, amount)
       VALUES ($1, $2, $3, $4, $5)`,
      [input.id, this.tenantId, input.contractor_bill_id, input.contractor_advance_id, input.amount]
    );
  }
}
