import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { PayrollProjectRow } from '../../../services/payroll/payrollTypes.js';

const PROJECT_COLUMNS = `id, tenant_id, name, code, description, status, created_by, updated_by, deleted_at, created_at, updated_at`;

export class PayrollProjectRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async getByIdIncludingDeleted(client: pg.PoolClient, id: string): Promise<PayrollProjectRow | null> {
    const r = await client.query<PayrollProjectRow>(
      `SELECT ${PROJECT_COLUMNS}
       FROM payroll_projects WHERE id = $1 AND tenant_id = $2`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async listActive(client: pg.PoolClient): Promise<PayrollProjectRow[]> {
    const r = await client.query<PayrollProjectRow>(
      `SELECT ${PROJECT_COLUMNS}
       FROM payroll_projects WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY name ASC`,
      [this.tenantId]
    );
    return r.rows;
  }

  async listChangedSince(client: pg.PoolClient, since: Date): Promise<PayrollProjectRow[]> {
    const r = await client.query<PayrollProjectRow>(
      `SELECT ${PROJECT_COLUMNS}
       FROM payroll_projects WHERE tenant_id = $1 AND updated_at > $2 ORDER BY updated_at ASC`,
      [this.tenantId, since]
    );
    return r.rows;
  }
}
