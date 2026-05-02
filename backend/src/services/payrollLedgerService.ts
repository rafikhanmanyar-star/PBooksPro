import type pg from 'pg';
import {
  buildPayrollLedgerRowsFromSource,
  summarizePayrollBalanceFromRows,
  type LedgerBuildPayslip,
  type LedgerBuildRun,
  type LedgerBuildTx,
} from './payrollLedgerCore.js';

function num(v: string | number | null | undefined): number {
  if (typeof v === 'number') return v || 0;
  return parseFloat(String(v ?? '0')) || 0;
}

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

/**
 * Replace employee payroll ledger rows with a chronological rebuild from payslips + linked expense transactions.
 */
export async function syncPayrollLedgerForEmployee(
  client: pg.PoolClient,
  tenantId: string,
  employeeId: string
): Promise<void> {
  const psRows = await client.query<{
    id: string;
    payroll_run_id: string;
    net_pay: string;
    created_at: Date;
  }>(
    `SELECT id, payroll_run_id, net_pay::text, created_at FROM payslips
     WHERE tenant_id = $1 AND employee_id = $2 AND deleted_at IS NULL
     ORDER BY created_at ASC`,
    [tenantId, employeeId]
  );

  const payslips: LedgerBuildPayslip[] = psRows.rows.map((r) => ({
    id: r.id,
    payroll_run_id: r.payroll_run_id,
    net_pay: num(r.net_pay),
    created_at: r.created_at,
  }));

  const runIds = [...new Set(psRows.rows.map((r) => r.payroll_run_id))];
  const runsById = new Map<string, LedgerBuildRun>();
  let labelMap = new Map<string, string>();
  if (runIds.length > 0) {
    const runQ = await client.query<{
      id: string;
      month: string;
      year: number;
      period_end: Date | null;
    }>(
      `SELECT id, month, year, period_end FROM payroll_runs WHERE tenant_id = $1 AND id = ANY($2::text[])`,
      [tenantId, runIds]
    );
    for (const r of runQ.rows) {
      runsById.set(r.id, {
        id: r.id,
        period_end: r.period_end,
        month: r.month,
        year: r.year,
      });
      labelMap.set(r.id, `${r.month} ${r.year}`);
    }
  }

  const payslipIds = payslips.map((p) => p.id);
  let payrollTransactions: LedgerBuildTx[] = [];
  if (payslipIds.length > 0) {
    const tq = await client.query<{
      id: string;
      payslip_id: string | null;
      amount: string;
      date: Date;
      description: string | null;
      created_at: Date;
      type: string;
    }>(
      `SELECT t.id, t.payslip_id, t.amount::text, t.date, t.description, t.created_at, t.type
       FROM transactions t
       INNER JOIN payslips p ON p.id = t.payslip_id AND p.tenant_id = t.tenant_id
       WHERE t.tenant_id = $1 AND p.employee_id = $2 AND t.deleted_at IS NULL`,
      [tenantId, employeeId]
    );
    payrollTransactions = tq.rows.map((t) => ({
      id: t.id,
      payslip_id: t.payslip_id,
      amount: num(t.amount),
      date: t.date,
      description: t.description,
      created_at: t.created_at,
      type: String(t.type),
    }));
  }

  const built = buildPayrollLedgerRowsFromSource(payslips, runsById, payrollTransactions);

  await client.query(`DELETE FROM payroll_transactions WHERE tenant_id = $1 AND employee_id = $2`, [
    tenantId,
    employeeId,
  ]);

  if (built.length === 0) return;

  for (const row of built) {
    let description = row.description;
    if (row.transaction_type === 'PAYSLIP' && row.payroll_run_id) {
      const lbl = labelMap.get(row.payroll_run_id);
      if (lbl) description = `Payslip (${lbl}) — net`;
    }

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
        tenantId,
        employeeId,
        row.payroll_run_id,
        row.transaction_date,
        row.transaction_type,
        row.reference_id,
        description,
        row.debit,
        row.credit,
        row.balance_after,
        row.source_transaction_id,
        row.ledger_sort_ts,
      ]
    );
  }
}

/** Full-tenant backfill — run manually after migrating `payroll_transactions`. */
export async function syncPayrollLedgerForAllEmployees(client: pg.PoolClient, tenantId: string): Promise<number> {
  const r = await client.query<{ id: string }>(
    `SELECT id FROM payroll_employees WHERE tenant_id = $1 AND deleted_at IS NULL`,
    [tenantId]
  );
  for (const row of r.rows) {
    await syncPayrollLedgerForEmployee(client, tenantId, row.id);
  }
  return r.rows.length;
}

