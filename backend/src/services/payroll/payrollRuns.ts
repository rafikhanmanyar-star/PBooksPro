import type pg from 'pg';
import { randomUUID } from 'crypto';
import { recordDomainMutation } from '../../core/recordDomainMutation.js';
import { PayrollRunRepository } from '../../modules/payroll/repositories/PayrollRunRepository.js';
import { PayslipRepository, type PayslipBatchInsertRow } from '../../modules/payroll/repositories/PayslipRepository.js';
import {
  computeMonthlyPayslip,
  isPayrollPeriodBeforeJoiningDate,
} from '../../payroll/salaryComputation.js';
import { todayUtcYyyyMmDd } from '../../utils/dateOnly.js';
import { payPeriodCalendarBounds } from '../../utils/payrollPeriod.js';
import { ExpenseCashValidationBatchContext } from '../../financial/expenseCashValidation.js';
import { createTransaction, rowToTransactionApi } from '../transactionsService.js';
import { enforceLockForSave } from '../recordLocksService.js';
import { dateStr, j, numStr, optStr } from './payrollHelpers.js';
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
  prior?: PayslipRow | null
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
    summary: `Payslip ${payslipId} ${action}`,
    newValue: row && action !== 'delete' ? rowToPayslipApi(row) : undefined,
    oldValue: prior ? rowToPayslipApi(prior) : row && action === 'delete' ? rowToPayslipApi(row) : undefined,
  });
}

export async function listPayrollRuns(client: pg.PoolClient, tenantId: string): Promise<PayrollRunRow[]> {
  return new PayrollRunRepository(tenantId).listActive(client);
}

export async function getPayrollRun(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<PayrollRunRow | null> {
  return new PayrollRunRepository(tenantId).getById(client, id);
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
  const newStatus = count === 0 ? 'DRAFT' : allPaid ? 'PAID' : 'DRAFT';
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
  runId: string
): Promise<PayslipRow[]> {
  return new PayslipRepository(tenantId).listByRun(client, runId);
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

    const computed = computeMonthlyPayslip(employeeRowToLike(emp), run.year, month1);
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
      await auditPayslipMutation(client, tenantId, reviveId, 'create', actorUserId);
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
    await auditPayslipMutation(client, tenantId, row.id, 'create', actorUserId);
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

export async function updatePayslipAmounts(
  client: pg.PoolClient,
  tenantId: string,
  payslipId: string,
  body: Record<string, unknown>,
  actorUserId?: string | null
): Promise<PayslipRow | null> {
  const ps = await getPayslip(client, tenantId, payslipId);
  if (!ps) return null;
  await enforcePayrollRunLock(client, tenantId, ps.payroll_run_id, actorUserId);
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
