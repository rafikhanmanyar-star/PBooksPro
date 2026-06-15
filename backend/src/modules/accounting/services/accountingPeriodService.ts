import type pg from 'pg';
import { randomUUID } from 'crypto';
import { recordDomainMutation } from '../../../core/recordDomainMutation.js';
import { AccountingPeriodRepository } from '../repositories/AccountingPeriodRepository.js';

export type AccountingPeriodStatus = 'open' | 'closed' | 'locked';

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

/** Block posting when entry_date falls in a closed/locked period (unless explicitly allowed). */
export async function assertAccountingPeriodOpen(
  client: pg.PoolClient,
  tenantId: string,
  entryDate: string,
  options?: {
    allowClosedPeriod?: boolean;
    overrideLockedPeriod?: boolean;
    actorRole?: string;
  }
): Promise<void> {
  if (options?.allowClosedPeriod) return;
  const d = entryDate.slice(0, 10);
  const p = await new AccountingPeriodRepository(tenantId).findClosedOrLockedForDate(client, d);
  if (!p) return;

  if (
    p.status === 'locked' &&
    options?.overrideLockedPeriod &&
    options.actorRole === 'super_admin'
  ) {
    return;
  }
  if (p.status === 'locked') {
    throw new Error(
      `Accounting period ${ymd(p.start_date)} – ${ymd(p.end_date)} is locked. Super Admin override required.`
    );
  }
  throw new Error(
    `Accounting period ${ymd(p.start_date)} – ${ymd(p.end_date)} is closed. Reopen the period or choose an open period date.`
  );
}

export async function listAccountingPeriods(
  client: pg.PoolClient,
  tenantId: string
): Promise<AccountingPeriodRow[]> {
  return new AccountingPeriodRepository(tenantId).list(client);
}

export async function getAccountingPeriodById(
  client: pg.PoolClient,
  tenantId: string,
  periodId: string
): Promise<AccountingPeriodRow | null> {
  return new AccountingPeriodRepository(tenantId).getById(client, periodId);
}

export async function createAccountingPeriod(
  client: pg.PoolClient,
  tenantId: string,
  input: { startDate: string; endDate: string }
): Promise<AccountingPeriodRow> {
  const start = input.startDate.slice(0, 10);
  const end = input.endDate.slice(0, 10);
  if (start > end) throw new Error('start_date must be on or before end_date.');

  const repo = new AccountingPeriodRepository(tenantId);
  if (await repo.hasOverlappingRange(client, start, end)) {
    throw new Error('Date range overlaps an existing accounting period.');
  }

  return repo.insertPeriod(client, randomUUID(), start, end);
}

/** Open a fiscal period with standard domain audit + change_log. */
export async function openAccountingPeriod(
  client: pg.PoolClient,
  tenantId: string,
  input: { startDate: string; endDate: string },
  actorUserId: string | null
): Promise<AccountingPeriodRow> {
  const row = await createAccountingPeriod(client, tenantId, input);
  const apiRow = rowToAccountingPeriodApi(row);
  await recordDomainMutation(client, {
    tenantId,
    userId: actorUserId,
    module: 'accounting_periods',
    entityType: 'accounting_period',
    entityId: row.id,
    action: 'create',
    auditAction: 'open',
    summary: `Accounting period opened ${apiRow.startDate} – ${apiRow.endDate}`,
    newValue: apiRow,
  });
  return row;
}

export async function markAccountingPeriodClosed(
  client: pg.PoolClient,
  tenantId: string,
  periodId: string,
  actorUserId: string | null,
  closingJournalEntryId: string | null,
  yearEndTransferJournalEntryId: string | null
): Promise<AccountingPeriodRow> {
  const row = await new AccountingPeriodRepository(tenantId).markClosed(
    client,
    periodId,
    actorUserId,
    closingJournalEntryId,
    yearEndTransferJournalEntryId
  );
  if (!row) throw new Error('Period not found or already closed.');
  return row;
}

export async function reopenAccountingPeriod(
  client: pg.PoolClient,
  tenantId: string,
  periodId: string,
  actorUserId: string | null
): Promise<AccountingPeriodRow> {
  const before = await getAccountingPeriodById(client, tenantId, periodId);
  if (!before) throw new Error('Period not found or not closed.');

  const row = await new AccountingPeriodRepository(tenantId).reopen(client, periodId, actorUserId);
  if (!row) throw new Error('Period not found or not closed.');

  const oldApi = rowToAccountingPeriodApi(before);
  const newApi = rowToAccountingPeriodApi(row);
  await recordDomainMutation(client, {
    tenantId,
    userId: actorUserId,
    module: 'accounting_periods',
    entityType: 'accounting_period',
    entityId: periodId,
    action: 'update',
    auditAction: 'reopen',
    summary: `Accounting period reopened ${newApi.startDate} – ${newApi.endDate}`,
    oldValue: oldApi,
    newValue: newApi,
  });

  return row;
}
