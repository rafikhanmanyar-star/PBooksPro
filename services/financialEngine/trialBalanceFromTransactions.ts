/**
 * Builds synthetic double-entry trial balance rows from legacy `transactions` when `journal_lines` is empty.
 * Uses a clearing account for the non-cash leg of Income/Expense/Loan so debits equal credits.
 */

import type { Account, Transaction } from '../../types';
import { LoanSubtype, TransactionType } from '../../types';
import { roundMoney } from './validation';
import type { TrialBalanceRawRow } from './trialBalanceCore';

export const TRANSACTION_TRIAL_BALANCE_CLEARING_ID = '__tx_tb_clearing__';

function ymd(d: string): string {
  return d.slice(0, 10);
}

function inPeriod(dateStr: string, from: string, to: string, basis: 'period' | 'cumulative'): boolean {
  const d = ymd(dateStr);
  if (basis === 'cumulative') return d <= to;
  return d >= from && d <= to;
}

/**
 * Aggregate debits/credits per account from operational transactions (mirrors cash effects + balancing clearing).
 */
export function buildTrialBalanceRawRowsFromTransactions(
  transactions: Transaction[],
  accounts: Account[],
  from: string,
  to: string,
  basis: 'period' | 'cumulative'
): TrialBalanceRawRow[] {
  const agg = new Map<string, { debit: number; credit: number }>();

  const bump = (accountId: string, debit: number, credit: number) => {
    const cur = agg.get(accountId) ?? { debit: 0, credit: 0 };
    cur.debit = roundMoney(cur.debit + debit);
    cur.credit = roundMoney(cur.credit + credit);
    agg.set(accountId, cur);
  };

  for (const t of transactions) {
    const del = (t as { deletedAt?: string }).deletedAt;
    if (del) continue;
    if (!inPeriod(t.date, from, to, basis)) continue;

    const M = roundMoney(Math.abs(Number(t.amount)));
    if (M < 0.005) continue;

    switch (t.type) {
      case TransactionType.INCOME: {
        bump(t.accountId, M, 0);
        bump(TRANSACTION_TRIAL_BALANCE_CLEARING_ID, 0, M);
        break;
      }
      case TransactionType.EXPENSE: {
        bump(TRANSACTION_TRIAL_BALANCE_CLEARING_ID, M, 0);
        bump(t.accountId, 0, M);
        break;
      }
      case TransactionType.TRANSFER: {
        if (t.fromAccountId) bump(t.fromAccountId, 0, M);
        if (t.toAccountId) bump(t.toAccountId, M, 0);
        break;
      }
      case TransactionType.LOAN: {
        const st = String(t.subtype ?? '');
        const isIn =
          st === LoanSubtype.RECEIVE ||
          st === LoanSubtype.COLLECT ||
          st.includes('Receive') ||
          st.includes('Collect');
        const isOut =
          st === LoanSubtype.GIVE ||
          st === LoanSubtype.REPAY ||
          st.includes('Give') ||
          st.includes('Repay');
        if (isIn) {
          bump(t.accountId, M, 0);
          bump(TRANSACTION_TRIAL_BALANCE_CLEARING_ID, 0, M);
        } else if (isOut) {
          bump(TRANSACTION_TRIAL_BALANCE_CLEARING_ID, M, 0);
          bump(t.accountId, 0, M);
        }
        break;
      }
      default:
        break;
    }
  }

  const nameById = new Map(accounts.map((a) => [a.id, a.name]));
  const typeById = new Map(accounts.map((a) => [a.id, a.type]));

  const rows: TrialBalanceRawRow[] = [];
  for (const [id, v] of agg) {
    if (v.debit < 0.005 && v.credit < 0.005) continue;
    const isClearing = id === TRANSACTION_TRIAL_BALANCE_CLEARING_ID;
    rows.push({
      accountId: id,
      accountName: isClearing
        ? 'Transaction clearing (counterparty / P&L — from ledger)'
        : (nameById.get(id) ?? 'Unknown account'),
      accountType: isClearing ? 'Equity' : String(typeById.get(id) ?? 'Asset'),
      parentAccountId: null,
      accountCode: isClearing ? 'TX-CLEAR' : null,
      subType: isClearing ? 'system_clearing' : null,
      isActive: true,
      grossDebit: v.debit,
      grossCredit: v.credit,
    });
  }

  return rows;
}
