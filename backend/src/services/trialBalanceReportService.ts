import type pg from 'pg';
import { roundMoney } from '../financial/validation.js';
import {
  applyOpeningBalances,
  buildTrialBalanceReport,
  compareTrialBalanceType,
  mergeRawRowsByAccount,
  type AccountOpeningInput,
  type TrialBalanceBasis,
  type TrialBalanceRawRow,
  type TrialBalanceReportPayload,
} from '../financial/trialBalanceCore.js';
import { JournalRepository } from '../modules/accounting/repositories/JournalRepository.js';
import { AccountRepository } from '../modules/accounting/repositories/AccountRepository.js';

export type { TrialBalanceBasis, TrialBalanceReportPayload };

function mapPgRow(row: Record<string, unknown>): TrialBalanceRawRow {
  return {
    accountId: String(row.account_id),
    accountName: String(row.account_name),
    accountType: String(row.account_type),
    parentAccountId: row.parent_account_id != null ? String(row.parent_account_id) : null,
    accountCode: row.account_code != null ? String(row.account_code) : null,
    subType: row.sub_type != null ? String(row.sub_type) : null,
    isActive: row.is_active === null || row.is_active === undefined ? true : Boolean(row.is_active),
    grossDebit: roundMoney(Number(row.gross_debit)),
    grossCredit: roundMoney(Number(row.gross_credit)),
  };
}

/**
 * Double-entry trial balance from journal_lines + journal_entries + accounts.
 * - period: opening balances + prior journal activity (before from) + activity in [from, to]
 * - cumulative: opening balances + all journal lines with entry_date <= to
 */
export async function fetchTrialBalanceRawRows(
  client: pg.PoolClient,
  tenantId: string,
  options: { from: string; to: string; basis: TrialBalanceBasis }
): Promise<TrialBalanceRawRow[]> {
  const journalRepo = new JournalRepository(tenantId);
  const periodRows = (
    await journalRepo.aggregateTrialBalanceRows(client, {
      from: options.from,
      to: options.to,
      basis: options.basis,
    })
  ).map((r) => mapPgRow(r as unknown as Record<string, unknown>));

  let activityRows = periodRows;
  if (options.basis === 'period') {
    const priorRows = (
      await journalRepo.aggregateTrialBalanceRows(client, {
        from: '1900-01-01',
        to: options.from,
        basis: 'cumulative',
        priorOnly: true,
        priorBefore: options.from,
      })
    ).map((r) => mapPgRow(r as unknown as Record<string, unknown>));
    activityRows = mergeRawRowsByAccount([...priorRows, ...periodRows]);
  }

  const openings = await fetchAccountOpeningInputs(client, tenantId);
  const withOpening = applyOpeningBalances(activityRows, openings);

  withOpening.sort((x, y) => {
    const c = compareTrialBalanceType(x.accountType, y.accountType);
    if (c !== 0) return c;
    const cx = (x.accountCode || '').localeCompare(y.accountCode || '');
    if (cx !== 0) return cx;
    return x.accountName.localeCompare(y.accountName);
  });
  return withOpening;
}

async function fetchAccountOpeningInputs(
  client: pg.PoolClient,
  tenantId: string
): Promise<AccountOpeningInput[]> {
  const rows = await new AccountRepository(tenantId).listOpeningBalanceInputs(client);
  return rows.map((row) => ({
    accountId: row.account_id,
    accountName: row.account_name,
    accountType: row.account_type,
    parentAccountId: row.parent_account_id,
    accountCode: row.account_code,
    subType: row.sub_type,
    isActive: row.is_active,
    openingBalance: roundMoney(row.opening_balance),
  }));
}

export async function getTrialBalanceReportPayload(
  client: pg.PoolClient,
  tenantId: string,
  options: { from: string; to: string; basis: TrialBalanceBasis }
): Promise<TrialBalanceReportPayload & { from: string; to: string; basis: TrialBalanceBasis }> {
  const raw = await fetchTrialBalanceRawRows(client, tenantId, options);
  const report = buildTrialBalanceReport(raw);
  return {
    ...report,
    from: options.from,
    to: options.to,
    basis: options.basis,
  };
}
