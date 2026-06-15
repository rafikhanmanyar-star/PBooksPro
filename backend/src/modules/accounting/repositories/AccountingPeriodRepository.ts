import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { AccountingPeriodRow } from '../services/accountingPeriodService.js';

export class AccountingPeriodRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async list(client: pg.PoolClient): Promise<AccountingPeriodRow[]> {
    const r = await client.query<AccountingPeriodRow>(
      `SELECT * FROM accounting_periods WHERE tenant_id = $1 ORDER BY start_date DESC`,
      [this.tenantId]
    );
    return r.rows;
  }

  async getById(client: pg.PoolClient, periodId: string): Promise<AccountingPeriodRow | null> {
    const r = await client.query<AccountingPeriodRow>(
      `SELECT * FROM accounting_periods WHERE tenant_id = $1 AND id = $2`,
      [this.tenantId, periodId]
    );
    return r.rows[0] ?? null;
  }

  async findClosedOrLockedForDate(
    client: pg.PoolClient,
    entryDate: string
  ): Promise<{ id: string; start_date: string; end_date: string; status: string } | null> {
    const r = await client.query<{ id: string; start_date: string; end_date: string; status: string }>(
      `SELECT id, start_date::text, end_date::text, status FROM accounting_periods
       WHERE tenant_id = $1 AND status IN ('closed', 'locked')
         AND $2::date >= start_date AND $2::date <= end_date
       LIMIT 1`,
      [this.tenantId, entryDate.slice(0, 10)]
    );
    return r.rows[0] ?? null;
  }

  async hasOverlappingRange(client: pg.PoolClient, start: string, end: string): Promise<boolean> {
    const r = await client.query(
      `SELECT id FROM accounting_periods
       WHERE tenant_id = $1 AND NOT (end_date < $2::date OR start_date > $3::date)
       LIMIT 1`,
      [this.tenantId, start, end]
    );
    return r.rows.length > 0;
  }

  async insertPeriod(client: pg.PoolClient, id: string, start: string, end: string): Promise<AccountingPeriodRow> {
    const r = await client.query<AccountingPeriodRow>(
      `INSERT INTO accounting_periods (id, tenant_id, start_date, end_date, status, created_at, updated_at)
       VALUES ($1, $2, $3::date, $4::date, 'open', NOW(), NOW())
       RETURNING *`,
      [id, this.tenantId, start, end]
    );
    return r.rows[0]!;
  }

  async markClosed(
    client: pg.PoolClient,
    periodId: string,
    actorUserId: string | null,
    closingJournalEntryId: string | null,
    yearEndTransferJournalEntryId: string | null
  ): Promise<AccountingPeriodRow | null> {
    const r = await client.query<AccountingPeriodRow>(
      `UPDATE accounting_periods SET
         status = 'closed',
         closed_by = $3,
         closed_at = NOW(),
         closing_journal_entry_id = $4,
         year_end_transfer_journal_entry_id = $5,
         reopened_by = NULL,
         reopened_at = NULL,
         updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2 AND status = 'open'
       RETURNING *`,
      [this.tenantId, periodId, actorUserId, closingJournalEntryId, yearEndTransferJournalEntryId]
    );
    return r.rows[0] ?? null;
  }

  async reopen(client: pg.PoolClient, periodId: string, actorUserId: string | null): Promise<AccountingPeriodRow | null> {
    const r = await client.query<AccountingPeriodRow>(
      `UPDATE accounting_periods SET
         status = 'open',
         reopened_by = $3,
         reopened_at = NOW(),
         updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2 AND status = 'closed'
       RETURNING *`,
      [this.tenantId, periodId, actorUserId]
    );
    return r.rows[0] ?? null;
  }
}
