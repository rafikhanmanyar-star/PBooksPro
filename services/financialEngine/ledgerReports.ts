/**
 * General ledger, trial balance, and account statement from journal_lines + journal_entries.
 * Local-only: SQLite via Electron bridge. LAN/API: PostgreSQL via REST.
 */

import { roundMoney } from './validation';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { journalApi } from '../api/journalApi';

function getBridge() {
  if (typeof window === 'undefined' || !window.sqliteBridge?.query) {
    throw new Error('Ledger reports require Electron SQLite bridge.');
  }
  return window.sqliteBridge;
}

export type TrialBalanceRow = {
  account_id: string;
  account_name: string;
  account_type: string;
  total_debit: number;
  total_credit: number;
};

export async function getTrialBalance(tenantId: string, options?: { fromDate?: string; toDate?: string }): Promise<TrialBalanceRow[]> {
  if (!isLocalOnlyMode()) {
    void tenantId;
    const rows = await journalApi.getTrialBalanceReport({
      fromDate: options?.fromDate,
      toDate: options?.toDate,
    });
    return rows.map((row) => ({
      account_id: row.account_id,
      account_name: row.account_name,
      account_type: row.account_type,
      total_debit: roundMoney(Number(row.total_debit)),
      total_credit: roundMoney(Number(row.total_credit)),
    }));
  }

  const bridge = getBridge();
  let sql = `
    SELECT
      jl.account_id AS account_id,
      a.name AS account_name,
      a.type AS account_type,
      COALESCE(SUM(jl.debit_amount), 0) AS total_debit,
      COALESCE(SUM(jl.credit_amount), 0) AS total_credit
    FROM journal_lines jl
    INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
    INNER JOIN accounts a ON a.id = jl.account_id
    WHERE je.tenant_id = ?
  `;
  const params: unknown[] = [tenantId];
  if (options?.fromDate) {
    sql += ` AND je.entry_date >= ?`;
    params.push(options.fromDate);
  }
  if (options?.toDate) {
    sql += ` AND je.entry_date <= ?`;
    params.push(options.toDate);
  }
  sql += ` GROUP BY jl.account_id, a.name, a.type ORDER BY a.type, a.name`;
  const r = await bridge.query(sql, params);
  if (!r.ok) throw new Error(r.error || 'Trial balance query failed');
  return (r.rows || []).map((row: Record<string, unknown>) => ({
    account_id: String(row.account_id),
    account_name: String(row.account_name),
    account_type: String(row.account_type),
    total_debit: roundMoney(Number(row.total_debit)),
    total_credit: roundMoney(Number(row.total_credit)),
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
