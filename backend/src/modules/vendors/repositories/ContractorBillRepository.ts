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
}
