import type pg from 'pg';
import { GLOBAL_SYSTEM_TENANT_ID } from '../constants/globalSystemChart.js';
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
  const periodRows = await fetchJournalAggregateRows(client, tenantId, options);

  let activityRows = periodRows;
  if (options.basis === 'period') {
    const priorRows = await fetchJournalAggregateRows(client, tenantId, {
      from: '1900-01-01',
      to: options.from,
      basis: 'cumulative',
      priorOnly: true,
      priorBefore: options.from,
    });
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
  const r = await client.query(
    `SELECT
      a.id AS account_id,
      a.name AS account_name,
      a.type AS account_type,
      a.parent_account_id AS parent_account_id,
      a.account_code AS account_code,
      a.sub_type AS sub_type,
      COALESCE(a.is_active, TRUE) AS is_active,
      COALESCE(a.opening_balance, 0)::float AS opening_balance
    FROM accounts a
    WHERE (a.tenant_id = $1 OR a.tenant_id = $2)
      AND a.deleted_at IS NULL
      AND COALESCE(a.opening_balance, 0) <> 0`,
    [tenantId, GLOBAL_SYSTEM_TENANT_ID]
  );
  return (r.rows as Record<string, unknown>[]).map((row) => ({
    accountId: String(row.account_id),
    accountName: String(row.account_name),
    accountType: String(row.account_type),
    parentAccountId: row.parent_account_id != null ? String(row.parent_account_id) : null,
    accountCode: row.account_code != null ? String(row.account_code) : null,
    subType: row.sub_type != null ? String(row.sub_type) : null,
    isActive: row.is_active === null || row.is_active === undefined ? true : Boolean(row.is_active),
    openingBalance: roundMoney(Number(row.opening_balance)),
  }));
}

type JournalAggregateOptions = {
  from: string;
  to: string;
  basis: TrialBalanceBasis;
  priorOnly?: boolean;
  priorBefore?: string;
};

async function fetchJournalAggregateRows(
  client: pg.PoolClient,
  tenantId: string,
  options: JournalAggregateOptions
): Promise<TrialBalanceRawRow[]> {
  const params: unknown[] = [tenantId, GLOBAL_SYSTEM_TENANT_ID];
  let dateCond = '';
  if (options.priorOnly && options.priorBefore) {
    dateCond = ` AND je.entry_date < $${params.length + 1}`;
    params.push(options.priorBefore);
  } else if (options.basis === 'cumulative') {
    dateCond = ` AND je.entry_date <= $${params.length + 1}`;
    params.push(options.to);
  } else {
    dateCond = ` AND je.entry_date >= $${params.length + 1} AND je.entry_date <= $${params.length + 2}`;
    params.push(options.from, options.to);
  }

  const r = await client.query(
    `SELECT
      jl.account_id AS account_id,
      a.name AS account_name,
      a.type AS account_type,
      a.parent_account_id AS parent_account_id,
      a.account_code AS account_code,
      a.sub_type AS sub_type,
      COALESCE(a.is_active, TRUE) AS is_active,
      COALESCE(SUM(jl.debit_amount), 0)::float AS gross_debit,
      COALESCE(SUM(jl.credit_amount), 0)::float AS gross_credit
    FROM journal_lines jl
    INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
    INNER JOIN accounts a ON a.id = jl.account_id
      AND (a.tenant_id = je.tenant_id OR a.tenant_id = $2)
    WHERE je.tenant_id = $1
      AND a.deleted_at IS NULL
      ${dateCond}
    GROUP BY jl.account_id, a.name, a.type, a.parent_account_id, a.account_code, a.sub_type, a.is_active`,
    params
  );

  return (r.rows as Record<string, unknown>[]).map(mapPgRow);
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
