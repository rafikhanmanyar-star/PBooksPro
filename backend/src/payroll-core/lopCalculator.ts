/**
 * AUTO-GENERATED — do not edit. Source: shared/payroll-core/lopCalculator.ts
 * Regenerate: node scripts/ensure-shared-financial-cores.mjs
 */

import type { ProjectedSalaryImpact } from './payrollTypes.js';

/**
 * LOP Days = Absent + Unpaid Leave + (Half Days × 0.5)
 * Sprint 3A — informational only; no salary deduction applied here.
 */
export function calculateLopDays(input: {
  absentDays: number;
  unpaidLeaveDays: number;
  halfDays: number;
}): number {
  return input.absentDays + input.unpaidLeaveDays + input.halfDays * 0.5;
}

/** Projected salary impact for wizard preview — does not mutate payslips. */
export function projectSalaryImpact(grossPay: number, workingDays: number, lopDays: number): ProjectedSalaryImpact {
  const safeWorking = workingDays > 0 ? workingDays : 1;
  const dailyRate = grossPay / safeWorking;
  const projectedDeduction = dailyRate * lopDays;
  return {
    grossPay,
    workingDays: safeWorking,
    lopDays,
    dailyRate,
    projectedDeduction,
    projectedNetAfterLop: Math.max(0, grossPay - projectedDeduction),
  };
}
