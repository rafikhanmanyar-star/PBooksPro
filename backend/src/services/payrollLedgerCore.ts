import { formatPgDateToYyyyMmDd, todayUtcYyyyMmDd } from '../utils/dateOnly.js';
import { payPeriodCalendarBounds } from '../utils/payrollPeriod.js';

export const PAYROLL_LEDGER_TYPES = [
  'PAYSLIP',
  'PAYMENT',
  'ADVANCE',
  'ADVANCE_ADJUSTMENT',
  'MANUAL_ADJUSTMENT',
] as const;

export type PayrollLedgerType = (typeof PAYROLL_LEDGER_TYPES)[number];

export type LedgerBuildPayslip = {
  id: string;
  payroll_run_id: string;
  net_pay: number;
  created_at: Date | string;
};

export type LedgerBuildRun = {
  id: string;
  period_end: Date | string | null;
  /** From `payroll_runs`; used when `period_end` was never persisted. */
  month?: string;
  year?: number;
};

export type LedgerBuildTx = {
  id: string;
  payslip_id: string | null;
  /** Expense amounts are positive numbers in payroll flow */
  amount: number;
  date: Date | string;
  description?: string | null;
  created_at?: Date | string | null;
  type: string;
};

export type BuiltPayrollLedgerRow = {
  id: string;
  payroll_run_id: string | null;
  transaction_date: string;
  transaction_type: 'PAYSLIP' | 'PAYMENT';
  reference_id: string;
  description: string;
  debit: number;
  credit: number;
  balance_after: number;
  source_transaction_id: string | null;
  ledger_sort_ts: number;
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Calendar-only `YYYY-MM-DD`, or '' when absent / unreadable — never coerce null to unix epoch for ledgers. */
function toLedgerYyyyMmDd(d: Date | string | null | undefined): string {
  if (d == null) return '';
  if (d instanceof Date) {
    const out = Number.isNaN(d.getTime()) ? '' : formatPgDateToYyyyMmDd(d);
    return out;
  }
  const s = String(d).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1]!;
  const t = new Date(s).getTime();
  if (!Number.isNaN(t)) return formatPgDateToYyyyMmDd(new Date(t));
  return '';
}

/** True for empty string or plausible “unset” sentinel from bad imports / unix epoch DATE. */
function isUnsetPayrollLedgerDate(iso: string): boolean {
  if (!iso || iso.length < 10) return true;
  return iso.startsWith('1970-');
}

