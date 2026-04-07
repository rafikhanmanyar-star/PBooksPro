/**
 * Persist payroll_runs, payroll_employees, and payslips to SQLite when running in Electron.
 * Keeps localStorage in sync: hydrate from DB on load, persist to DB on write.
 * FK order: payroll_runs and payroll_employees must exist before payslips.
 */

import { sqliteQuery, sqliteRun, isElectronWithSqlite } from '../../../services/electronSqliteStorage';
import {
  type PayrollRun,
  type Payslip,
  type PayrollEmployee,
  type Department,
  type GradeLevel,
  parseAssignmentSnapshotFromApi,
} from '../types';
import { coercePayslipAmounts } from '../utils/payslipPaymentState';

export async function hydratePayrollFromDb(tenantId: string): Promise<{
  runs: PayrollRun[];
  payslips: Payslip[];
  employees: PayrollEmployee[];
  departments: Department[];
  grades: GradeLevel[];
}> {
  const empty = { runs: [], payslips: [], employees: [], departments: [], grades: [] };
  if (!tenantId || !isElectronWithSqlite()) return empty;

  const safeQuery = async <T>(sql: string, params: unknown[]): Promise<T[]> => {
    try { return await sqliteQuery<T>(sql, params); } catch { return []; }
  };

  const [runRows, payslipRows, empRows, deptRows, gradeRows] = await Promise.all([
    safeQuery<Record<string, unknown>>('SELECT * FROM payroll_runs WHERE tenant_id = ? ORDER BY year DESC, month DESC', [tenantId]),
    safeQuery<Record<string, unknown>>('SELECT * FROM payslips WHERE tenant_id = ?', [tenantId]),
    safeQuery<Record<string, unknown>>('SELECT * FROM payroll_employees WHERE tenant_id = ?', [tenantId]),
    safeQuery<Record<string, unknown>>('SELECT * FROM payroll_departments WHERE tenant_id = ?', [tenantId]),
    safeQuery<Record<string, unknown>>('SELECT * FROM payroll_grades WHERE tenant_id = ?', [tenantId]),
  ]);

  return {
    runs: runRows.map(rowToRun),
    payslips: payslipRows.map(rowToPayslip),
    employees: empRows.map(rowToEmployee),
    departments: deptRows.map(rowToDepartment),
    grades: gradeRows.map(rowToGrade),
  };
}

export async function persistPayrollRunsToDb(tenantId: string, runs: PayrollRun[]): Promise<void> {
  if (!tenantId || !isElectronWithSqlite()) return;
  try {
    for (const run of runs) {
      await sqliteRun(
        `INSERT OR REPLACE INTO payroll_runs (id, tenant_id, month, year, period_start, period_end, status, total_amount, employee_count, created_by, updated_by, approved_by, approved_at, paid_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          run.id,
          tenantId,
          run.month,
          run.year,
          run.period_start ?? null,
          run.period_end ?? null,
          run.status ?? 'DRAFT',
          run.total_amount ?? 0,
          run.employee_count ?? 0,
          run.created_by ?? null,
          run.updated_by ?? null,
          run.approved_by ?? null,
          run.approved_at ?? null,
          run.paid_at ?? null,
          run.created_at ?? new Date().toISOString(),
          run.updated_at ?? new Date().toISOString()
        ]
      );
    }
  } catch (_) {
    // DB may not have table or FK constraint; keep using localStorage
  }
}

/** Persist payroll_departments to SQLite. Call before persistPayrollEmployeesToDb so department_id FK is satisfied. */
export async function persistPayrollDepartmentsToDb(tenantId: string, departments: Department[]): Promise<void> {
  if (!tenantId || !isElectronWithSqlite()) return;
  try {
    for (const d of departments) {
      await sqliteRun(
        `INSERT OR REPLACE INTO payroll_departments (id, tenant_id, name, code, description, parent_department_id, head_employee_id, cost_center_code, budget_allocation, is_active, created_by, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          d.id,
          tenantId,
          d.name ?? '',
          d.code ?? null,
          d.description ?? null,
          d.parent_department_id ?? null,
          d.head_employee_id ?? null,
          d.cost_center_code ?? null,
          d.budget_allocation ?? 0,
          d.is_active ? 1 : 0,
          d.created_by ?? null,
          d.updated_by ?? null,
          d.created_at ?? new Date().toISOString(),
          d.updated_at ?? new Date().toISOString()
        ]
      );
    }
  } catch (_) {
    // DB may not have table
  }
}

