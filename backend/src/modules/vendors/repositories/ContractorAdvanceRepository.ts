import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { ContractorAdvanceRow } from '../../../services/contractorBillingService.js';

const ADVANCE_COLS = `id, tenant_id, contractor_contact_id, advance_date, original_amount::text, remaining_amount::text,
  cash_account_id, advance_asset_account_id, advance_journal_entry_id, project_id, description, created_by,
  created_at, updated_at, deleted_at`;

export class ContractorAdvanceRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async getById(client: pg.PoolClient, id: string): Promise<ContractorAdvanceRow | null> {
    const r = await client.query<ContractorAdvanceRow>(
      `SELECT ${ADVANCE_COLS}
       FROM contractor_advances
       WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [this.tenantId, id]
    );
    return r.rows[0] ?? null;
  }

  async getByIdForUpdate(client: pg.PoolClient, id: string): Promise<ContractorAdvanceRow | null> {
    const r = await client.query<ContractorAdvanceRow>(
      `SELECT ${ADVANCE_COLS}
       FROM contractor_advances
       WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
       FOR UPDATE`,
      [this.tenantId, id]
    );
    return r.rows[0] ?? null;
  }

  async listByContractor(client: pg.PoolClient, contractorContactId: string): Promise<ContractorAdvanceRow[]> {
    const r = await client.query<ContractorAdvanceRow>(
      `SELECT ${ADVANCE_COLS}
       FROM contractor_advances
       WHERE tenant_id = $1 AND contractor_contact_id = $2 AND deleted_at IS NULL
       ORDER BY advance_date ASC, id ASC`,
      [this.tenantId, contractorContactId]
    );
    return r.rows;
  }

  async listChangedSince(client: pg.PoolClient, since: Date): Promise<ContractorAdvanceRow[]> {
    const r = await client.query<ContractorAdvanceRow>(
      `SELECT ${ADVANCE_COLS}
       FROM contractor_advances
       WHERE tenant_id = $1 AND updated_at > $2
       ORDER BY updated_at ASC`,
      [this.tenantId, since]
    );
    return r.rows;
  }
}