function toMillis(d: Date | string | null | undefined): number {
  if (d == null) return 0;
  if (d instanceof Date) {
    const t = d.getTime();
    return Number.isNaN(t) ? 0 : t;
  }
  const t = new Date(String(d)).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * PAYSLIP increases payable (debit); PAYMENT reduces payable (credit).
 * Balance = Σ debit − Σ credit. Positive ⇒ company owes employee; negative ⇒ advance balance.
 */
export function buildPayrollLedgerRowsFromSource(
  payslips: LedgerBuildPayslip[],
  runsById: Map<string, LedgerBuildRun>,
  payrollTransactions: LedgerBuildTx[]
): BuiltPayrollLedgerRow[] {
  type Ev =
    | { kind: 'PAYSLIP'; row: Omit<BuiltPayrollLedgerRow, 'balance_after'> }
    | { kind: 'PAYMENT'; row: Omit<BuiltPayrollLedgerRow, 'balance_after'> };
  const events: Ev[] = [];

  for (const ps of payslips) {
    const run = runsById.get(ps.payroll_run_id);
    const periodEndCandidate = run ? toLedgerYyyyMmDd(run.period_end) : '';
    const fromRunPeriod =
      run?.month !== undefined && run.year !== undefined
        ? payPeriodCalendarBounds(run.month, run.year)?.end ?? ''
        : '';
    const createdStr = toLedgerYyyyMmDd(ps.created_at);
    const txnDate =
      periodEndCandidate && !isUnsetPayrollLedgerDate(periodEndCandidate)
        ? periodEndCandidate
        : fromRunPeriod && !isUnsetPayrollLedgerDate(fromRunPeriod)
          ? fromRunPeriod
          : createdStr && !isUnsetPayrollLedgerDate(createdStr)
            ? createdStr
            : '';
    const payslipTs = toMillis(ps.created_at);
    const net = round2(Number(ps.net_pay) || 0);
    const rawCreatedFb = formatPgDateToYyyyMmDd(new Date(ps.created_at));
    const safeTxn =
      txnDate ||
      (rawCreatedFb && !isUnsetPayrollLedgerDate(rawCreatedFb) ? rawCreatedFb : '') ||
      todayUtcYyyyMmDd();
    events.push({
      kind: 'PAYSLIP',
      row: {
        id: `pt_ps_${ps.id}`,
        payroll_run_id: ps.payroll_run_id,
        transaction_date: safeTxn,
        transaction_type: 'PAYSLIP',
        reference_id: ps.id,
        description: `Payroll payslip (${ps.id.slice(-8)})`,
        debit: Math.max(0, net),
        credit: 0,
        source_transaction_id: null,
        ledger_sort_ts: payslipTs || new Date(`${safeTxn}T12:00:00Z`).getTime(),
      },
    });
  }

  const payslipIds = new Set(payslips.map((p) => p.id));
  for (const tx of payrollTransactions) {
    const pid = tx.payslip_id && String(tx.payslip_id).trim() ? String(tx.payslip_id).trim() : '';
    if (!pid || !payslipIds.has(pid)) continue;
    const ttype = String(tx.type || '').toLowerCase();
    if (ttype !== 'expense') continue;
    const amt = round2(Number(tx.amount) || 0);
    if (amt <= 0) continue;
    let txnDate = toLedgerYyyyMmDd(tx.date);
    if (!txnDate || isUnsetPayrollLedgerDate(txnDate)) {
      txnDate = tx.created_at != null ? toLedgerYyyyMmDd(tx.created_at) : '';
    }
    if (!txnDate || isUnsetPayrollLedgerDate(txnDate)) txnDate = todayUtcYyyyMmDd();
    const ct = tx.created_at != null ? toMillis(tx.created_at) : new Date(`${txnDate}T12:00:00Z`).getTime();
    events.push({
      kind: 'PAYMENT',
      row: {
        id: `pt_tx_${tx.id}`,
        payroll_run_id: null,
        transaction_date: txnDate,
        transaction_type: 'PAYMENT',
        reference_id: tx.id,
        description: (tx.description && String(tx.description).trim()) || 'Salary payment',
        debit: 0,
        credit: amt,
        source_transaction_id: tx.id,
        ledger_sort_ts: ct || new Date(`${txnDate}T12:00:00Z`).getTime(),
      },
    });
  }

  events.sort((a, b) => {
    const ra = a.row;
    const rb = b.row;
    const dd = ra.transaction_date.localeCompare(rb.transaction_date);
    if (dd !== 0) return dd;
    const ts = ra.ledger_sort_ts - rb.ledger_sort_ts;
    if (ts !== 0) return ts;
    const kindPri = (x: Ev) => (x.kind === 'PAYSLIP' ? 0 : 1);
    const kp = kindPri(a) - kindPri(b);
    if (kp !== 0) return kp;
    return ra.id.localeCompare(rb.id);
  });

  let bal = 0;
  const out: BuiltPayrollLedgerRow[] = [];
  for (const ev of events) {
    const r = ev.row;
    bal = round2(bal + r.debit - r.credit);
    out.push({ ...r, balance_after: bal });
  }
  return out;
}

export function summarizePayrollBalanceFromRows(rows: BuiltPayrollLedgerRow[]): {
  totalDebit: number;
  totalCredit: number;
  balance: number;
  advanceAmount: number;
  payableAmount: number;
} {
  let totalDebit = 0;
  let totalCredit = 0;
  for (const r of rows) {
    totalDebit += r.debit;
    totalCredit += r.credit;
  }
  totalDebit = round2(totalDebit);
  totalCredit = round2(totalCredit);
  const balance = rows.length === 0 ? 0 : round2(rows[rows.length - 1]!.balance_after);
  let advanceAmount = 0;
  let payableAmount = 0;
  if (balance < -0.01) {
    advanceAmount = round2(Math.abs(balance));
  } else if (balance > 0.01) {
    payableAmount = balance;
  }
  return { totalDebit, totalCredit, balance, advanceAmount, payableAmount };
}
