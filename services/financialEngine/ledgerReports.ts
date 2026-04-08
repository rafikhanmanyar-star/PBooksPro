/**
 * General ledger, trial balance, and account statement from journal_lines + journal_entries.
 * Local-only: SQLite via Electron bridge. LAN/API: PostgreSQL via REST.
 */

import { roundMoney } from './validation';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { journalApi } from '../api/journalApi';
import {
  buildTrialBalanceReport,
  compareTrialBalanceType,
  ledgerTenantIdsForLocalQuery,
  type TrialBalanceBasis,
  type TrialBalanceRawRow,
  type TrialBalanceReportPayload,
} from './trialBalanceCore';
import { buildTrialBalanceRawRowsFromTransactions } from './trialBalanceFromTransactions';
import type { Account, Transaction } from '../../types';

function getBridge() {
  if (typeof window === 'undefined' || !window.sqliteBridge?.query) {
    throw new Error('Ledger reports require Electron SQLite bridge.');
  }
  return window.sqliteBridge;
}

/** @deprecated Use fetchTrialBalanceReport — gross columns only */
export type TrialBalanceRow = {
  account_id: string;
  account_name: string;
  account_type: string;
  total_debit: number;
  total_credit: number;
};

export type FetchTrialBalanceOptions = {
  from: string;
  to: string;
  basis?: TrialBalanceBasis;
  /**
   * When the GL journal has no lines in range, build synthetic TB from legacy `transactions`
   * (Income/Expense/Transfer/Loan) so the report is not empty in local-only mode.
   */
  ledgerFallback?: {
    transactions: Transaction[];
    accounts: Account[];
  };
};

export type TrialBalanceReportResult = TrialBalanceReportPayload & {
  from: string;
  to: string;
  basis: TrialBalanceBasis;
  /** `transactions_fallback` = derived from operational transactions; `journal` = journal_lines only. */
  dataSource?: 'journal' | 'transactions_fallback';
};

function mapApiToTrialBalanceResult(raw: {
  from: string;
  to: string;
  basis: string;
  accounts: Array<{
    id: string;
    name: string;
    code: string | null;
    type: string;
    sub_type: string | null;
    parent_id: string | null;
    is_active: boolean;
    gross_debit: number;
    gross_credit: number;
    net_balance: number;
    debit: number;
    credit: number;
  }>;
  totals: {
    total_debit: number;
    total_credit: number;
    gross_debit: number;
    gross_credit: number;
  };
  is_balanced: boolean;
}): TrialBalanceReportResult {
  const basis: TrialBalanceBasis = raw.basis === 'cumulative' ? 'cumulative' : 'period';
  const accounts = raw.accounts.map((a) => ({
    accountId: a.id,
    accountName: a.name,
    accountType: a.type,
    parentAccountId: a.parent_id,
    accountCode: a.code,
    subType: a.sub_type,
    isActive: a.is_active,
    grossDebit: roundMoney(Number(a.gross_debit)),
    grossCredit: roundMoney(Number(a.gross_credit)),
    netBalance: roundMoney(Number(a.net_balance)),
    debit: roundMoney(Number(a.debit)),
    credit: roundMoney(Number(a.credit)),
  }));
  return {
    from: raw.from,
    to: raw.to,
    basis,
    accounts,
    totals: {
      totalDebit: roundMoney(Number(raw.totals.total_debit)),
      totalCredit: roundMoney(Number(raw.totals.total_credit)),
      grossDebit: roundMoney(Number(raw.totals.gross_debit)),
      grossCredit: roundMoney(Number(raw.totals.gross_credit)),
    },
    isBalanced: raw.is_balanced,
    dataSource: 'journal',
  };
}

/**
 * Canonical trial balance (double-entry): net debit/credit columns, gross totals, balance check.
 */
