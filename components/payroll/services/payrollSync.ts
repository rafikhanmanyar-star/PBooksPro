/**
 * Pull payroll entities from PostgreSQL (LAN API) into localStorage cache so existing
 * payroll UI (storageService) works unchanged in API mode.
 */

import { isLocalOnlyMode } from '../../../config/apiUrl';
import { payrollApi } from '../../../services/api/payrollApi';
import { storageService } from './storageService';
import { normalizeEmployee, normalizePayrollRun, normalizePayslip } from '../types';

export async function syncPayrollFromServer(tenantId: string): Promise<void> {
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

  const allPayslips: ReturnType<typeof storageService.getPayslips> = [];
  for (const run of runsNorm) {
    const raw = await payrollApi.getPayslipsByRun(run.id);
    for (const p of raw || []) {
      allPayslips.push(normalizePayslip(p as any));
    }
  }
  storageService.setPayslips(tenantId, allPayslips);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pbooks-payroll-storage-updated', { detail: { tenantId } }));
  }
}
