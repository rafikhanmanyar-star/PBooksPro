/**
 * A5.1.4 — mandatory repository scope fragments for report SQL (H2).
 */
import type { DataScopeEnforcementContext } from '../../../auth/tenantRepositoryScope.js';
import {
  appendScopeFragment,
  applyDepartmentScope,
  applyOwnerScope,
  applyProjectScope,
  applyPropertyScope,
} from '../../../auth/tenantRepositoryScope.js';

export type ReportScopeSql = {
  clauses: string[];
  params: unknown[];
  nextParamIndex: number;
};

export function buildReportScopeSql(
  ctx: DataScopeEnforcementContext,
  columns: {
    project?: string;
    property?: string;
    owner?: string;
    department?: string;
  },
  startParamIndex: number
): ReportScopeSql {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let idx = startParamIndex;

  if (columns.project) {
    const frag = applyProjectScope(ctx, columns.project, idx);
    appendScopeFragment(clauses, params, frag);
    if (frag) idx = frag.nextParamIndex;
  }
  if (columns.property) {
    const frag = applyPropertyScope(ctx, columns.property, idx);
    appendScopeFragment(clauses, params, frag);
    if (frag) idx = frag.nextParamIndex;
  }
  if (columns.owner) {
    const frag = applyOwnerScope(ctx, columns.owner, idx);
    appendScopeFragment(clauses, params, frag);
    if (frag) idx = frag.nextParamIndex;
  }
  if (columns.department) {
    const frag = applyDepartmentScope(ctx, columns.department, idx);
    appendScopeFragment(clauses, params, frag);
    if (frag) idx = frag.nextParamIndex;
  }

  return { clauses, params, nextParamIndex: idx };
}

export function mergeReportScopeIntoFilter(
  ctx: DataScopeEnforcementContext,
  parts: string[],
  params: unknown[],
  columns: {
    project?: string;
    property?: string;
    owner?: string;
    department?: string;
  }
): number {
  const scope = buildReportScopeSql(ctx, columns, params.length + 1);
  parts.push(...scope.clauses);
  params.push(...scope.params);
  return scope.nextParamIndex;
}
