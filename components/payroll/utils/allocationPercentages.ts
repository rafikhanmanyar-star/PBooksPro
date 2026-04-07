import type { BuildingAllocation, PayrollEmployee, PayrollRun, Payslip, ProjectAllocation } from '../types';
import { getDaysInMonth } from './salaryCalculation';

function allocationPayload(emp: PayrollEmployee) {
  return {
    projects: (emp.projects || []).map((p) => ({
      project_id: p.project_id,
      percentage: p.percentage,
      start_date: p.start_date || '',
    })),
    buildings: (emp.buildings || []).map((b) => ({
      building_id: b.building_id,
      percentage: b.percentage,
      start_date: b.start_date || '',
    })),
  };
}

/** True if project/building assignments or effective dates changed. */
export function allocationChanged(prev: PayrollEmployee, next: PayrollEmployee): boolean {
  return JSON.stringify(allocationPayload(prev)) !== JSON.stringify(allocationPayload(next));
}

const MONTH_NAMES_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

function parseMonthLabelToOneBased(label: string): number | null {
  const t = String(label).trim();
  const n = parseInt(t, 10);
  if (!Number.isNaN(n) && n >= 1 && n <= 12) return n;
  const i = MONTH_NAMES_EN.findIndex((m) => m.toLowerCase() === t.toLowerCase());
  return i >= 0 ? i + 1 : null;
}

/**
 * Last calendar day (YYYY-MM-DD) of the latest payroll month that has a payslip for this employee.
 * Used to allow allocation edits that only affect rows effective after this date.
 */
