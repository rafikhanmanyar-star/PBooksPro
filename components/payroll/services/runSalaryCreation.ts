/**
 * Run salary creation for a given month/year.
 * Creates or reuses a payroll run; skips employees who already have a payslip; prorata for joining month; amounts rounded to nearest 100.
 *
 * Local-only: synchronous logic below. LAN/API: use `runSalaryCreationForPeriodAsync` (PostgreSQL + REST).
 */

import { PayrollRun, Payslip, PayrollStatus, normalizePayrollRun, normalizePayslip } from '../types';
import { isLocalOnlyMode } from '../../../config/apiUrl';
import { payrollApi } from '../../../services/api/payrollApi';
import { storageService } from './storageService';
import { persistPayrollToDbInOrder } from './payrollDb';
import { computeMonthlyPayslip, getMonthName, isPayrollPeriodBeforeJoiningDate } from '../utils/salaryCalculation';
import { buildAssignmentSnapshotFromEmployee } from '../utils/payslipAssignment';

export interface RunSalaryCreationResult {
  runId: string;
  payslips: Payslip[];
}

export function runSalaryCreationForPeriod(
  tenantId: string,
  userId: string,
  year: number,
  month: number,
  employeeId?: string
): RunSalaryCreationResult {
  const employees = storageService.getEmployees(tenantId);
  const targetId = employeeId?.trim();
  const toProcess = targetId ? employees.filter((e) => e.id === targetId) : employees;

  if (targetId && toProcess.length === 0) {
    throw new Error('Employee not found.');
  }
  if (!targetId && employees.length === 0) {
    throw new Error('No employees found. Add employees in the Workforce tab first.');
  }

  const runs = storageService.getPayrollRuns(tenantId);
  const monthLabel = getMonthName(month);
  let run = runs.find(r => r.month === monthLabel && r.year === year);

  if (!run) {
    run = {
      id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      tenant_id: tenantId,
      month: monthLabel,
      year,
      status: PayrollStatus.DRAFT,
      total_amount: 0,
      employee_count: 0,
      created_by: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    storageService.addPayrollRun(tenantId, run, userId);
  }

  for (const emp of toProcess) {
    const existing = storageService.getPayslipByRunAndEmployee(tenantId, run!.id, emp.id);
    if (existing) {
      if (targetId) {
        throw new Error('This employee already has a payslip for this period.');
      }
      continue;
    }

    // Do not generate payslip if payroll period is before employee's joining date
    if (isPayrollPeriodBeforeJoiningDate(emp.joining_date, year, month)) {
      if (targetId) {
        throw new Error('This payroll period is before the employee\'s joining date.');
      }
      continue;
    }

    const computed = computeMonthlyPayslip(emp, year, month);
    const payslip: Payslip = {
      id: `ps-${Date.now()}-${emp.id}-${Math.random().toString(36).slice(2, 6)}`,
      tenant_id: tenantId,
      payroll_run_id: run!.id,
      employee_id: emp.id,
      basic_pay: computed.basic_pay,
      total_allowances: computed.total_allowances,
      total_deductions: computed.total_deductions,
      total_adjustments: computed.total_adjustments,
      gross_pay: computed.gross_pay,
      net_pay: computed.net_pay,
      allowance_details: computed.allowance_details,
      deduction_details: computed.deduction_details,
      adjustment_details: emp.adjustments ?? [],
      assignment_snapshot: buildAssignmentSnapshotFromEmployee(emp),
      is_paid: false,
      paid_amount: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    storageService.addPayslip(tenantId, payslip);
  }

  const allPayslipsForRun = storageService.getPayslipsByRunId(tenantId, run!.id);
  const runTotal = allPayslipsForRun.reduce((s, p) => s + p.net_pay, 0);
  storageService.updatePayrollRun(tenantId, {
    ...run,
    total_amount: runTotal,
    employee_count: allPayslipsForRun.length,
    updated_at: new Date().toISOString()
  }, userId);

  return { runId: run!.id, payslips: allPayslipsForRun };
}

/**
 * Same as `runSalaryCreationForPeriod` but uses the API when not in local-only mode:
 * POST /payroll/runs → POST /payroll/runs/:id/process → GET payslips, then merges into localStorage (and Electron SQLite when applicable).
 */
export async function runSalaryCreationForPeriodAsync(
  tenantId: string,
  userId: string,
  year: number,
  month: number,
  employeeId?: string
): Promise<RunSalaryCreationResult> {
  if (isLocalOnlyMode()) {
    return runSalaryCreationForPeriod(tenantId, userId, year, month, employeeId);
  }

  const monthLabel = getMonthName(month);
  if (!monthLabel) {
    throw new Error('Invalid month.');
  }

  storageService.init(tenantId);

  const created = await payrollApi.createPayrollRun({ month: monthLabel, year });
  if (!created?.id) {
    throw new Error('Could not create payroll run on the server.');
  }

  const processed = await payrollApi.processPayrollRun(created.id, {
    employeeId: employeeId?.trim() || undefined,
  });
  if (!processed?.id) {
    throw new Error('Could not process payroll run on the server.');
  }

  const runId = processed.id;
  const rawPayslips = await payrollApi.getPayslipsByRun(runId);
  const payslips = (rawPayslips || []).map((p) => normalizePayslip(p));

  const runRow = normalizePayrollRun(processed);
  const runsWithout = storageService.getPayrollRuns(tenantId).filter((r) => r.id !== runId);
  storageService.setPayrollRuns(tenantId, [runRow, ...runsWithout]);

  const payslipsMerged = [
    ...storageService.getPayslips(tenantId).filter((p) => p.payroll_run_id !== runId),
    ...payslips
  ];
  storageService.setPayslips(tenantId, payslipsMerged);

  void persistPayrollToDbInOrder(
    tenantId,
    storageService.getPayrollRuns(tenantId),
    storageService.getEmployees(tenantId),
    storageService.getPayslips(tenantId),
    storageService.getDepartments(tenantId),
    storageService.getGradeLevels(tenantId)
  ).catch(() => {});

  return { runId, payslips };
}
