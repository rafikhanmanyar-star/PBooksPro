import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { DataScopeEnforcementContext } from '../../../auth/tenantRepositoryScope.js';
import { applyDepartmentScope, appendScopeFragment } from '../../../auth/tenantRepositoryScope.js';

const PAYROLL_MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function payrollMonthName(month1to12: number): string | null {
  if (month1to12 < 1 || month1to12 > 12) return null;
  return PAYROLL_MONTH_NAMES[month1to12 - 1];
}

export type PayrollReportFilters = {
  month?: number;
  year?: number;
  departmentId?: string;
  employeeId?: string;
  status?: string;
  runId?: string;
  fromDate?: string;
  toDate?: string;
  projectId?: string;
};

function employeeScopeJoin(scopeCtx?: DataScopeEnforcementContext): string {
  return ' INNER JOIN payroll_employees e ON e.id = ps.employee_id AND e.tenant_id = ps.tenant_id AND e.deleted_at IS NULL';
}

function employeeScopeConditions(
  conditions: string[],
  params: unknown[],
  scopeCtx?: DataScopeEnforcementContext,
  alias = 'e'
): void {
  appendScopeFragment(
    conditions,
    params,
    applyDepartmentScope(scopeCtx ?? { enabled: false, scopes: [] }, `${alias}.department_id`, params.length + 1)
  );
}

function periodRunConditions(
  conditions: string[],
  params: unknown[],
  filters: PayrollReportFilters,
  runAlias = 'pr'
): void {
  if (filters.year) {
    params.push(filters.year);
    conditions.push(`${runAlias}.year = $${params.length}`);
  }
  if (filters.month) {
    const name = payrollMonthName(filters.month);
    if (name) {
      params.push(name);
      conditions.push(`${runAlias}.month = $${params.length}`);
    }
  }
  if (filters.runId) {
    params.push(filters.runId);
    conditions.push(`${runAlias}.id = $${params.length}`);
  }
}

export class PayrollReportingRepository extends TenantRepository {
  constructor(tenantId: string) {
    super(tenantId);
  }

  async fetchRegisterRows(
    client: pg.PoolClient,
    filters: PayrollReportFilters,
    scopeCtx?: DataScopeEnforcementContext
  ): Promise<
    Array<{
      payslip_id: string;
      employee_id: string;
      employee_code: string | null;
      employee_name: string;
      department: string | null;
      designation: string | null;
      month: string;
      year: number;
      run_status: string;
      basic_pay: string;
      total_allowances: string;
      gross_pay: string;
      total_deductions: string;
      lop_deduction: string;
      net_pay: string;
      paid_amount: string;
      is_paid: boolean | null;
      adjustment_details: unknown;
      deduction_details: unknown;
    }>
  > {
    const params: unknown[] = [this.tenantId];
    const conditions = ['ps.tenant_id = $1', 'ps.deleted_at IS NULL', 'pr.deleted_at IS NULL'];
    periodRunConditions(conditions, params, filters);
    if (filters.departmentId) {
      params.push(filters.departmentId);
      conditions.push(`e.department_id = $${params.length}`);
    }
    if (filters.employeeId) {
      params.push(filters.employeeId);
      conditions.push(`ps.employee_id = $${params.length}`);
    }
    employeeScopeConditions(conditions, params, scopeCtx);
    const r = await client.query(
      `SELECT ps.id AS payslip_id, ps.employee_id, e.employee_code, e.name AS employee_name,
              e.department, e.designation, pr.month, pr.year, pr.status AS run_status,
              ps.basic_pay::text, ps.total_allowances::text, ps.gross_pay::text, ps.total_deductions::text,
              ps.lop_deduction::text, ps.net_pay::text, ps.paid_amount::text, ps.is_paid,
              ps.adjustment_details, ps.deduction_details
       FROM payslips ps
       INNER JOIN payroll_runs pr ON pr.id = ps.payroll_run_id AND pr.tenant_id = ps.tenant_id
       ${employeeScopeJoin(scopeCtx)}
       WHERE ${conditions.join(' AND ')}
       ORDER BY pr.year DESC, pr.month DESC, e.name ASC`,
      params
    );
    return r.rows as Array<{
      payslip_id: string;
      employee_id: string;
      employee_code: string | null;
      employee_name: string;
      department: string | null;
      designation: string | null;
      month: string;
      year: number;
      run_status: string;
      basic_pay: string;
      total_allowances: string;
      gross_pay: string;
      total_deductions: string;
      lop_deduction: string;
      net_pay: string;
      paid_amount: string;
      is_paid: boolean | null;
      adjustment_details: unknown;
      deduction_details: unknown;
    }>;
  }

