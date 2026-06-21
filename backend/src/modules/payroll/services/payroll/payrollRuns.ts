import type pg from 'pg';
import { randomUUID } from 'crypto';
import { recordDomainMutation } from '../../../../core/recordDomainMutation.js';
import { PayrollRunRepository } from '../../repositories/PayrollRunRepository.js';
import { PayslipRepository, type PayslipBatchInsertRow } from '../../repositories/PayslipRepository.js';
import {
  computeAttendanceAwarePayslip,
  isPayrollPeriodBeforeJoiningDate,
} from '../../../../payroll/salaryComputation.js';
import {
  assertPayrollRunEditable,
  assertPayrollRunStatusForPayment,
  assertPayrollRunStatusForPayslipGeneration,
  validateAttendanceSummaryForPayroll,
} from '../../../../payroll-core/payrollValidation.js';
import type { PayrollAttendanceSummaryInput } from '../../../../payroll-core/payrollTypes.js';
import {
  PayrollAttendanceSummaryRepository,
  num as numSummary,
} from '../../../payroll-attendance/attendanceSummary.repository.js';
import { todayUtcYyyyMmDd } from '../../../../utils/dateOnly.js';
import { payPeriodCalendarBounds } from '../../../../utils/payrollPeriod.js';
import { ExpenseCashValidationBatchContext } from '../../../../financial/expenseCashValidation.js';
import { createTransaction, rowToTransactionApi } from '../../../accounting/services/transactionsService.js';
import { enforceLockForSave } from '../../../accounting/services/recordLocksService.js';
import { dateStr, j, numStr, optStr } from './payrollHelpers.js';
import type { DataScopeEnforcementContext } from '../../../../auth/tenantRepositoryScope.js';
import { rowToPayrollRunApi, rowToPayslipApi } from './payrollRowMappers.js';
import { employeeRowToLike, listEmployees } from './payrollEmployees.js';
import {
  type BulkPayPayslipLine,
  type PayrollRunRow,
  type PayslipRow,
} from './payrollTypes.js';

async function enforcePayrollRunLock(
  client: pg.PoolClient,
  tenantId: string,
  runId: string,
  actorUserId?: string | null
): Promise<void> {
  await enforceLockForSave(client, tenantId, 'payroll', runId, actorUserId);
}

async function auditPayslipMutation(
  client: pg.PoolClient,
  tenantId: string,
  payslipId: string,
  action: 'create' | 'update' | 'delete',
  userId: string | null | undefined,
  prior?: PayslipRow | null,
  auditAction?: string
): Promise<void> {
  const repo = new PayslipRepository(tenantId);
  const row =
    action === 'delete'
      ? prior ?? (await repo.getByIdIncludingDeleted(client, payslipId))
      : await repo.getById(client, payslipId);
  if (!row && action !== 'delete') return;
  await recordDomainMutation(client, {
    tenantId,
    userId: userId ?? null,
    module: 'payroll',
    entityType: 'payslip',
    entityId: payslipId,
    action,
    auditAction,
    summary: auditAction ?? `Payslip ${payslipId} ${action}`,
    newValue: row && action !== 'delete' ? rowToPayslipApi(row) : undefined,
    oldValue: prior ? rowToPayslipApi(prior) : row && action === 'delete' ? rowToPayslipApi(row) : undefined,
  });
}

function summaryRowToInput(row: {
  working_days: string | number;
  present_days: string | number;
  leave_days: string | number;
  paid_leave_days: string | number;
  unpaid_leave_days: string | number;
  absent_days: string | number;
  half_days: string | number;
  lop_days: string | number;
}): PayrollAttendanceSummaryInput {
  return {
    working_days: numSummary(row.working_days),
    present_days: numSummary(row.present_days),
    leave_days: numSummary(row.leave_days),
    paid_leave_days: numSummary(row.paid_leave_days),
    unpaid_leave_days: numSummary(row.unpaid_leave_days),
    absent_days: numSummary(row.absent_days),
    half_days: numSummary(row.half_days),
    lop_days: numSummary(row.lop_days),
  };
}

