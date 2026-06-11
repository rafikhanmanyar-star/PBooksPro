import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { PayrollEmployeeRow } from '../../../services/payroll/payrollTypes.js';

const EMPLOYEE_COLUMNS = `id, tenant_id, user_id, name, email, phone, address, photo, employee_code, designation, department,
  department_id, grade, status, joining_date, termination_date, salary, adjustments, projects, buildings,
  created_by, updated_by, deleted_at, created_at, updated_at`;

export class PayrollEmployeeRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async getById(client: pg.PoolClient, id: string): Promise<PayrollEmployeeRow | null> {
    const r = await client.query<PayrollEmployeeRow>(
      `SELECT ${EMPLOYEE_COLUMNS}
       FROM payroll_employees WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async getByIdIncludingDeleted(client: pg.PoolClient, id: string): Promise<PayrollEmployeeRow | null> {
    const r = await client.query<PayrollEmployeeRow>(
      `SELECT ${EMPLOYEE_COLUMNS}
       FROM payroll_employees WHERE id = $1 AND tenant_id = $2`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async listActive(client: pg.PoolClient): Promise<PayrollEmployeeRow[]> {
    const r = await client.query<PayrollEmployeeRow>(
      `SELECT ${EMPLOYEE_COLUMNS}
       FROM payroll_employees WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY name ASC`,
      [this.tenantId]
    );
    return r.rows;
  }

  async listByDepartment(client: pg.PoolClient, departmentId: string): Promise<PayrollEmployeeRow[]> {
    const r = await client.query<PayrollEmployeeRow>(
      `SELECT ${EMPLOYEE_COLUMNS}
       FROM payroll_employees WHERE tenant_id = $1 AND department_id = $2 AND deleted_at IS NULL ORDER BY name ASC`,
      [this.tenantId, departmentId]
    );
    return r.rows;
  }

  async listChangedSince(client: pg.PoolClient, since: Date): Promise<PayrollEmployeeRow[]> {
    const r = await client.query<PayrollEmployeeRow>(
      `SELECT ${EMPLOYEE_COLUMNS}
       FROM payroll_employees WHERE tenant_id = $1 AND updated_at > $2 ORDER BY updated_at ASC`,
      [this.tenantId, since]
    );
    return r.rows;
  }
}
