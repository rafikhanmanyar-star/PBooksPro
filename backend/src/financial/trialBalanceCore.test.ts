import assert from 'node:assert';
import {
  applyOpeningBalances,
  buildTrialBalanceReport,
  mergeRawRowsByAccount,
  netReversalPair,
  OPENING_BALANCE_EQUITY_ID,
  type AccountOpeningInput,
  type TrialBalanceRawRow,
} from './trialBalanceCore.js';

function row(id: string, name: string, type: string, gd: number, gc: number): TrialBalanceRawRow {
  return {
    accountId: id,
    accountName: name,
    accountType: type,
    parentAccountId: null,
    accountCode: null,
    subType: null,
    isActive: true,
    grossDebit: gd,
    grossCredit: gc,
  };
}

{
  const openings: AccountOpeningInput[] = [
    { accountId: 'b1', accountName: 'Bank', accountType: 'Bank', openingBalance: 5000 },
  ];
  const report = buildTrialBalanceReport(applyOpeningBalances([], openings));
  assert.strictEqual(report.isBalanced, true);
  assert.ok(report.accounts.some((a) => a.accountId === OPENING_BALANCE_EQUITY_ID));
}

{
  const netted = netReversalPair({ grossDebit: 100, grossCredit: 0 }, { grossDebit: 0, grossCredit: 100 });
  assert.strictEqual(netted.grossDebit, 100);
  assert.strictEqual(netted.grossCredit, 100);
}

{
  const combined = mergeRawRowsByAccount([
    row('c', 'Cash', 'Cash', 100, 0),
    row('c', 'Cash', 'Cash', 50, 0),
  ]);
  assert.strictEqual(combined[0].grossDebit, 150);
}

console.log('trialBalanceCore.test.ts (backend): ok');
