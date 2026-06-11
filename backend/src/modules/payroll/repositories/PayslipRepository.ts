import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { PayslipRow } from '../../../services/payroll/payrollTypes.js';

const PAYSLIP_COLUMNS = `id, tenant_id, payroll_run_id, employee_id, basic_pay::text, total_allowances::text, total_deductions::text,
  total_adjustments::text, gross_pay::text, net_pay::text, allowance_details, deduction_details, adjustment_details,
  assignment_snapshot, is_paid, paid_amount::text, paid_at, transaction_id, deleted_at, created_at, updated_at`;

export type PayslipComputedInsert = {
  basic_pay: number;
  total_allowances: number;
  total_deductions: number;
  total_adjustments: number;
  gross_pay: number;
  net_pay: number;
  allowance_details: unknown;
  deduction_details: unknown;
};

export type PayslipBatchInsertRow = {
  id: string;
  tenantId: string;
  runId: string;
  employeeId: string;
  computed: PayslipComputedInsert;
  adjustmentJson: string;
  assignmentSnapshot: string;
};

const PAYSIP_BATCH_ROWS = 50;

export class PayslipRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async getById(client: pg.PoolClient, id: string): Promise<PayslipRow | null> {
    const r = await client.query<PayslipRow>(
      `SELECT ${PAYSLIP_COLUMNS}
       FROM payslips WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async getByIdIncludingDeleted(client: pg.PoolClient, id: string): Promise<PayslipRow | null> {
    const r = await client.query<PayslipRow>(
      `SELECT ${PAYSLIP_COLUMNS}
       FROM payslips WHERE id = $1 AND tenant_id = $2`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async listByRun(client: pg.PoolClient, runId: string): Promise<PayslipRow[]> {
    const r = await client.query<PayslipRow>(
      `SELECT ${PAYSLIP_COLUMNS}
       FROM payslips WHERE tenant_id = $1 AND payroll_run_id = $2 AND deleted_at IS NULL ORDER BY id ASC`,
      [this.tenantId, runId]
    );
    return r.rows;
  }

  async listByEmployee(client: pg.PoolClient, employeeId: string): Promise<PayslipRow[]> {
    const r = await client.query<PayslipRow>(
      `SELECT ${PAYSLIP_COLUMNS}
       FROM payslips WHERE tenant_id = $1 AND employee_id = $2 AND deleted_at IS NULL ORDER BY created_at DESC`,
      [this.tenantId, employeeId]
    );
    return r.rows;
  }

  async listChangedSince(client: pg.PoolClient, since: Date): Promise<PayslipRow[]> {
    const r = await client.query<PayslipRow>(
      `SELECT ${PAYSLIP_COLUMNS}
       FROM payslips WHERE tenant_id = $1 AND updated_at > $2 ORDER BY updated_at ASC`,
      [this.tenantId, since]
    );
    return r.rows;
  }

  async findSoftDeletedId(client: pg.PoolClient, runId: string, employeeId: string): Promise<string | null> {
    const r = await client.query<{ id: string }>(
      `SELECT id FROM payslips
       WHERE tenant_id = $1 AND payroll_run_id = $2 AND employee_id = $3 AND deleted_at IS NOT NULL
       LIMIT 1`,
      [this.tenantId, runId, employeeId]
    );
    return r.rows[0]?.id ?? null;
  }

  async reviveComputed(
    client: pg.PoolClient,
    payslipId: string,
    computed: PayslipComputedInsert,
    adjustmentJson: string,
    assignmentSnapshot: string
  ): Promise<void> {
    await client.query(
      `UPDATE payslips SET
          basic_pay = $1, total_allowances = $2, total_deductions = $3, total_adjustments = $4,
          gross_pay = $5, net_pay = $6,
          allowance_details = $7::jsonb, deduction_details = $8::jsonb, adjustment_details = $9::jsonb,
          assignment_snapshot = $10::jsonb,
          is_paid = false, paid_amount = 0, paid_at = NULL, transaction_id = NULL,
          deleted_at = NULL, updated_at = NOW()
        WHERE id = $11 AND tenant_id = $12`,
      [
        computed.basic_pay,
        computed.total_allowances,
        computed.total_deductions,
        computed.total_adjustments,
        computed.gross_pay,
        computed.net_pay,
        JSON.stringify(computed.allowance_details),
        JSON.stringify(computed.deduction_details),
        adjustmentJson,
        assignmentSnapshot,
        payslipId,
        this.tenantId,
      ]
    );
  }

  async insertBatch(client: pg.PoolClient, rows: PayslipBatchInsertRow[]): Promise<void> {
    for (let c = 0; c < rows.length; c += PAYSIP_BATCH_ROWS) {
      const slice = rows.slice(c, c + PAYSIP_BATCH_ROWS);
      const parts: string[] = [];
      const params: unknown[] = [];
      let i = 1;
      for (const r of slice) {
        parts.push(
          `($${i},$${i + 1},$${i + 2},$${i + 3},$${i + 4},$${i + 5},$${i + 6},$${i + 7},$${i + 8},$${i + 9},$${i + 10}::jsonb,$${i + 11}::jsonb,$${i + 12}::jsonb,$${i + 13}::jsonb,false,0,NULL,NOW(),NOW())`
        );
        params.push(
          r.id,
          r.tenantId,
          r.runId,
          r.employeeId,
          r.computed.basic_pay,
          r.computed.total_allowances,
          r.computed.total_deductions,
          r.computed.total_adjustments,
          r.computed.gross_pay,
          r.computed.net_pay,
          JSON.stringify(r.computed.allowance_details),
          JSON.stringify(r.computed.deduction_details),
          r.adjustmentJson,
          r.assignmentSnapshot
        );
        i += 14;
      }
      await client.query(
        `INSERT INTO payslips (
           id, tenant_id, payroll_run_id, employee_id, basic_pay, total_allowances, total_deductions, total_adjustments,
           gross_pay, net_pay, allowance_details, deduction_details, adjustment_details, assignment_snapshot, is_paid, paid_amount, deleted_at, created_at, updated_at
         ) VALUES ${parts.join(',')}`,
        params
      );
    }
  }

  async sumNetPayAndCount(
    client: pg.PoolClient,
    runId: string
  ): Promise<{ total_amt: string; cnt: string } | null> {
    const r = await client.query<{ total_amt: string; cnt: string }>(
      `SELECT COALESCE(SUM(net_pay::numeric), 0)::text AS total_amt, COUNT(*)::int AS cnt
       FROM payslips WHERE tenant_id = $1 AND payroll_run_id = $2 AND deleted_at IS NULL`,
      [this.tenantId, runId]
    );
    return r.rows[0] ?? null;
  }

  async aggregateForRunRecalc(
    client: pg.PoolClient,
    runId: string
  ): Promise<{
    cnt: string;
    total_amt: string;
    all_paid: boolean | null;
    max_paid_at: Date | null;
  } | null> {
    const r = await client.query<{
      cnt: string;
      total_amt: string;
      all_paid: boolean | null;
      max_paid_at: Date | null;
    }>(
      `SELECT
         COUNT(*)::int AS cnt,
         COALESCE(SUM(net_pay::numeric), 0)::text AS total_amt,
         CASE
           WHEN COUNT(*) = 0 THEN NULL
           ELSE BOOL_AND(
             is_paid OR COALESCE(paid_amount::numeric, 0) >= net_pay::numeric - 0.01
           )
         END AS all_paid,
         MAX(paid_at) FILTER (WHERE paid_at IS NOT NULL) AS max_paid_at
       FROM payslips
       WHERE tenant_id = $1 AND payroll_run_id = $2 AND deleted_at IS NULL`,
      [this.tenantId, runId]
    );
    return r.rows[0] ?? null;
  }

  async updateAmounts(
    client: pg.PoolClient,
    payslipId: string,
    amounts: {
      basic_pay: number;
      total_allowances: number;
      total_deductions: number;
      total_adjustments: number;
      gross_pay: number;
      net_pay: number;
      allowance_details: unknown;
      deduction_details: unknown;
      adjustment_details: unknown;
    }
  ): Promise<void> {
    await client.query(
      `UPDATE payslips SET
         basic_pay = $3, total_allowances = $4, total_deductions = $5, total_adjustments = $6,
         gross_pay = $7, net_pay = $8,
         allowance_details = $9::jsonb, deduction_details = $10::jsonb, adjustment_details = $11::jsonb,
         updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [
        payslipId,
        this.tenantId,
        amounts.basic_pay,
        amounts.total_allowances,
        amounts.total_deductions,
        amounts.total_adjustments,
        amounts.gross_pay,
        amounts.net_pay,
        JSON.stringify(amounts.allowance_details),
        JSON.stringify(amounts.deduction_details),
        JSON.stringify(amounts.adjustment_details),
      ]
    );
  }

  async markDeleted(client: pg.PoolClient, payslipId: string): Promise<boolean> {
    const r = await client.query(
      `UPDATE payslips SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [payslipId, this.tenantId]
    );
    return (r.rowCount ?? 0) > 0;
  }

  async markDeletedByRun(client: pg.PoolClient, runId: string): Promise<void> {
    await client.query(
      `UPDATE payslips SET deleted_at = NOW(), updated_at = NOW() WHERE payroll_run_id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [runId, this.tenantId]
    );
  }
}