  async fetchPaymentHistoryRows(
    client: pg.PoolClient,
    filters: PayrollReportFilters,
    scopeCtx?: DataScopeEnforcementContext
  ): Promise<
    Array<{
      transaction_id: string;
      payment_date: string;
      reference: string | null;
      description: string | null;
      amount: string;
      account_name: string | null;
      created_by: string | null;
      employee_id: string;
      employee_name: string;
      department: string | null;
      payroll_period: string;
      status: string;
    }>
  > {
    const params: unknown[] = [this.tenantId];
    const conditions = [
      't.tenant_id = $1',
      't.deleted_at IS NULL',
      't.payslip_id IS NOT NULL',
      'ps.deleted_at IS NULL',
    ];
    if (filters.fromDate) {
      params.push(filters.fromDate);
      conditions.push(`t.date >= $${params.length}::date`);
    }
    if (filters.toDate) {
      params.push(filters.toDate);
      conditions.push(`t.date <= $${params.length}::date`);
    }
    if (filters.employeeId) {
      params.push(filters.employeeId);
      conditions.push(`ps.employee_id = $${params.length}`);
    }
    if (filters.departmentId) {
      params.push(filters.departmentId);
      conditions.push(`e.department_id = $${params.length}`);
    }
    employeeScopeConditions(conditions, params, scopeCtx);
    if (filters.month || filters.year) {
      periodRunConditions(conditions, params, filters);
    }
    const r = await client.query(
      `SELECT t.id AS transaction_id, t.date::text AS payment_date, t.reference, t.description,
              t.amount::text, a.name AS account_name, t.user_id AS created_by,
              ps.employee_id, e.name AS employee_name, e.department,
              (pr.month || ' ' || pr.year::text) AS payroll_period,
              CASE WHEN t.deleted_at IS NOT NULL THEN 'Reversed' ELSE 'Posted' END AS status
       FROM transactions t
       INNER JOIN payslips ps ON ps.id = t.payslip_id AND ps.tenant_id = t.tenant_id
       INNER JOIN payroll_runs pr ON pr.id = ps.payroll_run_id AND pr.tenant_id = ps.tenant_id
       INNER JOIN payroll_employees e ON e.id = ps.employee_id AND e.tenant_id = ps.tenant_id AND e.deleted_at IS NULL
       LEFT JOIN accounts a ON a.id = t.account_id AND a.tenant_id = t.tenant_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY t.date DESC, t.created_at DESC`,
      params
    );
    return r.rows as Array<{
      transaction_id: string;
      payment_date: string;
      reference: string | null;
      description: string | null;
      amount: string;
      account_name: string | null;
      created_by: string | null;
      employee_id: string;
      employee_name: string;
      department: string | null;
      payroll_period: string;
      status: string;
    }>;
  }

  async fetchLiabilityRunRows(
    client: pg.PoolClient,
    filters: PayrollReportFilters,
    scopeCtx?: DataScopeEnforcementContext
  ): Promise<
    Array<{
      run_id: string;
      month: string;
      year: number;
      run_status: string;
      approved_payroll: string;
      payments_made: string;
      employee_count: string;
      unpaid_employee_count: string;
    }>
  > {
    const params: unknown[] = [this.tenantId];
    const conditions = [
      'pr.tenant_id = $1',
      'pr.deleted_at IS NULL',
      "pr.status IN ('APPROVED', 'PAID')",
    ];
    periodRunConditions(conditions, params, filters);
    if (filters.departmentId) {
      params.push(filters.departmentId);
      conditions.push(`EXISTS (
        SELECT 1 FROM payslips ps2
        INNER JOIN payroll_employees e2 ON e2.id = ps2.employee_id AND e2.tenant_id = ps2.tenant_id
        WHERE ps2.payroll_run_id = pr.id AND ps2.deleted_at IS NULL AND e2.department_id = $${params.length}
      )`);
    }
    const scopeParams: unknown[] = [...params];
    const scopeConditions: string[] = [];
    employeeScopeConditions(scopeConditions, scopeParams, scopeCtx);
    const scopeSql =
      scopeConditions.length > 0
        ? ` AND EXISTS (
        SELECT 1 FROM payslips ps3
        INNER JOIN payroll_employees e ON e.id = ps3.employee_id AND e.tenant_id = ps3.tenant_id AND e.deleted_at IS NULL
        WHERE ps3.payroll_run_id = pr.id AND ps3.deleted_at IS NULL AND ${scopeConditions.join(' AND ')}
      )`
        : '';

    const r = await client.query(
      `SELECT pr.id AS run_id, pr.month, pr.year, pr.status AS run_status,
              COALESCE(pr.total_amount, 0)::text AS approved_payroll,
              COALESCE(SUM(ps.paid_amount), 0)::text AS payments_made,
              COUNT(ps.id)::text AS employee_count,
              COUNT(ps.id) FILTER (WHERE NOT ps.is_paid AND COALESCE(ps.paid_amount, 0) < ps.net_pay - 0.005)::text AS unpaid_employee_count
       FROM payroll_runs pr
       LEFT JOIN payslips ps ON ps.payroll_run_id = pr.id AND ps.tenant_id = pr.tenant_id AND ps.deleted_at IS NULL
       WHERE ${conditions.join(' AND ')}${scopeSql}
       GROUP BY pr.id, pr.month, pr.year, pr.status, pr.total_amount
       ORDER BY pr.year DESC, pr.month DESC`,
      scopeParams
    );
    return r.rows as Array<{
      run_id: string;
      month: string;
      year: number;
      run_status: string;
      approved_payroll: string;
      payments_made: string;
      employee_count: string;
      unpaid_employee_count: string;
    }>;
  }

