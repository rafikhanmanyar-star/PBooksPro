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
import { dateStr, iso, numStr } from './payrollHelpers.js';

export function rowToDepartmentApi(row: PayrollDepartmentRow): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: row.id,
    tenant_id: row.tenant_id,
    name: row.name,
    code: row.code ?? undefined,
    description: row.description ?? undefined,
    parent_department_id: row.parent_department_id ?? undefined,
    head_employee_id: row.head_employee_id ?? undefined,
    cost_center_code: row.cost_center_code ?? undefined,
    budget_allocation: numStr(row.budget_allocation),
    is_active: row.is_active,
    created_by: row.created_by ?? undefined,
    updated_by: row.updated_by ?? undefined,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
  if (row.deleted_at) base.deleted_at = iso(row.deleted_at);
  return base;
}

export function rowToGradeApi(row: PayrollGradeRow): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: row.id,
    tenant_id: row.tenant_id,
    name: row.name,
    description: row.description ?? '',
    min_salary: numStr(row.min_salary),
    max_salary: numStr(row.max_salary),
    created_by: row.created_by ?? undefined,
    updated_by: row.updated_by ?? undefined,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
  if (row.deleted_at) base.deleted_at = iso(row.deleted_at);
  return base;
}

export function rowToEmployeeApi(row: PayrollEmployeeRow): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: row.id,
    tenant_id: row.tenant_id,
    user_id: row.user_id ?? undefined,
    name: row.name,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    address: row.address ?? undefined,
    photo: row.photo ?? undefined,
    employee_code: row.employee_code ?? undefined,
    designation: row.designation,
    department: row.department,
    department_id: row.department_id ?? undefined,
    grade: row.grade ?? '',
    status: row.status,
    joining_date: dateStr(row.joining_date),
    termination_date: row.termination_date ? dateStr(row.termination_date) : undefined,
    salary: row.salary,
    adjustments: row.adjustments,
    projects: row.projects,
    buildings: row.buildings,
    created_by: row.created_by,
    updated_by: row.updated_by ?? undefined,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
  if (row.deleted_at) base.deleted_at = iso(row.deleted_at);
  return base;
}

export function rowToPayrollRunApi(row: PayrollRunRow): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: row.id,
    tenant_id: row.tenant_id,
    month: row.month,
    year: row.year,
    period_start: row.period_start ? dateStr(row.period_start) : undefined,
    period_end: row.period_end ? dateStr(row.period_end) : undefined,
    status: row.status,
    total_amount: numStr(row.total_amount),
    employee_count: row.employee_count,
    created_by: row.created_by ?? undefined,
    updated_by: row.updated_by ?? undefined,
    approved_by: row.approved_by ?? undefined,
    approved_at: row.approved_at ? iso(row.approved_at) : undefined,
    paid_at: row.paid_at ? iso(row.paid_at) : undefined,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
  if (row.deleted_at) base.deleted_at = iso(row.deleted_at);
  return base;
}

export function rowToPayslipApi(row: PayslipRow): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: row.id,
    tenant_id: row.tenant_id,
    payroll_run_id: row.payroll_run_id,
    employee_id: row.employee_id,
    basic_pay: numStr(row.basic_pay),
    total_allowances: numStr(row.total_allowances),
    total_deductions: numStr(row.total_deductions),
    total_adjustments: numStr(row.total_adjustments),
    gross_pay: numStr(row.gross_pay),
    net_pay: numStr(row.net_pay),
    allowance_details: row.allowance_details,
    deduction_details: row.deduction_details,
    adjustment_details: row.adjustment_details,
    assignment_snapshot: row.assignment_snapshot ?? undefined,
    is_paid: row.is_paid,
    paid_amount: numStr(row.paid_amount),
    paid_at: row.paid_at ? iso(row.paid_at) : undefined,
    transaction_id: row.transaction_id ?? undefined,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
  if (row.deleted_at) base.deleted_at = iso(row.deleted_at);
  return base;
}

export function rowToSalaryComponentApi(row: PayrollSalaryComponentRow): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: row.id,
    tenant_id: row.tenant_id,
    name: row.name,
    type: row.type,
    is_percentage: row.is_percentage,
    default_value: numStr(row.default_value),
    is_taxable: row.is_taxable,
    is_active: row.is_active,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
  if (row.deleted_at) base.deleted_at = iso(row.deleted_at);
  return base;
}

export function rowToPayrollProjectApi(row: PayrollProjectRow): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: row.id,
    tenant_id: row.tenant_id,
    name: row.name,
    code: row.code,
    description: row.description ?? '',
    status: row.status,
    created_by: row.created_by ?? undefined,
    updated_by: row.updated_by ?? undefined,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
  if (row.deleted_at) base.deleted_at = iso(row.deleted_at);
  return base;
}

export function rowToTenantConfigApi(row: PayrollTenantConfigRow): Record<string, unknown> {
  return {
    tenant_id: row.tenant_id,
    earning_types: row.earning_types,
    deduction_types: row.deduction_types,
    default_account_id: row.default_account_id,
    default_category_id: row.default_category_id,
    default_project_id: row.default_project_id,
    updated_at: iso(row.updated_at),
  };
}
