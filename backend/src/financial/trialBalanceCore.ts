/**
 * Trial balance presentation from journal aggregates (shared backend logic).
 */

import { MONEY_EPSILON, roundMoney } from './validation.js';

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
  totalDebit: number;
  totalCredit: number;
  grossDebit: number;
  grossCredit: number;
}

export interface TrialBalanceReportPayload {
  accounts: TrialBalanceAccountLine[];
  totals: TrialBalanceTotals;
  isBalanced: boolean;
}

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

export const TRIAL_BALANCE_TYPE_ORDER: string[] = ['Bank', 'Cash', 'Asset', 'Liability', 'Equity'];

export function compareTrialBalanceType(a: string, b: string): number {
  const ia = TRIAL_BALANCE_TYPE_ORDER.indexOf(a);
  const ib = TRIAL_BALANCE_TYPE_ORDER.indexOf(b);
  const sa = ia === -1 ? 999 : ia;
  const sb = ib === -1 ? 999 : ib;
  if (sa !== sb) return sa - sb;
  return a.localeCompare(b);
}
