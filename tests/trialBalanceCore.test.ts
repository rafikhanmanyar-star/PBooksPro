/**
 * Trial balance core: balanced entries, imbalance detection, net columns.
 */
import assert from 'node:assert';
import {
  buildTrialBalanceReport,
  netColumnsFromGross,
  type TrialBalanceRawRow,
} from '../services/financialEngine/trialBalanceCore';

function row(
  id: string,
  name: string,
  type: string,
  gd: number,
  gc: number
): TrialBalanceRawRow {
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

assert.deepStrictEqual(netColumnsFromGross(100, 0), { debit: 100, credit: 0, netBalance: 100 });
assert.deepStrictEqual(netColumnsFromGross(0, 100), { debit: 0, credit: 100, netBalance: -100 });
assert.deepStrictEqual(netColumnsFromGross(50, 50), { debit: 0, credit: 0, netBalance: 0 });

{
  const r = buildTrialBalanceReport([
    row('a1', 'Cash', 'Cash', 1000, 0),
    row('a2', 'Revenue', 'Bank', 0, 1000),
  ]);
  assert.strictEqual(r.isBalanced, true);
  assert.strictEqual(r.totals.grossDebit, 1000);
  assert.strictEqual(r.totals.grossCredit, 1000);
  assert.strictEqual(r.totals.totalDebit, r.totals.totalCredit);
}

{
  const r = buildTrialBalanceReport([row('a1', 'Bad', 'Cash', 100, 0)]);
  assert.strictEqual(r.isBalanced, false);
}

console.log('trialBalanceCore.test.ts: ok');
