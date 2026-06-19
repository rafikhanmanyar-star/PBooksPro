import type pg from 'pg';
import {
  buildPayrollLedgerRowsFromSource,
  summarizePayrollBalanceFromRows,
  type LedgerBuildPayslip,
  type LedgerBuildRun,
  type LedgerBuildTx,
} from '../../../services/payrollLedgerCore.js';
import { PayslipRepository } from '../repositories/PayslipRepository.js';
import { PayrollRunRepository } from '../repositories/PayrollRunRepository.js';
import { PayrollEmployeeRepository } from '../repositories/PayrollEmployeeRepository.js';
import {
  PayrollTransactionRepository,
  type PayrollLedgerRowDb,
} from '../repositories/PayrollTransactionRepository.js';
import { TransactionRepository } from '../../accounting/repositories/TransactionRepository.js';

function num(v: string | number | null | undefined): number {
  if (typeof v === 'number') return v || 0;
  return parseFloat(String(v ?? '0')) || 0;
}

export type { PayrollLedgerRowDb };

/**
 * Replace employee payroll ledger rows with a chronological rebuild from payslips + linked expense transactions.
 */
export async function syncPayrollLedgerForEmployee(
  client: pg.PoolClient,
  tenantId: string,
  employeeId: string
): Promise<void> {
  const psRows = await new PayslipRepository(tenantId).listForLedgerRebuild(client, employeeId);

  const payslips: LedgerBuildPayslip[] = psRows.map((r) => ({
    id: r.id,
    payroll_run_id: r.payroll_run_id,
    net_pay: num(r.net_pay),
    created_at: r.created_at,
  }));

  const runIds = [...new Set(psRows.map((r) => r.payroll_run_id))];
  const runsById = new Map<string, LedgerBuildRun>();
  const labelMap = new Map<string, string>();
  if (runIds.length > 0) {
    const runRows = await new PayrollRunRepository(tenantId).getPeriodLabelsByIds(client, runIds);
    for (const r of runRows) {
      runsById.set(r.id, {
        id: r.id,
        period_end: r.period_end,
        month: r.month,
        year: r.year,
      });
      labelMap.set(r.id, `${r.month} ${r.year}`);
    }
  }

  const payrollTransactions: LedgerBuildTx[] = (
    await new TransactionRepository(tenantId).listPayrollExpenseForEmployee(client, employeeId)
  ).map((t) => ({
    id: t.id,
    payslip_id: t.payslip_id,
    amount: num(t.amount),
    date: t.date,
    description: t.description,
    created_at: t.created_at,
    type: String(t.type),
  }));

  const built = buildPayrollLedgerRowsFromSource(payslips, runsById, payrollTransactions);
  const ledgerRepo = new PayrollTransactionRepository(tenantId);
  await ledgerRepo.deleteForEmployee(client, employeeId);

  if (built.length === 0) return;

  for (const row of built) {
    let description = row.description;
    if (row.transaction_type === 'PAYSLIP' && row.payroll_run_id) {
      const lbl = labelMap.get(row.payroll_run_id);
      if (lbl) description = `Payslip (${lbl}) — net`;
    }

    await ledgerRepo.insertRow(client, employeeId, {
      id: row.id,
      payroll_run_id: row.payroll_run_id,
      transaction_date: row.transaction_date,
      transaction_type: row.transaction_type,
      reference_id: row.reference_id,
      description,
      debit: row.debit,
      credit: row.credit,
      balance_after: row.balance_after,
      source_transaction_id: row.source_transaction_id,
      ledger_sort_ts: row.ledger_sort_ts,
    });
  }
}

/** Full-tenant backfill — run manually after migrating `payroll_transactions`. */
export async function syncPayrollLedgerForAllEmployees(
  client: pg.PoolClient,
  tenantId: string
): Promise<number> {
  const ids = await new PayrollEmployeeRepository(tenantId).listActiveIds(client);
  for (const id of ids) {
    await syncPayrollLedgerForEmployee(client, tenantId, id);
  }
  return ids.length;
}

export async function getEmployeePayrollBalanceFromDb(
  client: pg.PoolClient,
  tenantId: string,
  employeeId: string
): Promise<ReturnType<typeof summarizePayrollBalanceFromRows>> {
  const row = await new PayrollTransactionRepository(tenantId).summarizeBalance(client, employeeId);
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
  opts: {
    typeFilter?: string | null;
    limit: number;
    offset: number;
    year?: number | null;
    month?: number | null;
  }
): Promise<{ total: number; rows: PayrollLedgerRowDb[] }> {
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 5000);
  const offset = Math.max(Number(opts.offset) || 0, 0);

  let filterSql = '';
  const filterParams: unknown[] = [];
  let paramIndex = 3;

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
    filterSql = ` AND transaction_type = $${paramIndex}`;
    filterParams.push(tfRaw);
    paramIndex += 1;
  }

  if (opts.year != null && Number.isFinite(opts.year)) {
    filterSql += ` AND EXTRACT(YEAR FROM transaction_date::date) = $${paramIndex}`;
    filterParams.push(Math.trunc(opts.year));
    paramIndex += 1;
  }
  if (opts.month != null && Number.isFinite(opts.month)) {
    filterSql += ` AND EXTRACT(MONTH FROM transaction_date::date) = $${paramIndex}`;
    filterParams.push(Math.trunc(opts.month));
    paramIndex += 1;
  }

  const ledgerRepo = new PayrollTransactionRepository(tenantId);
  const total = await ledgerRepo.countForEmployee(client, employeeId, filterSql, filterParams);
  const rows = await ledgerRepo.listPage(client, employeeId, filterSql, filterParams, limit, offset);

  return { total, rows };
}
