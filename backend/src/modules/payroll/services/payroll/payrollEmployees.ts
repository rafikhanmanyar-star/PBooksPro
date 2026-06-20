import type pg from 'pg';
import { randomUUID } from 'crypto';
import { recordDomainMutation } from '../../../../core/recordDomainMutation.js';
import {
  PayrollEmployeeRepository,
  type PayrollEmployeeWriteFields,
} from '../../repositories/PayrollEmployeeRepository.js';
import { type PayrollEmployeeLike } from '../../../../payroll/salaryComputation.js';
import { dateStr, j, optStr } from './payrollHelpers.js';
import { rowToEmployeeApi } from './payrollRowMappers.js';
import { type PayrollEmployeeRow } from './payrollTypes.js';

import type { DataScopeEnforcementContext } from '../../../../auth/tenantRepositoryScope.js';

export async function listEmployees(
  client: pg.PoolClient,
  tenantId: string,
  scopeCtx?: DataScopeEnforcementContext
): Promise<PayrollEmployeeRow[]> {
  return new PayrollEmployeeRepository(tenantId).listActive(client, scopeCtx);
}

export type EmployeeListPageQuery = {
  page: number;
  pageSize: number;
  limit: number;
  offset: number;
  departmentId?: string;
  search?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
};

export async function listEmployeesPage(
  client: pg.PoolClient,
  tenantId: string,
  query: EmployeeListPageQuery,
  scopeCtx?: DataScopeEnforcementContext
): Promise<{ rows: PayrollEmployeeRow[]; total: number; page: number; pageSize: number }> {
  const { rows, total } = await new PayrollEmployeeRepository(tenantId).listPage(
    client,
    {
      limit: query.limit,
      offset: query.offset,
      departmentId: query.departmentId,
      search: query.search,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
    },
    scopeCtx
  );
  return { rows, total, page: query.page, pageSize: query.pageSize };
}

export async function getEmployee(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  scopeCtx?: DataScopeEnforcementContext
): Promise<PayrollEmployeeRow | null> {
  return new PayrollEmployeeRepository(tenantId).getById(client, id, scopeCtx);
}

export async function listEmployeesByDepartment(
  client: pg.PoolClient,
  tenantId: string,
  departmentId: string
): Promise<PayrollEmployeeRow[]> {
  return new PayrollEmployeeRepository(tenantId).listByDepartment(client, departmentId);
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

  const empRepo = new PayrollEmployeeRepository(tenantId);
  const prior = await empRepo.getByIdIncludingDeleted(client, id);

  const fields: PayrollEmployeeWriteFields = {
    user_id: optStr(body.user_id ?? body.userId),
    name: p.name,
    email: p.email,
    phone: p.phone,
    address: p.address,
    photo: p.photo,
    employee_code: p.employee_code,
    designation: p.designation,
    department: p.department,
    department_id: p.department_id,
    grade: p.grade,
    status: p.status,
    joining_date: p.joining_date,
    termination_date: p.termination_date,
    salary: p.salary,
    adjustments: p.adjustments,
    projects: p.projects,
    buildings: p.buildings,
  };

  const row = await empRepo.upsertEmployee(client, id, fields, userId);
  await recordDomainMutation(client, {
    tenantId,
    userId,
    module: 'payroll',
    entityType: 'payroll_employee',
    entityId: row.id,
    action: prior ? 'update' : 'create',
    summary: `Payroll employee ${row.name} ${prior ? 'updated' : 'created'}`,
    newValue: rowToEmployeeApi(row),
    oldValue: prior ? rowToEmployeeApi(prior) : undefined,
  });
  return row;
}

export async function softDeleteEmployee(client: pg.PoolClient, tenantId: string, id: string): Promise<boolean> {
  const empRepo = new PayrollEmployeeRepository(tenantId);
  const prior = await empRepo.getById(client, id);
  const ok = await empRepo.markDeleted(client, id);
  if (ok && prior) {
    await recordDomainMutation(client, {
      tenantId,
      userId: prior.updated_by ?? prior.created_by,
      module: 'payroll',
      entityType: 'payroll_employee',
      entityId: id,
      action: 'delete',
      summary: `Payroll employee ${prior.name} deleted`,
      oldValue: rowToEmployeeApi(prior),
    });
  }
  return ok;
}

export function employeeRowToLike(row: PayrollEmployeeRow): PayrollEmployeeLike {
  return {
    joining_date: dateStr(row.joining_date),
    salary: j(row.salary, { basic: 0, allowances: [], deductions: [] }),
    adjustments: j(row.adjustments, []),
  };
}
