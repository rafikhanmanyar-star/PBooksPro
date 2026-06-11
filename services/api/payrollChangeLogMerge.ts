import type { ChangeLogEntry } from './changeLogMerge';

/** Maps Architecture v2 payroll change_log entity_type → incremental sync entity bucket key. */
export const PAYROLL_CHANGE_LOG_ENTITY_KEY: Record<string, string> = {
  payroll_department: 'payroll_departments',
  payroll_grade: 'payroll_grades',
  payroll_employee: 'payroll_employees',
  payroll_run: 'payroll_runs',
  payslip: 'payslips',
  payroll_project: 'payroll_projects',
  payroll_tenant_config: 'payroll_tenant_config',
  payroll_salary_component: 'payroll_salary_components',
};

/**
 * Apply payroll-domain change_log entries into payroll localStorage via storageService.
 * Payloads use API row shape from backend rowTo*Api mappers (snake_case).
 */
export async function applyPayrollChangeLogToStorage(
  tenantId: string,
  entries: ChangeLogEntry[] | undefined
): Promise<void> {
  if (!entries?.length || !tenantId) return;

  const entities: Record<string, unknown[]> = {};
  for (const entry of entries) {
    const bucket = PAYROLL_CHANGE_LOG_ENTITY_KEY[entry.entityType];
    if (!bucket) continue;
    if (!entities[bucket]) entities[bucket] = [];

    if (entry.action === 'delete') {
      entities[bucket].push({
        id: entry.entityId,
        deleted_at: entry.changedAt,
        deletedAt: entry.changedAt,
      });
      continue;
    }

    if (entry.payload != null && typeof entry.payload === 'object') {
      entities[bucket].push(entry.payload);
    }
  }

  if (Object.keys(entities).length === 0) return;

  const { storageService } = await import('../../components/payroll/services/storageService');
  storageService.init(tenantId);
  storageService.applyPayrollIncrementalEntities(tenantId, entities);
}