/** Persist payroll_grades to SQLite. */
export async function persistPayrollGradesToDb(tenantId: string, grades: GradeLevel[]): Promise<void> {
  if (!tenantId || !isElectronWithSqlite()) return;
  try {
    for (const g of grades) {
      await sqliteRun(
        `INSERT OR REPLACE INTO payroll_grades (id, tenant_id, name, description, min_salary, max_salary, created_by, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          g.id,
          tenantId,
          g.name ?? '',
          g.description ?? '',
          g.min_salary ?? 0,
          g.max_salary ?? 0,
          g.created_by ?? null,
          g.updated_by ?? null,
          g.created_at ?? new Date().toISOString(),
          g.updated_at ?? new Date().toISOString()
        ]
      );
    }
  } catch (_) {
    // DB may not have table
  }
}

/** Persist payroll_employees so payslips FK (employee_id) can succeed. Call before persistPayslipsToDb. */
export async function persistPayrollEmployeesToDb(tenantId: string, employees: PayrollEmployee[]): Promise<void> {
  if (!tenantId || !isElectronWithSqlite()) return;
  try {
    for (const emp of employees) {
      const salaryJson = typeof emp.salary === 'string' ? emp.salary : JSON.stringify(emp.salary ?? { basic: 0, allowances: [], deductions: [] });
      const adjustmentsJson = typeof emp.adjustments === 'string' ? emp.adjustments : JSON.stringify(emp.adjustments ?? []);
      const projectsJson = typeof emp.projects === 'string' ? emp.projects : JSON.stringify(emp.projects ?? []);
      const buildingsJson =
        typeof emp.buildings === 'string' ? emp.buildings : JSON.stringify(emp.buildings ?? []);
      await sqliteRun(
        `INSERT OR REPLACE INTO payroll_employees (id, tenant_id, user_id, name, email, phone, address, photo, employee_code, designation, department, department_id, grade, status, joining_date, termination_date, salary, adjustments, projects, buildings, created_by, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          emp.id,
          tenantId,
          emp.user_id ?? null,
          emp.name ?? '',
          emp.email ?? null,
          emp.phone ?? null,
          emp.address ?? null,
          emp.photo ?? null,
          emp.employee_code ?? null,
          emp.designation ?? '',
          emp.department ?? '',
          emp.department_id ?? null,
          emp.grade ?? null,
          (emp.status as string) ?? 'ACTIVE',
          emp.joining_date ?? '',
          emp.termination_date ?? null,
          salaryJson,
          adjustmentsJson,
          projectsJson,
          buildingsJson,
          emp.created_by ?? 'system',
          emp.updated_by ?? null,
          emp.created_at ?? new Date().toISOString(),
          emp.updated_at ?? new Date().toISOString()
        ]
      );
    }
  } catch (_) {
    // DB may not have table; keep using localStorage
  }
}

export async function deletePayrollRunFromDb(tenantId: string, runId: string): Promise<void> {
  if (!tenantId || !runId || !isElectronWithSqlite()) return;
  try {
    await sqliteRun('DELETE FROM payroll_runs WHERE tenant_id = ? AND id = ?', [tenantId, runId]);
  } catch (_) {}
}

