/**
 * Pull payroll entities from PostgreSQL (LAN API) into localStorage cache so existing
 * payroll UI (storageService) works unchanged in API mode.
 */

import { isLocalOnlyMode } from '../../../config/apiUrl';
import { payrollApi } from '../../../services/api/payrollApi';
import { storageService } from './storageService';
import { normalizeEmployee, normalizePayrollRun, normalizePayslip } from '../types';

export type SyncPayrollFromServerOptions = {
  /** When set, only re-fetches payslips for these payroll run IDs (merges with cached payslips for other runs). */
  runIds?: string[];
};

export async function syncPayrollFromServer(tenantId: string, options?: SyncPayrollFromServerOptions): Promise<void> {
  if (isLocalOnlyMode() || !tenantId) return;

  storageService.init(tenantId);

  const [employees, runs, departments, grades, earningTypes, deductionTypes] = await Promise.all([
    payrollApi.getEmployees(),
    payrollApi.getPayrollRuns(),
    payrollApi.getDepartments(),
    payrollApi.getGradeLevels(),
    payrollApi.getEarningTypes(),
    payrollApi.getDeductionTypes(),
  ]);

  storageService.setEmployees(tenantId, employees.map((e) => normalizeEmployee(e as any)));
  storageService.setDepartments(tenantId, departments);
  storageService.setGradeLevels(tenantId, grades);
  storageService.setEarningTypes(tenantId, earningTypes);
  storageService.setDeductionTypes(tenantId, deductionTypes);

  const runsNorm = runs.map((r) => normalizePayrollRun(r as any));
  storageService.setPayrollRuns(tenantId, runsNorm);

  const targetRunIds = (options?.runIds ?? []).filter(Boolean);
  if (targetRunIds.length === 0) {
    const allPayslips: ReturnType<typeof storageService.getPayslips> = [];
    for (const run of runsNorm) {
      const raw = await payrollApi.getPayslipsByRun(run.id);
      for (const p of raw || []) {
        allPayslips.push(normalizePayslip(p as any));
      }
    }
    storageService.setPayslips(tenantId, allPayslips);
  } else {
    const runIdSet = new Set(targetRunIds);
    const freshLists = await Promise.all(targetRunIds.map((id) => payrollApi.getPayslipsByRun(id)));
    const fresh = freshLists.flat().map((p) => normalizePayslip(p as any));
    const existing = storageService.getPayslips(tenantId);
    const kept = existing.filter((p) => !runIdSet.has(p.payroll_run_id));
    const byId = new Map<string, (typeof fresh)[0]>();
    for (const p of [...kept, ...fresh]) {
      byId.set(p.id, p);
    }
    storageService.setPayslips(tenantId, Array.from(byId.values()));
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pbooks-payroll-storage-updated', { detail: { tenantId } }));
  }
}
