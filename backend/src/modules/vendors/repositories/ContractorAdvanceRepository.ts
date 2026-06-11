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

  async adjustRemaining(client: pg.PoolClient, id: string, delta: number): Promise<void> {
    await client.query(
      `UPDATE contractor_advances SET remaining_amount = remaining_amount + $1::numeric, updated_at = NOW()
       WHERE tenant_id = $2 AND id = $3`,
      [delta, this.tenantId, id]
    );
  }

  async setAdvanceJournalEntryId(client: pg.PoolClient, id: string, journalEntryId: string): Promise<void> {
    await client.query(
      `UPDATE contractor_advances SET advance_journal_entry_id = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3`,
      [journalEntryId, id, this.tenantId]
    );
  }

  async appendDescriptionNote(client: pg.PoolClient, id: string, note: string): Promise<void> {
    await client.query(
      `UPDATE contractor_advances SET
         description =
           CASE
             WHEN trim(COALESCE(description, '')) = '' THEN $3::text
             ELSE trim(description) || ' ' || $3::text
           END,
         updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [this.tenantId, id, note]
    );
  }

  async getRemainingAmount(client: pg.PoolClient, id: string): Promise<number | null> {
    const r = await client.query<{ remaining_amount: string }>(
      `SELECT remaining_amount::text AS remaining_amount
       FROM contractor_advances WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [this.tenantId, id]
    );
    const raw = r.rows[0]?.remaining_amount;
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  async markFullyAppliedInDescription(client: pg.PoolClient, id: string): Promise<void> {
    await client.query(
      `UPDATE contractor_advances SET
         description =
           CASE
             WHEN trim(COALESCE(description, '')) ILIKE '%Fully applied (remaining prepaid: 0)%' THEN description
             WHEN trim(COALESCE(description, '')) = '' THEN 'Fully applied (remaining prepaid: 0).'
             ELSE trim(description) || ' Fully applied (remaining prepaid: 0).'
           END,
         updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [this.tenantId, id]
    );
  }
}
