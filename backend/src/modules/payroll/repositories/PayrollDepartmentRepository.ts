import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { PayrollDepartmentRow } from '../services/payroll/payrollTypes.js';

const DEPARTMENT_COLUMNS = `id, tenant_id, name, code, description, parent_department_id, head_employee_id, cost_center_code,
  budget_allocation::text, is_active, created_by, updated_by, deleted_at, created_at, updated_at`;

export type PayrollDepartmentWriteFields = {
  name: string;
  code: string | null | undefined;
  description: string | null | undefined;
  parent_department_id: string | null | undefined;
  head_employee_id: string | null | undefined;
  cost_center_code: string | null | undefined;
  budget_allocation: number;
  is_active: boolean;
};

export class PayrollDepartmentRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async getById(client: pg.PoolClient, id: string): Promise<PayrollDepartmentRow | null> {
    const r = await client.query<PayrollDepartmentRow>(
      `SELECT ${DEPARTMENT_COLUMNS}
       FROM payroll_departments WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async getByIdIncludingDeleted(client: pg.PoolClient, id: string): Promise<PayrollDepartmentRow | null> {
    const r = await client.query<PayrollDepartmentRow>(
      `SELECT ${DEPARTMENT_COLUMNS}
       FROM payroll_departments WHERE id = $1 AND tenant_id = $2`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async listActive(client: pg.PoolClient): Promise<PayrollDepartmentRow[]> {
    const r = await client.query<PayrollDepartmentRow>(
      `SELECT ${DEPARTMENT_COLUMNS}
       FROM payroll_departments WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY name ASC`,
      [this.tenantId]
    );
    return r.rows;
  }

  async listChangedSince(client: pg.PoolClient, since: Date): Promise<PayrollDepartmentRow[]> {
    const r = await client.query<PayrollDepartmentRow>(
      `SELECT ${DEPARTMENT_COLUMNS}
       FROM payroll_departments WHERE tenant_id = $1 AND updated_at > $2 ORDER BY updated_at ASC`,
      [this.tenantId, since]
    );
    return r.rows;
  }

  async upsertDepartment(
    client: pg.PoolClient,
    id: string,
    fields: PayrollDepartmentWriteFields,
    userId: string | null
  ): Promise<PayrollDepartmentRow> {
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
       RETURNING ${DEPARTMENT_COLUMNS}`,
      [
        id,
        this.tenantId,
        fields.name,
        fields.code,
        fields.description,
        fields.parent_department_id,
        fields.head_employee_id,
        fields.cost_center_code,
        fields.budget_allocation,
        fields.is_active,
        userId,
        userId,
      ]
    );
    const row = r.rows[0];
    if (!row) throw new Error('Failed to upsert payroll department.');
    return row;
  }

  async markDeleted(client: pg.PoolClient, id: string): Promise<boolean> {
    const r = await client.query(
      `UPDATE payroll_departments SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, this.tenantId]
    );
    return (r.rowCount ?? 0) > 0;
  }
}
