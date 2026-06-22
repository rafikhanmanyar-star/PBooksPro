import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildJournalLinesFromPayrollRunAccrual,
  resolvePayrollRunAccrualAmount,
  shouldSkipPayrollRunAccrual,
} from '../modules/payroll/services/payroll/payrollJournalPostingService.js';
import type { PayrollRunRow } from '../modules/payroll/services/payroll/payrollTypes.js';

describe('payrollJournalPostingService', () => {
  it('skips zero accrual amounts', () => {
    assert.equal(shouldSkipPayrollRunAccrual(0), true);
    assert.equal(shouldSkipPayrollRunAccrual(0.001), true);
    assert.equal(shouldSkipPayrollRunAccrual(100), false);
  });

  it('builds expense/AP accrual lines', () => {
    const lines = buildJournalLinesFromPayrollRunAccrual(50000, {
      projectId: 'proj-1',
      buildingId: null,
      costCenterId: null,
    });
    assert.ok(lines);
    assert.equal(lines!.length, 2);
    assert.equal(lines![0].accountId, 'sys-acc-expense-summary');
    assert.equal(lines![0].debitAmount, 50000);
    assert.equal(lines![1].accountId, 'sys-acc-ap');
    assert.equal(lines![1].creditAmount, 50000);
  });

  it('prefers run total_amount for accrual', () => {
    const run = {
      total_amount: '120000',
    } as PayrollRunRow;
    assert.equal(resolvePayrollRunAccrualAmount(run, 99999), 120000);
  });

  it('falls back to payslip net sum when run total is zero', () => {
    const run = { total_amount: '0' } as PayrollRunRow;
    assert.equal(resolvePayrollRunAccrualAmount(run, 85000.5), 85000.5);
  });
});
