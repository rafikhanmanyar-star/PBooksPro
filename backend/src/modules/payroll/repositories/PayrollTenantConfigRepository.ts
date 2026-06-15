import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { PayrollTenantConfigRow } from '../services/payroll/payrollTypes.js';

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

  async ensureDefault(client: pg.PoolClient): Promise<void> {
    await client.query(
      `INSERT INTO payroll_tenant_config (tenant_id, earning_types, deduction_types, updated_at) VALUES ($1, '[]'::jsonb, '[]'::jsonb, NOW())
       ON CONFLICT (tenant_id) DO NOTHING`,
      [this.tenantId]
    );
  }

  async updateEarningTypes(client: pg.PoolClient, types: unknown): Promise<PayrollTenantConfigRow> {
    const r = await client.query<PayrollTenantConfigRow>(
      `UPDATE payroll_tenant_config SET earning_types = $2::jsonb, updated_at = NOW() WHERE tenant_id = $1
       RETURNING ${CONFIG_COLUMNS}`,
      [this.tenantId, JSON.stringify(types ?? [])]
    );
    const row = r.rows[0];
    if (!row) throw new Error('Failed to update earning types.');
    return row;
  }

  async updateDeductionTypes(client: pg.PoolClient, types: unknown): Promise<PayrollTenantConfigRow> {
    const r = await client.query<PayrollTenantConfigRow>(
      `UPDATE payroll_tenant_config SET deduction_types = $2::jsonb, updated_at = NOW() WHERE tenant_id = $1
       RETURNING ${CONFIG_COLUMNS}`,
      [this.tenantId, JSON.stringify(types ?? [])]
    );
    const row = r.rows[0];
    if (!row) throw new Error('Failed to update deduction types.');
    return row;
  }

  async updateDefaults(
    client: pg.PoolClient,
    defaults: {
      default_account_id: string | null;
      default_category_id: string | null;
      default_project_id: string | null;
    }
  ): Promise<PayrollTenantConfigRow> {
    const r = await client.query<PayrollTenantConfigRow>(
      `UPDATE payroll_tenant_config SET
         default_account_id = $2,
         default_category_id = $3,
         default_project_id = $4,
         updated_at = NOW()
       WHERE tenant_id = $1
       RETURNING ${CONFIG_COLUMNS}`,
      [this.tenantId, defaults.default_account_id, defaults.default_category_id, defaults.default_project_id]
    );
    const row = r.rows[0];
    if (!row) throw new Error('Failed to update payroll settings.');
    return row;
  }
}
