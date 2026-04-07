/**
 * Server-side payslip math (mirrors components/payroll/utils/salaryCalculation.ts).
 */

export const AdjustmentType = { EARNING: 'EARNING', DEDUCTION: 'DEDUCTION' } as const;

export type EmployeeSalaryComponent = {
  name: string;
  amount: number;
  is_percentage: boolean;
};

export type SalaryAdjustment = {
  id?: string;
  name: string;
  amount: number;
  type: string;
  date_added?: string;
  created_by?: string;
};

export type SalaryStructure = {
  basic: number;
  allowances: EmployeeSalaryComponent[];
  deductions: EmployeeSalaryComponent[];
};

export type PayrollEmployeeLike = {
  joining_date: string;
  salary: SalaryStructure;
  adjustments?: SalaryAdjustment[];
};

const MONTH_NAMES = [
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
];

export function getMonthName(monthIndex1Based: number): string {
  return MONTH_NAMES[monthIndex1Based - 1] ?? '';
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function parseJoiningDate(joiningDate: string): { year: number; month: number; day: number } | null {
  if (!joiningDate) return null;
  const parts = joiningDate.split('-').map(Number);
  if (parts.length < 3) return null;
  const [y, m, d] = parts;
  if (!m || m < 1 || m > 12) return null;
  return { year: y, month: m, day: Math.min(d || 1, getDaysInMonth(y, m)) };
}

export function daysWorkedInJoiningMonth(joiningDate: string, year: number, month: number): number | null {
  const join = parseJoiningDate(joiningDate);
  if (!join || join.year !== year || join.month !== month) return null;
  const daysInMonth = getDaysInMonth(year, month);
  return daysInMonth - join.day + 1;
}

export function isPayrollPeriodBeforeJoiningDate(
  joiningDate: string | undefined,
  year: number,
  month: number
): boolean {
  if (!joiningDate || String(joiningDate).trim() === '') return false;
  const join = parseJoiningDate(joiningDate);
  if (!join) return false;
  return year < join.year || (year === join.year && month < join.month);
}

function componentAmount(basic: number, comp: EmployeeSalaryComponent): number {
  if (comp.is_percentage) return Math.round((basic * comp.amount) / 100);
  return comp.amount;
}

export type ComputedPayslipAmounts = {
  basic_pay: number;
  total_allowances: number;
  total_deductions: number;
  total_adjustments: number;
  gross_pay: number;
  net_pay: number;
  allowance_details: EmployeeSalaryComponent[];
  deduction_details: EmployeeSalaryComponent[];
};

export function computeMonthlyPayslip(employee: PayrollEmployeeLike, year: number, month: number): ComputedPayslipAmounts {
  const basic = employee.salary?.basic ?? 0;
  const allowances = employee.salary?.allowances ?? [];
  const deductions = employee.salary?.deductions ?? [];
  const adjustments = employee.adjustments ?? [];

  const allowanceDetails = allowances.map((a) => ({
    ...a,
    amount: componentAmount(basic, a),
  }));
  const deductionDetails = deductions.map((d) => ({
    ...d,
    amount: componentAmount(basic, d),
  }));

  let totalAllowances = allowanceDetails.reduce((s, a) => s + a.amount, 0);
  let totalDeductions = deductionDetails.reduce((s, d) => s + d.amount, 0);
  const adjustmentEarnings = adjustments
    .filter((a) => a.type === AdjustmentType.EARNING)
    .reduce((s, a) => s + a.amount, 0);
  const adjustmentDeductions = adjustments
    .filter((a) => a.type === AdjustmentType.DEDUCTION)
    .reduce((s, a) => s + a.amount, 0);
  let totalAdjustments = adjustmentEarnings - adjustmentDeductions;

  let basicPay = basic;
  let grossPay = basic + totalAllowances;
  let netPay = grossPay - totalDeductions + totalAdjustments;

  const daysWorked = daysWorkedInJoiningMonth(employee.joining_date, year, month);
  const daysInMonth = getDaysInMonth(year, month);

  if (daysWorked != null && daysWorked < daysInMonth) {
    const factor = daysWorked / daysInMonth;
    basicPay = Math.round(basic * factor);
    totalAllowances = Math.round(totalAllowances * factor);
    totalDeductions = Math.round(totalDeductions * factor);
    totalAdjustments = Math.round(totalAdjustments * factor);
    grossPay = basicPay + totalAllowances;
    netPay = grossPay - totalDeductions + totalAdjustments;
  }
  netPay = Math.ceil(netPay / 100) * 100;

  return {
    basic_pay: basicPay,
    total_allowances: totalAllowances,
    total_deductions: totalDeductions,
    total_adjustments: totalAdjustments,
    gross_pay: grossPay,
    net_pay: netPay,
    allowance_details: allowanceDetails,
    deduction_details: deductionDetails,
  };
}