export async function listPayrollRuns(
  client: pg.PoolClient,
  tenantId: string,
  scopeCtx?: DataScopeEnforcementContext
): Promise<PayrollRunRow[]> {
  return new PayrollRunRepository(tenantId).listActive(client, scopeCtx);
}

export async function getPayrollRun(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  scopeCtx?: DataScopeEnforcementContext
): Promise<PayrollRunRow | null> {
  return new PayrollRunRepository(tenantId).getById(client, id, scopeCtx);
}

export async function createPayrollRun(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>,
  userId: string | null
): Promise<PayrollRunRow> {
  const id = `pr_${randomUUID().replace(/-/g, '')}`;
  const month = String(body.month ?? '').trim();
  const year = Number(body.year ?? 0);
  if (!month || !year) throw new Error('month and year are required.');

  const bounds = payPeriodCalendarBounds(month, year);
  const period_start = bounds?.start ?? null;
  const period_end = bounds?.end ?? null;

  const runRepo = new PayrollRunRepository(tenantId);
  const priorRow = await runRepo.getByMonthYear(client, month, year);

  const row = await runRepo.upsertByPeriod(client, id, month, year, period_start, period_end, userId);
  await recordDomainMutation(client, {
    tenantId,
    userId,
    module: 'payroll',
    entityType: 'payroll_run',
    entityId: row.id,
    action: priorRow ? 'update' : 'create',
    summary: `Payroll run ${row.month} ${row.year} ${priorRow ? 'updated' : 'created'}`,
    newValue: rowToPayrollRunApi(row),
    oldValue: priorRow ? rowToPayrollRunApi(priorRow) : undefined,
  });
  return row;
}

/** Recompute total_amount, employee_count, and status from non-deleted payslips for a run. */
export async function recalculatePayrollRunAggregates(
  client: pg.PoolClient,
  tenantId: string,
  runId: string
): Promise<PayrollRunRow | null> {
  const run = await getPayrollRun(client, tenantId, runId);
  if (!run) return null;

  const agg = await new PayslipRepository(tenantId).aggregateForRunRecalc(client, runId);
  if (!agg) return null;

  const count = Number(agg.cnt);
  const totalAmt = numStr(agg.total_amt);
  const allPaid = agg.all_paid === true;
  let newStatus: string;
  if (count === 0) {
    newStatus = run.status === 'GENERATED' || run.status === 'APPROVED' || run.status === 'PROCESSING'
      ? run.status
      : 'DRAFT';
  } else if (allPaid) {
    newStatus = 'PAID';
  } else if (
    run.status === 'GENERATED' ||
    run.status === 'APPROVED' ||
    run.status === 'PROCESSING'
  ) {
    newStatus = run.status;
  } else {
    newStatus = 'DRAFT';
  }
  const paidAt = count > 0 && allPaid ? agg.max_paid_at : null;

  const updated = await new PayrollRunRepository(tenantId).applyAggregatesFromPayslips(client, runId, {
    total_amount: totalAmt,
    employee_count: count,
    status: newStatus,
    paid_at: paidAt,
  });
  if (
    updated &&
    (run.total_amount !== updated.total_amount ||
      run.employee_count !== updated.employee_count ||
      run.status !== updated.status ||
      String(run.paid_at ?? '') !== String(updated.paid_at ?? ''))
  ) {
    await recordDomainMutation(client, {
      tenantId,
      userId: updated.updated_by ?? updated.created_by,
      module: 'payroll',
      entityType: 'payroll_run',
      entityId: updated.id,
      action: 'update',
      summary: `Payroll run ${updated.month} ${updated.year} aggregates recalculated`,
      newValue: rowToPayrollRunApi(updated),
      oldValue: rowToPayrollRunApi(run),
    });
  }
  return updated;
}

