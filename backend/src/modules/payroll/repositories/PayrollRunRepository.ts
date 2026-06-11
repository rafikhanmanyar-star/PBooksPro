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

  async getByMonthYear(client: pg.PoolClient, month: string, year: number): Promise<PayrollRunRow | null> {
    const r = await client.query<PayrollRunRow>(
      `SELECT ${RUN_COLUMNS}
       FROM payroll_runs WHERE tenant_id = $1 AND month = $2 AND year = $3`,
      [this.tenantId, month, year]
    );
    return r.rows[0] ?? null;
  }

  async upsertByPeriod(
    client: pg.PoolClient,
    proposeId: string,
    month: string,
    year: number,
    periodStart: string | null,
    periodEnd: string | null,
    userId: string | null
  ): Promise<PayrollRunRow> {
    const r = await client.query<PayrollRunRow>(
      `INSERT INTO payroll_runs (id, tenant_id, month, year, period_start, period_end, status, total_amount, employee_count, created_by, updated_by, deleted_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,'DRAFT',0,0,$7,$8,NULL,NOW(),NOW())
       ON CONFLICT (tenant_id, month, year) DO UPDATE SET
         deleted_at = CASE WHEN payroll_runs.deleted_at IS NOT NULL THEN NULL ELSE payroll_runs.deleted_at END,
         status = CASE WHEN payroll_runs.deleted_at IS NOT NULL THEN 'DRAFT' ELSE payroll_runs.status END,
         total_amount = CASE WHEN payroll_runs.deleted_at IS NOT NULL THEN 0 ELSE payroll_runs.total_amount END,
         employee_count = CASE WHEN payroll_runs.deleted_at IS NOT NULL THEN 0 ELSE payroll_runs.employee_count END,
         paid_at = CASE WHEN payroll_runs.deleted_at IS NOT NULL THEN NULL ELSE payroll_runs.paid_at END,
         period_start = COALESCE(payroll_runs.period_start, EXCLUDED.period_start),
         period_end = COALESCE(payroll_runs.period_end, EXCLUDED.period_end),
         updated_at = NOW()
       RETURNING ${RUN_COLUMNS}`,
      [proposeId, this.tenantId, month, year, periodStart, periodEnd, userId, userId]
    );
    const row = r.rows[0];
    if (!row) throw new Error('Could not create payroll run.');
    return row;
  }

  async updateFields(
    client: pg.PoolClient,
    id: string,
    fields: {
      status?: string | null;
      total_amount?: number | null;
      employee_count?: number | null;
      touchPaidAt?: boolean;
      paid_at?: Date | null;
    }
  ): Promise<PayrollRunRow | null> {
    const r = await client.query<PayrollRunRow>(
      `UPDATE payroll_runs SET
         status = COALESCE($3::text, status),
         total_amount = COALESCE($4::numeric, total_amount),
         employee_count = COALESCE($5::int, employee_count),
         paid_at = CASE WHEN $6::boolean THEN $7::timestamptz ELSE paid_at END,
         updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING ${RUN_COLUMNS}`,
      [
        id,
        this.tenantId,
        fields.status ?? null,
        fields.total_amount ?? null,
        fields.employee_count ?? null,
        fields.touchPaidAt === true,
        fields.paid_at ?? null,
      ]
    );
    return r.rows[0] ?? null;
  }

  async setTotals(client: pg.PoolClient, id: string, totalAmount: number, employeeCount: number): Promise<PayrollRunRow | null> {
    const r = await client.query<PayrollRunRow>(
      `UPDATE payroll_runs SET total_amount = $3, employee_count = $4, updated_at = NOW() WHERE id = $1 AND tenant_id = $2
       RETURNING ${RUN_COLUMNS}`,
      [id, this.tenantId, totalAmount, employeeCount]
    );
    return r.rows[0] ?? null;
  }

  async applyAggregatesFromPayslips(
    client: pg.PoolClient,
    id: string,
    agg: { total_amount: number; employee_count: number; status: string; paid_at: Date | null }
  ): Promise<PayrollRunRow | null> {
    const r = await client.query<PayrollRunRow>(
      `UPDATE payroll_runs SET
         total_amount = $3,
         employee_count = $4,
         status = $5::text,
         paid_at = $6,
         updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING ${RUN_COLUMNS}`,
      [id, this.tenantId, agg.total_amount, agg.employee_count, agg.status, agg.paid_at]
    );
    return r.rows[0] ?? null;
  }

  async markDeleted(client: pg.PoolClient, id: string): Promise<boolean> {
    const r = await client.query(
      `UPDATE payroll_runs SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, this.tenantId]
    );
    return (r.rowCount ?? 0) > 0;
  }
}
