/**
 * RBAC 2.0 Phase 3 — authorization engine orchestration.
 */
import type { Response, NextFunction, RequestHandler } from 'express';
import type pg from 'pg';
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import { sendFailure } from '../utils/apiResponse.js';
import { resolveEnterpriseRole } from './permissions.js';
import {
  computeCompositeAccessVersionHash,
  loadAccessVersionMaterial,
} from './accessVersionService.js';
import {
  resolveEffectivePermissions,
  toLegacyPermissionArray,
} from './rbacPermissionResolver.js';
import { buildEffectiveAccessContext } from './effectiveAccessContext.js';
import type { EffectiveAccessContext } from './effectiveAccessContext.js';
import {
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
} from './permissionEvaluator.js';
import { isRbacV2AuthorizationEngineEnabled } from './rbacAuthorizationFeatureFlag.js';
import type { VerifiedAccessToken } from './jwt.js';
import {
  recordRbacBreakGlass,
  recordRbacDeny,
  recordRbacPermissionCheck,
  recordRbacStaleAv,
} from './rbacV2Metrics.js';
import { validateBreakGlassSession } from '../modules/rbac/services/rbacBreakGlassService.js';
import { resolveDataScopeMaterial } from './dataScopeResolver.js';
import { resolveApprovalMaterial } from './approvalCapabilityResolver.js';

export type AuthorizationEngineResult =
  | { ok: true; context: EffectiveAccessContext }
  | { ok: false; code: 'STALE_AV' | 'BREAK_GLASS_EXPIRED' | 'UNAUTHORIZED' };

export function validateJwtAccessVersion(
  jwtAv: string | undefined,
  currentHash: string,
  options?: { requireAv?: boolean }
): boolean {
  if (options?.requireAv && !jwtAv) return false;
  if (!jwtAv) return true;
  return jwtAv === currentHash;
}

export async function resolveAuthorizationContext(input: {
  tenantId: string;
  userId: string;
  legacyRole: string;
  breakGlassSessionId?: string | null;
  breakGlassExpiresAt?: string | null;
  client?: pg.PoolClient;
}): Promise<EffectiveAccessContext> {
  const { permissions, assignments } = await resolveEffectivePermissions({
    tenantId: input.tenantId,
    userId: input.userId,
    legacyRole: input.legacyRole,
    client: input.client,
    breakGlassSessionId: input.breakGlassSessionId,
  });

  const scopeMaterial = await resolveDataScopeMaterial({
    tenantId: input.tenantId,
    userId: input.userId,
    assignments,
    isBreakGlass: Boolean(input.breakGlassSessionId),
    client: input.client,
  });

  const approvalMaterial = await resolveApprovalMaterial({
    tenantId: input.tenantId,
    userId: input.userId,
    permissions,
    assignments,
    client: input.client,
  });

  const material = await loadAccessVersionMaterial(input.tenantId, input.userId, input.client, {
    breakGlassSessionId: input.breakGlassSessionId,
  });
  const roleVersionHash = computeCompositeAccessVersionHash({
    ...material,
    scopeHash: scopeMaterial.scopeHash,
    approvalHash: approvalMaterial.approvalHash,
  });

  return buildEffectiveAccessContext({
    userId: input.userId,
    tenantId: input.tenantId,
    permissions,
    assignments,
    scopes: scopeMaterial.scopes,
    approvalCapabilities: approvalMaterial.approvalCapabilities,
    accessVersion: material.accessVersion,
    roleVersionHash,
    breakGlassSessionId: input.breakGlassSessionId,
    breakGlassExpiresAt: input.breakGlassExpiresAt,
  });
}

export async function authorizeV2ForRequest(
  req: AuthedRequest,
  payload: VerifiedAccessToken,
  legacyRole: string,
  client?: pg.PoolClient
): Promise<AuthorizationEngineResult> {
  if (!isRbacV2AuthorizationEngineEnabled()) {
    return { ok: false, code: 'UNAUTHORIZED' };
  }

  let breakGlassSessionId: string | null = null;
  let breakGlassExpiresAt: string | null = null;
  if (payload.sessionType === 'break_glass') {
    if (!payload.breakGlassSessionId || !client) {
      return { ok: false, code: 'BREAK_GLASS_EXPIRED' };
    }
    const session = await validateBreakGlassSession(
      payload.breakGlassSessionId,
      payload.tenantId,
      payload.sub,
      client
    );
    if (!session) {
      recordRbacBreakGlass(req, 'session_expired');
      return { ok: false, code: 'BREAK_GLASS_EXPIRED' };
    }
    breakGlassSessionId = payload.breakGlassSessionId;
    breakGlassExpiresAt = session.expires_at.toISOString();
    recordRbacBreakGlass(req, 'session_active');
  }

  const context = await resolveAuthorizationContext({
    tenantId: payload.tenantId,
    userId: payload.sub,
    legacyRole,
    breakGlassSessionId,
    breakGlassExpiresAt,
    client,
  });

  if (!validateJwtAccessVersion(payload.av, context.roleVersionHash, { requireAv: true })) {
    recordRbacStaleAv(req);
    return { ok: false, code: 'STALE_AV' };
  }

  req.effectiveAccess = context;
  req.resolvedPermissions = toLegacyPermissionArray(context.permissions);
  return { ok: true, context };
}

export function attachEffectiveAccess(req: AuthedRequest, context: EffectiveAccessContext): void {
  req.effectiveAccess = context;
  req.resolvedPermissions = toLegacyPermissionArray(context.permissions);
}

export function requirePermissionV2(...permissionKeys: string[]): RequestHandler {
  return (req, res, next) => {
    if (!isRbacV2AuthorizationEngineEnabled()) {
      sendFailure(
        res,
        503,
        'AUTH_MISCONFIGURED',
        'Route uses requirePermissionV2 but RBAC_V2_AUTHORIZATION_ENGINE is disabled. Use requirePermission instead.'
      );
      return;
    }
    const authed = req as AuthedRequest;
    const ctx = authed.effectiveAccess;
    if (!ctx) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Authorization context not resolved');
      return;
    }
    const enterprise = resolveEnterpriseRole(authed.role);
    if (!hasAnyPermission(ctx, permissionKeys, enterprise)) {
      recordRbacDeny(authed, permissionKeys.join('|'));
      sendFailure(res, 403, 'FORBIDDEN', 'Insufficient permissions');
      return;
    }
    recordRbacPermissionCheck(authed, permissionKeys[0]);
    next();
  };
}

export function requireAllPermissionsV2(...permissionKeys: string[]): RequestHandler {
  return (req, res, next) => {
    if (!isRbacV2AuthorizationEngineEnabled()) {
      sendFailure(
        res,
        503,
        'AUTH_MISCONFIGURED',
        'Route uses requireAllPermissionsV2 but RBAC_V2_AUTHORIZATION_ENGINE is disabled. Use requireAllPermissions instead.'
      );
      return;
    }
    const authed = req as AuthedRequest;
    const ctx = authed.effectiveAccess;
    if (!ctx) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Authorization context not resolved');
      return;
    }
    const enterprise = resolveEnterpriseRole(authed.role);
    if (!hasAllPermissions(ctx, permissionKeys, enterprise)) {
      recordRbacDeny(authed, permissionKeys.join('|'));
      sendFailure(res, 403, 'FORBIDDEN', 'Insufficient permissions');
      return;
    }
    recordRbacPermissionCheck(authed, permissionKeys[0]);
    next();
  };
}

export { hasPermission, hasAnyPermission, hasAllPermissions };
