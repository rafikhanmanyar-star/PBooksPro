import type pg from 'pg';
import { randomUUID } from 'crypto';

export type AccountingPeriodStatus = 'open' | 'closed';

export type AccountingPeriodRow = {
  id: string;
  tenant_id: string;
  start_date: Date | string;
  end_date: Date | string;
  status: AccountingPeriodStatus;
  closed_by: string | null;
  closed_at: Date | null;
  closing_journal_entry_id: string | null;
  year_end_transfer_journal_entry_id: string | null;
  reopened_by: string | null;
  reopened_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type AccountingPeriodApi = {
  id: string;
  startDate: string;
  endDate: string;
  status: AccountingPeriodStatus;
  closedBy: string | null;
  closedAt: string | null;
  closingJournalEntryId: string | null;
  yearEndTransferJournalEntryId: string | null;
  reopenedBy: string | null;
  reopenedAt: string | null;
};

function ymd(d: Date | string): string {
  if (typeof d === 'string') return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

export function rowToAccountingPeriodApi(row: AccountingPeriodRow): AccountingPeriodApi {
  return {
    id: row.id,
    startDate: ymd(row.start_date),
    endDate: ymd(row.end_date),
    status: row.status,
    closedBy: row.closed_by,
    closedAt: row.closed_at ? new Date(row.closed_at).toISOString() : null,
    closingJournalEntryId: row.closing_journal_entry_id,
    yearEndTransferJournalEntryId: row.year_end_transfer_journal_entry_id,
    reopenedBy: row.reopened_by,
    reopenedAt: row.reopened_at ? new Date(row.reopened_at).toISOString() : null,
  };
}

/** Block posting when entry_date falls in a closed period (unless explicitly allowed). */
export async function assertAccountingPeriodOpen(
  client: pg.PoolClient,
  tenantId: string,
  entryDate: string,
  options?: { allowClosedPeriod?: boolean }
): Promise<void> {
  if (options?.allowClosedPeriod) return;
  const d = entryDate.slice(0, 10);
  const r = await client.query<{ id: string; start_date: string; end_date: string }>(
    `SELECT id, start_date::text, end_date::text FROM accounting_periods
     WHERE tenant_id = $1 AND status = 'closed'
       AND $2::date >= start_date AND $2::date <= end_date
     LIMIT 1`,
    [tenantId, d]
  );
  if (r.rows.length > 0) {
    const p = r.rows[0];
    throw new Error(
      `Accounting period ${ymd(p.start_date)} – ${ymd(p.end_date)} is closed. Reopen the period or choose an open period date.`
    );
  }
}

export async function listAccountingPeriods(
  client: pg.PoolClient,
  tenantId: string
): Promise<AccountingPeriodRow[]> {
  const r = await client.query<AccountingPeriodRow>(
    `SELECT * FROM accounting_periods WHERE tenant_id = $1 ORDER BY start_date DESC`,
    [tenantId]
  );
  return r.rows;
}

export async function getAccountingPeriodById(
  client: pg.PoolClient,
  tenantId: string,
  periodId: string
): Promise<AccountingPeriodRow | null> {
  const r = await client.query<AccountingPeriodRow>(
    `SELECT * FROM accounting_periods WHERE tenant_id = $1 AND id = $2`,
    [tenantId, periodId]
  );
  return r.rows[0] ?? null;
}

export async function createAccountingPeriod(
  client: pg.PoolClient,
  tenantId: string,
  input: { startDate: string; endDate: string }
): Promise<AccountingPeriodRow> {
  const start = input.startDate.slice(0, 10);
  const end = input.endDate.slice(0, 10);
  if (start > end) throw new Error('start_date must be on or before end_date.');

  const overlap = await client.query(
    `SELECT id FROM accounting_periods
     WHERE tenant_id = $1 AND NOT (end_date < $2::date OR start_date > $3::date)
     LIMIT 1`,
    [tenantId, start, end]
  );
  if (overlap.rows.length > 0) {
    throw new Error('Date range overlaps an existing accounting period.');
  }

  const id = randomUUID();
  const r = await client.query<AccountingPeriodRow>(
    `INSERT INTO accounting_periods (id, tenant_id, start_date, end_date, status, created_at, updated_at)
     VALUES ($1, $2, $3::date, $4::date, 'open', NOW(), NOW())
     RETURNING *`,
    [id, tenantId, start, end]
  );
  return r.rows[0];
}

export async function markAccountingPeriodClosed(
  client: pg.PoolClient,
  tenantId: string,
  periodId: string,
  actorUserId: string | null,
  closingJournalEntryId: string | null,
  yearEndTransferJournalEntryId: string | null
): Promise<AccountingPeriodRow> {
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
    [tenantId, periodId, actorUserId, closingJournalEntryId, yearEndTransferJournalEntryId]
  );
  if (r.rows.length === 0) throw new Error('Period not found or already closed.');
  return r.rows[0];
}

export async function reopenAccountingPeriod(
  client: pg.PoolClient,
  tenantId: string,
  periodId: string,
  actorUserId: string | null
): Promise<AccountingPeriodRow> {
  const r = await client.query<AccountingPeriodRow>(
    `UPDATE accounting_periods SET
       status = 'open',
       reopened_by = $3,
       reopened_at = NOW(),
       updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2 AND status = 'closed'
     RETURNING *`,
    [tenantId, periodId, actorUserId]
  );
  if (r.rows.length === 0) throw new Error('Period not found or not closed.');
  return r.rows[0];
}
