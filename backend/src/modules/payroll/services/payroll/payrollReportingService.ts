import type pg from 'pg';
import type { DataScopeEnforcementContext } from '../../../../auth/tenantRepositoryScope.js';
import {
  buildLiabilityRow,
  buildPayrollSummaryReport,
  buildRegisterRow,
  num,
  payslipStatusLabel,
  roundMoney,
} from '../../../../reportEngines/index.js';
import {
  PayrollReportingRepository,
  type PayrollReportFilters,
} from '../../repositories/PayrollReportingRepository.js';

export type { PayrollReportFilters };

function filterRegisterByStatus<T extends { status: string }>(rows: T[], status?: string): T[] {
  if (!status?.trim()) return rows;
  const want = status.trim().toLowerCase();
  return rows.filter((r) => r.status.toLowerCase() === want);
}

export async function getPayrollRegisterReport(
  client: pg.PoolClient,
  tenantId: string,
  filters: PayrollReportFilters,
  scopeCtx?: DataScopeEnforcementContext
) {
  const raw = await new PayrollReportingRepository(tenantId).fetchRegisterRows(client, filters, scopeCtx);
  const rows = raw.map((r) =>
    buildRegisterRow({
      payslip_id: r.payslip_id,
      employee_id: r.employee_id,
      employee_code: r.employee_code,
      employee_name: r.employee_name,
      department: r.department,
      designation: r.designation,
      payroll_period: `${r.month} ${r.year}`,
      month: r.month,
      year: r.year,
      basic_pay: num(r.basic_pay),
      total_allowances: num(r.total_allowances),
      gross_pay: num(r.gross_pay),
      total_deductions: num(r.total_deductions),
      lop_deduction: num(r.lop_deduction),
      net_pay: num(r.net_pay),
      paid_amount: num(r.paid_amount),
      adjustment_details: r.adjustment_details,
      deduction_details: r.deduction_details,
      is_paid: r.is_paid,
      run_status: r.run_status,
    })
  );
  return {
    report: 'payroll_register' as const,
    filters,
    rows: filterRegisterByStatus(rows, filters.status),
  };
}

export async function getPayrollPaymentHistoryReport(
  client: pg.PoolClient,
  tenantId: string,
  filters: PayrollReportFilters,
  scopeCtx?: DataScopeEnforcementContext
) {
  const raw = await new PayrollReportingRepository(tenantId).fetchPaymentHistoryRows(
    client,
    filters,
    scopeCtx
  );
  return {
    report: 'payroll_payment_history' as const,
    filters,
    rows: raw.map((r) => ({
      transaction_id: r.transaction_id,
      employee_id: r.employee_id,
      employee_name: r.employee_name,
      department: r.department,
      payment_date: r.payment_date,
      reference_number: r.reference ?? r.transaction_id,
      payment_method: r.account_name ?? 'Bank/Cash',
      amount: roundMoney(num(r.amount)),
      created_by: r.created_by,
      payroll_period: r.payroll_period,
      status: r.status,
      description: r.description,
    })),
  };
}

export async function getPayrollLiabilityReport(
  client: pg.PoolClient,
  tenantId: string,
  filters: PayrollReportFilters,
  scopeCtx?: DataScopeEnforcementContext
) {
  const raw = await new PayrollReportingRepository(tenantId).fetchLiabilityRunRows(
    client,
    filters,
    scopeCtx
  );
  const rows = raw.map((r) =>
    buildLiabilityRow({
      run_id: r.run_id,
      payroll_period: `${r.month} ${r.year}`,
      month: r.month,
      year: r.year,
      run_status: r.run_status,
      approved_payroll: num(r.approved_payroll),
      payments_made: num(r.payments_made),
      employee_count: Number(r.employee_count),
      unpaid_employee_count: Number(r.unpaid_employee_count),
    })
  );
  const totals = {
    approved_payroll: roundMoney(rows.reduce((s, r) => s + r.approved_payroll, 0)),
    payments_made: roundMoney(rows.reduce((s, r) => s + r.payments_made, 0)),
    outstanding_liability: roundMoney(rows.reduce((s, r) => s + r.outstanding_liability, 0)),
  };
  return { report: 'payroll_liability' as const, filters, rows, totals };
}