export async function fetchTrialBalanceReport(
  tenantId: string,
  options: FetchTrialBalanceOptions
): Promise<TrialBalanceReportResult> {
  const from = options.from;
  const to = options.to;
  const basis = options.basis ?? 'period';

  if (!isLocalOnlyMode()) {
    void tenantId;
    const raw = await journalApi.getTrialBalanceCanonical({ from, to, basis });
    return mapApiToTrialBalanceResult(raw as Parameters<typeof mapApiToTrialBalanceResult>[0]);
  }

  const bridge = getBridge();
  let dateCond = '';
  const tenantIds = ledgerTenantIdsForLocalQuery(tenantId);
  const tenantPlaceholders = tenantIds.map(() => '?').join(', ');
  const params: unknown[] = [...tenantIds];
  if (basis === 'cumulative') {
    dateCond = ` AND je.entry_date <= ?`;
    params.push(to);
  } else {
    dateCond = ` AND je.entry_date >= ? AND je.entry_date <= ?`;
    params.push(from, to);
  }

  const sql = `
    SELECT
      jl.account_id AS account_id,
      a.name AS account_name,
      a.type AS account_type,
      a.parent_account_id AS parent_account_id,
      a.account_code AS account_code,
      a.sub_type AS sub_type,
      COALESCE(a.is_active, 1) AS is_active_raw,
      COALESCE(SUM(jl.debit_amount), 0) AS gross_debit,
      COALESCE(SUM(jl.credit_amount), 0) AS gross_credit
    FROM journal_lines jl
    INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
    INNER JOIN accounts a ON a.id = jl.account_id
    WHERE je.tenant_id IN (${tenantPlaceholders})
      AND a.deleted_at IS NULL
      ${dateCond}
    GROUP BY jl.account_id, a.name, a.type, a.parent_account_id, a.account_code, a.sub_type, a.is_active
  `;

  const r = await bridge.query(sql, params);
  if (!r.ok) throw new Error(r.error || 'Trial balance query failed');

  let rawRows: TrialBalanceRawRow[] = (r.rows || []).map((row: Record<string, unknown>) => ({
    accountId: String(row.account_id),
    accountName: String(row.account_name),
    accountType: String(row.account_type),
    parentAccountId: row.parent_account_id != null ? String(row.parent_account_id) : null,
    accountCode: row.account_code != null ? String(row.account_code) : null,
    subType: row.sub_type != null ? String(row.sub_type) : null,
    isActive: Number(row.is_active_raw) !== 0,
    grossDebit: roundMoney(Number(row.gross_debit)),
    grossCredit: roundMoney(Number(row.gross_credit)),
  }));

  let dataSource: 'journal' | 'transactions_fallback' = 'journal';

  if (
    rawRows.length === 0 &&
    options.ledgerFallback?.transactions?.length &&
    options.ledgerFallback.accounts?.length
  ) {
    rawRows = buildTrialBalanceRawRowsFromTransactions(
      options.ledgerFallback.transactions,
      options.ledgerFallback.accounts,
      from,
      to,
      basis
    );
    dataSource = 'transactions_fallback';
  }

  rawRows.sort((x, y) => {
    const c = compareTrialBalanceType(x.accountType, y.accountType);
    if (c !== 0) return c;
    const cx = (x.accountCode || '').localeCompare(y.accountCode || '');
    if (cx !== 0) return cx;
    return x.accountName.localeCompare(y.accountName);
  });

  const report = buildTrialBalanceReport(rawRows);
  return {
    ...report,
    from,
    to,
    basis,
    dataSource,
  };
}

/**
 * @deprecated Use fetchTrialBalanceReport for net columns and is_balanced.
 */
export async function getTrialBalance(
  tenantId: string,
  options?: { fromDate?: string; toDate?: string }
): Promise<TrialBalanceRow[]> {
  const from = options?.fromDate ?? '2000-01-01';
  const to = options?.toDate ?? new Date().toISOString().slice(0, 10);
  const full = await fetchTrialBalanceReport(tenantId, { from, to, basis: 'period' });
  return full.accounts.map((a) => ({
    account_id: a.accountId,
    account_name: a.accountName,
    account_type: a.accountType,
    total_debit: a.grossDebit,
    total_credit: a.grossCredit,
  }));
}

