/**
 * Trial balance core: balanced entries, opening balances, reversals, date filtering.
 */
import assert from 'node:assert';
import {
  applyOpeningBalances,
  buildTrialBalanceReport,
  mergeRawRowsByAccount,
  netColumnsFromGross,
  netReversalPair,
  openingAmountToGross,
  OPENING_BALANCE_EQUITY_ID,
  type AccountOpeningInput,
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

// --- net columns ---
assert.deepStrictEqual(netColumnsFromGross(100, 0), { debit: 100, credit: 0, netBalance: 100 });
assert.deepStrictEqual(netColumnsFromGross(0, 100), { debit: 0, credit: 100, netBalance: -100 });
assert.deepStrictEqual(netColumnsFromGross(50, 50), { debit: 0, credit: 0, netBalance: 0 });

// --- balanced journals ---
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

// --- opening balances ---
{
  assert.deepStrictEqual(openingAmountToGross(5000, 'Bank'), { grossDebit: 5000, grossCredit: 0 });
  assert.deepStrictEqual(openingAmountToGross(200, 'Liability'), { grossDebit: 0, grossCredit: 200 });
}

{
  const openings: AccountOpeningInput[] = [
    {
      accountId: 'bank-1',
      accountName: 'Main Bank',
      accountType: 'Bank',
      openingBalance: 10000,
    },
  ];
  const withOb = applyOpeningBalances([], openings);
  assert.strictEqual(withOb.length, 2);
  const bank = withOb.find((r) => r.accountId === 'bank-1');
  const equity = withOb.find((r) => r.accountId === OPENING_BALANCE_EQUITY_ID);
  assert.ok(bank);
  assert.strictEqual(bank!.grossDebit, 10000);
  assert.ok(equity);
  assert.strictEqual(equity!.grossCredit, 10000);

  const report = buildTrialBalanceReport(withOb);
  assert.strictEqual(report.isBalanced, true);
}

{
  const activity = [row('bank-1', 'Main Bank', 'Bank', 500, 0), row('rev-1', 'Sales', 'Bank', 0, 500)];
  const openings: AccountOpeningInput[] = [
    { accountId: 'bank-1', accountName: 'Main Bank', accountType: 'Bank', openingBalance: 1000 },
  ];
  const merged = applyOpeningBalances(activity, openings);
  const bank = merged.find((r) => r.accountId === 'bank-1');
  assert.strictEqual(bank!.grossDebit, 1500);
  const report = buildTrialBalanceReport(merged);
  assert.strictEqual(report.isBalanced, true);
}

// --- reversals ---
{
  const original = { grossDebit: 1000, grossCredit: 0 };
  const reversal = { grossDebit: 0, grossCredit: 1000 };
  const netted = netReversalPair(original, reversal);
  assert.strictEqual(netted.grossDebit, 1000);
  assert.strictEqual(netted.grossCredit, 1000);
  const report = buildTrialBalanceReport([
    row('a1', 'Cash', 'Cash', netted.grossDebit, netted.grossCredit),
    row('a2', 'Rev', 'Bank', 0, 0),
  ]);
  assert.strictEqual(report.accounts[0].debit, 0);
  assert.strictEqual(report.accounts[0].credit, 0);
}

{
  const periodActivity = [row('cash', 'Cash', 'Cash', 200, 0), row('rev', 'Revenue', 'Bank', 0, 200)];
  const priorActivity = [row('cash', 'Cash', 'Cash', 300, 0), row('rev', 'Revenue', 'Bank', 0, 300)];
  const combined = mergeRawRowsByAccount([...priorActivity, ...periodActivity]);
  const cash = combined.find((r) => r.accountId === 'cash');
  assert.strictEqual(cash!.grossDebit, 500);
  const report = buildTrialBalanceReport(combined);
  assert.strictEqual(report.totals.grossDebit, 500);
  assert.strictEqual(report.totals.grossCredit, 500);
  assert.strictEqual(report.isBalanced, true);
}

// --- date filtering simulation (period vs cumulative aggregates) ---
{
  const jan = [row('cash', 'Cash', 'Cash', 100, 0), row('eq', 'Equity', 'Equity', 0, 100)];
  const feb = [row('cash', 'Cash', 'Cash', 50, 0), row('eq', 'Equity', 'Equity', 0, 50)];
  const periodOnly = mergeRawRowsByAccount(feb);
  const cumulative = mergeRawRowsByAccount([...jan, ...feb]);
  assert.strictEqual(periodOnly.find((r) => r.accountId === 'cash')!.grossDebit, 50);
  assert.strictEqual(cumulative.find((r) => r.accountId === 'cash')!.grossDebit, 150);
}

console.log('trialBalanceCore.test.ts: ok');
