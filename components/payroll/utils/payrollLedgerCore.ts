/**
 * Browser-safe payroll ledger (must match backend `payrollLedgerCore.ts` semantics).
 *
 * PAYSLIP `transaction_date`: payslip `created_at` calendar day first (Payroll Cycle table “Date”), then period fallbacks.
 */

export type LedgerBuildPayslip = {
  id: string;
  payroll_run_id: string;
  net_pay: number;
  created_at: Date | string;
};

export type LedgerBuildRun = {
  id: string;
  period_end: Date | string | null;
  month?: string;
  year?: number;
};

export type LedgerBuildTx = {
  id: string;
  payslip_id: string | null;
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

const MONTH_LABEL_TO_NUM_LC: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function resolveMonthNumber(monthRaw: string): number | null {
  const t = String(monthRaw ?? '')
    .trim()
    .toLowerCase();
  if (!t) return null;
  const nm = /^(\d{1,2})$/.exec(t);
  if (nm) {
    const n = Number(nm[1]);
    return n >= 1 && n <= 12 ? n : null;
  }
  return MONTH_LABEL_TO_NUM_LC[t] ?? null;
}

function payPeriodCalendarEndYyyyMmDd(monthRaw: string, yearRaw: number): string {
  const mn = resolveMonthNumber(monthRaw);
  const year = Number(yearRaw);
  if (mn === null || !Number.isFinite(year) || year < 1901 || year > 3000) return '';
  const d = new Date(Date.UTC(year, mn, 0));
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return `${y}-${pad2(m)}-${pad2(day)}`;
}

export function ledgerToYyyyMmDd(d: Date | string | null | undefined): string {
  if (d == null) return '';
  const s = String(d).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1]!;
  if (d instanceof Date && !Number.isNaN(d.getTime())) {
    const y = d.getFullYear();
    const mo = d.getMonth() + 1;
    const da = d.getDate();
    return `${y}-${pad2(mo)}-${pad2(da)}`;
  }
  const t = new Date(s).getTime();
  if (!Number.isNaN(t)) {
    const x = new Date(t);
    return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`;
  }
  return '';
}

function isUnsetPayrollLedgerDate(iso: string): boolean {
  if (!iso || iso.length < 10) return true;
  return iso.startsWith('1970-');
}

function todayUtcYyyyMmDd(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
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
    const periodEndCand = run ? ledgerToYyyyMmDd(run.period_end) : '';
    const runYear = run?.year != null ? Number(run.year) : NaN;
    const fromRunPeriod =
      run?.month != null &&
      String(run.month).trim() !== '' &&
      Number.isFinite(runYear) &&
      runYear >= 1901
        ? payPeriodCalendarEndYyyyMmDd(String(run.month), runYear)
        : '';
    const createdStr = ledgerToYyyyMmDd(ps.created_at);
    const txnCandidate =
      createdStr && !isUnsetPayrollLedgerDate(createdStr)
        ? createdStr
        : periodEndCand && !isUnsetPayrollLedgerDate(periodEndCand)
          ? periodEndCand
          : fromRunPeriod && !isUnsetPayrollLedgerDate(fromRunPeriod)
            ? fromRunPeriod
            : '';
    const payslipTs = toMillis(ps.created_at);
    const net = round2(Number(ps.net_pay) || 0);
    const safeTxn = txnCandidate || todayUtcYyyyMmDd();
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
    const pid =
      tx.payslip_id && String(tx.payslip_id).trim() ? String(tx.payslip_id).trim() : '';
    if (!pid || !payslipIds.has(pid)) continue;
    const ttype = String(tx.type || '').toLowerCase();
    if (ttype !== 'expense') continue;
    const amt = round2(Number(tx.amount) || 0);
    if (amt <= 0) continue;
    let txnDate = ledgerToYyyyMmDd(tx.date);
    if (!txnDate || isUnsetPayrollLedgerDate(txnDate)) {
      txnDate = tx.created_at != null ? ledgerToYyyyMmDd(tx.created_at) : '';
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

/** Oldest first: date → ledger_sort_ts → payslip before payment same day → id */
export function sortLedgerRowsChronological(rows: BuiltPayrollLedgerRow[]): BuiltPayrollLedgerRow[] {
  return [...rows].sort((a, b) => {
    const dd = a.transaction_date.localeCompare(b.transaction_date);
    if (dd !== 0) return dd;
    const ts = (a.ledger_sort_ts || 0) - (b.ledger_sort_ts || 0);
    if (ts !== 0) return ts;
    const pri = (r: BuiltPayrollLedgerRow) => (r.transaction_type === 'PAYSLIP' ? 0 : 1);
    const kp = pri(a) - pri(b);
    if (kp !== 0) return kp;
    return a.id.localeCompare(b.id);
  });
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

/** Net payable / advance from Σ payslip net − Σ salary expense on those payslips (matches full ledger final balance). */
export function employeePayrollNetBalanceFromTotals(
  payslipNets: number[],
  paymentAmounts: number[]
): { balance: number; payableAmount: number; advanceAmount: number } {
  const debit = round2(payslipNets.reduce((s, n) => s + n, 0));
  const credit = round2(paymentAmounts.reduce((s, n) => s + n, 0));
  const balance = round2(debit - credit);
  let advanceAmount = 0;
  let payableAmount = 0;
  if (balance < -0.01) advanceAmount = round2(Math.abs(balance));
  else if (balance > 0.01) payableAmount = balance;
  return { balance, payableAmount, advanceAmount };
}

export type LedgerRowFilter = 'all' | 'payslips' | 'payments' | 'advances';

export function filterBuiltLedgerRows(rows: BuiltPayrollLedgerRow[], filter: LedgerRowFilter): BuiltPayrollLedgerRow[] {
  if (filter === 'all') return rows;
  if (filter === 'payslips') return rows.filter((r) => r.transaction_type === 'PAYSLIP');
  if (filter === 'payments') return rows.filter((r) => r.transaction_type === 'PAYMENT');
  return rows.filter(
    (r) =>
      ((r.transaction_type as string) === 'ADVANCE' ||
        (r.transaction_type as string) === 'ADVANCE_ADJUSTMENT' ||
        (r.transaction_type as string) === 'MANUAL_ADJUSTMENT') ||
      (r.transaction_type === 'PAYMENT' && r.balance_after < -0.01)
  );
}