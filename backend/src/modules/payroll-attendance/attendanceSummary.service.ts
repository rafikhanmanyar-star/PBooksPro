import type pg from 'pg';
import { recordDomainMutation } from '../../core/recordDomainMutation.js';
import type { DataScopeEnforcementContext } from '../../auth/tenantRepositoryScope.js';
import { PayrollRunRepository } from '../payroll/repositories/PayrollRunRepository.js';
import { PayslipRepository } from '../payroll/repositories/PayslipRepository.js';
import { rowToPayrollRunApi } from '../payroll/services/payroll/payrollRowMappers.js';
import { numStr } from '../payroll/services/payroll/payrollHelpers.js';
import { buildAttendanceSummary, countWorkingDaysInMonth, monthDateBounds } from '../../payroll-core/attendanceCalculator.js';
import { projectPayrollImpactFromSummary } from '../../payroll-core/payrollCalculator.js';
import { DEFAULT_WORK_WEEK } from '../../payroll-core/payrollTypes.js';
import { employeeRowToLike, listEmployees } from '../payroll/services/payroll/payrollEmployees.js';
import { isPayrollPeriodBeforeJoiningDate } from '../../payroll/salaryComputation.js';
import { dateStr } from '../payroll/services/payroll/payrollHelpers.js';
import { getTenantConfig } from '../payroll/services/payroll/payrollConfig.js';
import {
  ensurePayrollRunAccrualJournal,
  resolvePayrollRunAccrualAmount,
  reversePayrollRunAccrualJournal,
} from '../payroll/services/payroll/payrollJournalPostingService.js';
import {
  PayrollAttendanceSummaryRepository,
  newSummaryId,
  num,
} from './attendanceSummary.repository.js';
import type {
  PayrollAttendanceSummaryApi,
  PayrollAttendanceSummaryListFilters,
  PayrollAttendanceSummaryWithEmployee,
  PayrollRunLifecycleStatus,
  WorkWeekConfigApi,
} from './attendanceSummary.types.js';

export class PayrollAttendanceSummaryError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'PayrollAttendanceSummaryError';
  }
}

const MONTH_NAMES = [
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
];

export function monthNameFromNumber(month: number): string {
  return MONTH_NAMES[month - 1] ?? 'January';
}

export function monthNumberFromName(name: string): number {
  const idx = MONTH_NAMES.indexOf(name);
  return idx >= 0 ? idx + 1 : 1;
}

