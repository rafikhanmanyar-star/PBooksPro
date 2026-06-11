import type pg from 'pg';
import { randomUUID } from 'crypto';
import { recordDomainMutation } from '../../core/recordDomainMutation.js';
import { PayrollRunRepository } from '../../modules/payroll/repositories/PayrollRunRepository.js';
import { PayslipRepository } from '../../modules/payroll/repositories/PayslipRepository.js';
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

  const prior = await client.query<PayrollRunRow>(
    `SELECT id, tenant_id, month, year, period_start, period_end, status, total_amount::text, employee_count,
            created_by, updated_by, approved_by, approved_at, paid_at, deleted_at, created_at, updated_at
     FROM payroll_runs WHERE tenant_id = $1 AND month = $2 AND year = $3`,
    [tenantId, month, year]
  );
  const priorRow = prior.rows[0] ?? null;

  // If this period was soft-deleted, ON CONFLICT must revive the row; otherwise getPayrollRun(process) sees "not found".
  const r = await client.query<PayrollRunRow>(
    `INSERT INTO payroll_runs (id, tenant_id, month, year, period_start, period_end, status, total_amount, employee_count, created_by, updated_by, deleted_at, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,'DRAFT',0,0,$7,$8,NULL,NOW(),NOW())
     ON CONFLICT (tenant_id, month, year) DO UPDATE SET
       deleted_at = CASE WHEN payroll_runs.deleted_at IS NOT NULL THEN NULL ELSE payroll_runs.deleted_at END,
       status = CASE WHEN payroll_runs.deleted_at IS NOT NULL THEN 'DRAFT' ELSE payroll_runs.status END,
       total_amount = CASE WHEN payroll_runs.deleted_at IS NOT NULL THEN 0 ELSE payroll_runs.total_amount END,
       employee_count = CASE WHEN payroll_runs.deleted_at IS NOT NULL THEN 0 ELSE payroll_runs.employee_count END,
       paid_at = CASE WHEN payroll_runs.deleted_at IS NOT NULL THEN NULL ELSE payroll_runs.paid_at END,
       period_start = COALESCE(payroll_runs.period_start, EXCLUDED.period_start),
       period_end = COALESCE(payroll_runs.period_end, EXCLUDED.period_end),
       updated_at = NOW()
     RETURNING id, tenant_id, month, year, period_start, period_end, status, total_amount::text, employee_count,
               created_by, updated_by, approved_by, approved_at, paid_at, deleted_at, created_at, updated_at`,
    [id, tenantId, month, year, period_start, period_end, userId, userId]
  );
  const row = r.rows[0];
  if (!row) throw new Error('Could not create payroll run.');
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

  const agg = await client.query<{
    cnt: string;
    total_amt: string;
    all_paid: boolean | null;
    max_paid_at: Date | null;
  }>(
    `SELECT
       COUNT(*)::int AS cnt,
       COALESCE(SUM(net_pay::numeric), 0)::text AS total_amt,
       CASE
         WHEN COUNT(*) = 0 THEN NULL
         ELSE BOOL_AND(
           is_paid OR COALESCE(paid_amount::numeric, 0) >= net_pay::numeric - 0.01
         )
       END AS all_paid,
       MAX(paid_at) FILTER (WHERE paid_at IS NOT NULL) AS max_paid_at
     FROM payslips
     WHERE tenant_id = $1 AND payroll_run_id = $2 AND deleted_at IS NULL`,
    [tenantId, runId]
  );
  const row = agg.rows[0];
  if (!row) return null;

  const count = Number(row.cnt);
  const totalAmt = numStr(row.total_amt);
  const allPaid = row.all_paid === true;
  const newStatus = count === 0 ? 'DRAFT' : allPaid ? 'PAID' : 'DRAFT';
  const paidAt = count > 0 && allPaid ? row.max_paid_at : null;

  const u = await client.query<PayrollRunRow>(
    `UPDATE payroll_runs SET
       total_amount = $3,
       employee_count = $4,
       status = $5::text,
       paid_at = $6,
       updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     RETURNING id, tenant_id, month, year, period_start, period_end, status, total_amount::text, employee_count,
               created_by, updated_by, approved_by, approved_at, paid_at, deleted_at, created_at, updated_at`,
    [runId, tenantId, totalAmt, count, newStatus, paidAt]
  );
  const updated = u.rows[0] ?? null;
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

  const u = await client.query<PayrollRunRow>(
    `UPDATE payroll_runs SET
       status = COALESCE($3::text, status),
       total_amount = COALESCE($4::numeric, total_amount),
       employee_count = COALESCE($5::int, employee_count),
       paid_at = CASE WHEN $6::boolean THEN $7::timestamptz ELSE paid_at END,
       updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     RETURNING id, tenant_id, month, year, period_start, period_end, status, total_amount::text, employee_count,
               created_by, updated_by, approved_by, approved_at, paid_at, deleted_at, created_at, updated_at`,
    [
      id,
      tenantId,
      status ?? null,
      total_amount !== undefined && !Number.isNaN(total_amount) ? total_amount : null,
      employee_count !== undefined && !Number.isNaN(employee_count) ? employee_count : null,
      touchPaidAt,
      paid_at_value ?? null,
    ]
  );
  const row = u.rows[0] ?? null;
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
  await client.query(
    `UPDATE payslips SET deleted_at = NOW(), updated_at = NOW() WHERE payroll_run_id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, tenantId]
  );
  for (const ps of payslipsToDelete) {
    await auditPayslipMutation(client, tenantId, ps.id, 'delete', actorUserId, ps);
  }
  const u = await client.query(`UPDATE payroll_runs SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`, [
    id,
    tenantId,
  ]);
  const ok = (u.rowCount ?? 0) > 0;
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

const PAYSIP_BATCH_ROWS = 50;

type PayslipInsertRow = {
  id: string;
  tenantId: string;
  runId: string;
  employeeId: string;
  computed: ReturnType<typeof computeMonthlyPayslip>;
  adjustmentJson: string;
  assignmentSnapshot: string;
};

function buildPayslipBatchInsert(slice: PayslipInsertRow[]): { sql: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  for (const r of slice) {
    parts.push(
      `($${i},$${i + 1},$${i + 2},$${i + 3},$${i + 4},$${i + 5},$${i + 6},$${i + 7},$${i + 8},$${i + 9},$${i + 10}::jsonb,$${i + 11}::jsonb,$${i + 12}::jsonb,$${i + 13}::jsonb,false,0,NULL,NOW(),NOW())`
    );
    params.push(
      r.id,
      r.tenantId,
      r.runId,
      r.employeeId,
      r.computed.basic_pay,
      r.computed.total_allowances,
      r.computed.total_deductions,
      r.computed.total_adjustments,
      r.computed.gross_pay,
      r.computed.net_pay,
      JSON.stringify(r.computed.allowance_details),
      JSON.stringify(r.computed.deduction_details),
      r.adjustmentJson,
      r.assignmentSnapshot
    );
    i += 14;
  }
  return {
    sql: `INSERT INTO payslips (
         id, tenant_id, payroll_run_id, employee_id, basic_pay, total_allowances, total_deductions, total_adjustments,
         gross_pay, net_pay, allowance_details, deduction_details, adjustment_details, assignment_snapshot, is_paid, paid_amount, deleted_at, created_at, updated_at
       ) VALUES ${parts.join(',')}`,
    params,
  };
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

  const toInsert: PayslipInsertRow[] = [];

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

    const softDel = await client.query<{ id: string }>(
      `SELECT id FROM payslips
       WHERE tenant_id = $1 AND payroll_run_id = $2 AND employee_id = $3 AND deleted_at IS NOT NULL
       LIMIT 1`,
      [tenantId, runId, emp.id]
    );
    if (softDel.rows[0]) {
      const reviveId = softDel.rows[0].id;
      await client.query(
        `UPDATE payslips SET
          basic_pay = $1, total_allowances = $2, total_deductions = $3, total_adjustments = $4,
          gross_pay = $5, net_pay = $6,
          allowance_details = $7::jsonb, deduction_details = $8::jsonb, adjustment_details = $9::jsonb,
          assignment_snapshot = $10::jsonb,
          is_paid = false, paid_amount = 0, paid_at = NULL, transaction_id = NULL,
          deleted_at = NULL, updated_at = NOW()
        WHERE id = $11 AND tenant_id = $12`,
        [
          computed.basic_pay,
          computed.total_allowances,
          computed.total_deductions,
          computed.total_adjustments,
          computed.gross_pay,
          computed.net_pay,
          JSON.stringify(computed.allowance_details),
          JSON.stringify(computed.deduction_details),
          adjustmentJson,
          assignmentSnapshot,
          reviveId,
          tenantId,
        ]
      );
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

  for (let c = 0; c < toInsert.length; c += PAYSIP_BATCH_ROWS) {
    const slice = toInsert.slice(c, c + PAYSIP_BATCH_ROWS);
    const { sql, params } = buildPayslipBatchInsert(slice);
    await client.query(sql, params);
    for (const row of slice) {
      await auditPayslipMutation(client, tenantId, row.id, 'create', actorUserId);
    }
  }

  const sumQ = await client.query<{ total_amt: string; cnt: string }>(
    `SELECT COALESCE(SUM(net_pay::numeric), 0)::text AS total_amt, COUNT(*)::int AS cnt
     FROM payslips WHERE tenant_id = $1 AND payroll_run_id = $2 AND deleted_at IS NULL`,
    [tenantId, runId]
  );
  const totalAmt = numStr(sumQ.rows[0]?.total_amt ?? '0');
  const totalPayslips = Number(sumQ.rows[0]?.cnt ?? 0);

  const u = await client.query<PayrollRunRow>(
    `UPDATE payroll_runs SET total_amount = $3, employee_count = $4, updated_at = NOW() WHERE id = $1 AND tenant_id = $2
     RETURNING id, tenant_id, month, year, period_start, period_end, status, total_amount::text, employee_count,
               created_by, updated_by, approved_by, approved_at, paid_at, deleted_at, created_at, updated_at`,
    [runId, tenantId, totalAmt, totalPayslips]
  );
  const updated = u.rows[0];
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

  await client.query(
    `UPDATE payslips SET
       basic_pay = $3, total_allowances = $4, total_deductions = $5, total_adjustments = $6,
       gross_pay = $7, net_pay = $8,
       allowance_details = $9::jsonb, deduction_details = $10::jsonb, adjustment_details = $11::jsonb,
       updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [
      payslipId,
      tenantId,
      basic_pay,
      total_allowances,
      total_deductions,
      total_adjustments,
      gross_pay,
      net_pay,
      JSON.stringify(allowance_details),
      JSON.stringify(deduction_details),
      JSON.stringify(adjustment_details),
    ]
  );
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
  const u = await client.query(
    `UPDATE payslips SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [payslipId, tenantId]
  );
  if ((u.rowCount ?? 0) === 0) return false;
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
