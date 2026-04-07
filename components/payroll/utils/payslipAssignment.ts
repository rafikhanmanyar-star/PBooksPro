import type {
  BuildingAllocation,
  Payslip,
  PayslipAssignmentSnapshot,
  PayrollEmployee,
  ProjectAllocation,
} from '../types';

/** Deep-clone project/building rows for persisting on a payslip at generation time. */
export function buildAssignmentSnapshotFromEmployee(emp: PayrollEmployee): PayslipAssignmentSnapshot {
  const projects = (emp.projects ?? []).map((p) => ({ ...p }));
  const buildings = (emp.buildings ?? []).map((b) => ({ ...b }));
  return { projects, buildings };
}

/**
 * Assignment shown on a payslip or used when paying: use snapshot from the payslip when present;
 * otherwise fall back to the employee's current profile (legacy rows).
 */
export function resolvePayslipAssignment(
  payslip: Payslip | null | undefined,
  employee: PayrollEmployee | undefined
): { projects: ProjectAllocation[]; buildings: BuildingAllocation[] } {
  const snap = payslip?.assignment_snapshot;
  if (snap != null) {
    const projects =
      snap.projects !== undefined
        ? (Array.isArray(snap.projects) ? snap.projects : [])
        : (employee?.projects ?? []);
    const buildings =
      snap.buildings !== undefined
        ? (Array.isArray(snap.buildings) ? snap.buildings : [])
        : (employee?.buildings ?? []);
    return { projects, buildings };
  }
  return {
    projects: employee?.projects ?? [],
    buildings: employee?.buildings ?? [],
  };
}

export function formatPayslipAssignmentDisplay(
  payslip: Payslip | null | undefined,
  employee: PayrollEmployee | undefined
): string {
  const { projects, buildings } = resolvePayslipAssignment(payslip, employee);
  const projectParts = projects.map((p) => `${p.project_name} (${p.percentage}%)`);
  const buildingParts = buildings.map((b) => `Building: ${b.building_name} (${b.percentage}%)`);
  if (projectParts.length || buildingParts.length) {
    return [...projectParts, ...buildingParts].join(', ');
  }
  return '—';
}
