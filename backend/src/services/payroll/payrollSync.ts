import type pg from 'pg';
import { PayrollDepartmentRepository } from '../../modules/payroll/repositories/PayrollDepartmentRepository.js';
import { PayrollEmployeeRepository } from '../../modules/payroll/repositories/PayrollEmployeeRepository.js';
import { PayrollGradeRepository } from '../../modules/payroll/repositories/PayrollGradeRepository.js';
import { PayrollProjectRepository } from '../../modules/payroll/repositories/PayrollProjectRepository.js';
import { PayrollRunRepository } from '../../modules/payroll/repositories/PayrollRunRepository.js';
import { PayrollSalaryComponentRepository } from '../../modules/payroll/repositories/PayrollSalaryComponentRepository.js';
import { PayrollTenantConfigRepository } from '../../modules/payroll/repositories/PayrollTenantConfigRepository.js';
import { PayslipRepository } from '../../modules/payroll/repositories/PayslipRepository.js';
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
  return new PayslipRepository(tenantId).listChangedSince(client, since);
}

export async function listSalaryComponentsChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<PayrollSalaryComponentRow[]> {
  return new PayrollSalaryComponentRepository(tenantId).listChangedSince(client, since);
}

export async function listPayrollProjectsChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<PayrollProjectRow[]> {
  return new PayrollProjectRepository(tenantId).listChangedSince(client, since);
}

export async function getTenantConfigIfChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<PayrollTenantConfigRow | null> {
  return new PayrollTenantConfigRepository(tenantId).getIfChangedSince(client, since);
}