export type GeneralLedgerRow = {
  entry_date: string;
  journal_entry_id: string;
  reference: string;
  description: string | null;
  line_number: number;
  debit_amount: number;
  credit_amount: number;
  running_balance: number;
};

function normalBalanceDirection(accountType: string): 1 | -1 {
  const t = (accountType || '').toLowerCase();
  if (t === 'asset' || t === 'expense') return 1;
  return -1;
}

/**
 * Running balance uses (debit - credit) * direction for normal balance display.
 */
export async function getGeneralLedger(
  accountId: string,
  tenantId: string,
  options?: { fromDate?: string; toDate?: string }
): Promise<{ accountType: string; accountName: string; rows: GeneralLedgerRow[] }> {
  if (!isLocalOnlyMode()) {
    void tenantId;
    const data = await journalApi.getGeneralLedgerReport(accountId, {
      fromDate: options?.fromDate,
      toDate: options?.toDate,
    });
    return {
      accountType: data.accountType,
      accountName: data.accountName,
      rows: data.rows.map((r) => ({
        entry_date: r.entry_date,
        journal_entry_id: r.journal_entry_id,
        reference: r.reference,
        description: r.description,
        line_number: r.line_number,
        debit_amount: roundMoney(Number(r.debit_amount)),
        credit_amount: roundMoney(Number(r.credit_amount)),
        running_balance: roundMoney(Number(r.running_balance)),
      })),
    };
  }

  const bridge = getBridge();
  const acc = await bridge.query(
    `SELECT type, name FROM accounts WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
    [accountId, tenantId]
  );
  if (!acc.ok || !acc.rows?.length) throw new Error('Account not found.');
  const accountType = String((acc.rows[0] as { type: string }).type);
  const accountName = String((acc.rows[0] as { name: string }).name);
  const dir = normalBalanceDirection(accountType);

  let sql = `
    SELECT
      je.entry_date AS entry_date,
      je.id AS journal_entry_id,
      je.reference AS reference,
      je.description AS description,
      jl.line_number AS line_number,
      jl.debit_amount AS debit_amount,
      jl.credit_amount AS credit_amount
    FROM journal_lines jl
    INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
    WHERE jl.account_id = ? AND je.tenant_id = ?
  `;
  const params: unknown[] = [accountId, tenantId];
  if (options?.fromDate) {
    sql += ` AND je.entry_date >= ?`;
    params.push(options.fromDate);
  }
  if (options?.toDate) {
    sql += ` AND je.entry_date <= ?`;
    params.push(options.toDate);
  }
  sql += ` ORDER BY je.entry_date ASC, je.id ASC, jl.line_number ASC`;

  const r = await bridge.query(sql, params);
  if (!r.ok) throw new Error(r.error || 'General ledger query failed');

  let running = 0;
  const rows: GeneralLedgerRow[] = (r.rows || []).map((raw: Record<string, unknown>) => {
    const debit = roundMoney(Number(raw.debit_amount));
    const credit = roundMoney(Number(raw.credit_amount));
    const delta = dir * (debit - credit);
    running = roundMoney(running + delta);
    return {
      entry_date: String(raw.entry_date),
      journal_entry_id: String(raw.journal_entry_id),
      reference: String(raw.reference ?? ''),
      description: raw.description != null ? String(raw.description) : null,
      line_number: Number(raw.line_number),
      debit_amount: debit,
      credit_amount: credit,
      running_balance: running,
    };
  });

  return { accountType, accountName, rows };
}

export type AccountStatementRow = GeneralLedgerRow;

export async function getAccountStatement(
  accountId: string,
  tenantId: string,
  options?: { fromDate?: string; toDate?: string }
): Promise<{ accountType: string; accountName: string; rows: AccountStatementRow[] }> {
  return getGeneralLedger(accountId, tenantId, options);
}
