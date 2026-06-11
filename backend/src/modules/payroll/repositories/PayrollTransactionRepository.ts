import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';

export type PayrollLedgerRowDb = {
  id: string;
  tenant_id: string;
  employee_id: string;
  payroll_run_id: string | null;
  transaction_date: Date | string;
  transaction_type: string;
  reference_id: string | null;
  description: string | null;
  debit: string;
  credit: string;
  balance_after: string;
  source_transaction_id: string | null;
  ledger_sort_ts: string;
};

export type PayrollLedgerInsertRow = {
  id: string;
  payroll_run_id: string | null;
  transaction_date: string | Date;
  transaction_type: string;
  reference_id: string | null;
  description: string | null;
  debit: number;
  credit: number;
  balance_after: number;
  source_transaction_id: string | null;
  ledger_sort_ts: string | number;
};

export class PayrollTransactionRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async deleteForEmployee(client: pg.PoolClient, employeeId: string): Promise<void> {
    await client.query(`DELETE FROM payroll_transactions WHERE tenant_id = $1 AND employee_id = $2`, [
      this.tenantId,
      employeeId,
    ]);
  }

  async insertRow(
    client: pg.PoolClient,
    employeeId: string,
    row: PayrollLedgerInsertRow
  ): Promise<void> {
    await client.query(
      `INSERT INTO payroll_transactions (
         id, tenant_id, employee_id, payroll_run_id, transaction_date, transaction_type,
         reference_id, description, debit, credit, balance_after, source_transaction_id,
         ledger_sort_ts, payslip_created_at, created_by
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NULL,NULL
       )`,
      [
        row.id,
        this.tenantId,
        employeeId,
        row.payroll_run_id,
        row.transaction_date,
        row.transaction_type,
        row.reference_id,
        row.description,
        row.debit,
        row.credit,
        row.balance_after,
        row.source_transaction_id,
        row.ledger_sort_ts,
      ]
    );
  }

  async summarizeBalance(
    client: pg.PoolClient,
    employeeId: string
  ): Promise<{ debit: string; credit: string; last_bal: string | null } | null> {
    const r = await client.query<{ debit: string; credit: string; last_bal: string | null }>(
      `SELECT
         COALESCE(SUM(debit), 0)::text AS debit,
         COALESCE(SUM(credit), 0)::text AS credit,
         (SELECT balance_after::text FROM payroll_transactions
           WHERE tenant_id = $1 AND employee_id = $2
           ORDER BY transaction_date DESC, ledger_sort_ts DESC, id DESC LIMIT 1) AS last_bal
       FROM payroll_transactions
       WHERE tenant_id = $1 AND employee_id = $2`,
      [this.tenantId, employeeId]
    );
    return r.rows[0] ?? null;
  }

  async countForEmployee(
    client: pg.PoolClient,
    employeeId: string,
    filterSql: string,
    filterParams: unknown[]
  ): Promise<number> {
    const params = [this.tenantId, employeeId, ...filterParams];
    const r = await client.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM payroll_transactions WHERE tenant_id = $1 AND employee_id = $2${filterSql}`,
      params
    );
    return r.rows[0]?.c ?? 0;
  }

  async listPage(
    client: pg.PoolClient,
    employeeId: string,
    filterSql: string,
    filterParams: unknown[],
    limit: number,
    offset: number
  ): Promise<PayrollLedgerRowDb[]> {
    const params = [this.tenantId, employeeId, ...filterParams, limit, offset];
    const lp = params.length - 1;
    const op = params.length;
    const r = await client.query<PayrollLedgerRowDb>(
      `SELECT id, tenant_id, employee_id, payroll_run_id, transaction_date, transaction_type,
              reference_id, description, debit::text, credit::text, balance_after::text, source_transaction_id,
              ledger_sort_ts::text, created_at
       FROM payroll_transactions
       WHERE tenant_id = $1 AND employee_id = $2${filterSql}
       ORDER BY transaction_date ASC, ledger_sort_ts ASC, id ASC
       LIMIT $${lp} OFFSET $${op}`,
      params
    );
    return r.rows;
  }
}
