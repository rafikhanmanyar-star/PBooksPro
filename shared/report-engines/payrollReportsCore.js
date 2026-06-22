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
];
export function payrollMonthName(month1to12) {
    if (month1to12 < 1 || month1to12 > 12)
        return null;
    return PAYROLL_MONTH_NAMES[month1to12 - 1];
}
export function roundMoney(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}
export function num(value) {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? n : 0;
}
export function payslipStatusLabel(isPaid, netPay, paidAmount) {
    if (isPaid === true || paidAmount >= netPay - 0.005)
        return 'Paid';
    if (paidAmount > 0.005)
        return 'Partial';
    return 'Unpaid';
}
export function sumNamedAmounts(details, keywords) {
    if (!Array.isArray(details))
        return 0;
    const lower = keywords.map((k) => k.toLowerCase());
    return details.reduce((sum, item) => {
        if (item == null || typeof item !== 'object')
            return sum;
        const rec = item;
        const name = String(rec.name ?? rec.label ?? rec.type ?? '').toLowerCase();
        if (!lower.some((k) => name.includes(k)))
            return sum;
        return sum + num(rec.amount);
    }, 0);
}
export function extractOvertimeAmount(adjustmentDetails) {
    return sumNamedAmounts(adjustmentDetails, ['overtime', 'ot', 'extra hours']);
}
export function extractAdvanceRecovery(deductionDetails, adjustmentDetails) {
    const fromDed = sumNamedAmounts(deductionDetails, ['advance', 'recovery', 'loan']);
    const fromAdj = sumNamedAmounts(adjustmentDetails, ['advance', 'recovery']);
    return fromDed + fromAdj;
}
export function buildRegisterRow(row) {
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
export function buildLiabilityRow(row) {
    const approved = roundMoney(row.approved_payroll);
    const paid = roundMoney(row.payments_made);
    const outstanding = roundMoney(Math.max(0, approved - paid));
    return {
        ...row,
        outstanding_liability: outstanding,
        employees_remaining: row.unpaid_employee_count,
    };
}
export function buildPayrollSummaryReport(input) {
    const rows = input.rows;
    const totalGross = roundMoney(rows.reduce((s, r) => s + r.gross_pay, 0));
    const totalDeductions = roundMoney(rows.reduce((s, r) => s + r.total_deductions + r.leave_deductions, 0));
    const totalNet = roundMoney(rows.reduce((s, r) => s + r.net_pay, 0));
    const totalPaid = roundMoney(rows.reduce((s, r) => s + r.paid_amount, 0));
    const outstanding = roundMoney(input.liabilityRows.reduce((s, r) => s + r.outstanding_liability, 0));
    const empCount = rows.length;
    const deptMap = new Map();
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
