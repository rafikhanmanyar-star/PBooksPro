import type pg from 'pg';
import { randomUUID } from 'crypto';
import { optStr } from './payrollHelpers.js';
import { type PayrollDepartmentRow, type PayrollGradeRow } from './payrollTypes.js';

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
