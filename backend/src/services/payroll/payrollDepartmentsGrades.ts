import type pg from 'pg';
import { randomUUID } from 'crypto';
import { recordDomainMutation } from '../../core/recordDomainMutation.js';
import { PayrollDepartmentRepository, type PayrollDepartmentWriteFields } from '../../modules/payroll/repositories/PayrollDepartmentRepository.js';
import { PayrollGradeRepository, type PayrollGradeWriteFields } from '../../modules/payroll/repositories/PayrollGradeRepository.js';
import { optStr } from './payrollHelpers.js';
import { rowToDepartmentApi, rowToGradeApi } from './payrollRowMappers.js';
import { type PayrollDepartmentRow, type PayrollGradeRow } from './payrollTypes.js';

export async function listDepartments(client: pg.PoolClient, tenantId: string): Promise<PayrollDepartmentRow[]> {
  return new PayrollDepartmentRepository(tenantId).listActive(client);
}

export async function getDepartment(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<PayrollDepartmentRow | null> {
  return new PayrollDepartmentRepository(tenantId).getById(client, id);
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

  const prior = await new PayrollDepartmentRepository(tenantId).getByIdIncludingDeleted(client, id);

  const fields: PayrollDepartmentWriteFields = {
    name,
    code,
    description,
    parent_department_id,
    head_employee_id,
    cost_center_code,
    budget_allocation,
    is_active,
  };

  const row = await new PayrollDepartmentRepository(tenantId).upsertDepartment(client, id, fields, userId);
  await recordDomainMutation(client, {
    tenantId,
    userId,
    module: 'payroll',
    entityType: 'payroll_department',
    entityId: row.id,
    action: prior ? 'update' : 'create',
    summary: `Payroll department ${row.name} ${prior ? 'updated' : 'created'}`,
    newValue: rowToDepartmentApi(row),
    oldValue: prior ? rowToDepartmentApi(prior) : undefined,
  });
  return row;
}

export async function softDeleteDepartment(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<boolean> {
  const prior = await new PayrollDepartmentRepository(tenantId).getById(client, id);
  const ok = await new PayrollDepartmentRepository(tenantId).markDeleted(client, id);
  if (ok && prior) {
    await recordDomainMutation(client, {
      tenantId,
      userId: prior.updated_by ?? prior.created_by,
      module: 'payroll',
      entityType: 'payroll_department',
      entityId: id,
      action: 'delete',
      summary: `Payroll department ${prior.name} deleted`,
      oldValue: rowToDepartmentApi(prior),
    });
  }
  return ok;
}

export async function listGrades(client: pg.PoolClient, tenantId: string): Promise<PayrollGradeRow[]> {
  return new PayrollGradeRepository(tenantId).listActive(client);
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

  const prior = await new PayrollGradeRepository(tenantId).getByIdIncludingDeleted(client, id);

  const fields: PayrollGradeWriteFields = {
    name,
    description,
    min_salary,
    max_salary,
  };

  const row = await new PayrollGradeRepository(tenantId).upsertGrade(client, id, fields, userId);
  await recordDomainMutation(client, {
    tenantId,
    userId,
    module: 'payroll',
    entityType: 'payroll_grade',
    entityId: row.id,
    action: prior ? 'update' : 'create',
    summary: `Payroll grade ${row.name} ${prior ? 'updated' : 'created'}`,
    newValue: rowToGradeApi(row),
    oldValue: prior ? rowToGradeApi(prior) : undefined,
  });
  return row;
}

export async function softDeleteGrade(client: pg.PoolClient, tenantId: string, id: string): Promise<boolean> {
  const prior = await new PayrollGradeRepository(tenantId).getByIdIncludingDeleted(client, id);
  const ok = await new PayrollGradeRepository(tenantId).markDeleted(client, id);
  if (ok && prior && !prior.deleted_at) {
    await recordDomainMutation(client, {
      tenantId,
      userId: prior.updated_by ?? prior.created_by,
      module: 'payroll',
      entityType: 'payroll_grade',
      entityId: id,
      action: 'delete',
      summary: `Payroll grade ${prior.name} deleted`,
      oldValue: rowToGradeApi(prior),
    });
  }
  return ok;
}
