/**
 * RBAC 2.0 Phase 3 — exclusive authorization mode (no dual-run / no OR semantics).
 *
 * Migration model:
 * - RBAC_V2_AUTHORIZATION_ENGINE=false → legacy matrix + module resolver only
 * - RBAC_V2_AUTHORIZATION_ENGINE=true  → v2 EffectiveAccessContext + permissionEvaluator only
 *
 * A route uses requirePermission OR requirePermissionV2 — never both on the same handler.
 */
import { isRbacV2AuthorizationEngineEnabled } from './rbacAuthorizationFeatureFlag.js';

export type AuthorizationMode = 'legacy' | 'v2';

export function getAuthorizationMode(): AuthorizationMode {
  return isRbacV2AuthorizationEngineEnabled() ? 'v2' : 'legacy';
}

export function isV2AuthorizationActive(): boolean {
  return getAuthorizationMode() === 'v2';
}

/** Guard rails: detect misconfigured routes stacking legacy + v2 permission middleware. */
export function assertExclusiveAuthorizationGuard(
  guardKind: 'legacy' | 'v2',
  alreadyApplied: AuthorizationMode | null
): AuthorizationMode {
  const mode = getAuthorizationMode();
  if (alreadyApplied && alreadyApplied !== mode) {
    throw new Error(
      `Authorization misconfiguration: route cannot use both legacy and v2 guards (applied=${alreadyApplied}, requested=${guardKind})`
    );
  }
  if (guardKind === 'v2' && mode === 'legacy') {
    throw new Error(
      'requirePermissionV2 used while RBAC_V2_AUTHORIZATION_ENGINE is disabled — use requirePermission instead'
    );
  }
  return mode;
}
