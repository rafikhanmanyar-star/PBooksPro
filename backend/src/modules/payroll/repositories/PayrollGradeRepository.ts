import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { PayrollGradeRow } from '../../../services/payroll/payrollTypes.js';

const GRADE_COLUMNS = `id, tenant_id, name, description, min_salary::text, max_salary::text, created_by, updated_by,
  deleted_at, created_at, updated_at`;

export class PayrollGradeRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async getByIdIncludingDeleted(client: pg.PoolClient, id: string): Promise<PayrollGradeRow | null> {
    const r = await client.query<PayrollGradeRow>(
      `SELECT ${GRADE_COLUMNS}
       FROM payroll_grades WHERE id = $1 AND tenant_id = $2`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async listActive(client: pg.PoolClient): Promise<PayrollGradeRow[]> {
    const r = await client.query<PayrollGradeRow>(
      `SELECT ${GRADE_COLUMNS}
       FROM payroll_grades WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY name ASC`,
      [this.tenantId]
    );
    return r.rows;
  }

  async listChangedSince(client: pg.PoolClient, since: Date): Promise<PayrollGradeRow[]> {
    const r = await client.query<PayrollGradeRow>(
      `SELECT ${GRADE_COLUMNS}
       FROM payroll_grades WHERE tenant_id = $1 AND updated_at > $2 ORDER BY updated_at ASC`,
      [this.tenantId, since]
    );
    return r.rows;
  }
}