export async function getEmployeePayrollBalanceFromDb(
  client: pg.PoolClient,
  tenantId: string,
  employeeId: string
): Promise<ReturnType<typeof summarizePayrollBalanceFromRows>> {
  const agg = await client.query<{ debit: string; credit: string; last_bal: string | null }>(
    `SELECT
       COALESCE(SUM(debit), 0)::text AS debit,
       COALESCE(SUM(credit), 0)::text AS credit,
       (SELECT balance_after::text FROM payroll_transactions
         WHERE tenant_id = $1 AND employee_id = $2
         ORDER BY transaction_date DESC, ledger_sort_ts DESC, id DESC LIMIT 1) AS last_bal
     FROM payroll_transactions
     WHERE tenant_id = $1 AND employee_id = $2`,
    [tenantId, employeeId]
  );
  const row = agg.rows[0];
  if (!row || (parseFloat(row.debit ?? '0') === 0 && parseFloat(row.credit ?? '0') === 0 && row.last_bal == null)) {
    return { totalDebit: 0, totalCredit: 0, balance: 0, advanceAmount: 0, payableAmount: 0 };
  }
  const totalDebit = num(row.debit);
  const totalCredit = num(row.credit);
  const balance = row.last_bal != null ? num(row.last_bal) : 0;
  let advanceAmount = 0;
  let payableAmount = 0;
  if (balance < -0.01) advanceAmount = Math.round(Math.abs(balance) * 100) / 100;
  else if (balance > 0.01) payableAmount = balance;
  return {
    totalDebit: Math.round(totalDebit * 100) / 100,
    totalCredit: Math.round(totalCredit * 100) / 100,
    balance: Math.round(balance * 100) / 100,
    advanceAmount,
    payableAmount,
  };
}

const LEDGER_ALLOWED_TYPES = new Set(['PAYSLIP', 'PAYMENT', 'ADVANCE', 'ADVANCE_ADJUSTMENT', 'MANUAL_ADJUSTMENT']);

export function rowToLedgerApi(row: PayrollLedgerRowDb): Record<string, unknown> {
  const d = row.transaction_date;
  const dateStr =
    typeof d === 'string'
      ? d.slice(0, 10)
      : d instanceof Date
        ? d.toISOString().slice(0, 10)
        : '';
  return {
    id: row.id,
    transaction_date: dateStr,
    transaction_type: row.transaction_type,
    reference_id: row.reference_id ?? undefined,
    payroll_run_id: row.payroll_run_id ?? undefined,
    description: row.description ?? '',
    debit: num(row.debit),
    credit: num(row.credit),
    balance_after: num(row.balance_after),
    source_transaction_id: row.source_transaction_id ?? undefined,
  };
}

export async function fetchEmployeeLedgerPage(
  client: pg.PoolClient,
  tenantId: string,
  employeeId: string,
  opts: { typeFilter?: string | null; limit: number; offset: number }
): Promise<{ total: number; rows: PayrollLedgerRowDb[] }> {
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 5000);
  const offset = Math.max(Number(opts.offset) || 0, 0);

  let filterSql = '';
  const countVals: unknown[] = [tenantId, employeeId];
  const selVals: unknown[] = [tenantId, employeeId];

  const tfRaw = opts.typeFilter || 'all';
  const tf = String(tfRaw).toLowerCase();

  if (tf === 'payslips') {
    filterSql = ` AND transaction_type = 'PAYSLIP'`;
  } else if (tf === 'payments') {
    filterSql = ` AND transaction_type = 'PAYMENT'`;
  } else if (tf === 'advances') {
    filterSql +=
      ` AND (transaction_type IN ('ADVANCE','ADVANCE_ADJUSTMENT','MANUAL_ADJUSTMENT')` +
      ` OR (transaction_type = 'PAYMENT' AND balance_after < -0.01))`;
  } else if (tf !== 'all' && LEDGER_ALLOWED_TYPES.has(String(tfRaw))) {
    filterSql = ` AND transaction_type = $3`;
    countVals.push(tfRaw);
    selVals.push(tfRaw);
  }

  const cq = await client.query<{ c: number }>(
    `SELECT COUNT(*)::int AS c FROM payroll_transactions WHERE tenant_id = $1 AND employee_id = $2${filterSql}`,
    countVals
  );

  const lp = selVals.length + 1;
  const op = selVals.length + 2;
  selVals.push(limit, offset);

  const qr = await client.query<PayrollLedgerRowDb>(
    `SELECT id, tenant_id, employee_id, payroll_run_id, transaction_date, transaction_type,
            reference_id, description, debit::text, credit::text, balance_after::text, source_transaction_id,
            ledger_sort_ts::text, created_at
     FROM payroll_transactions
     WHERE tenant_id = $1 AND employee_id = $2${filterSql}
     ORDER BY transaction_date ASC, ledger_sort_ts ASC, id ASC
     LIMIT $${lp} OFFSET $${op}`,
    selVals
  );

  return { total: cq.rows[0]?.c ?? 0, rows: qr.rows };
}