export async function getPayrollJournalReport(
  client: pg.PoolClient,
  tenantId: string,
  filters: PayrollReportFilters,
  scopeCtx?: DataScopeEnforcementContext
) {
  const raw = await new PayrollReportingRepository(tenantId).fetchJournalRunRows(client, filters, scopeCtx);
  const rows = raw.map((r) => {
    const approved = roundMoney(num(r.approved_amount));
    const settled = roundMoney(num(r.payments_settled));
    const liability = roundMoney(num(r.liability_amount) || approved);
    const expense = roundMoney(num(r.expense_amount) || approved);
    const remaining = r.journal_reversed ? 0 : roundMoney(Math.max(0, liability - settled));
    return {
      payroll_run_id: r.run_id,
      payroll_period: r.payroll_period,
      approval_date: r.approval_date,
      run_status: r.run_status,
      journal_entry_id: r.journal_entry_id,
      journal_reference: r.journal_reference,
      journal_reversed: r.journal_reversed,
      expense_amount: expense,
      liability_amount: liability,
      payments_settled: settled,
      remaining_liability: remaining,
      approved_amount: approved,
    };
  });
  return { report: 'payroll_journal' as const, filters, rows };
}

export async function getPayrollLeaveImpactReport(
  client: pg.PoolClient,
  tenantId: string,
  filters: PayrollReportFilters,
  scopeCtx?: DataScopeEnforcementContext
) {
  const raw = await new PayrollReportingRepository(tenantId).fetchLeaveImpactRows(client, filters, scopeCtx);
  return {
    report: 'payroll_leave_impact' as const,
    filters,
    rows: raw.map((r) => ({
      employee_id: r.employee_id,
      employee_name: r.employee_name,
      department: r.department,
      leave_type: r.leave_type,
      leave_days: num(r.leave_days),
      lop_impact: roundMoney(num(r.lop_impact)),
      payroll_adjustment: roundMoney(num(r.payroll_adjustment)),
      lop_days: num(r.lop_days),
    })),
  };
}

export async function getPayrollSummaryReport(
  client: pg.PoolClient,
  tenantId: string,
  filters: PayrollReportFilters,
  scopeCtx?: DataScopeEnforcementContext
) {
  const register = await getPayrollRegisterReport(client, tenantId, filters, scopeCtx);
  const liability = await getPayrollLiabilityReport(client, tenantId, filters, scopeCtx);
  const summary = buildPayrollSummaryReport({
    rows: register.rows,
    liabilityRows: liability.rows,
  });
  return { report: 'payroll_summary' as const, filters, summary };
}

/** Attendance impact rows enriched for Sprint 4 report UI. */
export async function getPayrollAttendanceImpactReportEnriched(
  client: pg.PoolClient,
  tenantId: string,
  month: number,
  year: number,
  scopeCtx?: DataScopeEnforcementContext
) {
  const { listStoredAttendanceSummaries } = await import(
    '../../../payroll-attendance/attendanceSummary.service.js'
  );
  const list = await listStoredAttendanceSummaries(
    client,
    tenantId,
    { payrollMonth: month, payrollYear: year, page: 1, limit: 2000 },
    scopeCtx
  );
  const rows = list.items.map((r) => ({
    employee_id: r.employee_id,
    employee_name: r.employee_name ?? r.employee_id,
    department: r.department,
    present_days: r.present_days,
    absent_days: r.absent_days,
    leave_days: r.leave_days,
    half_days: r.half_days,
    late_days: r.late_days ?? 0,
    lop_days: r.lop_days,
    paid_leave_days: r.paid_leave_days,
    unpaid_leave_days: r.unpaid_leave_days,
  }));
  return { report: 'attendance_impact' as const, month, year, rows };
}

export { payslipStatusLabel };
