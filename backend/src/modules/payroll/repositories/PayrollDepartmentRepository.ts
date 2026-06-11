import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { PayrollDepartmentRow } from '../../../services/payroll/payrollTypes.js';

const DEPARTMENT_COLUMNS = `id, tenant_id, name, code, description, parent_department_id, head_employee_id, cost_center_code,
  budget_allocation::text, is_active, created_by, updated_by, deleted_at, created_at, updated_at`;

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
}
