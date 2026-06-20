/**
 * RBAC 2.0 Phase 5 — approval matrix enforcement gate.
 * Requires RBAC_V2_AUTHORIZATION_ENGINE when approval matrix is enabled.
 */
import { isRbacV2AuthorizationEngineEnabled } from './rbacAuthorizationFeatureFlag.js';

export function isRbacV2ApprovalMatrixEnabled(): boolean {
  return process.env.RBAC_V2_APPROVAL_MATRIX === 'true';
}

export function isRbacV2ApprovalMatrixUiEnabled(): boolean {
  return process.env.VITE_RBAC_V2_APPROVAL_MATRIX === 'true';
}

export function isRbacV2ApprovalMatrixEffectivelyEnabled(): boolean {
  return isRbacV2ApprovalMatrixEnabled() && isRbacV2AuthorizationEngineEnabled();
}

export type RbacApprovalConfigurationResult =
  | { ok: true }
  | { ok: false; code: 'CONFIGURATION_ERROR'; message: string };

export function assertRbacV2ApprovalMatrixConfiguration(): RbacApprovalConfigurationResult {
  if (isRbacV2ApprovalMatrixEnabled() && !isRbacV2AuthorizationEngineEnabled()) {
    return {
      ok: false,
      code: 'CONFIGURATION_ERROR',
      message: 'RBAC_V2_APPROVAL_MATRIX requires RBAC_V2_AUTHORIZATION_ENGINE=true',
    };
  }
  return { ok: true };
}
