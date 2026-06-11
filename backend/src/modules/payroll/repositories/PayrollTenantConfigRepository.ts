import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { PayrollTenantConfigRow } from '../../../services/payroll/payrollTypes.js';

const CONFIG_COLUMNS = `tenant_id, earning_types, deduction_types, default_account_id, default_category_id, default_project_id, updated_at`;

export class PayrollTenantConfigRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async get(client: pg.PoolClient): Promise<PayrollTenantConfigRow | null> {
    const r = await client.query<PayrollTenantConfigRow>(
      `SELECT ${CONFIG_COLUMNS}
       FROM payroll_tenant_config WHERE tenant_id = $1`,
      [this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async getIfChangedSince(client: pg.PoolClient, since: Date): Promise<PayrollTenantConfigRow | null> {
    const r = await client.query<PayrollTenantConfigRow>(
      `SELECT ${CONFIG_COLUMNS}
       FROM payroll_tenant_config WHERE tenant_id = $1 AND updated_at > $2`,
      [this.tenantId, since]
    );
    return r.rows[0] ?? null;
  }
}