  async fetchJournalRunRows(
    client: pg.PoolClient,
    filters: PayrollReportFilters,
    scopeCtx?: DataScopeEnforcementContext
  ): Promise<
    Array<{
      run_id: string;
      payroll_period: string;
      approval_date: string | null;
      run_status: string;
      approved_amount: string;
      payments_settled: string;
      journal_entry_id: string | null;
      journal_reference: string | null;
      journal_reversed: boolean;
      expense_amount: string | null;
      liability_amount: string | null;
    }>
  > {
    const params: unknown[] = [this.tenantId];
    const conditions = ['pr.tenant_id = $1', 'pr.deleted_at IS NULL'];
    periodRunConditions(conditions, params, filters);
    if (filters.runId) {
      /* already in periodRunConditions */
    }
    const scopeParams: unknown[] = [...params];
    const scopeConditions: string[] = [];
    employeeScopeConditions(scopeConditions, scopeParams, scopeCtx);
    const scopeSql =
      scopeConditions.length > 0
        ? ` AND EXISTS (
        SELECT 1 FROM payslips ps3
        INNER JOIN payroll_employees e ON e.id = ps3.employee_id AND e.tenant_id = ps3.tenant_id AND e.deleted_at IS NULL
        WHERE ps3.payroll_run_id = pr.id AND ps3.deleted_at IS NULL AND ${scopeConditions.join(' AND ')}
      )`
        : '';

    const r = await client.query(
      `SELECT pr.id AS run_id,
              (pr.month || ' ' || pr.year::text) AS payroll_period,
              pr.approved_at::text AS approval_date,
              pr.status AS run_status,
              COALESCE(pr.total_amount, 0)::text AS approved_amount,
              COALESCE(SUM(ps.paid_amount), 0)::text AS payments_settled,
              je.id AS journal_entry_id,
              je.reference AS journal_reference,
              EXISTS (
                SELECT 1 FROM journal_reversals jr
                WHERE jr.original_journal_entry_id = je.id AND jr.tenant_id = pr.tenant_id
              ) AS journal_reversed,
              (
                SELECT COALESCE(SUM(jl.debit_amount), 0)::text
                FROM journal_lines jl
                WHERE jl.journal_entry_id = je.id
                  AND jl.account_id = 'sys-acc-expense-summary'
              ) AS expense_amount,
              (
                SELECT COALESCE(SUM(jl.credit_amount), 0)::text
                FROM journal_lines jl
                WHERE jl.journal_entry_id = je.id
                  AND jl.account_id = 'sys-acc-ap'
              ) AS liability_amount
       FROM payroll_runs pr
       LEFT JOIN payslips ps ON ps.payroll_run_id = pr.id AND ps.tenant_id = pr.tenant_id AND ps.deleted_at IS NULL
       LEFT JOIN LATERAL (
         SELECT je2.id, je2.reference
         FROM journal_entries je2
         WHERE je2.tenant_id = pr.tenant_id
           AND je2.source_module = 'payroll_run'
           AND je2.source_id = pr.id
         ORDER BY je2.created_at DESC
         LIMIT 1
       ) je ON true
       WHERE ${conditions.join(' AND ')}${scopeSql}
       GROUP BY pr.id, pr.month, pr.year, pr.approved_at, pr.status, pr.total_amount, je.id, je.reference
       ORDER BY pr.year DESC, pr.month DESC`,
      scopeParams
    );
    return r.rows as Array<{
      run_id: string;
      payroll_period: string;
      approval_date: string | null;
      run_status: string;
      approved_amount: string;
      payments_settled: string;
      journal_entry_id: string | null;
      journal_reference: string | null;
      journal_reversed: boolean;
      expense_amount: string | null;
      liability_amount: string | null;
    }>;
  }

