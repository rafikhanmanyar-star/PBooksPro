/**
 * Trial balance presentation from journal line aggregates (gross debit/credit per account).
 * Net columns: balance = grossDebit - grossCredit; one column holds |balance|, the other 0.
 */

import { MONEY_EPSILON, roundMoney } from './validation';

export type TrialBalanceBasis = 'period' | 'cumulative';

export interface TrialBalanceRawRow {
  accountId: string;
  accountName: string;
  accountType: string;
  parentAccountId: string | null;
  accountCode: string | null;
  subType: string | null;
  isActive: boolean;
  grossDebit: number;
  grossCredit: number;
}

export interface TrialBalanceAccountLine extends TrialBalanceRawRow {
  netBalance: number;
  debit: number;
  credit: number;
}

export interface TrialBalanceTotals {
  /** Sum of net debit column */
  totalDebit: number;
  /** Sum of net credit column */
  totalCredit: number;
  grossDebit: number;
  grossCredit: number;
}

export interface TrialBalanceReportPayload {
  accounts: TrialBalanceAccountLine[];
  totals: TrialBalanceTotals;
  /** True when net columns balance (and gross debits == gross credits). */
  isBalanced: boolean;
}

/**
 * Split gross amounts into net debit/credit presentation columns.
 */
export function netColumnsFromGross(grossDebit: number, grossCredit: number): { debit: number; credit: number; netBalance: number } {
  const gd = roundMoney(grossDebit);
  const gc = roundMoney(grossCredit);
  const netBalance = roundMoney(gd - gc);
  if (netBalance > MONEY_EPSILON) {
    return { debit: netBalance, credit: 0, netBalance };
  }
  if (netBalance < -MONEY_EPSILON) {
    return { debit: 0, credit: roundMoney(Math.abs(netBalance)), netBalance };
  }
  return { debit: 0, credit: 0, netBalance: 0 };
}

export function mapRawRowsToTrialBalanceLines(rows: TrialBalanceRawRow[]): TrialBalanceAccountLine[] {
  return rows.map((r) => {
    const { debit, credit, netBalance } = netColumnsFromGross(r.grossDebit, r.grossCredit);
    return {
      ...r,
      netBalance,
      debit,
      credit,
    };
  });
}

export function sumTrialBalanceTotals(lines: TrialBalanceAccountLine[]): TrialBalanceTotals {
  let totalDebit = 0;
  let totalCredit = 0;
  let grossDebit = 0;
  let grossCredit = 0;
  for (const l of lines) {
    totalDebit = roundMoney(totalDebit + l.debit);
    totalCredit = roundMoney(totalCredit + l.credit);
    grossDebit = roundMoney(grossDebit + roundMoney(l.grossDebit));
    grossCredit = roundMoney(grossCredit + roundMoney(l.grossCredit));
  }
  return { totalDebit, totalCredit, grossDebit, grossCredit };
}

export function isTrialBalanceBalanced(totals: TrialBalanceTotals): boolean {
  const netOk = Math.abs(totals.totalDebit - totals.totalCredit) < MONEY_EPSILON;
  const grossOk = Math.abs(totals.grossDebit - totals.grossCredit) < MONEY_EPSILON;
  return netOk && grossOk;
}

export function buildTrialBalanceReport(rows: TrialBalanceRawRow[]): TrialBalanceReportPayload {
  const accounts = mapRawRowsToTrialBalanceLines(rows);
  const totals = sumTrialBalanceTotals(accounts);
  return {
    accounts,
    totals,
    isBalanced: isTrialBalanceBalanced(totals),
  };
}

/** Group account types for section headers (order matters). */
export const TRIAL_BALANCE_TYPE_ORDER: string[] = ['Bank', 'Cash', 'Asset', 'Liability', 'Equity'];

export function compareTrialBalanceType(a: string, b: string): number {
  const ia = TRIAL_BALANCE_TYPE_ORDER.indexOf(a);
  const ib = TRIAL_BALANCE_TYPE_ORDER.indexOf(b);
  const sa = ia === -1 ? 999 : ia;
  const sb = ib === -1 ? 999 : ib;
  if (sa !== sb) return sa - sb;
  return a.localeCompare(b);
}

/**
 * SQLite local DB may store tenant_id as '', 'local', or a UUID; journal rows must match app data.
 */
export function ledgerTenantIdsForLocalQuery(raw: string | undefined | null): string[] {
  const set = new Set<string>();
  const t = (raw ?? '').trim();
  set.add(t);
  set.add('local');
  set.add('');
  return [...set];
}
