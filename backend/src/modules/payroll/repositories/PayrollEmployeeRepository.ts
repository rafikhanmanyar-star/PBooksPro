import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { PayrollEmployeeRow } from '../../../services/payroll/payrollTypes.js';

const EMPLOYEE_COLUMNS = `id, tenant_id, user_id, name, email, phone, address, photo, employee_code, designation, department,
  department_id, grade, status, joining_date, termination_date, salary, adjustments, projects, buildings,
  created_by, updated_by, deleted_at, created_at, updated_at`;

export type PayrollEmployeeWriteFields = {
  user_id: string | null | undefined;
  name: string;
  email: string | null | undefined;
  phone: string | null | undefined;
  address: string | null | undefined;
  photo: string | null | undefined;
  employee_code: string | null | undefined;
  designation: string;
  department: string;
  department_id: string | null | undefined;
  grade: string;
  status: string;
  joining_date: string;
  termination_date: string | null | undefined;
  salary: unknown;
  adjustments: unknown;
  projects: unknown;
  buildings: unknown;
};

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

  async upsertEmployee(
    client: pg.PoolClient,
    id: string,
    fields: PayrollEmployeeWriteFields,
    userId: string | null
  ): Promise<PayrollEmployeeRow> {
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
       RETURNING ${EMPLOYEE_COLUMNS}`,
      [
        id,
        this.tenantId,
        fields.user_id ?? null,
        fields.name,
        fields.email,
        fields.phone,
        fields.address,
        fields.photo,
        fields.employee_code,
        fields.designation,
        fields.department,
        fields.department_id,
        fields.grade,
        fields.status,
        fields.joining_date,
        fields.termination_date,
        JSON.stringify(fields.salary),
        JSON.stringify(fields.adjustments),
        JSON.stringify(fields.projects),
        JSON.stringify(fields.buildings),
        userId,
        userId,
      ]
    );
    const row = r.rows[0];
    if (!row) throw new Error('Failed to upsert payroll employee.');
    return row;
  }

  async markDeleted(client: pg.PoolClient, id: string): Promise<boolean> {
    const r = await client.query(
      `UPDATE payroll_employees SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, this.tenantId]
    );
    return (r.rowCount ?? 0) > 0;
  }

  async setDepartmentId(client: pg.PoolClient, id: string, departmentId: string): Promise<void> {
    await client.query(
      `UPDATE payroll_employees SET department_id = $3, updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
      [id, this.tenantId, departmentId]
    );
  }
}
