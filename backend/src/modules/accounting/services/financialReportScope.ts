/**
 * A5.1.4.1 — RBAC data scope helpers for financial report SQL paths.
 */
import type { DataScopeEnforcementContext } from '../../../auth/tenantRepositoryScope.js';
import {
  appendScopeFragment,
  applyProjectScope,
  applyPropertyScope,
} from '../../../auth/tenantRepositoryScope.js';

export function appendFinancialRbacScopeSql(
  conditions: string[],
  params: unknown[],
  scopeCtx: DataScopeEnforcementContext | undefined,
  columns: { project?: string; property?: string }
): void {
  if (!scopeCtx?.enabled) return;
  if (columns.project) {
    appendScopeFragment(conditions, params, applyProjectScope(scopeCtx, columns.project, params.length + 1));
  }
  if (columns.property) {
    appendScopeFragment(conditions, params, applyPropertyScope(scopeCtx, columns.property, params.length + 1));
  }
}
