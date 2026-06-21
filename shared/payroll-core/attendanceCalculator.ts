import type { AttendanceStatusCounts, ComputedAttendanceSummary, WorkWeekConfig } from './payrollTypes';
import { DEFAULT_WORK_WEEK } from './payrollTypes';
import { calculateLopDays } from './lopCalculator';

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Count configured working weekdays in a calendar month (not calendar days). */
export function countWorkingDaysInMonth(
  year: number,
  month: number,
  workWeek: WorkWeekConfig = DEFAULT_WORK_WEEK
): number {
  const dim = getDaysInMonth(year, month);
  let count = 0;
  for (let day = 1; day <= dim; day++) {
    const dow = new Date(year, month - 1, day).getDay();
    if (workWeek.working_days.includes(dow)) count++;
  }
  return count;
}

export function monthDateBounds(year: number, month: number): { start: string; end: string } {
  const dim = getDaysInMonth(year, month);
  const mm = String(month).padStart(2, '0');
  return {
    start: `${year}-${mm}-01`,
    end: `${year}-${mm}-${String(dim).padStart(2, '0')}`,
  };
}

/** Present days = PRESENT + LATE (per Sprint 3A rules). */
export function computePresentDays(counts: Pick<AttendanceStatusCounts, 'present' | 'late'>): number {
  return counts.present + counts.late;
}

export function computeLeaveDays(counts: Pick<AttendanceStatusCounts, 'paidLeave' | 'unpaidLeave'>): number {
  return counts.paidLeave + counts.unpaidLeave;
}

export function buildAttendanceSummary(
  counts: AttendanceStatusCounts,
  workingDays: number
): ComputedAttendanceSummary {
  const presentDays = computePresentDays(counts);
  const paidLeaveDays = counts.paidLeave;
  const unpaidLeaveDays = counts.unpaidLeave;
  const leaveDays = computeLeaveDays({ paidLeave: paidLeaveDays, unpaidLeave: unpaidLeaveDays });
  const lopDays = calculateLopDays({
    absentDays: counts.absent,
    unpaidLeaveDays,
    halfDays: counts.halfDay,
  });

  return {
    workingDays,
    presentDays,
    leaveDays,
    paidLeaveDays,
    unpaidLeaveDays,
    absentDays: counts.absent,
    halfDays: counts.halfDay,
    lateDays: counts.late,
    lopDays,
  };
}
