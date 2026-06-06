import type pg from 'pg';
import { changedSince } from './payrollHelpers.js';
import {
  type PayrollDepartmentRow,
  type PayrollEmployeeRow,
  type PayrollGradeRow,
  type PayrollProjectRow,
  type PayrollRunRow,
  type PayrollSalaryComponentRow,
  type PayrollTenantConfigRow,
  type PayslipRow,
} from './payrollTypes.js';

export async function listDepartmentsChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<PayrollDepartmentRow[]> {
  return changedSince(
    client,
    `SELECT id, tenant_id, name, code, description, parent_department_id, head_employee_id, cost_center_code,
            budget_allocation::text, is_active, created_by, updated_by, deleted_at, created_at, updated_at
     FROM payroll_departments WHERE tenant_id = $1 AND updated_at > $2 ORDER BY updated_at ASC`,
    tenantId,
    since
  );
}

export async function listGradesChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<PayrollGradeRow[]> {
  return changedSince(
    client,
    `SELECT id, tenant_id, name, description, min_salary::text, max_salary::text, created_by, updated_by,
            deleted_at, created_at, updated_at
     FROM payroll_grades WHERE tenant_id = $1 AND updated_at > $2 ORDER BY updated_at ASC`,
    tenantId,
    since
  );
}

export async function listEmployeesChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<PayrollEmployeeRow[]> {
  return changedSince(
    client,
    `SELECT id, tenant_id, user_id, name, email, phone, address, photo, employee_code, designation, department,
            department_id, grade, status, joining_date, termination_date, salary, adjustments, projects, buildings,
            created_by, updated_by, deleted_at, created_at, updated_at
     FROM payroll_employees WHERE tenant_id = $1 AND updated_at > $2 ORDER BY updated_at ASC`,
    tenantId,
    since
  );
}

export async function listPayrollRunsChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<PayrollRunRow[]> {
  return changedSince(
    client,
    `SELECT id, tenant_id, month, year, period_start, period_end, status, total_amount::text, employee_count,
            created_by, updated_by, approved_by, approved_at, paid_at, deleted_at, created_at, updated_at
     FROM payroll_runs WHERE tenant_id = $1 AND updated_at > $2 ORDER BY updated_at ASC`,
    tenantId,
    since
  );
}

export async function listPayslipsChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<PayslipRow[]> {
  return changedSince(
    client,
    `SELECT id, tenant_id, payroll_run_id, employee_id, basic_pay::text, total_allowances::text, total_deductions::text,
            total_adjustments::text, gross_pay::text, net_pay::text, allowance_details, deduction_details, adjustment_details,
            assignment_snapshot, is_paid, paid_amount::text, paid_at, transaction_id, deleted_at, created_at, updated_at
     FROM payslips WHERE tenant_id = $1 AND updated_at > $2 ORDER BY updated_at ASC`,
    tenantId,
    since
  );
}

export async function listSalaryComponentsChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<PayrollSalaryComponentRow[]> {
  return changedSince(
    client,
    `SELECT id, tenant_id, name, type, is_percentage, default_value::text, is_taxable, is_active, deleted_at, created_at, updated_at
     FROM payroll_salary_components WHERE tenant_id = $1 AND updated_at > $2 ORDER BY updated_at ASC`,
    tenantId,
    since
  );
}

export async function listPayrollProjectsChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<PayrollProjectRow[]> {
  return changedSince(
    client,
    `SELECT id, tenant_id, name, code, description, status, created_by, updated_by, deleted_at, created_at, updated_at
     FROM payroll_projects WHERE tenant_id = $1 AND updated_at > $2 ORDER BY updated_at ASC`,
    tenantId,
    since
  );
}

export async function getTenantConfigIfChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<PayrollTenantConfigRow | null> {
  const r = await client.query<PayrollTenantConfigRow>(
    `SELECT tenant_id, earning_types, deduction_types, default_account_id, default_category_id, default_project_id, updated_at
     FROM payroll_tenant_config WHERE tenant_id = $1 AND updated_at > $2`,
    [tenantId, since]
  );
  return r.rows[0] ?? null;
}