export async function updatePayrollRun(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  body: Record<string, unknown>,
  actorUserId?: string | null
): Promise<PayrollRunRow | null> {
  await enforceLockForSave(client, tenantId, 'payroll', id, actorUserId);
  const prior = await getPayrollRun(client, tenantId, id);
  const status = body.status !== undefined ? String(body.status) : undefined;
  const total_amount =
    body.total_amount !== undefined || body.totalAmount !== undefined
      ? Number(body.total_amount ?? body.totalAmount)
      : undefined;
  const employee_count =
    body.employee_count !== undefined || body.employeeCount !== undefined
      ? Number(body.employee_count ?? body.employeeCount)
      : undefined;
  const touchPaidAt = 'paid_at' in body || 'paidAt' in body;
  const paid_at_raw = body.paid_at ?? body.paidAt;
  const paid_at_value: Date | null | undefined =
    !touchPaidAt
      ? undefined
      : paid_at_raw === null || paid_at_raw === ''
        ? null
        : new Date(String(paid_at_raw).slice(0, 10) + 'T12:00:00.000Z');

  const row = await new PayrollRunRepository(tenantId).updateFields(client, id, {
    status: status ?? null,
    total_amount: total_amount !== undefined && !Number.isNaN(total_amount) ? total_amount : null,
    employee_count: employee_count !== undefined && !Number.isNaN(employee_count) ? employee_count : null,
    touchPaidAt,
    paid_at: paid_at_value ?? null,
  });
  if (row) {
    await recordDomainMutation(client, {
      tenantId,
      userId: actorUserId ?? row.updated_by ?? row.created_by,
      module: 'payroll',
      entityType: 'payroll_run',
      entityId: row.id,
      action: 'update',
      summary: `Payroll run ${row.month} ${row.year} updated`,
      newValue: rowToPayrollRunApi(row),
      oldValue: prior ? rowToPayrollRunApi(prior) : undefined,
    });
  }
  return row;
}

export async function deletePayrollRun(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  actorUserId?: string | null
): Promise<boolean> {
  await enforcePayrollRunLock(client, tenantId, id, actorUserId);
  const prior = await getPayrollRun(client, tenantId, id);
  const payslipsToDelete = await listPayslipsByRun(client, tenantId, id);
  await new PayslipRepository(tenantId).markDeletedByRun(client, id);
  for (const ps of payslipsToDelete) {
    await auditPayslipMutation(client, tenantId, ps.id, 'delete', actorUserId, ps);
  }
  const ok = await new PayrollRunRepository(tenantId).markDeleted(client, id);
  if (ok && prior) {
    await recordDomainMutation(client, {
      tenantId,
      userId: actorUserId ?? prior.updated_by ?? prior.created_by,
      module: 'payroll',
      entityType: 'payroll_run',
      entityId: id,
      action: 'delete',
      summary: `Payroll run ${prior.month} ${prior.year} deleted`,
      oldValue: rowToPayrollRunApi(prior),
    });
  }
  return ok;
}

export async function listPayslipsByRun(
  client: pg.PoolClient,
  tenantId: string,
  runId: string,
  scopeCtx?: DataScopeEnforcementContext
): Promise<PayslipRow[]> {
  return new PayslipRepository(tenantId).listByRun(client, runId, scopeCtx);
}

export async function listPayslipsByEmployee(
  client: pg.PoolClient,
  tenantId: string,
  employeeId: string
): Promise<PayslipRow[]> {
  return new PayslipRepository(tenantId).listByEmployee(client, employeeId);
}

