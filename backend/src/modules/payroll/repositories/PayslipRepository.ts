import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { PayslipRow } from '../../../services/payroll/payrollTypes.js';

const PAYSLIP_COLUMNS = `id, tenant_id, payroll_run_id, employee_id, basic_pay::text, total_allowances::text, total_deductions::text,
  total_adjustments::text, gross_pay::text, net_pay::text, allowance_details, deduction_details, adjustment_details,
  assignment_snapshot, is_paid, paid_amount::text, paid_at, transaction_id, deleted_at, created_at, updated_at`;

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
}