export async function persistPayslipsToDb(tenantId: string, payslips: Payslip[]): Promise<void> {
  if (!tenantId || !isElectronWithSqlite()) return;
  try {
    for (const ps of payslips) {
      const assignmentJson =
        ps.assignment_snapshot != null
          ? JSON.stringify(ps.assignment_snapshot)
          : null;
      await sqliteRun(
        `INSERT OR REPLACE INTO payslips (id, tenant_id, payroll_run_id, employee_id, basic_pay, total_allowances, total_deductions, total_adjustments, gross_pay, net_pay, allowance_details, deduction_details, adjustment_details, assignment_snapshot, is_paid, paid_amount, paid_at, transaction_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ps.id,
          tenantId,
          ps.payroll_run_id,
          ps.employee_id,
          ps.basic_pay ?? 0,
          ps.total_allowances ?? 0,
          ps.total_deductions ?? 0,
          ps.total_adjustments ?? 0,
          ps.gross_pay ?? 0,
          ps.net_pay ?? 0,
          typeof ps.allowance_details === 'string' ? ps.allowance_details : JSON.stringify(ps.allowance_details ?? []),
          typeof ps.deduction_details === 'string' ? ps.deduction_details : JSON.stringify(ps.deduction_details ?? []),
          typeof ps.adjustment_details === 'string' ? ps.adjustment_details : JSON.stringify(ps.adjustment_details ?? []),
          assignmentJson,
          ps.is_paid ? 1 : 0,
          ps.paid_amount ?? 0,
          ps.paid_at ?? null,
          ps.transaction_id ?? null,
          ps.created_at ?? new Date().toISOString(),
          ps.updated_at ?? new Date().toISOString()
        ]
      );
    }
  } catch (_) {
    // FK to payroll_runs / payroll_employees: ensure persistPayrollToDbInOrder is used
  }
}

/** Persist runs, departments, grades, employees, then payslips (FK order). Use this when saving payslips or employees. */
export async function persistPayrollToDbInOrder(
  tenantId: string,
  runs: PayrollRun[],
  employees: PayrollEmployee[],
  payslips: Payslip[],
  departments?: Department[],
  grades?: GradeLevel[]
): Promise<void> {
  if (!tenantId || !isElectronWithSqlite()) return;
  await persistPayrollRunsToDb(tenantId, runs);
  if (departments && departments.length > 0) await persistPayrollDepartmentsToDb(tenantId, departments);
  if (grades && grades.length > 0) await persistPayrollGradesToDb(tenantId, grades);
  await persistPayrollEmployeesToDb(tenantId, employees);
  await persistPayslipsToDb(tenantId, payslips);
}

export async function deletePayslipFromDb(tenantId: string, payslipId: string): Promise<void> {
  if (!tenantId || !payslipId || !isElectronWithSqlite()) return;
  try {
    await sqliteRun('DELETE FROM payslips WHERE tenant_id = ? AND id = ?', [tenantId, payslipId]);
  } catch (_) {}
}

function rowToRun(row: Record<string, unknown>): PayrollRun {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    month: String(row.month),
    year: Number(row.year),
    period_start: row.period_start != null ? String(row.period_start) : undefined,
    period_end: row.period_end != null ? String(row.period_end) : undefined,
    status: (row.status as PayrollRun['status']) ?? 'DRAFT',
    total_amount: Number(row.total_amount ?? 0),
    employee_count: Number(row.employee_count ?? 0),
    created_by: String(row.created_by ?? ''),
    updated_by: row.updated_by != null ? String(row.updated_by) : undefined,
    approved_by: row.approved_by != null ? String(row.approved_by) : undefined,
    approved_at: row.approved_at != null ? String(row.approved_at) : undefined,
    paid_at: row.paid_at != null ? String(row.paid_at) : undefined,
    created_at: row.created_at != null ? String(row.created_at) : undefined,
    updated_at: row.updated_at != null ? String(row.updated_at) : undefined
  };
}

function rowToPayslip(row: Record<string, unknown>): Payslip {
  const parseJson = (v: unknown): unknown[] => {
    if (v == null) return [];
    if (typeof v === 'string') try { return JSON.parse(v); } catch { return []; }
    return Array.isArray(v) ? v : [];
  };
  const net = Number(row.net_pay ?? 0);
  const rawPaid = Number(row.paid_amount ?? 0);
  const isPaidFlag = Number(row.is_paid) === 1;
  const payment = coercePayslipAmounts(net, rawPaid, isPaidFlag);
  const assignment_snapshot = parseAssignmentSnapshotFromApi(row.assignment_snapshot);
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    payroll_run_id: String(row.payroll_run_id),
    employee_id: String(row.employee_id),
    basic_pay: Number(row.basic_pay ?? 0),
    total_allowances: Number(row.total_allowances ?? 0),
    total_deductions: Number(row.total_deductions ?? 0),
    total_adjustments: Number(row.total_adjustments ?? 0),
    gross_pay: Number(row.gross_pay ?? 0),
    net_pay: payment.net_pay,
    allowance_details: parseJson(row.allowance_details) as Payslip['allowance_details'],
    deduction_details: parseJson(row.deduction_details) as Payslip['deduction_details'],
    adjustment_details: parseJson(row.adjustment_details) as Payslip['adjustment_details'],
    ...(assignment_snapshot !== undefined ? { assignment_snapshot } : {}),
    is_paid: payment.is_paid,
    paid_amount: payment.paid_amount,
    paid_at: row.paid_at != null ? String(row.paid_at) : undefined,
    transaction_id: row.transaction_id != null ? String(row.transaction_id) : undefined,
    created_at: row.created_at != null ? String(row.created_at) : undefined,
    updated_at: row.updated_at != null ? String(row.updated_at) : undefined
  };
}

function rowToEmployee(row: Record<string, unknown>): PayrollEmployee {
  const parseJson = (v: unknown): unknown => {
    if (v == null) return undefined;
    if (typeof v === 'string') try { return JSON.parse(v); } catch { return undefined; }
    return v;
  };
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    user_id: row.user_id != null ? String(row.user_id) : undefined,
    name: String(row.name ?? ''),
    email: row.email != null ? String(row.email) : undefined,
    phone: row.phone != null ? String(row.phone) : undefined,
    address: row.address != null ? String(row.address) : undefined,
    photo: row.photo != null ? String(row.photo) : undefined,
    employee_code: row.employee_code != null ? String(row.employee_code) : undefined,
    designation: String(row.designation ?? ''),
    department: String(row.department ?? ''),
    department_id: row.department_id != null ? String(row.department_id) : undefined,
    grade: String(row.grade ?? ''),
    status: (row.status as PayrollEmployee['status']) ?? 'ACTIVE',
    joining_date: String(row.joining_date ?? ''),
    termination_date: row.termination_date != null ? String(row.termination_date) : undefined,
    salary: (parseJson(row.salary) as PayrollEmployee['salary']) ?? { basic: 0, allowances: [], deductions: [] },
    adjustments: (parseJson(row.adjustments) as PayrollEmployee['adjustments']) ?? [],
    projects: (parseJson(row.projects) as PayrollEmployee['projects']) ?? [],
    buildings: (() => {
      const raw = parseJson(row.buildings);
      const arr = Array.isArray(raw) ? raw : [];
      return arr.map((b: any) => ({
        building_id: b.building_id || b.buildingId,
        building_name: b.building_name || b.buildingName,
        percentage: Number(b.percentage) || 0,
        start_date: b.start_date || b.startDate,
        end_date: b.end_date || b.endDate,
      }));
    })(),
    created_by: row.created_by != null ? String(row.created_by) : undefined,
    updated_by: row.updated_by != null ? String(row.updated_by) : undefined,
    created_at: row.created_at != null ? String(row.created_at) : undefined,
    updated_at: row.updated_at != null ? String(row.updated_at) : undefined,
  };
}

function rowToDepartment(row: Record<string, unknown>): Department {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    name: String(row.name ?? ''),
    code: row.code != null ? String(row.code) : undefined,
    description: row.description != null ? String(row.description) : undefined,
    parent_department_id: row.parent_department_id != null ? String(row.parent_department_id) : undefined,
    head_employee_id: row.head_employee_id != null ? String(row.head_employee_id) : undefined,
    cost_center_code: row.cost_center_code != null ? String(row.cost_center_code) : undefined,
    budget_allocation: Number(row.budget_allocation ?? 0),
    is_active: Number(row.is_active) === 1,
    created_by: row.created_by != null ? String(row.created_by) : undefined,
    updated_by: row.updated_by != null ? String(row.updated_by) : undefined,
    created_at: row.created_at != null ? String(row.created_at) : undefined,
    updated_at: row.updated_at != null ? String(row.updated_at) : undefined,
  };
}

function rowToGrade(row: Record<string, unknown>): GradeLevel {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    name: String(row.name ?? ''),
    description: String(row.description ?? ''),
    min_salary: Number(row.min_salary ?? 0),
    max_salary: Number(row.max_salary ?? 0),
    created_by: row.created_by != null ? String(row.created_by) : undefined,
    updated_by: row.updated_by != null ? String(row.updated_by) : undefined,
    created_at: row.created_at != null ? String(row.created_at) : undefined,
    updated_at: row.updated_at != null ? String(row.updated_at) : undefined,
  };
}
