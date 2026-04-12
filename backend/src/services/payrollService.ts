import type pg from 'pg';
import { randomUUID } from 'crypto';
import {
  computeMonthlyPayslip,
  getMonthName,
  isPayrollPeriodBeforeJoiningDate,
  type PayrollEmployeeLike,
} from '../payroll/salaryComputation.js';
import { todayUtcYyyyMmDd } from '../utils/dateOnly.js';
import { ExpenseCashValidationBatchContext } from '../financial/expenseCashValidation.js';
import { createTransaction, rowToTransactionApi } from './transactionsService.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type PayrollDepartmentRow = {
  id: string;
  tenant_id: string;
  name: string;
  code: string | null;
  description: string | null;
  parent_department_id: string | null;
  head_employee_id: string | null;
  cost_center_code: string | null;
  budget_allocation: string;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type PayrollGradeRow = {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  min_salary: string;
  max_salary: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type PayrollEmployeeRow = {
  id: string;
  tenant_id: string;
  user_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  photo: string | null;
  employee_code: string | null;
  designation: string;
  department: string;
  department_id: string | null;
  grade: string | null;
  status: string;
  joining_date: Date;
  termination_date: Date | null;
  salary: unknown;
  adjustments: unknown;
  projects: unknown;
  buildings: unknown;
  created_by: string;
  updated_by: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type PayrollRunRow = {
  id: string;
  tenant_id: string;
  month: string;
  year: number;
  period_start: Date | null;
  period_end: Date | null;
  status: string;
  total_amount: string;
  employee_count: number;
  created_by: string | null;
  updated_by: string | null;
  approved_by: string | null;
  approved_at: Date | null;
  paid_at: Date | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type PayslipRow = {
  id: string;
  tenant_id: string;
  payroll_run_id: string;
  employee_id: string;
  basic_pay: string;
  total_allowances: string;
  total_deductions: string;
  total_adjustments: string;
  gross_pay: string;
  net_pay: string;
  allowance_details: unknown;
  deduction_details: unknown;
  adjustment_details: unknown;
  assignment_snapshot: unknown;
  is_paid: boolean;
  paid_amount: string;
  paid_at: Date | null;
  transaction_id: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type PayrollSalaryComponentRow = {
  id: string;
  tenant_id: string;
  name: string;
  type: string;
  is_percentage: boolean;
  default_value: string;
  is_taxable: boolean;
  is_active: boolean;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type PayrollProjectRow = {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  description: string | null;
  status: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type PayrollTenantConfigRow = {
  tenant_id: string;
  earning_types: unknown;
  deduction_types: unknown;
  default_account_id: string | null;
  default_category_id: string | null;
  default_project_id: string | null;
  updated_at: Date;
};

function iso(d: Date | string | null | undefined): string | undefined {
  if (d == null) return undefined;
  const x = d instanceof Date ? d : new Date(String(d));
  if (isNaN(x.getTime())) return undefined;
  return x.toISOString();
}

function dateStr(d: Date | string | null | undefined): string {
  if (d == null) return '';
  if (typeof d === 'string') {
    const t = d.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
    const m = t.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  const s = iso(d);
  return s ? s.slice(0, 10) : '';
}

function numStr(v: string | number): number {
  return typeof v === 'number' ? v : parseFloat(String(v || '0')) || 0;
}

// ── Row → API (camelCase + nested JSON for client normalize*) ─────────────────

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

// ── Incremental sync ──────────────────────────────────────────────────────────

async function changedSince<T extends pg.QueryResultRow>(
  client: pg.PoolClient,
  sql: string,
  tenantId: string,
  since: Date
): Promise<T[]> {
  const r = await client.query<T>(sql, [tenantId, since]);
  return r.rows;
}

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

// ── Helpers: JSON ─────────────────────────────────────────────────────────────

function j<T>(v: unknown, fallback: T): T {
  if (v == null) return fallback;
  if (typeof v === 'string') {
    try {
      return JSON.parse(v) as T;
    } catch {
      return fallback;
    }
  }
  return v as T;
}

function optStr(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

// ── Departments CRUD ──────────────────────────────────────────────────────────

export async function listDepartments(client: pg.PoolClient, tenantId: string): Promise<PayrollDepartmentRow[]> {
  const r = await client.query<PayrollDepartmentRow>(
    `SELECT id, tenant_id, name, code, description, parent_department_id, head_employee_id, cost_center_code,
            budget_allocation::text, is_active, created_by, updated_by, deleted_at, created_at, updated_at
     FROM payroll_departments WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY name ASC`,
    [tenantId]
  );
  return r.rows;
}

export async function getDepartment(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<PayrollDepartmentRow | null> {
  const r = await client.query<PayrollDepartmentRow>(
    `SELECT id, tenant_id, name, code, description, parent_department_id, head_employee_id, cost_center_code,
            budget_allocation::text, is_active, created_by, updated_by, deleted_at, created_at, updated_at
     FROM payroll_departments WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, tenantId]
  );
  return r.rows[0] ?? null;
}

export async function upsertDepartment(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>,
  userId: string | null
): Promise<PayrollDepartmentRow> {
  const id =
    typeof body.id === 'string' && body.id.trim()
      ? body.id.trim()
      : `pd_${randomUUID().replace(/-/g, '')}`;
  const name = String(body.name ?? '').trim();
  if (!name) throw new Error('name is required.');
  const code = optStr(body.code ?? body.code);
  const description = optStr(body.description);
  const parent_department_id = optStr(body.parent_department_id ?? body.parentDepartmentId);
  const head_employee_id = optStr(body.head_employee_id ?? body.headEmployeeId);
  const cost_center_code = optStr(body.cost_center_code ?? body.costCenterCode);
  const budget_allocation = Number(body.budget_allocation ?? body.budgetAllocation ?? 0);
  const is_active = body.is_active !== false && body.isActive !== false;

  const r = await client.query<PayrollDepartmentRow>(
    `INSERT INTO payroll_departments (
       id, tenant_id, name, code, description, parent_department_id, head_employee_id, cost_center_code,
       budget_allocation, is_active, created_by, updated_by, deleted_at, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NULL,NOW(),NOW())
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       code = EXCLUDED.code,
       description = EXCLUDED.description,
       parent_department_id = EXCLUDED.parent_department_id,
       head_employee_id = EXCLUDED.head_employee_id,
       cost_center_code = EXCLUDED.cost_center_code,
       budget_allocation = EXCLUDED.budget_allocation,
       is_active = EXCLUDED.is_active,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()
     RETURNING id, tenant_id, name, code, description, parent_department_id, head_employee_id, cost_center_code,
               budget_allocation::text, is_active, created_by, updated_by, deleted_at, created_at, updated_at`,
    [
      id,
      tenantId,
      name,
      code,
      description,
      parent_department_id,
      head_employee_id,
      cost_center_code,
      budget_allocation,
      is_active,
      userId,
      userId,
    ]
  );
  return r.rows[0];
}

export async function softDeleteDepartment(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<boolean> {
  const u = await client.query(`UPDATE payroll_departments SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`, [
    id,
    tenantId,
  ]);
  return (u.rowCount ?? 0) > 0;
}

// ── Grades ────────────────────────────────────────────────────────────────────

export async function listGrades(client: pg.PoolClient, tenantId: string): Promise<PayrollGradeRow[]> {
  const r = await client.query<PayrollGradeRow>(
    `SELECT id, tenant_id, name, description, min_salary::text, max_salary::text, created_by, updated_by, deleted_at, created_at, updated_at
     FROM payroll_grades WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY name ASC`,
    [tenantId]
  );
  return r.rows;
}

export async function upsertGrade(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>,
  userId: string | null
): Promise<PayrollGradeRow> {
  const id =
    typeof body.id === 'string' && body.id.trim() ? body.id.trim() : `pg_${randomUUID().replace(/-/g, '')}`;
  const name = String(body.name ?? '').trim();
  if (!name) throw new Error('name is required.');
  const description = String(body.description ?? '');
  const min_salary = Number(body.min_salary ?? body.minSalary ?? 0);
  const max_salary = Number(body.max_salary ?? body.maxSalary ?? 0);

  const r = await client.query<PayrollGradeRow>(
    `INSERT INTO payroll_grades (id, tenant_id, name, description, min_salary, max_salary, created_by, updated_by, deleted_at, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL,NOW(),NOW())
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       min_salary = EXCLUDED.min_salary,
       max_salary = EXCLUDED.max_salary,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()
     RETURNING id, tenant_id, name, description, min_salary::text, max_salary::text, created_by, updated_by, deleted_at, created_at, updated_at`,
    [id, tenantId, name, description, min_salary, max_salary, userId, userId]
  );
  return r.rows[0];
}

export async function softDeleteGrade(client: pg.PoolClient, tenantId: string, id: string): Promise<boolean> {
  const u = await client.query(`UPDATE payroll_grades SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`, [
    id,
    tenantId,
  ]);
  return (u.rowCount ?? 0) > 0;
}

// ── Employees ─────────────────────────────────────────────────────────────────

export async function listEmployees(client: pg.PoolClient, tenantId: string): Promise<PayrollEmployeeRow[]> {
  const r = await client.query<PayrollEmployeeRow>(
    `SELECT id, tenant_id, user_id, name, email, phone, address, photo, employee_code, designation, department,
            department_id, grade, status, joining_date, termination_date, salary, adjustments, projects, buildings,
            created_by, updated_by, deleted_at, created_at, updated_at
     FROM payroll_employees WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY name ASC`,
    [tenantId]
  );
  return r.rows;
}

export async function getEmployee(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<PayrollEmployeeRow | null> {
  const r = await client.query<PayrollEmployeeRow>(
    `SELECT id, tenant_id, user_id, name, email, phone, address, photo, employee_code, designation, department,
            department_id, grade, status, joining_date, termination_date, salary, adjustments, projects, buildings,
            created_by, updated_by, deleted_at, created_at, updated_at
     FROM payroll_employees WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, tenantId]
  );
  return r.rows[0] ?? null;
}

export async function listEmployeesByDepartment(
  client: pg.PoolClient,
  tenantId: string,
  departmentId: string
): Promise<PayrollEmployeeRow[]> {
  const r = await client.query<PayrollEmployeeRow>(
    `SELECT id, tenant_id, user_id, name, email, phone, address, photo, employee_code, designation, department,
            department_id, grade, status, joining_date, termination_date, salary, adjustments, projects, buildings,
            created_by, updated_by, deleted_at, created_at, updated_at
     FROM payroll_employees WHERE tenant_id = $1 AND department_id = $2 AND deleted_at IS NULL ORDER BY name ASC`,
    [tenantId, departmentId]
  );
  return r.rows;
}

function pickEmployeePayload(body: Record<string, unknown>) {
  const salary = j(body.salary, { basic: 0, allowances: [], deductions: [] });
  const adjustments = j(body.adjustments, []);
  const projects = j(body.projects, []);
  const buildings = j(body.buildings, []);
  const joining = String(body.joining_date ?? body.joiningDate ?? '').slice(0, 10);
  if (!joining) throw new Error('joining_date is required.');
  return {
    name: String(body.name ?? '').trim(),
    email: optStr(body.email),
    phone: optStr(body.phone),
    address: optStr(body.address),
    photo: optStr(body.photo),
    employee_code: optStr(body.employee_code ?? body.employeeCode),
    designation: String(body.designation ?? '').trim() || 'Staff',
    department: String(body.department ?? '').trim() || 'General',
    department_id: optStr(body.department_id ?? body.departmentId),
    grade: String(body.grade ?? ''),
    status: String(body.status ?? 'ACTIVE'),
    joining_date: joining,
    termination_date:
      body.termination_date === null || body.terminationDate === null
        ? null
        : optStr(body.termination_date ?? body.terminationDate),
    salary,
    adjustments,
    projects,
    buildings,
  };
}

export async function upsertEmployee(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>,
  userId: string | null
): Promise<PayrollEmployeeRow> {
  const id =
    typeof body.id === 'string' && body.id.trim()
      ? body.id.trim()
      : `pe_${randomUUID().replace(/-/g, '')}`;
  const p = pickEmployeePayload(body);
  if (!p.name) throw new Error('name is required.');

  const r = await client.query<PayrollEmployeeRow>(
    `INSERT INTO payroll_employees (
       id, tenant_id, user_id, name, email, phone, address, photo, employee_code, designation, department, department_id,
       grade, status, joining_date, termination_date, salary, adjustments, projects, buildings, created_by, updated_by, deleted_at, created_at, updated_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::date,$16::date,$17::jsonb,$18::jsonb,$19::jsonb,$20::jsonb,$21,$22,NULL,NOW(),NOW()
     )
     ON CONFLICT (id) DO UPDATE SET
       user_id = COALESCE(EXCLUDED.user_id, payroll_employees.user_id),
       name = EXCLUDED.name,
       email = EXCLUDED.email,
       phone = EXCLUDED.phone,
       address = EXCLUDED.address,
       photo = EXCLUDED.photo,
       employee_code = EXCLUDED.employee_code,
       designation = EXCLUDED.designation,
       department = EXCLUDED.department,
       department_id = EXCLUDED.department_id,
       grade = EXCLUDED.grade,
       status = EXCLUDED.status,
       joining_date = EXCLUDED.joining_date,
       termination_date = EXCLUDED.termination_date,
       salary = EXCLUDED.salary,
       adjustments = EXCLUDED.adjustments,
       projects = EXCLUDED.projects,
       buildings = EXCLUDED.buildings,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()
     RETURNING id, tenant_id, user_id, name, email, phone, address, photo, employee_code, designation, department,
               department_id, grade, status, joining_date, termination_date, salary, adjustments, projects, buildings,
               created_by, updated_by, deleted_at, created_at, updated_at`,
    [
      id,
      tenantId,
      optStr(body.user_id ?? body.userId),
      p.name,
      p.email,
      p.phone,
      p.address,
      p.photo,
      p.employee_code,
      p.designation,
      p.department,
      p.department_id,
      p.grade,
      p.status,
      p.joining_date,
      p.termination_date,
      JSON.stringify(p.salary),
      JSON.stringify(p.adjustments),
      JSON.stringify(p.projects),
      JSON.stringify(p.buildings),
      userId,
      userId,
    ]
  );
  return r.rows[0];
}

export async function softDeleteEmployee(client: pg.PoolClient, tenantId: string, id: string): Promise<boolean> {
  const u = await client.query(`UPDATE payroll_employees SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`, [
    id,
    tenantId,
  ]);
  return (u.rowCount ?? 0) > 0;
}

// ── Runs & payslips ───────────────────────────────────────────────────────────

export async function listPayrollRuns(client: pg.PoolClient, tenantId: string): Promise<PayrollRunRow[]> {
  const r = await client.query<PayrollRunRow>(
    `SELECT id, tenant_id, month, year, period_start, period_end, status, total_amount::text, employee_count,
            created_by, updated_by, approved_by, approved_at, paid_at, deleted_at, created_at, updated_at
     FROM payroll_runs WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY year DESC, month DESC`,
    [tenantId]
  );
  return r.rows;
}

export async function getPayrollRun(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<PayrollRunRow | null> {
  const r = await client.query<PayrollRunRow>(
    `SELECT id, tenant_id, month, year, period_start, period_end, status, total_amount::text, employee_count,
            created_by, updated_by, approved_by, approved_at, paid_at, deleted_at, created_at, updated_at
     FROM payroll_runs WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, tenantId]
  );
  return r.rows[0] ?? null;
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

  // If this period was soft-deleted, ON CONFLICT must revive the row; otherwise getPayrollRun(process) sees "not found".
  const r = await client.query<PayrollRunRow>(
    `INSERT INTO payroll_runs (id, tenant_id, month, year, status, total_amount, employee_count, created_by, updated_by, deleted_at, created_at, updated_at)
     VALUES ($1,$2,$3,$4,'DRAFT',0,0,$5,$6,NULL,NOW(),NOW())
     ON CONFLICT (tenant_id, month, year) DO UPDATE SET
       deleted_at = CASE WHEN payroll_runs.deleted_at IS NOT NULL THEN NULL ELSE payroll_runs.deleted_at END,
       status = CASE WHEN payroll_runs.deleted_at IS NOT NULL THEN 'DRAFT' ELSE payroll_runs.status END,
       total_amount = CASE WHEN payroll_runs.deleted_at IS NOT NULL THEN 0 ELSE payroll_runs.total_amount END,
       employee_count = CASE WHEN payroll_runs.deleted_at IS NOT NULL THEN 0 ELSE payroll_runs.employee_count END,
       paid_at = CASE WHEN payroll_runs.deleted_at IS NOT NULL THEN NULL ELSE payroll_runs.paid_at END,
       updated_at = NOW()
     RETURNING id, tenant_id, month, year, period_start, period_end, status, total_amount::text, employee_count,
               created_by, updated_by, approved_by, approved_at, paid_at, deleted_at, created_at, updated_at`,
    [id, tenantId, month, year, userId, userId]
  );
  const row = r.rows[0];
  if (!row) throw new Error('Could not create payroll run.');
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
  return u.rows[0] ?? null;
}

export async function updatePayrollRun(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  body: Record<string, unknown>
): Promise<PayrollRunRow | null> {
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
  return u.rows[0] ?? null;
}

export async function deletePayrollRun(client: pg.PoolClient, tenantId: string, id: string): Promise<boolean> {
  await client.query(
    `UPDATE payslips SET deleted_at = NOW(), updated_at = NOW() WHERE payroll_run_id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, tenantId]
  );
  const u = await client.query(`UPDATE payroll_runs SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`, [
    id,
    tenantId,
  ]);
  return (u.rowCount ?? 0) > 0;
}

export async function listPayslipsByRun(
  client: pg.PoolClient,
  tenantId: string,
  runId: string
): Promise<PayslipRow[]> {
  const r = await client.query<PayslipRow>(
    `SELECT id, tenant_id, payroll_run_id, employee_id, basic_pay::text, total_allowances::text, total_deductions::text,
            total_adjustments::text, gross_pay::text, net_pay::text, allowance_details, deduction_details, adjustment_details,
            assignment_snapshot, is_paid, paid_amount::text, paid_at, transaction_id, deleted_at, created_at, updated_at
     FROM payslips WHERE tenant_id = $1 AND payroll_run_id = $2 AND deleted_at IS NULL ORDER BY id ASC`,
    [tenantId, runId]
  );
  return r.rows;
}

export async function listPayslipsByEmployee(
  client: pg.PoolClient,
  tenantId: string,
  employeeId: string
): Promise<PayslipRow[]> {
  const r = await client.query<PayslipRow>(
    `SELECT id, tenant_id, payroll_run_id, employee_id, basic_pay::text, total_allowances::text, total_deductions::text,
            total_adjustments::text, gross_pay::text, net_pay::text, allowance_details, deduction_details, adjustment_details,
            assignment_snapshot, is_paid, paid_amount::text, paid_at, transaction_id, deleted_at, created_at, updated_at
     FROM payslips WHERE tenant_id = $1 AND employee_id = $2 AND deleted_at IS NULL ORDER BY created_at DESC`,
    [tenantId, employeeId]
  );
  return r.rows;
}

export async function getPayslip(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<PayslipRow | null> {
  const r = await client.query<PayslipRow>(
    `SELECT id, tenant_id, payroll_run_id, employee_id, basic_pay::text, total_allowances::text, total_deductions::text,
            total_adjustments::text, gross_pay::text, net_pay::text, allowance_details, deduction_details, adjustment_details,
            assignment_snapshot, is_paid, paid_amount::text, paid_at, transaction_id, deleted_at, created_at, updated_at
     FROM payslips WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, tenantId]
  );
  return r.rows[0] ?? null;
}

function employeeRowToLike(row: PayrollEmployeeRow): PayrollEmployeeLike {
  return {
    joining_date: dateStr(row.joining_date),
    salary: j(row.salary, { basic: 0, allowances: [], deductions: [] }),
    adjustments: j(row.adjustments, []),
  };
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
  onlyEmployeeId?: string | null
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
    const psId = `ps_${randomUUID().replace(/-/g, '')}`;
    const assignmentSnapshot = JSON.stringify({
      projects: j(emp.projects, []),
      buildings: j(emp.buildings, []),
    });
    toInsert.push({
      id: psId,
      tenantId,
      runId,
      employeeId: emp.id,
      computed,
      adjustmentJson: JSON.stringify(j(emp.adjustments, [])),
      assignmentSnapshot,
    });
    newCount++;
    newAmount += computed.net_pay;
    existingEmp.add(emp.id);
  }

  for (let c = 0; c < toInsert.length; c += PAYSIP_BATCH_ROWS) {
    const slice = toInsert.slice(c, c + PAYSIP_BATCH_ROWS);
    const { sql, params } = buildPayslipBatchInsert(slice);
    await client.query(sql, params);
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
  body: Record<string, unknown>
): Promise<PayslipRow | null> {
  const ps = await getPayslip(client, tenantId, payslipId);
  if (!ps) return null;
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
  return getPayslip(client, tenantId, payslipId);
}

export async function softDeletePayslip(client: pg.PoolClient, tenantId: string, payslipId: string): Promise<boolean> {
  const ps = await getPayslip(client, tenantId, payslipId);
  if (!ps) return false;
  const runId = ps.payroll_run_id;
  const u = await client.query(
    `UPDATE payslips SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [payslipId, tenantId]
  );
  if ((u.rowCount ?? 0) === 0) return false;
  await recalculatePayrollRunAggregates(client, tenantId, runId);
  return true;
}

export type BulkPayPayslipLine = {
  payslipId: string;
  amount?: number;
  accountId: string;
  categoryId?: string;
  projectId?: string;
  buildingId?: string;
  description?: string;
  date?: string;
};

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
  const payAmt = Number(body.amount) || numStr(ps.net_pay);
  const accountId = String(body.accountId ?? body.account_id ?? '').trim();
  if (!accountId) throw new Error('accountId is required.');
  const categoryId = optStr(body.categoryId ?? body.category_id);
  const projectId = optStr(body.projectId ?? body.project_id);
  const buildingId = optStr(body.buildingId ?? body.building_id);
  const description = String(body.description ?? `Payroll payment`).trim();

  const newPaid = numStr(ps.paid_amount) + payAmt;
  const net = numStr(ps.net_pay);
  const isPaid = newPaid >= net - 0.01;

  const paymentDateStr =
    body.date != null && String(body.date).trim()
      ? String(body.date).slice(0, 10)
      : todayUtcYyyyMmDd();
  const paymentAt = new Date(paymentDateStr + 'T12:00:00.000Z');

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
    options?.expenseCashBatchCtx ?? null
  );

  const u = await client.query<PayslipRow>(
    `UPDATE payslips SET
       is_paid = $3,
       paid_amount = $4,
       paid_at = CASE WHEN $4::numeric > 0 THEN COALESCE(paid_at, $6::timestamptz) ELSE paid_at END,
       transaction_id = $5,
       updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     RETURNING id, tenant_id, payroll_run_id, employee_id, basic_pay::text, total_allowances::text, total_deductions::text,
               total_adjustments::text, gross_pay::text, net_pay::text, allowance_details, deduction_details, adjustment_details,
               assignment_snapshot, is_paid, paid_amount::text, paid_at, transaction_id, deleted_at, created_at, updated_at`,
    [payslipId, tenantId, isPaid, newPaid, tx.id, paymentAt]
  );
  const row = u.rows[0];
  if (!row) throw new Error('Failed to update payslip.');
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

// ── Tenant config (earning/deduction types + GL defaults) ──────────────────────

export async function getTenantConfig(client: pg.PoolClient, tenantId: string): Promise<PayrollTenantConfigRow> {
  const r = await client.query<PayrollTenantConfigRow>(
    `SELECT tenant_id, earning_types, deduction_types, default_account_id, default_category_id, default_project_id, updated_at
     FROM payroll_tenant_config WHERE tenant_id = $1`,
    [tenantId]
  );
  if (r.rows[0]) return r.rows[0];
  await client.query(
    `INSERT INTO payroll_tenant_config (tenant_id, earning_types, deduction_types, updated_at) VALUES ($1, '[]'::jsonb, '[]'::jsonb, NOW())
     ON CONFLICT (tenant_id) DO NOTHING`,
    [tenantId]
  );
  const again = await client.query<PayrollTenantConfigRow>(
    `SELECT tenant_id, earning_types, deduction_types, default_account_id, default_category_id, default_project_id, updated_at
     FROM payroll_tenant_config WHERE tenant_id = $1`,
    [tenantId]
  );
  return (
    again.rows[0] ?? {
      tenant_id: tenantId,
      earning_types: [],
      deduction_types: [],
      default_account_id: null,
      default_category_id: null,
      default_project_id: null,
      updated_at: new Date(),
    }
  );
}

export async function updateTenantConfigEarningTypes(
  client: pg.PoolClient,
  tenantId: string,
  types: unknown
): Promise<PayrollTenantConfigRow> {
  await getTenantConfig(client, tenantId);
  const r = await client.query<PayrollTenantConfigRow>(
    `UPDATE payroll_tenant_config SET earning_types = $2::jsonb, updated_at = NOW() WHERE tenant_id = $1
     RETURNING tenant_id, earning_types, deduction_types, default_account_id, default_category_id, default_project_id, updated_at`,
    [tenantId, JSON.stringify(types ?? [])]
  );
  const row = r.rows[0];
  if (!row) throw new Error('Failed to update earning types.');
  return row;
}

export async function updateTenantConfigDeductionTypes(
  client: pg.PoolClient,
  tenantId: string,
  types: unknown
): Promise<PayrollTenantConfigRow> {
  await getTenantConfig(client, tenantId);
  const r = await client.query<PayrollTenantConfigRow>(
    `UPDATE payroll_tenant_config SET deduction_types = $2::jsonb, updated_at = NOW() WHERE tenant_id = $1
     RETURNING tenant_id, earning_types, deduction_types, default_account_id, default_category_id, default_project_id, updated_at`,
    [tenantId, JSON.stringify(types ?? [])]
  );
  const row = r.rows[0];
  if (!row) throw new Error('Failed to update deduction types.');
  return row;
}

export async function updatePayrollSettings(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>
): Promise<PayrollTenantConfigRow> {
  const cur = await getTenantConfig(client, tenantId);
  const da =
    body.defaultAccountId !== undefined || body.default_account_id !== undefined
      ? optStr(body.defaultAccountId ?? body.default_account_id)
      : cur.default_account_id;
  const dc =
    body.defaultCategoryId !== undefined || body.default_category_id !== undefined
      ? optStr(body.defaultCategoryId ?? body.default_category_id)
      : cur.default_category_id;
  const dp =
    body.defaultProjectId !== undefined || body.default_project_id !== undefined
      ? optStr(body.defaultProjectId ?? body.default_project_id)
      : cur.default_project_id;
  const r = await client.query<PayrollTenantConfigRow>(
    `UPDATE payroll_tenant_config SET
       default_account_id = $2,
       default_category_id = $3,
       default_project_id = $4,
       updated_at = NOW()
     WHERE tenant_id = $1
     RETURNING tenant_id, earning_types, deduction_types, default_account_id, default_category_id, default_project_id, updated_at`,
    [tenantId, da ?? null, dc ?? null, dp ?? null]
  );
  return r.rows[0];
}

// ── Salary components & payroll projects ──────────────────────────────────────

export async function listSalaryComponents(client: pg.PoolClient, tenantId: string): Promise<PayrollSalaryComponentRow[]> {
  const r = await client.query<PayrollSalaryComponentRow>(
    `SELECT id, tenant_id, name, type, is_percentage, default_value::text, is_taxable, is_active, deleted_at, created_at, updated_at
     FROM payroll_salary_components WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY name ASC`,
    [tenantId]
  );
  return r.rows;
}

export async function listPayrollProjects(client: pg.PoolClient, tenantId: string): Promise<PayrollProjectRow[]> {
  const r = await client.query<PayrollProjectRow>(
    `SELECT id, tenant_id, name, code, description, status, created_by, updated_by, deleted_at, created_at, updated_at
     FROM payroll_projects WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY name ASC`,
    [tenantId]
  );
  return r.rows;
}

export async function upsertPayrollProject(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>,
  userId: string | null
): Promise<PayrollProjectRow> {
  const id =
    typeof body.id === 'string' && body.id.trim() ? body.id.trim() : `ppj_${randomUUID().replace(/-/g, '')}`;
  const name = String(body.name ?? '').trim();
  if (!name) throw new Error('name is required.');
  const code = String(body.code ?? '').trim() || id.slice(0, 8).toUpperCase();
  const description = optStr(body.description);
  const status = String(body.status ?? 'ACTIVE');

  const r = await client.query<PayrollProjectRow>(
    `INSERT INTO payroll_projects (id, tenant_id, name, code, description, status, created_by, updated_by, deleted_at, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL,NOW(),NOW())
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       code = EXCLUDED.code,
       description = EXCLUDED.description,
       status = EXCLUDED.status,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()
     RETURNING id, tenant_id, name, code, description, status, created_by, updated_by, deleted_at, created_at, updated_at`,
    [id, tenantId, name, code, description, status, userId, userId]
  );
  return r.rows[0];
}

export async function migrateDepartmentNamesToIds(client: pg.PoolClient, tenantId: string): Promise<number> {
  const depts = await listDepartments(client, tenantId);
  const byName = new Map(depts.map((d) => [d.name.toLowerCase(), d.id]));
  const emps = await client.query<{ id: string; department: string; department_id: string | null }>(
    `SELECT id, department, department_id FROM payroll_employees WHERE tenant_id = $1 AND deleted_at IS NULL`,
    [tenantId]
  );
  let n = 0;
  for (const e of emps.rows) {
    const match = byName.get(e.department.toLowerCase());
    const did = e.department_id || match;
    if (did && did !== e.department_id) {
      await client.query(`UPDATE payroll_employees SET department_id = $3, updated_at = NOW() WHERE id = $1 AND tenant_id = $2`, [
        e.id,
        tenantId,
        did,
      ]);
      n++;
    }
  }
  return n;
}

export async function departmentStats(
  client: pg.PoolClient,
  tenantId: string
): Promise<{ id: string; name: string; code?: string; total_employees: number; active_employees: number; total_basic_salary: number; budget_allocation: number }[]> {
  const depts = await listDepartments(client, tenantId);
  const emps = await listEmployees(client, tenantId);
  return depts.map((d) => {
    const inDept = emps.filter((e) => e.department_id === d.id || e.department === d.name);
    const active = inDept.filter((e) => e.status === 'ACTIVE');
    const totalBasic = inDept.reduce((s, e) => {
      const sal = j(e.salary, { basic: 0 }) as { basic?: number };
      return s + (typeof sal.basic === 'number' ? sal.basic : 0);
    }, 0);
    return {
      id: d.id,
      name: d.name,
      code: d.code ?? undefined,
      total_employees: inDept.length,
      active_employees: active.length,
      total_basic_salary: totalBasic,
      budget_allocation: numStr(d.budget_allocation),
    };
  });
}
