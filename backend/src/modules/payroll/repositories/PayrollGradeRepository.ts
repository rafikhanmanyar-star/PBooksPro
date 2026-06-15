import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { PayrollGradeRow } from '../services/payroll/payrollTypes.js';

const GRADE_COLUMNS = `id, tenant_id, name, description, min_salary::text, max_salary::text, created_by, updated_by,
  deleted_at, created_at, updated_at`;

export type PayrollGradeWriteFields = {
  name: string;
  description: string;
  min_salary: number;
  max_salary: number;
};

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

  async upsertGrade(
    client: pg.PoolClient,
    id: string,
    fields: PayrollGradeWriteFields,
    userId: string | null
  ): Promise<PayrollGradeRow> {
    const r = await client.query<PayrollGradeRow>(
      `INSERT INTO payroll_grades (id, tenant_id, name, description, min_salary, max_salary, created_by, updated_by, deleted_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL,NOW(),NOW())
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         min_salary = EXCLUDED.min_salary,
         max_salary = EXCLUDED.max_salary,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()
       RETURNING ${GRADE_COLUMNS}`,
      [id, this.tenantId, fields.name, fields.description, fields.min_salary, fields.max_salary, userId, userId]
    );
    const row = r.rows[0];
    if (!row) throw new Error('Failed to upsert payroll grade.');
    return row;
  }

  async markDeleted(client: pg.PoolClient, id: string): Promise<boolean> {
    const r = await client.query(
      `UPDATE payroll_grades SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, this.tenantId]
    );
    return (r.rowCount ?? 0) > 0;
  }
}
