/**
 * Map main app Project (Settings → Assets → Projects) to payroll PayrollProject.
 * Used so payroll project allocation combo shows the same projects as the app.
 */

import type { Project } from '../../../types';
import type { PayrollProject } from '../types';

function mapStatus(appStatus?: string): 'ACTIVE' | 'COMPLETED' | 'ON_HOLD' {
  const s = (appStatus || '').toLowerCase();
  if (s === 'completed' || s === 'done' || s === 'finished') return 'COMPLETED';
  if (s === 'on hold' || s === 'hold' || s === 'paused') return 'ON_HOLD';
  return 'ACTIVE';
}

export function mapAppProjectsToPayroll(appProjects: Project[], tenantId: string): PayrollProject[] {
  return appProjects.map(p => ({
    id: p.id,
    tenant_id: tenantId,
    name: p.name,
    code: (p.id || '').substring(0, 8).toUpperCase(),
    description: p.description || '',
    status: mapStatus(p.status)
  }));
}
