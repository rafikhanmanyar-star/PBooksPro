import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { PayrollSalaryComponentRow } from '../services/payroll/payrollTypes.js';

const COMPONENT_COLUMNS = `id, tenant_id, name, type, is_percentage, default_value::text, is_taxable, is_active, deleted_at, created_at, updated_at`;

export class PayrollSalaryComponentRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async listActive(client: pg.PoolClient): Promise<PayrollSalaryComponentRow[]> {
    const r = await client.query<PayrollSalaryComponentRow>(
      `SELECT ${COMPONENT_COLUMNS}
       FROM payroll_salary_components WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY name ASC`,
      [this.tenantId]
    );
    return r.rows;
  }

  async listChangedSince(client: pg.PoolClient, since: Date): Promise<PayrollSalaryComponentRow[]> {
    const r = await client.query<PayrollSalaryComponentRow>(
      `SELECT ${COMPONENT_COLUMNS}
       FROM payroll_salary_components WHERE tenant_id = $1 AND updated_at > $2 ORDER BY updated_at ASC`,
      [this.tenantId, since]
    );
    return r.rows;
  }
}
