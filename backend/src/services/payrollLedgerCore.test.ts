import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPayrollLedgerRowsFromSource,
  summarizePayrollBalanceFromRows,
  type LedgerBuildPayslip,
  type LedgerBuildRun,
  type LedgerBuildTx,
} from './payrollLedgerCore.js';

const run = (id: string, periodEnd: string | null): LedgerBuildRun => ({
  id,
  period_end: periodEnd,
});

function ps(
  id: string,
  runId: string,
  net: number,
  created: string
): LedgerBuildPayslip {
  return {
    id,
    payroll_run_id: runId,
    net_pay: net,
    created_at: created,
  };
}

function expTx(
  id: string,
  payslipId: string,
  amount: number,
  date: string,
  created: string
): LedgerBuildTx {
  return {
    id,
    payslip_id: payslipId,
    amount,
    date,
    created_at: created,
    type: 'expense',
  };
}

describe('buildPayrollLedgerRowsFromSource', () => {
  it('builds payslip debit then running balance matches net before payment', () => {
    const payslips = [ps('ps1', 'run1', 10_000, '2026-01-15')];
    const runs = new Map<string, LedgerBuildRun>([['run1', run('run1', '2026-01-31')]]);
    const rows = buildPayrollLedgerRowsFromSource(payslips, runs, []);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.transaction_type, 'PAYSLIP');
    assert.equal(rows[0]!.debit, 10_000);
    assert.equal(rows[0]!.balance_after, 10_000);
  });

  it('ignores non-expense transactions linked to payslip', () => {
    const payslips = [ps('ps1', 'run1', 5_000, '2026-01-10')];
    const runs = new Map<string, LedgerBuildRun>([['run1', run('run1', null)]]);
    const txs: LedgerBuildTx[] = [
      { id: 't1', payslip_id: 'ps1', amount: 5_000, date: '2026-01-20', created_at: '2026-01-20', type: 'income' },
    ];
    const rows = buildPayrollLedgerRowsFromSource(payslips, runs, txs);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.balance_after, 5_000);
  });

  it('full salary payment settles balance to zero', () => {
    const payslips = [ps('ps1', 'run1', 8_000, '2026-02-01')];
    const runs = new Map<string, LedgerBuildRun>([['run1', run('run1', '2026-02-28')]]);
    const txs = [expTx('pay1', 'ps1', 8_000, '2026-02-28', '2026-02-28T10:00:00Z')];
    const rows = buildPayrollLedgerRowsFromSource(payslips, runs, txs);
    assert.equal(rows.length, 2);
    const last = rows[rows.length - 1]!;
    assert.equal(last.transaction_type, 'PAYMENT');
    assert.equal(last.balance_after, 0);
  });

  it('overpayment yields negative balance (advance) on payment row after payslip is booked', () => {
    const payslips = [ps('ps1', 'run1', 5_000, '2026-03-01')];
    const runs = new Map<string, LedgerBuildRun>([['run1', run('run1', '2026-03-05')]]);
    const txs = [expTx('pay1', 'ps1', 7_000, '2026-03-10', '2026-03-10T09:00:00Z')];
    const rows = buildPayrollLedgerRowsFromSource(payslips, runs, txs);
    const psRow = rows.find((r) => r.transaction_type === 'PAYSLIP');
    const payRow = rows.find((r) => r.transaction_type === 'PAYMENT');
    assert.ok(psRow && payRow);
    assert.equal(psRow!.balance_after, 5_000);
    assert.equal(payRow!.credit, 7_000);
    assert.ok(payRow!.balance_after < -0.01);
    assert.equal(payRow!.balance_after, -2_000);
  });

  it('multiple payslips and payments accumulate in date order', () => {
    const payslips = [
      ps('ps1', 'r1', 3_000, '2026-04-01'),
      ps('ps2', 'r1', 4_000, '2026-04-05'),
    ];
    const runs = new Map<string, LedgerBuildRun>([['r1', run('r1', null)]]);
    const txs = [
      expTx('p1', 'ps1', 3_000, '2026-04-02', '2026-04-02'),
      expTx('p2', 'ps2', 4_000, '2026-04-06', '2026-04-06'),
    ];
    const rows = buildPayrollLedgerRowsFromSource(payslips, runs, txs);
    const last = rows[rows.length - 1]!;
    assert.equal(last.balance_after, 0);
  });
});

describe('summarizePayrollBalanceFromRows', () => {
  it('returns zeros for empty rows', () => {
    const s = summarizePayrollBalanceFromRows([]);
    assert.deepEqual(s, {
      totalDebit: 0,
      totalCredit: 0,
      balance: 0,
      advanceAmount: 0,
      payableAmount: 0,
    });
  });

  it('classifies advance when final balance is negative', () => {
    const payslips = [ps('ps1', 'run1', 100, '2026-01-01')];
    const runs = new Map<string, LedgerBuildRun>([['run1', run('run1', null)]]);
    const rows = buildPayrollLedgerRowsFromSource(payslips, runs, [expTx('x', 'ps1', 150, '2026-01-02', '2026-01-02')]);
    const s = summarizePayrollBalanceFromRows(rows);
    assert.ok(s.advanceAmount >= 49.99);
    assert.ok(s.advanceAmount <= 50.01);
    assert.equal(s.payableAmount, 0);
    assert.ok(s.balance < -0.01);
  });

  it('classifies payable when balance is positive after partial pay', () => {
    const payslips = [ps('ps1', 'run1', 600, '2026-01-01')];
    const runs = new Map<string, LedgerBuildRun>([['run1', run('run1', null)]]);
    const rows = buildPayrollLedgerRowsFromSource(payslips, runs, [expTx('x', 'ps1', 200, '2026-01-02', '2026-01-02')]);
    const s = summarizePayrollBalanceFromRows(rows);
    assert.equal(s.payableAmount, 400);
    assert.equal(s.advanceAmount, 0);
  });
});
