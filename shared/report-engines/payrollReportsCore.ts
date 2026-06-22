/** Pure payroll report aggregation — no I/O. */

export const PAYROLL_MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export function payrollMonthName(month1to12: number): string | null {
  if (month1to12 < 1 || month1to12 > 12) return null;
  return PAYROLL_MONTH_NAMES[month1to12 - 1];
}

export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function num(value: string | number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function payslipStatusLabel(isPaid: boolean | null | undefined, netPay: number, paidAmount: number): string {
  if (isPaid === true || paidAmount >= netPay - 0.005) return 'Paid';
  if (paidAmount > 0.005) return 'Partial';
  return 'Unpaid';
}

export function sumNamedAmounts(details: unknown, keywords: string[]): number {
  if (!Array.isArray(details)) return 0;
  const lower = keywords.map((k) => k.toLowerCase());
  return details.reduce((sum, item) => {
    if (item == null || typeof item !== 'object') return sum;
    const rec = item as Record<string, unknown>;
    const name = String(rec.name ?? rec.label ?? rec.type ?? '').toLowerCase();
    if (!lower.some((k) => name.includes(k))) return sum;
    return sum + num(rec.amount as string | number);
  }, 0);
}

export function extractOvertimeAmount(adjustmentDetails: unknown): number {
  return sumNamedAmounts(adjustmentDetails, ['overtime', 'ot', 'extra hours']);
}

export function extractAdvanceRecovery(deductionDetails: unknown, adjustmentDetails: unknown): number {
  const fromDed = sumNamedAmounts(deductionDetails, ['advance', 'recovery', 'loan']);
  const fromAdj = sumNamedAmounts(adjustmentDetails, ['advance', 'recovery']);
  return fromDed + fromAdj;
}

export type PayrollRegisterRowInput = {
  payslip_id: string;
  employee_id: string;
  employee_code?: string | null;
  employee_name: string;
  department?: string | null;
  designation?: string | null;
  payroll_period: string;
  month: string;
  year: number;
  basic_pay: number;
  total_allowances: number;
  gross_pay: number;
  total_deductions: number;
  lop_deduction: number;
  net_pay: number;
  paid_amount: number;
  adjustment_details?: unknown;
  deduction_details?: unknown;
  is_paid?: boolean | null;
  run_status?: string | null;
};

export type PayrollRegisterRow = PayrollRegisterRowInput & {
  overtime: number;
  advance_recovery: number;
  leave_deductions: number;
  remaining_balance: number;
  status: string;
};

export function buildRegisterRow(row: PayrollRegisterRowInput): PayrollRegisterRow {
  const net = roundMoney(row.net_pay);
  const paid = roundMoney(row.paid_amount);
  const remaining = roundMoney(Math.max(0, net - paid));
  return {
    ...row,
    overtime: roundMoney(extractOvertimeAmount(row.adjustment_details)),
    advance_recovery: roundMoney(extractAdvanceRecovery(row.deduction_details, row.adjustment_details)),
    leave_deductions: roundMoney(row.lop_deduction),
    remaining_balance: remaining,
    status: payslipStatusLabel(row.is_paid, net, paid),
  };
}

export type PayrollLiabilityRunInput = {
  run_id: string;
  payroll_period: string;
  month: string;
  year: number;
  run_status: string;
  approved_payroll: number;
  payments_made: number;
  employee_count: number;
  unpaid_employee_count: number;
};

export type PayrollLiabilityRow = PayrollLiabilityRunInput & {
  outstanding_liability: number;
  employees_remaining: number;
};

export function buildLiabilityRow(row: PayrollLiabilityRunInput): PayrollLiabilityRow {
  const approved = roundMoney(row.approved_payroll);
  const paid = roundMoney(row.payments_made);
  const outstanding = roundMoney(Math.max(0, approved - paid));
  return {
    ...row,
    outstanding_liability: outstanding,
    employees_remaining: row.unpaid_employee_count,
  };
}

export type PayrollSummaryInput = {
  rows: PayrollRegisterRow[];
  liabilityRows: PayrollLiabilityRow[];
};

export type PayrollSummaryReport = {
  employees_processed: number;
  total_gross_payroll: number;
  total_deductions: number;
  total_net_payroll: number;
  total_paid: number;
  outstanding_liability: number;
  average_salary: number;
  department_breakdown: Array<{
    department: string;
    employee_count: number;
    gross_pay: number;
    net_pay: number;
    paid: number;
    outstanding: number;
  }>;
};

export function buildPayrollSummaryReport(input: PayrollSummaryInput): PayrollSummaryReport {
  const rows = input.rows;
  const totalGross = roundMoney(rows.reduce((s, r) => s + r.gross_pay, 0));
  const totalDeductions = roundMoney(rows.reduce((s, r) => s + r.total_deductions + r.leave_deductions, 0));
  const totalNet = roundMoney(rows.reduce((s, r) => s + r.net_pay, 0));
  const totalPaid = roundMoney(rows.reduce((s, r) => s + r.paid_amount, 0));
  const outstanding = roundMoney(input.liabilityRows.reduce((s, r) => s + r.outstanding_liability, 0));
  const empCount = rows.length;
  const deptMap = new Map<string, { count: number; gross: number; net: number; paid: number; outstanding: number }>();
  for (const r of rows) {
    const dept = r.department?.trim() || 'Unassigned';
    const cur = deptMap.get(dept) ?? { count: 0, gross: 0, net: 0, paid: 0, outstanding: 0 };
    cur.count += 1;
    cur.gross += r.gross_pay;
    cur.net += r.net_pay;
    cur.paid += r.paid_amount;
    cur.outstanding += r.remaining_balance;
    deptMap.set(dept, cur);
  }
  const department_breakdown = Array.from(deptMap.entries())
    .map(([department, v]) => ({
      department,
      employee_count: v.count,
      gross_pay: roundMoney(v.gross),
      net_pay: roundMoney(v.net),
      paid: roundMoney(v.paid),
      outstanding: roundMoney(v.outstanding),
    }))
    .sort((a, b) => b.net_pay - a.net_pay);

  return {
    employees_processed: empCount,
    total_gross_payroll: totalGross,
    total_deductions: totalDeductions,
    total_net_payroll: totalNet,
    total_paid: totalPaid,
    outstanding_liability: outstanding,
    average_salary: empCount > 0 ? roundMoney(totalNet / empCount) : 0,
    department_breakdown,
  };
}
