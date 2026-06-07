import type { RequestHandler } from 'express';
import type { AuthedRequest } from './authMiddleware.js';
import { sendFailure } from '../utils/apiResponse.js';
import {
  type EnterpriseRole,
  type Permission,
  permissionsForRole,
  resolveEnterpriseRole,
  roleHasAllPermissions,
  roleHasAnyPermission,
  roleHasPermission,
} from '../auth/permissions.js';

export { permissionsForRole, resolveEnterpriseRole, roleHasPermission };

/** Require a single permission (server-side enforcement). */
export function requirePermission(permission: Permission): RequestHandler {
  return (req, res, next) => {
    const role = (req as AuthedRequest).role;
    if (roleHasPermission(role, permission)) {
      next();
      return;
    }
    sendFailure(res, 403, 'FORBIDDEN', `Missing permission: ${permission}`);
  };
}

/** Require any one of the listed permissions. */
export function requireAnyPermission(...permissions: Permission[]): RequestHandler {
  return (req, res, next) => {
    const role = (req as AuthedRequest).role;
    if (roleHasAnyPermission(role, permissions)) {
      next();
      return;
    }
    sendFailure(res, 403, 'FORBIDDEN', 'Insufficient permissions');
  };
}

/** Require all listed permissions. */
export function requireAllPermissions(...permissions: Permission[]): RequestHandler {
  return (req, res, next) => {
    const role = (req as AuthedRequest).role;
    if (roleHasAllPermissions(role, permissions)) {
      next();
      return;
    }
    sendFailure(res, 403, 'FORBIDDEN', 'Insufficient permissions');
  };
}

/** Require role to resolve to one of the enterprise roles (after legacy mapping). */
export function requireRole(...roles: EnterpriseRole[]): RequestHandler {
  const allowed = new Set(roles);
  return (req, res, next) => {
    const enterprise = resolveEnterpriseRole((req as AuthedRequest).role);
    if (allowed.has(enterprise)) {
      next();
      return;
    }
    sendFailure(res, 403, 'FORBIDDEN', 'Insufficient role');
  };
}

/** @deprecated Use requirePermission('financial.write') */
export const requireFinancialWriteRole: RequestHandler = requirePermission('financial.write');

/** Block mutations unless role has financial.write. GET/HEAD/OPTIONS pass through. */
export const requireFinancialWriteOnMutations: RequestHandler = (req, res, next) => {
  const method = (req.method ?? 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    next();
    return;
  }
  return requirePermission('financial.write')(req, res, next);
};

/** Payroll: GET requires payroll.read; mutations require payroll.write. */
export const requirePayrollAccess: RequestHandler = (req, res, next) => {
  const method = (req.method ?? 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return requirePermission('payroll.read')(req, res, next);
  }
  return requirePermission('payroll.write')(req, res, next);
};
