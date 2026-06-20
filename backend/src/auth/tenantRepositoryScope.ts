/**
 * RBAC 2.0 Phase 4 — repository-layer data scope SQL helpers.
 * Never trust client-supplied scope parameters for authorization.
 */
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import type { DataScopeGrant, ScopeDimension } from './dataScopeTypes.js';
import { isRbacV2AuthorizationEngineEnabled } from './rbacAuthorizationFeatureFlag.js';
import { isRbacV2DataScopeEnabled } from './rbacDataScopeFeatureFlag.js';
import {
  recordRbacScopeDeny,
  recordRbacScopeFilter,
} from './rbacV2Metrics.js';

export type DataScopeEnforcementContext = {
  enabled: boolean;
  scopes: readonly DataScopeGrant[];
  /** When true, enforcement denies all scoped reads (misconfiguration or missing effectiveAccess). */
  failClosed?: boolean;
};

export function dataScopeContextFromRequest(req: AuthedRequest): DataScopeEnforcementContext {
  if (!isRbacV2DataScopeEnabled()) {
    return { enabled: false, scopes: [] };
  }
  if (!isRbacV2AuthorizationEngineEnabled() || !req.effectiveAccess) {
    return { enabled: true, scopes: [], failClosed: true };
  }
  return { enabled: true, scopes: req.effectiveAccess.scopes, failClosed: false };
}

export function scopeGrantForDimension(
  scopes: readonly DataScopeGrant[],
  dimension: ScopeDimension
): DataScopeGrant | undefined {
  return scopes.find((s) => s.dimension === dimension);
}

export type ScopeSqlFragment = {
  clause: string;
  params: unknown[];
  nextParamIndex: number;
};

/**
 * Returns SQL AND fragment for assigned scope, null when no filter needed.
 * Assigned with empty entityIds → deny-all (1=0).
 */
export function applyDataScope(
  ctx: DataScopeEnforcementContext,
  dimension: ScopeDimension,
  columnSql: string,
  startParamIndex: number
): ScopeSqlFragment | null {
  if (!ctx.enabled) return null;
  if (ctx.failClosed) {
    return { clause: '1=0', params: [], nextParamIndex: startParamIndex };
  }

  const grant = scopeGrantForDimension(ctx.scopes, dimension);
  if (!grant || grant.mode === 'all') return null;

  const ids = grant.entityIds ?? [];
  if (ids.length === 0) {
    return { clause: '1=0', params: [], nextParamIndex: startParamIndex };
  }

  return {
    clause: `${columnSql} = ANY($${startParamIndex}::text[])`,
    params: [ids],
    nextParamIndex: startParamIndex + 1,
  };
}

export function appendScopeFragment(
  conditions: string[],
  params: unknown[],
  fragment: ScopeSqlFragment | null
): void {
  if (!fragment) return;
  conditions.push(fragment.clause);
  params.push(...fragment.params);
}

export function applyProjectScope(
  ctx: DataScopeEnforcementContext,
  columnSql: string,
  startParamIndex: number
): ScopeSqlFragment | null {
  return applyDataScope(ctx, 'project', columnSql, startParamIndex);
}

export function applyPropertyScope(
  ctx: DataScopeEnforcementContext,
  columnSql: string,
  startParamIndex: number
): ScopeSqlFragment | null {
  return applyDataScope(ctx, 'property', columnSql, startParamIndex);
}

export function applyOwnerScope(
  ctx: DataScopeEnforcementContext,
  columnSql: string,
  startParamIndex: number
): ScopeSqlFragment | null {
  return applyDataScope(ctx, 'owner', columnSql, startParamIndex);
}

export function applyDepartmentScope(
  ctx: DataScopeEnforcementContext,
  columnSql: string,
  startParamIndex: number
): ScopeSqlFragment | null {
  return applyDataScope(ctx, 'department', columnSql, startParamIndex);
}

/** Post-fetch check for single-row access (getById). */
export function rowMatchesScope(
  ctx: DataScopeEnforcementContext,
  dimension: ScopeDimension,
  entityId: string | null | undefined
): boolean {
  if (!ctx.enabled) return true;
  if (ctx.failClosed) return false;
  const grant = scopeGrantForDimension(ctx.scopes, dimension);
  if (!grant || grant.mode === 'all') return true;
  if (!entityId) return false;
  return (grant.entityIds ?? []).includes(entityId);
}

export function recordScopeFilterApplied(req: AuthedRequest | undefined, dimension: ScopeDimension): void {
  if (req) recordRbacScopeFilter(req, dimension);
}

export function recordScopeDeny(req: AuthedRequest | undefined, dimension: ScopeDimension): void {
  if (req) recordRbacScopeDeny(req, dimension);
}
