import type pg from 'pg';
import { randomUUID } from 'crypto';
import { type PayrollEmployeeLike } from '../../payroll/salaryComputation.js';
import { dateStr, j, optStr } from './payrollHelpers.js';
import { type PayrollEmployeeRow } from './payrollTypes.js';

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

export function employeeRowToLike(row: PayrollEmployeeRow): PayrollEmployeeLike {
  return {
    joining_date: dateStr(row.joining_date),
    salary: j(row.salary, { basic: 0, allowances: [], deductions: [] }),
    adjustments: j(row.adjustments, []),
  };
}
