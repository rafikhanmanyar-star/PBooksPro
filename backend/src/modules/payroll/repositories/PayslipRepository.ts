import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { PayslipRow } from '../services/payroll/payrollTypes.js';
import type { DataScopeEnforcementContext } from '../../../auth/tenantRepositoryScope.js';
import {
  appendScopeFragment,
  applyDepartmentScope,
} from '../../../auth/tenantRepositoryScope.js';

const PAYSLIP_COLUMNS = `id, tenant_id, payroll_run_id, employee_id, basic_pay::text, total_allowances::text, total_deductions::text,
  total_adjustments::text, gross_pay::text, net_pay::text, allowance_details, deduction_details, adjustment_details,
  assignment_snapshot, working_days::text, present_days::text, leave_days::text, paid_leave_days::text,
  unpaid_leave_days::text, absent_days::text, half_days::text, lop_days::text, lop_deduction::text,
  adjusted_basic::text, attendance_summary_snapshot, is_paid, paid_amount::text, paid_at, transaction_id, deleted_at, created_at, updated_at`;

export type PayslipComputedInsert = {
  basic_pay: number;
  total_allowances: number;
  total_deductions: number;
  total_adjustments: number;
  gross_pay: number;
  net_pay: number;
  allowance_details: unknown;
  deduction_details: unknown;
  working_days?: number;
  present_days?: number;
  leave_days?: number;
  paid_leave_days?: number;
  unpaid_leave_days?: number;
  absent_days?: number;
  half_days?: number;
  lop_days?: number;
  lop_deduction?: number;
  adjusted_basic?: number;
  attendance_summary_snapshot?: unknown;
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

  async getById(
    client: pg.PoolClient,
    id: string,
    scopeCtx?: DataScopeEnforcementContext
  ): Promise<PayslipRow | null> {
    const params: unknown[] = [id, this.tenantId];
    const conditions = ['ps.id = $1', 'ps.tenant_id = $2', 'ps.deleted_at IS NULL'];
    const joinEmployee =
      scopeCtx?.enabled
        ? ' INNER JOIN payroll_employees e ON e.id = ps.employee_id AND e.tenant_id = ps.tenant_id AND e.deleted_at IS NULL'
        : '';
    appendScopeFragment(
      conditions,
      params,
      applyDepartmentScope(scopeCtx ?? { enabled: false, scopes: [] }, 'e.department_id', params.length + 1)
    );
    const r = await client.query<PayslipRow>(
      `SELECT ps.id, ps.tenant_id, ps.payroll_run_id, ps.employee_id, ps.basic_pay::text, ps.total_allowances::text, ps.total_deductions::text,
        ps.total_adjustments::text, ps.gross_pay::text, ps.net_pay::text, ps.allowance_details, ps.deduction_details, ps.adjustment_details,
        ps.assignment_snapshot, ps.working_days::text, ps.present_days::text, ps.leave_days::text, ps.paid_leave_days::text,
        ps.unpaid_leave_days::text, ps.absent_days::text, ps.half_days::text, ps.lop_days::text, ps.lop_deduction::text,
        ps.adjusted_basic::text, ps.attendance_summary_snapshot, ps.is_paid, ps.paid_amount::text, ps.paid_at, ps.transaction_id, ps.deleted_at, ps.created_at, ps.updated_at
       FROM payslips ps${joinEmployee}
       WHERE ${conditions.join(' AND ')}`,
      params
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

  async listByRun(
    client: pg.PoolClient,
    runId: string,
    scopeCtx?: DataScopeEnforcementContext
  ): Promise<PayslipRow[]> {
    const params: unknown[] = [this.tenantId, runId];
    const conditions = ['ps.tenant_id = $1', 'ps.payroll_run_id = $2', 'ps.deleted_at IS NULL'];
    appendScopeFragment(
      conditions,
      params,
      applyDepartmentScope(scopeCtx ?? { enabled: false, scopes: [] }, 'e.department_id', params.length + 1)
    );
    const joinEmployee =
      scopeCtx?.enabled
        ? ' INNER JOIN payroll_employees e ON e.id = ps.employee_id AND e.tenant_id = ps.tenant_id AND e.deleted_at IS NULL'
        : '';
    const r = await client.query<PayslipRow>(
      `SELECT ps.id, ps.tenant_id, ps.payroll_run_id, ps.employee_id, ps.basic_pay::text, ps.total_allowances::text, ps.total_deductions::text,
        ps.total_adjustments::text, ps.gross_pay::text, ps.net_pay::text, ps.allowance_details, ps.deduction_details, ps.adjustment_details,
        ps.assignment_snapshot, ps.working_days::text, ps.present_days::text, ps.leave_days::text, ps.paid_leave_days::text,
        ps.unpaid_leave_days::text, ps.absent_days::text, ps.half_days::text, ps.lop_days::text, ps.lop_deduction::text,
        ps.adjusted_basic::text, ps.attendance_summary_snapshot,
        ps.is_paid, ps.paid_amount::text, ps.paid_at, ps.transaction_id, ps.deleted_at, ps.created_at, ps.updated_at
       FROM payslips ps${joinEmployee}
       WHERE ${conditions.join(' AND ')} ORDER BY ps.id ASC`,
      params
    );
    return r.rows;
  }

  async listByEmployee(
    client: pg.PoolClient,
    employeeId: string,
    scopeCtx?: DataScopeEnforcementContext
  ): Promise<PayslipRow[]> {
    const params: unknown[] = [this.tenantId, employeeId];
    const conditions = ['ps.tenant_id = $1', 'ps.employee_id = $2', 'ps.deleted_at IS NULL'];
    const joinEmployee =
      scopeCtx?.enabled
        ? ' INNER JOIN payroll_employees e ON e.id = ps.employee_id AND e.tenant_id = ps.tenant_id AND e.deleted_at IS NULL'
        : '';
    appendScopeFragment(
      conditions,
      params,
      applyDepartmentScope(scopeCtx ?? { enabled: false, scopes: [] }, 'e.department_id', params.length + 1)
    );
    const r = await client.query<PayslipRow>(
      `SELECT ps.id, ps.tenant_id, ps.payroll_run_id, ps.employee_id, ps.basic_pay::text, ps.total_allowances::text, ps.total_deductions::text,
        ps.total_adjustments::text, ps.gross_pay::text, ps.net_pay::text, ps.allowance_details, ps.deduction_details, ps.adjustment_details,
        ps.assignment_snapshot, ps.working_days::text, ps.present_days::text, ps.leave_days::text, ps.paid_leave_days::text,
        ps.unpaid_leave_days::text, ps.absent_days::text, ps.half_days::text, ps.lop_days::text, ps.lop_deduction::text,
        ps.adjusted_basic::text, ps.attendance_summary_snapshot, ps.is_paid, ps.paid_amount::text, ps.paid_at, ps.transaction_id, ps.deleted_at, ps.created_at, ps.updated_at
       FROM payslips ps${joinEmployee}
       WHERE ${conditions.join(' AND ')} ORDER BY ps.created_at DESC`,
      params
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
          working_days = $11, present_days = $12, leave_days = $13, paid_leave_days = $14,
          unpaid_leave_days = $15, absent_days = $16, half_days = $17, lop_days = $18,
          lop_deduction = $19, adjusted_basic = $20, attendance_summary_snapshot = $21::jsonb,
          is_paid = false, paid_amount = 0, paid_at = NULL, transaction_id = NULL,
          deleted_at = NULL, updated_at = NOW()
        WHERE id = $22 AND tenant_id = $23`,
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
        computed.working_days ?? null,
        computed.present_days ?? null,
        computed.leave_days ?? null,
        computed.paid_leave_days ?? null,
        computed.unpaid_leave_days ?? null,
        computed.absent_days ?? null,
        computed.half_days ?? null,
        computed.lop_days ?? null,
        computed.lop_deduction ?? 0,
        computed.adjusted_basic ?? computed.basic_pay,
        computed.attendance_summary_snapshot != null
          ? JSON.stringify(computed.attendance_summary_snapshot)
          : null,
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
          `($${i},$${i + 1},$${i + 2},$${i + 3},$${i + 4},$${i + 5},$${i + 6},$${i + 7},$${i + 8},$${i + 9},$${i + 10}::jsonb,$${i + 11}::jsonb,$${i + 12}::jsonb,$${i + 13}::jsonb,$${i + 14},$${i + 15},$${i + 16},$${i + 17},$${i + 18},$${i + 19},$${i + 20},$${i + 21},$${i + 22},$${i + 23},$${i + 24}::jsonb,false,0,NULL,NOW(),NOW())`
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
          r.assignmentSnapshot,
          r.computed.working_days ?? null,
          r.computed.present_days ?? null,
          r.computed.leave_days ?? null,
          r.computed.paid_leave_days ?? null,
          r.computed.unpaid_leave_days ?? null,
          r.computed.absent_days ?? null,
          r.computed.half_days ?? null,
          r.computed.lop_days ?? null,
          r.computed.lop_deduction ?? 0,
          r.computed.adjusted_basic ?? r.computed.basic_pay,
          r.computed.attendance_summary_snapshot != null
            ? JSON.stringify(r.computed.attendance_summary_snapshot)
            : null
        );
        i += 25;
      }
      await client.query(
        `INSERT INTO payslips (
           id, tenant_id, payroll_run_id, employee_id, basic_pay, total_allowances, total_deductions, total_adjustments,
           gross_pay, net_pay, allowance_details, deduction_details, adjustment_details, assignment_snapshot,
           working_days, present_days, leave_days, paid_leave_days, unpaid_leave_days, absent_days, half_days,
           lop_days, lop_deduction, adjusted_basic, attendance_summary_snapshot,
           is_paid, paid_amount, deleted_at, created_at, updated_at
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

  async getLedgerRecalcContext(
    client: pg.PoolClient,
    payslipId: string
  ): Promise<{ net_pay: string; payroll_run_id: string; employee_id: string } | null> {
    const r = await client.query<{ net_pay: string; payroll_run_id: string; employee_id: string }>(
      `SELECT net_pay::text, payroll_run_id, employee_id FROM payslips WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [payslipId, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async updatePaymentFromLedger(
    client: pg.PoolClient,
    payslipId: string,
    payment: {
      isPaid: boolean;
      paidAmount: number;
      transactionId: string | null;
      paidAt: Date | null;
    }
  ): Promise<void> {
    await client.query(
      `UPDATE payslips SET
         is_paid = $3,
         paid_amount = $4,
         paid_at = CASE WHEN $4::numeric > 0 THEN $6::timestamptz ELSE NULL END,
         transaction_id = $5,
         updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [payslipId, this.tenantId, payment.isPaid, payment.paidAmount, payment.transactionId, payment.paidAt]
    );
  }

  async listForLedgerRebuild(
    client: pg.PoolClient,
    employeeId: string
  ): Promise<Array<{ id: string; payroll_run_id: string; net_pay: string; created_at: Date }>> {
    const r = await client.query<{ id: string; payroll_run_id: string; net_pay: string; created_at: Date }>(
      `SELECT id, payroll_run_id, net_pay::text, created_at FROM payslips
       WHERE tenant_id = $1 AND employee_id = $2 AND deleted_at IS NULL
       ORDER BY created_at ASC`,
      [this.tenantId, employeeId]
    );
    return r.rows;
  }
}
