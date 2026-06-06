import type pg from 'pg';
import { randomUUID } from 'crypto';
import { j, numStr, optStr } from './payrollHelpers.js';
import { listDepartments } from './payrollDepartmentsGrades.js';
import { listEmployees } from './payrollEmployees.js';
import {
  type PayrollProjectRow,
  type PayrollSalaryComponentRow,
  type PayrollTenantConfigRow,
} from './payrollTypes.js';

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
