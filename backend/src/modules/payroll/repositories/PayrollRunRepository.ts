import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { PayrollRunRow } from '../../../services/payroll/payrollTypes.js';

const RUN_COLUMNS = `id, tenant_id, month, year, period_start, period_end, status, total_amount::text, employee_count,
  created_by, updated_by, approved_by, approved_at, paid_at, deleted_at, created_at, updated_at`;

export class PayrollRunRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async getById(client: pg.PoolClient, id: string): Promise<PayrollRunRow | null> {
    const r = await client.query<PayrollRunRow>(
      `SELECT ${RUN_COLUMNS}
       FROM payroll_runs WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async listActive(client: pg.PoolClient): Promise<PayrollRunRow[]> {
    const r = await client.query<PayrollRunRow>(
      `SELECT ${RUN_COLUMNS}
       FROM payroll_runs WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY year DESC, month DESC`,
      [this.tenantId]
    );
    return r.rows;
  }

  async listChangedSince(client: pg.PoolClient, since: Date): Promise<PayrollRunRow[]> {
    const r = await client.query<PayrollRunRow>(
      `SELECT ${RUN_COLUMNS}
       FROM payroll_runs WHERE tenant_id = $1 AND updated_at > $2 ORDER BY updated_at ASC`,
      [this.tenantId, since]
    );
    return r.rows;
  }
}
