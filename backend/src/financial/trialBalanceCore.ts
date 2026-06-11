/**
 * AUTO-GENERATED — do not edit. Source: shared/financial-core/trialBalanceCore.ts
 * Regenerate: node scripts/ensure-shared-financial-cores.mjs
 */

/**
 * Trial balance presentation from journal line aggregates (gross debit/credit per account).
 * Net columns: balance = grossDebit - grossCredit; one column holds |balance|, the other 0.
 */

import { MONEY_EPSILON, roundMoney } from './validation.js';

export type TrialBalanceBasis = 'period' | 'cumulative';

/** Synthetic equity line balancing account opening_balance fields in trial balance. */
export const OPENING_BALANCE_EQUITY_ID = '__opening_balance_equity__';

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
  /** True for the system equity offset row from opening balances. */
  isSystemRow?: boolean;
}

export interface AccountOpeningInput {
  accountId: string;
  accountName: string;
  accountType: string;
  parentAccountId?: string | null;
  accountCode?: string | null;
  subType?: string | null;
  isActive?: boolean;
  openingBalance: number;
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

/** Debit-normal: asset, expense, bank, cash. Credit-normal: liability, equity, revenue. */
export function normalBalanceDirection(accountType: string): 1 | -1 {
  const t = (accountType || '').toLowerCase();
  if (t === 'asset' || t === 'expense' || t === 'bank' || t === 'cash') return 1;
  return -1;
}

/** Convert stored opening_balance into gross debit/credit for trial balance presentation. */
export function openingAmountToGross(
  amount: number,
  accountType: string
): { grossDebit: number; grossCredit: number } {
  const ob = roundMoney(amount);
  if (Math.abs(ob) < MONEY_EPSILON) return { grossDebit: 0, grossCredit: 0 };
  const signed = normalBalanceDirection(accountType) * ob;
  if (signed > MONEY_EPSILON) return { grossDebit: roundMoney(signed), grossCredit: 0 };
  if (signed < -MONEY_EPSILON) return { grossDebit: 0, grossCredit: roundMoney(Math.abs(signed)) };
  return { grossDebit: 0, grossCredit: 0 };
}

/** Sum journal activity rows by account (used when merging period + prior-period aggregates). */
export function mergeRawRowsByAccount(rows: TrialBalanceRawRow[]): TrialBalanceRawRow[] {
  const map = new Map<string, TrialBalanceRawRow>();
  for (const r of rows) {
    const ex = map.get(r.accountId);
    if (!ex) {
      map.set(r.accountId, { ...r });
      continue;
    }
    ex.grossDebit = roundMoney(ex.grossDebit + r.grossDebit);
    ex.grossCredit = roundMoney(ex.grossCredit + r.grossCredit);
  }
  return [...map.values()];
}

/**
 * Add account opening_balance amounts and a balancing equity line so double-entry holds.
 * Call after merging journal activity (and prior-period activity for period basis).
 */
export function applyOpeningBalances(
  activityRows: TrialBalanceRawRow[],
  accounts: AccountOpeningInput[]
): TrialBalanceRawRow[] {
  const merged = mergeRawRowsByAccount(activityRows);
  let openingNetDebit = 0;

  for (const acc of accounts) {
    const { grossDebit, grossCredit } = openingAmountToGross(acc.openingBalance, acc.accountType);
    if (grossDebit < MONEY_EPSILON && grossCredit < MONEY_EPSILON) continue;

    openingNetDebit = roundMoney(openingNetDebit + grossDebit - grossCredit);

    const existing = merged.find((r) => r.accountId === acc.accountId);
    if (existing) {
      existing.grossDebit = roundMoney(existing.grossDebit + grossDebit);
      existing.grossCredit = roundMoney(existing.grossCredit + grossCredit);
    } else {
      merged.push({
        accountId: acc.accountId,
        accountName: acc.accountName,
        accountType: acc.accountType,
        parentAccountId: acc.parentAccountId ?? null,
        accountCode: acc.accountCode ?? null,
        subType: acc.subType ?? null,
        isActive: acc.isActive ?? true,
        grossDebit,
        grossCredit,
      });
    }
  }

  if (Math.abs(openingNetDebit) >= MONEY_EPSILON) {
    const equityRow = merged.find((r) => r.accountId === OPENING_BALANCE_EQUITY_ID);
    if (openingNetDebit > MONEY_EPSILON) {
      const grossCredit = roundMoney(openingNetDebit);
      if (equityRow) {
        equityRow.grossCredit = roundMoney(equityRow.grossCredit + grossCredit);
      } else {
        merged.push({
          accountId: OPENING_BALANCE_EQUITY_ID,
          accountName: 'Opening Balance Equity',
          accountType: 'Equity',
          parentAccountId: null,
          accountCode: 'OB-EQ',
          subType: 'system_opening',
          isActive: true,
          grossDebit: 0,
          grossCredit,
          isSystemRow: true,
        });
      }
    } else {
      const grossDebit = roundMoney(Math.abs(openingNetDebit));
      if (equityRow) {
        equityRow.grossDebit = roundMoney(equityRow.grossDebit + grossDebit);
      } else {
        merged.push({
          accountId: OPENING_BALANCE_EQUITY_ID,
          accountName: 'Opening Balance Equity',
          accountType: 'Equity',
          parentAccountId: null,
          accountCode: 'OB-EQ',
          subType: 'system_opening',
          isActive: true,
          grossDebit,
          grossCredit: 0,
          isSystemRow: true,
        });
      }
    }
  }

  return merged.filter(
    (r) => Math.abs(r.grossDebit) >= MONEY_EPSILON || Math.abs(r.grossCredit) >= MONEY_EPSILON
  );
}

/** Reversal pair: original + swapped lines net to zero when both fall in the same range. */
export function netReversalPair(
  original: { grossDebit: number; grossCredit: number },
  reversal: { grossDebit: number; grossCredit: number }
): { grossDebit: number; grossCredit: number } {
  return {
    grossDebit: roundMoney(original.grossDebit + reversal.grossDebit),
    grossCredit: roundMoney(original.grossCredit + reversal.grossCredit),
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
