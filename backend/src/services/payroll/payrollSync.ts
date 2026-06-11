import type pg from 'pg';
import { PayrollDepartmentRepository } from '../../modules/payroll/repositories/PayrollDepartmentRepository.js';
import { PayrollEmployeeRepository } from '../../modules/payroll/repositories/PayrollEmployeeRepository.js';
import { PayrollGradeRepository } from '../../modules/payroll/repositories/PayrollGradeRepository.js';
import { PayrollRunRepository } from '../../modules/payroll/repositories/PayrollRunRepository.js';
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
  return new PayrollDepartmentRepository(tenantId).listChangedSince(client, since);
}

export async function listGradesChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<PayrollGradeRow[]> {
  return new PayrollGradeRepository(tenantId).listChangedSince(client, since);
}

export async function listEmployeesChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<PayrollEmployeeRow[]> {
  return new PayrollEmployeeRepository(tenantId).listChangedSince(client, since);
}

export async function listPayrollRunsChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<PayrollRunRow[]> {
  return new PayrollRunRepository(tenantId).listChangedSince(client, since);
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