async function periodHasPayslips(
  client: pg.PoolClient,
  tenantId: string,
  monthLabel: string,
  payrollYear: number
): Promise<boolean> {
  const { rows } = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM payslips ps
       INNER JOIN payroll_runs pr ON pr.id = ps.payroll_run_id AND pr.tenant_id = ps.tenant_id
       WHERE ps.tenant_id = $1 AND pr.month = $2 AND pr.year = $3 AND ps.deleted_at IS NULL
     ) AS exists`,
    [tenantId, monthLabel, payrollYear]
  );
  return rows[0]?.exists === true;
}

function rowToSummaryApi(row: PayrollAttendanceSummaryWithEmployee): PayrollAttendanceSummaryApi {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    employee_id: row.employee_id,
    payroll_month: row.payroll_month,
    payroll_year: row.payroll_year,
    working_days: num(row.working_days),
    present_days: num(row.present_days),
    leave_days: num(row.leave_days),
    paid_leave_days: num(row.paid_leave_days),
    unpaid_leave_days: num(row.unpaid_leave_days),
    absent_days: num(row.absent_days),
    half_days: num(row.half_days),
    late_days: num(row.late_days),
    lop_days: num(row.lop_days),
    employee_name: row.employee_name,
    employee_code: row.employee_code ?? undefined,
    department: row.department,
    department_id: row.department_id ?? undefined,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

async function auditSummaryEvent(
  client: pg.PoolClient,
  tenantId: string,
  auditAction: string,
  userId: string | null | undefined,
  payload: Record<string, unknown>
): Promise<void> {
  await recordDomainMutation(client, {
    tenantId,
    userId: userId ?? null,
    module: 'payroll',
    entityType: 'payroll_summary',
    entityId: String(payload.periodKey ?? 'batch'),
    action: 'update',
    auditAction,
    summary: auditAction,
    newValue: payload,
  });
}

async function auditRunLifecycle(
  client: pg.PoolClient,
  tenantId: string,
  runId: string,
  auditAction: string,
  userId: string | null | undefined,
  prior: unknown,
  row: unknown
): Promise<void> {
  await recordDomainMutation(client, {
    tenantId,
    userId: userId ?? null,
    module: 'payroll',
    entityType: 'payroll_run',
    entityId: runId,
    action: 'update',
    auditAction,
    summary: auditAction,
    oldValue: prior,
    newValue: row,
  });
}

function assertRunEditable(status: string): void {
  if (status === 'APPROVED' || status === 'PAID') {
    throw new PayrollAttendanceSummaryError('FORBIDDEN', 'Payroll run is locked in the current status.');
  }
}

function assertRunApprovable(status: string): void {
  if (status !== 'GENERATED') {
    throw new PayrollAttendanceSummaryError('VALIDATION_ERROR', 'Only GENERATED payroll runs can be approved.');
  }
}

function assertRunUnapprovable(status: string): void {
  if (status !== 'APPROVED') {
    throw new PayrollAttendanceSummaryError('VALIDATION_ERROR', 'Only APPROVED payroll runs can be unapproved.');
  }
}

export async function getWorkWeekConfig(
  client: pg.PoolClient,
  tenantId: string
): Promise<WorkWeekConfigApi> {
  return new PayrollAttendanceSummaryRepository(tenantId).getWorkWeek(client);
}

export async function updateWorkWeekConfig(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>,
  userId: string | null
): Promise<WorkWeekConfigApi> {
  const workingDays = (body.working_days ?? body.workingDays) as number[] | undefined;
  const weekendDays = (body.weekend_days ?? body.weekendDays) as number[] | undefined;
  if (!Array.isArray(workingDays) || workingDays.length === 0) {
    throw new PayrollAttendanceSummaryError('VALIDATION_ERROR', 'working_days is required.');
  }
  const workWeek = {
    working_days: workingDays.map(Number),
    weekend_days: Array.isArray(weekendDays) ? weekendDays.map(Number) : DEFAULT_WORK_WEEK.weekend_days,
  };
  await new PayrollAttendanceSummaryRepository(tenantId).updateWorkWeek(client, workWeek);
  await recordDomainMutation(client, {
    tenantId,
    userId,
    module: 'payroll',
    entityType: 'payroll_settings',
    entityId: tenantId,
    action: 'update',
    auditAction: 'payroll.work_week.updated',
    summary: 'Payroll work week updated',
    newValue: workWeek,
  });
  return workWeek;
}

export async function previewAttendanceSummaries(
  client: pg.PoolClient,
  tenantId: string,
  payrollMonth: number,
  payrollYear: number,
  scopeCtx?: DataScopeEnforcementContext
): Promise<PayrollAttendanceSummaryApi[]> {
  const repo = new PayrollAttendanceSummaryRepository(tenantId);
  const workWeek = await repo.getWorkWeek(client);
  const workingDays = countWorkingDaysInMonth(payrollYear, payrollMonth, workWeek);
  const { start, end } = monthDateBounds(payrollYear, payrollMonth);
  const aggregated = await repo.aggregateAttendanceForPeriod(client, start, end, scopeCtx);

  return aggregated.map((row) => {
    const present = num(row.present_cnt);
    const late = num(row.late_cnt);
    const paidLeave = num(row.paid_leave_cnt);
    const unpaidLeave = num(row.unpaid_leave_cnt);
    const summary = buildAttendanceSummary(
      {
        present,
        absent: num(row.absent_cnt),
        leaveTotal: paidLeave + unpaidLeave,
        paidLeave,
        unpaidLeave,
        halfDay: num(row.half_day_cnt),
        late,
      },
      workingDays
    );
    return {
      id: `preview-${row.employee_id}`,
      tenant_id: tenantId,
      employee_id: row.employee_id,
      payroll_month: payrollMonth,
      payroll_year: payrollYear,
      working_days: summary.workingDays,
      present_days: summary.presentDays,
      leave_days: summary.leaveDays,
      paid_leave_days: summary.paidLeaveDays,
      unpaid_leave_days: summary.unpaidLeaveDays,
      absent_days: summary.absentDays,
      half_days: summary.halfDays,
      late_days: summary.lateDays,
      lop_days: summary.lopDays,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  });
}

export async function generateAttendanceSummaries(
  client: pg.PoolClient,
  tenantId: string,
  payrollMonth: number,
  payrollYear: number,
  userId: string | null,
  scopeCtx?: DataScopeEnforcementContext,
  runId?: string | null,
  options?: { forceOverride?: boolean }
): Promise<{ summaries: PayrollAttendanceSummaryApi[]; count: number; runId?: string }> {
  const forceOverride = options?.forceOverride === true;
  const monthLabel = monthNameFromNumber(payrollMonth);
  const payslipExists = await periodHasPayslips(client, tenantId, monthLabel, payrollYear);
  if (payslipExists && !forceOverride) {
    throw new PayrollAttendanceSummaryError(
      'CONFLICT',
      'Payslips already exist for this period. Regenerating summaries would leave stale payslips. Reprocess payslips after override, or use admin forceOverride.'
    );
  }

  const repo = new PayrollAttendanceSummaryRepository(tenantId);
  const workWeek = await repo.getWorkWeek(client);
  const workingDays = countWorkingDaysInMonth(payrollYear, payrollMonth, workWeek);
  const { start, end } = monthDateBounds(payrollYear, payrollMonth);
  const aggregated = await repo.aggregateAttendanceForPeriod(client, start, end, scopeCtx);

  const toUpsert = aggregated.map((row) => {
    const present = num(row.present_cnt);
    const late = num(row.late_cnt);
    const paidLeave = num(row.paid_leave_cnt);
    const unpaidLeave = num(row.unpaid_leave_cnt);
    const summary = buildAttendanceSummary(
      {
        present,
        absent: num(row.absent_cnt),
        leaveTotal: paidLeave + unpaidLeave,
        paidLeave,
        unpaidLeave,
        halfDay: num(row.half_day_cnt),
        late,
      },
      workingDays
    );
    return {
      id: newSummaryId(),
      tenant_id: tenantId,
      employee_id: row.employee_id,
      payroll_month: payrollMonth,
      payroll_year: payrollYear,
      working_days: summary.workingDays,
      present_days: summary.presentDays,
      leave_days: summary.leaveDays,
      paid_leave_days: summary.paidLeaveDays,
      unpaid_leave_days: summary.unpaidLeaveDays,
      absent_days: summary.absentDays,
      half_days: summary.halfDays,
      late_days: summary.lateDays,
      lop_days: summary.lopDays,
    };
  });

  await repo.batchUpsertSummaries(client, toUpsert);

  let linkedRunId = runId ?? undefined;
  if (runId) {
    const runRepo = new PayrollRunRepository(tenantId);
    const run = await runRepo.getById(client, runId);
    if (!run) throw new PayrollAttendanceSummaryError('NOT_FOUND', 'Payroll run not found.');
    assertRunEditable(run.status);
    await runRepo.updateFields(client, runId, { status: 'GENERATED' });
    linkedRunId = runId;
  }

  await auditSummaryEvent(client, tenantId, 'payroll.summary.generated', userId, {
    periodKey: `${payrollYear}-${payrollMonth}`,
    payrollMonth,
    payrollYear,
    count: toUpsert.length,
    runId: linkedRunId ?? null,
  });

  if (linkedRunId) {
    const { recordPayrollAudit } = await import('../payroll/services/payroll/payrollAuditService.js');
    const { PAYROLL_AUDIT_ACTIONS } = await import('../payroll/services/payroll/payrollAuditCatalog.js');
    await recordPayrollAudit(client, {
      tenantId,
      userId,
      entityType: 'payroll_run',
      entityId: linkedRunId,
      auditAction: PAYROLL_AUDIT_ACTIONS.RUN_GENERATED,
      newValue: { payrollMonth, payrollYear, summaryCount: toUpsert.length },
    });
  }

  const { rows } = await repo.listSummaries(
    client,
    { payrollMonth, payrollYear, page: 1, limit: 500 },
    scopeCtx
  );
  return { summaries: rows.map(rowToSummaryApi), count: toUpsert.length, runId: linkedRunId };
}

export async function listStoredAttendanceSummaries(
  client: pg.PoolClient,
  tenantId: string,
  filters: PayrollAttendanceSummaryListFilters,
  scopeCtx?: DataScopeEnforcementContext
): Promise<{ items: PayrollAttendanceSummaryApi[]; total: number; page: number; limit: number }> {
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 500;
  const { rows, total } = await new PayrollAttendanceSummaryRepository(tenantId).listSummaries(
    client,
    { ...filters, page, limit },
    scopeCtx
  );
  return { items: rows.map(rowToSummaryApi), total, page, limit };
}

export async function previewPayrollImpact(
  client: pg.PoolClient,
  tenantId: string,
  payrollMonth: number,
  payrollYear: number,
  scopeCtx?: DataScopeEnforcementContext
): Promise<
  {
    employee_id: string;
    employee_name?: string;
    gross_pay: number;
    lop_days: number;
    working_days: number;
    projected_deduction: number;
    projected_net_after_lop: number;
  }[]
> {
  const previews = await previewAttendanceSummaries(client, tenantId, payrollMonth, payrollYear, scopeCtx);
  const employees = await listEmployees(client, tenantId, scopeCtx);
  const byId = new Map(employees.map((e) => [e.id, e]));
  const out: {
    employee_id: string;
    employee_name?: string;
    gross_pay: number;
    lop_days: number;
    working_days: number;
    projected_deduction: number;
    projected_net_after_lop: number;
  }[] = [];

  for (const s of previews) {
    const emp = byId.get(s.employee_id);
    if (!emp) continue;
    const summaryInput = {
      working_days: s.working_days,
      present_days: s.present_days,
      leave_days: s.leave_days,
      paid_leave_days: s.paid_leave_days,
      unpaid_leave_days: s.unpaid_leave_days,
      absent_days: s.absent_days,
      half_days: s.half_days,
      lop_days: s.lop_days,
    };
    const impact = projectPayrollImpactFromSummary(employeeRowToLike(emp), payrollYear, payrollMonth, summaryInput);
    out.push({
      employee_id: s.employee_id,
      employee_name: emp.name,
      gross_pay: impact.gross_pay,
      lop_days: impact.lop_days,
      working_days: impact.working_days,
      projected_deduction: impact.lop_deduction,
      projected_net_after_lop: impact.projected_net,
    });
  }
  return out;
}

export async function approvePayrollRunLifecycle(
  client: pg.PoolClient,
  tenantId: string,
  runId: string,
  userId: string | null,
  scopeCtx?: DataScopeEnforcementContext
): Promise<{ run: ReturnType<typeof rowToPayrollRunApi> }> {
  const runRepo = new PayrollRunRepository(tenantId);
  const prior = await runRepo.getById(client, runId, scopeCtx);
  if (!prior) throw new PayrollAttendanceSummaryError('NOT_FOUND', 'Payroll run not found.');
  assertRunApprovable(prior.status);

  // SoD: payroll run creator cannot approve their own run
  if (userId && prior.created_by && prior.created_by === userId) {
    throw new PayrollAttendanceSummaryError(
      'FORBIDDEN',
      'Segregation of duties: the user who created this payroll run cannot approve it.'
    );
  }

  const payrollMonth = monthNumberFromName(prior.month);
  const summaryRepo = new PayrollAttendanceSummaryRepository(tenantId);
  const summaryMap = await summaryRepo.mapSummariesForPeriod(client, payrollMonth, prior.year);
  if (summaryMap.size === 0) {
    throw new PayrollAttendanceSummaryError(
      'VALIDATION_ERROR',
      'Cannot approve: attendance summaries have not been generated for this period.'
    );
  }

  const employees = await listEmployees(client, tenantId, scopeCtx);
  const eligible = employees.filter(
    (e) =>
      e.status === 'ACTIVE' &&
      !isPayrollPeriodBeforeJoiningDate(dateStr(e.joining_date), prior.year, payrollMonth)
  );
  const missing = eligible.filter((e) => !summaryMap.has(e.id));
  if (missing.length > 0) {
    throw new PayrollAttendanceSummaryError(
      'VALIDATION_ERROR',
      `Cannot approve: attendance summaries missing for ${missing.length} active employee(s).`
    );
  }

  for (const e of eligible) {
    const row = summaryMap.get(e.id)!;
    const workingDays = num(row.working_days);
    if (!(workingDays > 0)) {
      throw new PayrollAttendanceSummaryError(
        'VALIDATION_ERROR',
        `Cannot approve: working days must be greater than zero for employee ${e.name}.`
      );
    }
  }

  const payslips = await new PayslipRepository(tenantId).listByRun(client, runId, scopeCtx);
  if (payslips.length === 0) {
    throw new PayrollAttendanceSummaryError(
      'VALIDATION_ERROR',
      'Cannot approve: process payslips before approving the payroll run.'
    );
  }
  const payslipNetTotal = payslips.reduce((s, p) => s + numStr(p.net_pay), 0);
  const accrualAmount = resolvePayrollRunAccrualAmount(prior, payslipNetTotal);
  if (accrualAmount < 0.005) {
    throw new PayrollAttendanceSummaryError(
      'VALIDATION_ERROR',
      'Cannot approve: payroll accrual amount must be greater than zero.'
    );
  }

  const row = await runRepo.updateFields(client, runId, {
    status: 'APPROVED' as PayrollRunLifecycleStatus,
    touchApproved: true,
    approved_by: userId,
    approved_at: new Date(),
  });
  if (!row) throw new PayrollAttendanceSummaryError('VALIDATION_ERROR', 'Failed to approve payroll run.');
  const api = rowToPayrollRunApi(row);

  const tenantConfig = await getTenantConfig(client, tenantId);
  const accrualResult = await ensurePayrollRunAccrualJournal(client, tenantId, {
    run: row,
    accrualAmount,
    approvedBy: userId,
    categoryId: tenantConfig.default_category_id,
    projectId: tenantConfig.default_project_id,
  });
  if (!accrualResult.journalEntryId && accrualResult.skipped !== 'already_posted') {
    throw new PayrollAttendanceSummaryError(
      'VALIDATION_ERROR',
      'Failed to post payroll accrual to the general ledger.'
    );
  }

  await auditRunLifecycle(client, tenantId, runId, 'payroll.run.approved', userId, rowToPayrollRunApi(prior), api);
  await recordDomainMutation(client, {
    tenantId,
    userId: userId ?? null,
    module: 'payroll',
    entityType: 'payroll_run',
    entityId: runId,
    action: 'update',
    auditAction: 'payroll.run.accrual_posted',
    summary: `Payroll accrual posted for ${row.month} ${row.year}`,
    newValue: {
      runId,
      journalEntryId: accrualResult.journalEntryId,
      accrualAmount,
      period: `${row.month} ${row.year}`,
      approvedBy: userId,
    },
  });
  return { run: api };
}

export async function unapprovePayrollRunLifecycle(
  client: pg.PoolClient,
  tenantId: string,
  runId: string,
  userId: string | null,
  scopeCtx?: DataScopeEnforcementContext
): Promise<{ run: ReturnType<typeof rowToPayrollRunApi> }> {
  const runRepo = new PayrollRunRepository(tenantId);
  const prior = await runRepo.getById(client, runId, scopeCtx);
  if (!prior) throw new PayrollAttendanceSummaryError('NOT_FOUND', 'Payroll run not found.');
  assertRunUnapprovable(prior.status);

  const payslips = await new PayslipRepository(tenantId).listByRun(client, runId, scopeCtx);
  if (payslips.some((p) => p.is_paid || numStr(p.paid_amount) > 0)) {
    throw new PayrollAttendanceSummaryError(
      'FORBIDDEN',
      'Cannot unapprove: one or more payslips have payments recorded.'
    );
  }

  await reversePayrollRunAccrualJournal(client, tenantId, runId, userId, 'Payroll run unapproved');

  const row = await runRepo.updateFields(client, runId, {
    status: 'GENERATED',
    touchApproved: true,
    approved_by: null,
    approved_at: null,
  });
  if (!row) throw new PayrollAttendanceSummaryError('VALIDATION_ERROR', 'Failed to unapprove payroll run.');
  const api = rowToPayrollRunApi(row);
  await auditRunLifecycle(client, tenantId, runId, 'payroll.run.unapproved', userId, rowToPayrollRunApi(prior), api);
  return { run: api };
}

export async function setPayrollRunProcessing(
  client: pg.PoolClient,
  tenantId: string,
  runId: string,
  userId: string | null
): Promise<void> {
  const runRepo = new PayrollRunRepository(tenantId);
  const run = await runRepo.getById(client, runId);
  if (!run) throw new PayrollAttendanceSummaryError('NOT_FOUND', 'Payroll run not found.');
  assertRunEditable(run.status);
  await runRepo.updateFields(client, runId, { status: 'PROCESSING' });
}

export { rowToSummaryApi };
