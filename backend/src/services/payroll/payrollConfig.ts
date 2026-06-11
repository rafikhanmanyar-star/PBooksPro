import type pg from 'pg';
import { randomUUID } from 'crypto';
import { recordDomainMutation } from '../../core/recordDomainMutation.js';
import { PayrollEmployeeRepository } from '../../modules/payroll/repositories/PayrollEmployeeRepository.js';
import { PayrollProjectRepository, type PayrollProjectWriteFields } from '../../modules/payroll/repositories/PayrollProjectRepository.js';
import { PayrollSalaryComponentRepository } from '../../modules/payroll/repositories/PayrollSalaryComponentRepository.js';
import { PayrollTenantConfigRepository } from '../../modules/payroll/repositories/PayrollTenantConfigRepository.js';
import { j, numStr, optStr } from './payrollHelpers.js';
import { listDepartments } from './payrollDepartmentsGrades.js';
import { listEmployees } from './payrollEmployees.js';
import {
  rowToPayrollProjectApi,
  rowToTenantConfigApi,
} from './payrollRowMappers.js';
import {
  type PayrollProjectRow,
  type PayrollSalaryComponentRow,
  type PayrollTenantConfigRow,
} from './payrollTypes.js';

export async function getTenantConfig(client: pg.PoolClient, tenantId: string): Promise<PayrollTenantConfigRow> {
  const repo = new PayrollTenantConfigRepository(tenantId);
  const existing = await repo.get(client);
  if (existing) return existing;
  await repo.ensureDefault(client);
  const again = await repo.get(client);
  return (
    again ?? {
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
  types: unknown,
  userId?: string | null
): Promise<PayrollTenantConfigRow> {
  const prior = await getTenantConfig(client, tenantId);
  const row = await new PayrollTenantConfigRepository(tenantId).updateEarningTypes(client, types);
  await recordDomainMutation(client, {
    tenantId,
    userId: userId ?? null,
    module: 'payroll',
    entityType: 'payroll_tenant_config',
    entityId: tenantId,
    action: 'update',
    summary: 'Payroll earning types updated',
    newValue: rowToTenantConfigApi(row),
    oldValue: rowToTenantConfigApi(prior),
  });
  return row;
}

export async function updateTenantConfigDeductionTypes(
  client: pg.PoolClient,
  tenantId: string,
  types: unknown,
  userId?: string | null
): Promise<PayrollTenantConfigRow> {
  const prior = await getTenantConfig(client, tenantId);
  const row = await new PayrollTenantConfigRepository(tenantId).updateDeductionTypes(client, types);
  await recordDomainMutation(client, {
    tenantId,
    userId: userId ?? null,
    module: 'payroll',
    entityType: 'payroll_tenant_config',
    entityId: tenantId,
    action: 'update',
    summary: 'Payroll deduction types updated',
    newValue: rowToTenantConfigApi(row),
    oldValue: rowToTenantConfigApi(prior),
  });
  return row;
}

export async function updatePayrollSettings(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>,
  userId?: string | null
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
  const row = await new PayrollTenantConfigRepository(tenantId).updateDefaults(client, {
    default_account_id: da ?? null,
    default_category_id: dc ?? null,
    default_project_id: dp ?? null,
  });
  if (!row) throw new Error('Failed to update payroll settings.');
  await recordDomainMutation(client, {
    tenantId,
    userId: userId ?? null,
    module: 'payroll',
    entityType: 'payroll_tenant_config',
    entityId: tenantId,
    action: 'update',
    summary: 'Payroll default settings updated',
    newValue: rowToTenantConfigApi(row),
    oldValue: rowToTenantConfigApi(cur),
  });
  return row;
}

export async function listSalaryComponents(client: pg.PoolClient, tenantId: string): Promise<PayrollSalaryComponentRow[]> {
  return new PayrollSalaryComponentRepository(tenantId).listActive(client);
}

export async function listPayrollProjects(client: pg.PoolClient, tenantId: string): Promise<PayrollProjectRow[]> {
  return new PayrollProjectRepository(tenantId).listActive(client);
}

export async function upsertPayrollProject(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>,
  userId: string | null
): Promise<PayrollProjectRow> {
  const id =
    typeof body.id === 'string' && body.id.trim() ? body.id.trim() : `ppj_${randomUUID().replace(/-/g, '')}`;
  const prior = await new PayrollProjectRepository(tenantId).getByIdIncludingDeleted(client, id);
  const name = String(body.name ?? '').trim();
  if (!name) throw new Error('name is required.');
  const fields: PayrollProjectWriteFields = {
    name,
    code: String(body.code ?? '').trim() || id.slice(0, 8).toUpperCase(),
    description: optStr(body.description) ?? null,
    status: String(body.status ?? 'ACTIVE'),
  };

  const row = await new PayrollProjectRepository(tenantId).upsertProject(client, id, fields, userId);
  await recordDomainMutation(client, {
    tenantId,
    userId,
    module: 'payroll',
    entityType: 'payroll_project',
    entityId: row.id,
    action: prior && !prior.deleted_at ? 'update' : 'create',
    summary: `Payroll project ${row.name} ${prior && !prior.deleted_at ? 'updated' : 'created'}`,
    newValue: rowToPayrollProjectApi(row),
    oldValue: prior && !prior.deleted_at ? rowToPayrollProjectApi(prior) : undefined,
  });
  return row;
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
      await new PayrollEmployeeRepository(tenantId).setDepartmentId(client, e.id, did);
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
