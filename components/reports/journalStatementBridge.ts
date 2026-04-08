/**
 * Helpers to relate double-entry journal aggregates to financial statement views.
 * P&amp;L, Balance Sheet, and Cash Flow UIs still use transaction/category engines until
 * operational flows post exclusively through the journal; Trial Balance is the GL truth for posted lines.
 */

import type { TrialBalanceAccountLine } from '../../services/financialEngine/trialBalanceCore';

/** Sum net debit/credit presentation columns by chart account type (Bank, Cash, Asset, …). */
export function rollupTrialBalanceByAccountType(
  lines: TrialBalanceAccountLine[]
): Map<string, { debit: number; credit: number }> {
  const m = new Map<string, { debit: number; credit: number }>();
  for (const l of lines) {
    const cur = m.get(l.accountType) ?? { debit: 0, credit: 0 };
    cur.debit += l.debit;
    cur.credit += l.credit;
    m.set(l.accountType, cur);
  }
  return m;
}

/** Bank + Cash net movement from trial balance lines (for cross-checks with cash flow). */
export function trialBalanceNetForBankCash(lines: TrialBalanceAccountLine[]): { debit: number; credit: number } {
  let debit = 0;
  let credit = 0;
  for (const l of lines) {
    if (l.accountType === 'Bank' || l.accountType === 'Cash') {
      debit += l.debit;
      credit += l.credit;
    }
  }
  return { debit, credit };
}
