import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPeriodClosingLines,
  buildYearEndTransferLines,
  consolidateJournalLines,
  totalsFromProfitLossReport,
} from './fiscalPeriodCloseService.js';
import { validateBalanced } from '../financial/validation.js';
import {
  SYS_CLEARING,
  SYS_CURRENT_YEAR_EARNINGS,
  SYS_RETAINED_EARNINGS,
} from '../constants/fiscalAccounts.js';

describe('fiscalPeriodCloseService', () => {
  it('totalsFromProfitLossReport derives expense total from net income', () => {
    const t = totalsFromProfitLossReport({ totalRevenue: 1000, net_profit: 150, profit_before_tax: 150 });
    assert.equal(t.totalIncome, 1000);
    assert.equal(t.totalExpenses, 850);
    assert.equal(t.netIncome, 150);
  });

  it('buildPeriodClosingLines balances for profit scenario', () => {
    const lines = buildPeriodClosingLines({ totalIncome: 1000, totalExpenses: 850, netIncome: 150 });
    assert.ok(lines.length >= 2);
    assert.equal(validateBalanced(lines), null);
    const cye = lines.find((l) => l.accountId === SYS_CURRENT_YEAR_EARNINGS);
    assert.ok(cye);
    assert.equal(cye!.creditAmount, 150);
  });

  it('buildPeriodClosingLines balances for loss scenario', () => {
    const lines = buildPeriodClosingLines({ totalIncome: 800, totalExpenses: 900, netIncome: -100 });
    assert.equal(validateBalanced(lines), null);
    const cye = lines.find((l) => l.accountId === SYS_CURRENT_YEAR_EARNINGS);
    assert.ok(cye);
    assert.equal(cye!.debitAmount, 100);
  });

  it('buildPeriodClosingLines returns empty for zero activity', () => {
    assert.deepEqual(buildPeriodClosingLines({ totalIncome: 0, totalExpenses: 0, netIncome: 0 }), []);
  });

  it('buildYearEndTransferLines moves CYE credit to retained earnings', () => {
    const lines = buildYearEndTransferLines(500);
    assert.equal(validateBalanced(lines), null);
    assert.equal(lines.find((l) => l.accountId === SYS_RETAINED_EARNINGS)?.creditAmount, 500);
  });

  it('buildYearEndTransferLines moves CYE debit (loss) to retained earnings', () => {
    const lines = buildYearEndTransferLines(-200);
    assert.equal(validateBalanced(lines), null);
    assert.equal(lines.find((l) => l.accountId === SYS_RETAINED_EARNINGS)?.debitAmount, 200);
  });

  it('consolidateJournalLines nets duplicate accounts', () => {
    const merged = consolidateJournalLines([
      { accountId: SYS_CLEARING, debitAmount: 100, creditAmount: 0 },
      { accountId: SYS_CLEARING, debitAmount: 0, creditAmount: 40 },
    ]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].debitAmount, 60);
  });
});