  async fetchLeaveImpactRows(
    client: pg.PoolClient,
    filters: PayrollReportFilters,
    scopeCtx?: DataScopeEnforcementContext
  ): Promise<
    Array<{
      employee_id: string;
      employee_name: string;
      department: string | null;
      leave_type: string;
      leave_days: string;
      lop_days: string;
      lop_impact: string;
      payroll_adjustment: string;
    }>
  > {
    const params: unknown[] = [this.tenantId];
    const conditions = [
      'pas.tenant_id = $1',
      'e.deleted_at IS NULL',
    ];
    if (filters.month) {
      params.push(filters.month);
      conditions.push(`pas.payroll_month = $${params.length}`);
    }
    if (filters.year) {
      params.push(filters.year);
      conditions.push(`pas.payroll_year = $${params.length}`);
    }
    if (filters.departmentId) {
      params.push(filters.departmentId);
      conditions.push(`e.department_id = $${params.length}`);
    }
    if (filters.employeeId) {
      params.push(filters.employeeId);
      conditions.push(`pas.employee_id = $${params.length}`);
    }
    employeeScopeConditions(conditions, params, scopeCtx);
    const monthName = filters.month ? payrollMonthName(filters.month) : null;
    let payslipJoinSql = '';
    if (monthName && filters.year) {
      params.push(monthName, filters.year);
      payslipJoinSql = `AND ps.payroll_run_id IN (
           SELECT pr.id FROM payroll_runs pr
           WHERE pr.tenant_id = pas.tenant_id AND pr.deleted_at IS NULL
             AND pr.month = $${params.length - 1} AND pr.year = $${params.length}
         )`;
    }

    const r = await client.query(
      `SELECT pas.employee_id, e.name AS employee_name, e.department,
              COALESCE(lt.name, CASE WHEN pas.unpaid_leave_days > 0 THEN 'Unpaid Leave' ELSE 'Leave' END) AS leave_type,
              pas.leave_days::text AS leave_days,
              pas.lop_days::text AS lop_days,
              COALESCE(ps.lop_deduction, 0)::text AS lop_impact,
              COALESCE(ps.lop_deduction, 0)::text AS payroll_adjustment
       FROM payroll_attendance_summaries pas
       INNER JOIN payroll_employees e ON e.id = pas.employee_id AND e.tenant_id = pas.tenant_id
       LEFT JOIN LATERAL (
         SELECT lr.leave_type_id
         FROM leave_requests lr
         WHERE lr.tenant_id = pas.tenant_id AND lr.employee_id = pas.employee_id
           AND lr.deleted_at IS NULL AND lr.status = 'APPROVED'
           AND EXTRACT(MONTH FROM lr.from_date) = pas.payroll_month
           AND EXTRACT(YEAR FROM lr.from_date) = pas.payroll_year
         ORDER BY lr.created_at DESC
         LIMIT 1
       ) lr_pick ON true
       LEFT JOIN leave_types lt ON lt.id = lr_pick.leave_type_id AND lt.tenant_id = pas.tenant_id
       LEFT JOIN payslips ps ON ps.employee_id = pas.employee_id AND ps.tenant_id = pas.tenant_id AND ps.deleted_at IS NULL
         ${payslipJoinSql}
       WHERE ${conditions.join(' AND ')}
         AND (pas.leave_days > 0 OR pas.lop_days > 0 OR pas.unpaid_leave_days > 0)
       ORDER BY e.name ASC`,
      params
    );
    return r.rows as Array<{
      employee_id: string;
      employee_name: string;
      department: string | null;
      leave_type: string;
      leave_days: string;
      lop_days: string;
      lop_impact: string;
      payroll_adjustment: string;
    }>;
  }
}