export function getLatestPayslipPeriodEndYyyyMmDd(
  payslips: Payslip[],
  runs: PayrollRun[],
  employeeId: string
): string | null {
  const forEmp = payslips.filter((p) => p.employee_id === employeeId);
  if (forEmp.length === 0) return null;
  const byRunId = new Map(runs.map((r) => [r.id, r]));
  let bestY = 0;
  let bestM = 0;
  for (const p of forEmp) {
    const r = byRunId.get(p.payroll_run_id);
    if (!r) continue;
    const m = parseMonthLabelToOneBased(String(r.month));
    if (m == null) continue;
    const y = Number(r.year);
    if (!Number.isFinite(y) || y < 1900) continue;
    if (y > bestY || (y === bestY && m > bestM)) {
      bestY = y;
      bestM = m;
    }
  }
  if (bestY === 0 || bestM === 0) return null;
  const lastDay = getDaysInMonth(bestY, bestM);
  return `${bestY}-${String(bestM).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

function effectiveAllocationStartYyyyMmDd(row: { start_date?: string }, joiningDate: string): string {
  const s = (row.start_date || '').trim();
  if (s) return s.slice(0, 10);
  const j = (joiningDate || '').trim();
  if (j) return j.slice(0, 10);
  return '1970-01-01';
}

/**
 * True when the only allocation differences are on rows whose effective start is strictly after
 * `lockedPeriodEndYyyyMmDd` (end of last payslip month), or rows removed/added only in that future range.
 * Then changing assignments does not contradict existing payslip periods.
 */
export function allocationChangeOnlyAffectsFutureAllocations(
  prev: PayrollEmployee,
  next: PayrollEmployee,
  lockedPeriodEndYyyyMmDd: string
): boolean {
  const j = prev.joining_date || next.joining_date || '';
  const filterLocked = (emp: PayrollEmployee) => ({
    projects: (emp.projects || []).filter(
      (p) => effectiveAllocationStartYyyyMmDd(p, j) <= lockedPeriodEndYyyyMmDd
    ),
    buildings: (emp.buildings || []).filter(
      (b) => effectiveAllocationStartYyyyMmDd(b, j) <= lockedPeriodEndYyyyMmDd
    ),
  });
  const serialize = (partial: { projects: ProjectAllocation[]; buildings: BuildingAllocation[] }) =>
    JSON.stringify({
      projects: partial.projects.map((p) => ({
        project_id: p.project_id,
        percentage: p.percentage,
        start_date: p.start_date || '',
      })),
      buildings: partial.buildings.map((b) => ({
        building_id: b.building_id,
        percentage: b.percentage,
        start_date: b.start_date || '',
      })),
    });
  return serialize(filterLocked(prev)) === serialize(filterLocked(next));
}

/**
 * When the user changes one project/building share, spread the remainder across the others
 * proportionally so the combined total stays 100%.
 */
export function redistributeProjectBuildingShares(
  projects: ProjectAllocation[],
  buildings: BuildingAllocation[],
  changed: { type: 'project' | 'building'; index: number },
  newPercentage: number
): { projects: ProjectAllocation[]; buildings: BuildingAllocation[] } {
  const p = projects.map((x) => ({ ...x }));
  const b = buildings.map((x) => ({ ...x }));
  const clamped = Math.max(0, Math.min(100, Math.round(Number(newPercentage))));

  type Ref = { type: 'project' | 'building'; index: number };
  const refs: Ref[] = [
    ...p.map((_, i) => ({ type: 'project' as const, index: i })),
    ...b.map((_, i) => ({ type: 'building' as const, index: i })),
  ];
  if (refs.length === 0) return { projects: p, buildings: b };

  const isTarget = (r: Ref) => r.type === changed.type && r.index === changed.index;
  const others = refs.filter((r) => !isTarget(r));
  const remaining = 100 - clamped;

  const getPct = (r: Ref) => (r.type === 'project' ? p[r.index].percentage : b[r.index].percentage);
  const setPct = (r: Ref, v: number) => {
    if (r.type === 'project') p[r.index].percentage = v;
    else b[r.index].percentage = v;
  };

  if (changed.type === 'project') p[changed.index].percentage = clamped;
  else b[changed.index].percentage = clamped;

  if (others.length === 0) {
    return { projects: p, buildings: b };
  }

  const prevOthersSum = others.reduce((s, r) => s + getPct(r), 0);
  let next: number[];
  if (prevOthersSum <= 0) {
    const base = Math.floor(remaining / others.length);
    let leftover = remaining - base * others.length;
    next = others.map((_, i) => base + (i < leftover ? 1 : 0));
  } else {
    next = others.map((r) => Math.round((remaining * getPct(r)) / prevOthersSum));
    const s = next.reduce((a, c) => a + c, 0);
    next[next.length - 1] += remaining - s;
  }

  others.forEach((r, j) => setPct(r, next[j]));

  const total = [...p.map((x) => x.percentage), ...b.map((x) => x.percentage)].reduce((a, c) => a + c, 0);
  if (total !== 100 && others.length > 0) {
    const lastR = others[others.length - 1];
    setPct(lastR, getPct(lastR) + (100 - total));
  }

  return { projects: p, buildings: b };
}

/** After removing a row, scale remaining shares to sum to 100% (when any rows left). */
export function normalizeAllocationsTotal(
  projects: ProjectAllocation[],
  buildings: BuildingAllocation[]
): { projects: ProjectAllocation[]; buildings: BuildingAllocation[] } {
  const p = projects.map((x) => ({ ...x }));
  const b = buildings.map((x) => ({ ...x }));
  type Ref = { type: 'project' | 'building'; index: number };
  const refs: Ref[] = [
    ...p.map((_, i) => ({ type: 'project' as const, index: i })),
    ...b.map((_, i) => ({ type: 'building' as const, index: i })),
  ];
  if (refs.length === 0) return { projects: p, buildings: b };
  const getPct = (r: Ref) => (r.type === 'project' ? p[r.index].percentage : b[r.index].percentage);
  const setPct = (r: Ref, v: number) => {
    if (r.type === 'project') p[r.index].percentage = v;
    else b[r.index].percentage = v;
  };

  if (refs.length === 1) {
    setPct(refs[0], 100);
    return { projects: p, buildings: b };
  }

  const sum = refs.reduce((s, r) => s + getPct(r), 0);
  if (sum <= 0) {
    const eq = Math.floor(100 / refs.length);
    let left = 100 - eq * refs.length;
    refs.forEach((r, i) => setPct(r, eq + (i < left ? 1 : 0)));
    return { projects: p, buildings: b };
  }

  refs.forEach((r) => setPct(r, Math.round((getPct(r) * 100) / sum)));
  const tot = refs.reduce((s, r) => s + getPct(r), 0);
  setPct(refs[refs.length - 1], getPct(refs[refs.length - 1]) + (100 - tot));
  return { projects: p, buildings: b };
}