export async function getPayslip(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<PayslipRow | null> {
  return new PayslipRepository(tenantId).getById(client, id);
}

export async function processPayrollRun(
  client: pg.PoolClient,
  tenantId: string,
  runId: string,
  onlyEmployeeId?: string | null,
  actorUserId?: string | null
): Promise<{
  run: PayrollRunRow;
  processing_summary: {
    new_payslips_generated: number;
    existing_payslips_skipped: number;
    total_payslips: number;
    new_amount_added: number;
    previous_amount: number;
    total_amount: number;
  };
}> {
  const run = await getPayrollRun(client, tenantId, runId);
  if (!run) throw new Error('Payroll run not found.');
  assertPayrollRunStatusForPayslipGeneration(run.status);
  await enforcePayrollRunLock(client, tenantId, runId, actorUserId);

  const monthNum = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ].indexOf(run.month);
  const month1 = monthNum >= 0 ? monthNum + 1 : 1;

  const summaryMap = await new PayrollAttendanceSummaryRepository(tenantId).mapSummariesForPeriod(
    client,
    month1,
    run.year
  );

  const employees = await listEmployees(client, tenantId);
  const singleId = onlyEmployeeId?.trim() || null;
  if (singleId) {
    const found = employees.find((e) => e.id === singleId);
    if (!found) throw new Error('Employee not found.');
  }

  const existing = await listPayslipsByRun(client, tenantId, runId);
  const existingEmp = new Set(existing.map((p) => p.employee_id));

  let newCount = 0;
  let skipCount = 0;
  let newAmount = 0;
  const previousTotal = existing.reduce((s, p) => s + numStr(p.net_pay), 0);

  const touchedEmployeeIds = new Set<string>();

  const payslipRepo = new PayslipRepository(tenantId);
  const toInsert: PayslipBatchInsertRow[] = [];

  for (const emp of employees) {
    if (singleId && emp.id !== singleId) continue;

    if (existingEmp.has(emp.id)) {
      if (singleId) {
        throw new Error('This employee already has a payslip for this period.');
      }
      skipCount++;
      continue;
    }

    if (isPayrollPeriodBeforeJoiningDate(dateStr(emp.joining_date), run.year, month1)) {
      if (singleId) {
        throw new Error("This payroll period is before the employee's joining date.");
      }
      continue;
    }

    if (emp.status !== 'ACTIVE') {
      if (singleId) {
        throw new Error('Employee is not active.');
      }
      continue;
    }

    const summaryRow = summaryMap.get(emp.id);
    try {
      validateAttendanceSummaryForPayroll(
        summaryRow ? summaryRowToInput(summaryRow) : null,
        emp.id,
        true
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (singleId) throw new Error(msg);
      continue;
    }

    const computedFull = computeAttendanceAwarePayslip(
      employeeRowToLike(emp),
      run.year,
      month1,
      summaryRowToInput(summaryRow!)
    );
    const computed = {
      basic_pay: computedFull.basic_pay,
      total_allowances: computedFull.total_allowances,
      total_deductions: computedFull.total_deductions,
      total_adjustments: computedFull.total_adjustments,
      gross_pay: computedFull.gross_pay,
      net_pay: computedFull.net_pay,
      allowance_details: computedFull.allowance_details,
      deduction_details: computedFull.deduction_details,
      working_days: computedFull.working_days,
      present_days: computedFull.present_days,
      leave_days: computedFull.leave_days,
      paid_leave_days: computedFull.paid_leave_days,
      unpaid_leave_days: computedFull.unpaid_leave_days,
      absent_days: computedFull.absent_days,
      half_days: computedFull.half_days,
      lop_days: computedFull.lop_days,
      lop_deduction: computedFull.lop_deduction,
      adjusted_basic: computedFull.adjusted_basic,
      attendance_summary_snapshot: computedFull.attendance_summary_snapshot,
    };
    const assignmentSnapshot = JSON.stringify({
      projects: j(emp.projects, []),
      buildings: j(emp.buildings, []),
    });
    const adjustmentJson = JSON.stringify(j(emp.adjustments, []));

    const reviveId = await payslipRepo.findSoftDeletedId(client, runId, emp.id);
    if (reviveId) {
      await payslipRepo.reviveComputed(client, reviveId, computed, adjustmentJson, assignmentSnapshot);
      newCount++;
      newAmount += computed.net_pay;
      touchedEmployeeIds.add(emp.id);
      await auditPayslipMutation(client, tenantId, reviveId, 'create', actorUserId, null, 'payroll.payslip.generated');
      if (computed.lop_deduction > 0) {
        await auditPayslipMutation(client, tenantId, reviveId, 'update', actorUserId, null, 'payroll.lop.applied');
      }
      continue;
    }

    const psId = `ps_${randomUUID().replace(/-/g, '')}`;
    toInsert.push({
      id: psId,
      tenantId,
      runId,
      employeeId: emp.id,
      computed,
      adjustmentJson,
      assignmentSnapshot,
    });
    newCount++;
    newAmount += computed.net_pay;
    existingEmp.add(emp.id);
    touchedEmployeeIds.add(emp.id);
  }

  await payslipRepo.insertBatch(client, toInsert);
  for (const row of toInsert) {
    await auditPayslipMutation(client, tenantId, row.id, 'create', actorUserId, null, 'payroll.payslip.generated');
    if ((row.computed.lop_deduction ?? 0) > 0) {
      await auditPayslipMutation(client, tenantId, row.id, 'update', actorUserId, null, 'payroll.lop.applied');
    }
  }

  const sumQ = await payslipRepo.sumNetPayAndCount(client, runId);
  const totalAmt = numStr(sumQ?.total_amt ?? '0');
  const totalPayslips = Number(sumQ?.cnt ?? 0);

  const updated = await new PayrollRunRepository(tenantId).setTotals(client, runId, totalAmt, totalPayslips);
  if (!updated) throw new Error('Failed to update payroll run.');

  await recordDomainMutation(client, {
    tenantId,
    userId: actorUserId ?? updated.updated_by ?? updated.created_by,
    module: 'payroll',
    entityType: 'payroll_run',
    entityId: updated.id,
    action: 'update',
    summary: `Payroll run ${updated.month} ${updated.year} processed (${newCount} new payslip(s))`,
    newValue: rowToPayrollRunApi(updated),
    oldValue: rowToPayrollRunApi(run),
  });

  const { syncPayrollLedgerForEmployee } = await import('../payrollLedgerService.js');
  for (const eid of touchedEmployeeIds) {
    await syncPayrollLedgerForEmployee(client, tenantId, eid);
  }

  return {
    run: updated,
    processing_summary: {
      new_payslips_generated: newCount,
      existing_payslips_skipped: skipCount,
      total_payslips: totalPayslips,
      new_amount_added: newAmount,
      previous_amount: previousTotal,
      total_amount: totalAmt,
    },
  };
}

function payslipHasAttendanceSnapshot(row: PayslipRow): boolean {
  const snap = row.attendance_summary_snapshot;
  if (snap == null) return false;
  if (typeof snap === 'string') {
    const trimmed = snap.trim();
    if (!trimmed || trimmed === 'null') return false;
    try {
      const parsed = JSON.parse(trimmed);
      return parsed != null && typeof parsed === 'object';
    } catch {
      return false;
    }
  }
  return typeof snap === 'object';
}

function bodyFieldDiffers(body: Record<string, unknown>, keys: string[], stored: number): boolean {
  for (const key of keys) {
    if (!(key in body)) continue;
    const incoming = Number(body[key]);
    if (!Number.isFinite(incoming)) continue;
    if (Math.abs(incoming - stored) > 0.001) return true;
  }
  return false;
}

function assertAttendancePayslipEditAllowed(
  ps: PayslipRow,
  body: Record<string, unknown>,
  adminOverride: boolean
): void {
  if (!payslipHasAttendanceSnapshot(ps) || adminOverride) return;

  const storedBasic = Number(numStr(ps.basic_pay));
  if (bodyFieldDiffers(body, ['basic_pay', 'basicPay'], storedBasic)) {
    throw new Error(
      'Cannot edit basic pay on attendance-calculated payslips. Use adminOverride with payroll.write.'
    );
  }

  const scalarGuards: Array<{ keys: string[]; stored: number }> = [
    { keys: ['lop_days', 'lopDays'], stored: Number(numStr(ps.lop_days ?? '0')) },
    { keys: ['lop_deduction', 'lopDeduction'], stored: Number(numStr(ps.lop_deduction ?? '0')) },
    { keys: ['adjusted_basic', 'adjustedBasic'], stored: Number(numStr(ps.adjusted_basic ?? ps.basic_pay)) },
    { keys: ['working_days', 'workingDays'], stored: Number(numStr(ps.working_days ?? '0')) },
    { keys: ['present_days', 'presentDays'], stored: Number(numStr(ps.present_days ?? '0')) },
    { keys: ['leave_days', 'leaveDays'], stored: Number(numStr(ps.leave_days ?? '0')) },
    { keys: ['paid_leave_days', 'paidLeaveDays'], stored: Number(numStr(ps.paid_leave_days ?? '0')) },
    { keys: ['unpaid_leave_days', 'unpaidLeaveDays'], stored: Number(numStr(ps.unpaid_leave_days ?? '0')) },
    { keys: ['absent_days', 'absentDays'], stored: Number(numStr(ps.absent_days ?? '0')) },
    { keys: ['half_days', 'halfDays'], stored: Number(numStr(ps.half_days ?? '0')) },
  ];
  for (const { keys, stored } of scalarGuards) {
    if (bodyFieldDiffers(body, keys, stored)) {
      throw new Error(
        'Cannot edit attendance-derived payslip fields. Use adminOverride with payroll.write.'
      );
    }
  }

  if ('attendance_summary_snapshot' in body || 'attendanceSummarySnapshot' in body) {
    throw new Error(
      'Cannot edit attendance summary snapshot. Use adminOverride with payroll.write.'
    );
  }
}

export async function updatePayslipAmounts(
  client: pg.PoolClient,
  tenantId: string,
  payslipId: string,
  body: Record<string, unknown>,
  actorUserId?: string | null
): Promise<PayslipRow | null> {
  const ps = await getPayslip(client, tenantId, payslipId);
  if (!ps) return null;
  const run = await getPayrollRun(client, tenantId, ps.payroll_run_id);
  if (run) assertPayrollRunEditable(run.status);
  await enforcePayrollRunLock(client, tenantId, ps.payroll_run_id, actorUserId);

  const adminOverride = body.adminOverride === true || body.admin_override === true;
  assertAttendancePayslipEditAllowed(ps, body, adminOverride);

  const basic_pay = Number(body.basic_pay ?? body.basicPay ?? numStr(ps.basic_pay));
  const total_allowances = Number(body.total_allowances ?? body.totalAllowances ?? numStr(ps.total_allowances));
  const total_deductions = Number(body.total_deductions ?? body.totalDeductions ?? numStr(ps.total_deductions));
  const total_adjustments = Number(body.total_adjustments ?? body.totalAdjustments ?? numStr(ps.total_adjustments));
  const gross_pay = Number(body.gross_pay ?? body.grossPay ?? basic_pay + total_allowances);
  const net_pay = Number(body.net_pay ?? body.netPay ?? gross_pay - total_deductions + total_adjustments);
  const allowance_details = j(body.allowance_details ?? body.allowanceDetails, j(ps.allowance_details, []));
  const deduction_details = j(body.deduction_details ?? body.deductionDetails, j(ps.deduction_details, []));
  const adjustment_details = j(body.adjustment_details ?? body.adjustmentDetails, j(ps.adjustment_details, []));

  await new PayslipRepository(tenantId).updateAmounts(client, payslipId, {
    basic_pay,
    total_allowances,
    total_deductions,
    total_adjustments,
    gross_pay,
    net_pay,
    allowance_details,
    deduction_details,
    adjustment_details,
  });
  await recalculatePayrollRunAggregates(client, tenantId, ps.payroll_run_id);
  const updated = await getPayslip(client, tenantId, payslipId);
  if (updated) {
    await auditPayslipMutation(client, tenantId, payslipId, 'update', actorUserId, ps);
  }
  const empId = ps.employee_id;
  const { syncPayrollLedgerForEmployee } = await import('../payrollLedgerService.js');
  await syncPayrollLedgerForEmployee(client, tenantId, empId);
  return updated;
}

export async function softDeletePayslip(
  client: pg.PoolClient,
  tenantId: string,
  payslipId: string,
  actorUserId?: string | null
): Promise<boolean> {
  const ps = await getPayslip(client, tenantId, payslipId);
  if (!ps) return false;
  const run = await getPayrollRun(client, tenantId, ps.payroll_run_id);
  if (run) assertPayrollRunEditable(run.status);
  await enforcePayrollRunLock(client, tenantId, ps.payroll_run_id, actorUserId);
  const runId = ps.payroll_run_id;
  const deleted = await new PayslipRepository(tenantId).markDeleted(client, payslipId);
  if (!deleted) return false;
  await auditPayslipMutation(client, tenantId, payslipId, 'delete', actorUserId, ps);
  await recalculatePayrollRunAggregates(client, tenantId, runId);
  const { syncPayrollLedgerForEmployee } = await import('../payrollLedgerService.js');
  await syncPayrollLedgerForEmployee(client, tenantId, ps.employee_id);
  return true;
}

export async function payPayslip(
  client: pg.PoolClient,
  tenantId: string,
  payslipId: string,
  body: Record<string, unknown>,
  userId: string | null,
  options?: {
    skipRecalculate?: boolean;
    expenseCashBatchCtx?: ExpenseCashValidationBatchContext;
  }
): Promise<{ payslip: PayslipRow; transaction: ReturnType<typeof rowToTransactionApi> }> {
  const ps = await getPayslip(client, tenantId, payslipId);
  if (!ps) throw new Error('Payslip not found.');
  const run = await getPayrollRun(client, tenantId, ps.payroll_run_id);
  if (!run) throw new Error('Payroll run not found.');
  assertPayrollRunStatusForPayment(run.status);
  await enforcePayrollRunLock(client, tenantId, ps.payroll_run_id, userId);
  const payAmt = Number(body.amount) || numStr(ps.net_pay);
  if (!(payAmt > 0) || Number.isNaN(payAmt)) throw new Error('Payment amount must be greater than zero.');
  const accountId = String(body.accountId ?? body.account_id ?? '').trim();
  if (!accountId) throw new Error('accountId is required.');
  const categoryId = optStr(body.categoryId ?? body.category_id);
  const projectId = optStr(body.projectId ?? body.project_id);
  const buildingId = optStr(body.buildingId ?? body.building_id);
  const description = String(body.description ?? `Payroll payment`).trim();

  const paymentDateStr =
    body.date != null && String(body.date).trim()
      ? String(body.date).slice(0, 10)
      : todayUtcYyyyMmDd();

  const txBody: Record<string, unknown> = {
    type: 'Expense',
    amount: payAmt,
    date: paymentDateStr,
    description,
    accountId,
    categoryId: categoryId ?? undefined,
    projectId: projectId ?? undefined,
    buildingId: buildingId ?? undefined,
    payslipId: payslipId,
  };

  const tx = await createTransaction(
    client,
    tenantId,
    txBody,
    userId,
    { expenseCashBatchCtx: options?.expenseCashBatchCtx ?? null }
  );

  const row = await getPayslip(client, tenantId, payslipId);
  if (!row) throw new Error('Failed to load payslip after payment.');
  await auditPayslipMutation(client, tenantId, payslipId, 'update', userId, ps);
  if (!options?.skipRecalculate) {
    await recalculatePayrollRunAggregates(client, tenantId, ps.payroll_run_id);
  }
  return { payslip: row, transaction: rowToTransactionApi(tx) };
}

/** Pay many payslip lines in one DB transaction; one aggregate recalc per affected payroll run. */
export async function payBulkPayslips(
  client: pg.PoolClient,
  tenantId: string,
  lines: BulkPayPayslipLine[],
  userId: string | null
): Promise<{
  results: Array<{ payslip: PayslipRow; transaction: ReturnType<typeof rowToTransactionApi> }>;
}> {
  if (lines.length === 0) return { results: [] };
  const expenseCtx = new ExpenseCashValidationBatchContext(client, tenantId);
  const results: Array<{ payslip: PayslipRow; transaction: ReturnType<typeof rowToTransactionApi> }> = [];
  const runIds = new Set<string>();
  for (const line of lines) {
    const ps = await getPayslip(client, tenantId, line.payslipId);
    if (ps) runIds.add(ps.payroll_run_id);
  }
  for (const rid of runIds) {
    await enforcePayrollRunLock(client, tenantId, rid, userId);
    const run = await getPayrollRun(client, tenantId, rid);
    if (run) assertPayrollRunStatusForPayment(run.status);
  }
  for (const line of lines) {
    const body: Record<string, unknown> = {
      accountId: line.accountId,
      categoryId: line.categoryId,
      projectId: line.projectId,
      buildingId: line.buildingId,
      amount: line.amount,
      description: line.description,
      date: line.date,
    };
    const r = await payPayslip(client, tenantId, line.payslipId, body, userId, {
      skipRecalculate: true,
      expenseCashBatchCtx: expenseCtx,
    });
    results.push(r);
    runIds.add(r.payslip.payroll_run_id);
  }
  for (const rid of runIds) {
    await recalculatePayrollRunAggregates(client, tenantId, rid);
  }
  return { results };
}
