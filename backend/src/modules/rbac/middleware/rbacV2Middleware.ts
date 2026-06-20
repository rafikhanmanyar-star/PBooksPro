/**
 * RBAC 2.0 — v2 catalog permission guards (supports keys not yet in v1 Permission type).
 */
import type { RequestHandler } from 'express';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { sendFailure } from '../../../utils/apiResponse.js';
import { isSystemOwnerSlug, permissionSetHas, resolveEnterpriseRole, type Permission } from '../../../auth/permissions.js';

function requestHasPermissionKey(req: AuthedRequest, key: string): boolean {
  const resolved = req.resolvedPermissions;
  if (resolved && resolved.length > 0) {
    if ((resolved as readonly string[]).includes(key)) return true;
    if (permissionSetHas(resolved, key as Permission)) return true;
  }
  const enterpriseRole = resolveEnterpriseRole(req.role ?? '');
  if (isSystemOwnerSlug(req.role) || enterpriseRole === 'super_admin') return true;
  return false;
}

/** Require any one of the listed permission keys (v1 or v2 catalog). */
export function requireSecurityPermissionKey(...keys: string[]): RequestHandler {
  return (req, res, next) => {
    const authed = req as AuthedRequest;
    if (keys.some((k) => requestHasPermissionKey(authed, k))) {
      next();
      return;
    }
    sendFailure(res, 403, 'FORBIDDEN', 'Insufficient permissions');
  };
}

/** RBAC audit log read — v2 key; super_admin / SYSTEM_OWNER bypass via resolver. */
export function requireRbacAuditRead(): RequestHandler {
  return requireSecurityPermissionKey('audit_logs.rbac.read');
}
