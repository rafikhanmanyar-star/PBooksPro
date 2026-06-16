import type { RequestHandler } from 'express';
import type { AuthedRequest } from './authMiddleware.js';
import { sendFailure } from '../utils/apiResponse.js';
import {
  type EnterpriseRole,
  type Permission,
  permissionSetHas,
  permissionsForRole,
  resolveEnterpriseRole,
  roleCanReadProjectSellingCatalog,
  roleCanWriteProjectSellingCatalog,
  roleHasAllPermissions,
  roleHasAnyPermission,
  roleHasPermission,
} from '../auth/permissions.js';

export { permissionsForRole, resolveEnterpriseRole, roleHasPermission };

function requestHasPermission(req: AuthedRequest, permission: Permission): boolean {
  const resolved = req.resolvedPermissions;
  if (resolved && resolved.length > 0) {
    return permissionSetHas(resolved, permission);
  }
  return roleHasPermission(req.role, permission);
}

/** Require a single permission (server-side enforcement). */
export function requirePermission(permission: Permission): RequestHandler {
  return (req, res, next) => {
    if (requestHasPermission(req as AuthedRequest, permission)) {
      next();
      return;
    }
    sendFailure(res, 403, 'FORBIDDEN', `Missing permission: ${permission}`);
  };
}

/** Require any one of the listed permissions. */
export function requireAnyPermission(...permissions: Permission[]): RequestHandler {
  return (req, res, next) => {
    const authed = req as AuthedRequest;
    if (permissions.some((p) => requestHasPermission(authed, p))) {
      next();
      return;
    }
    sendFailure(res, 403, 'FORBIDDEN', 'Insufficient permissions');
  };
}

/** Require all listed permissions. */
export function requireAllPermissions(...permissions: Permission[]): RequestHandler {
  return (req, res, next) => {
    const authed = req as AuthedRequest;
    if (permissions.every((p) => requestHasPermission(authed, p))) {
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

/** Tenant onboarding wizard — company administrators only (legacy Admin → company_admin). */
export function requireCompanyAdmin(): RequestHandler {
  return (req, res, next) => {
    const enterprise = resolveEnterpriseRole((req as AuthedRequest).role);
    if (enterprise === 'company_admin' || enterprise === 'super_admin') {
      next();
      return;
    }
    sendFailure(res, 403, 'FORBIDDEN', 'Company administrator access required');
  };
}

/** Billing portal: company admins (legacy users.read) and roles with billing.read. */
export function requireBillingRead(): RequestHandler {
  return requireAnyPermission('billing.read', 'users.read');
}

/** Billing mutations: company admins (legacy users.manage) and roles with billing.manage. */
export function requireBillingManage(): RequestHandler {
  return requireAnyPermission('billing.manage', 'users.manage');
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

/**
 * Block mutations unless role has financial.write or any listed permission.
 * GET/HEAD/OPTIONS pass through.
 */
export function requireWriteOnMutations(...permissions: Permission[]): RequestHandler {
  return (req, res, next) => {
    const method = (req.method ?? 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      next();
      return;
    }
    return requireAnyPermission('financial.write', ...permissions)(req, res, next);
  };
}

/**
 * Projects, units, and sales contacts — read + write for project selling catalog.
 * GET requires project_selling.read (or financial.write / catalog write bundle).
 * Mutations require catalog.write, marketing_plans.write, agreements.write, or financial.write.
 */
export const requireProjectSellingCatalogAccess: RequestHandler = (req, res, next) => {
  const role = (req as AuthedRequest).role;
  const method = (req.method ?? 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    if (roleCanReadProjectSellingCatalog(role)) {
      next();
      return;
    }
    sendFailure(res, 403, 'FORBIDDEN', 'Missing permission: project_selling.read');
    return;
  }
  if (roleCanWriteProjectSellingCatalog(role)) {
    next();
    return;
  }
  sendFailure(res, 403, 'FORBIDDEN', 'Insufficient permissions for project selling catalog');
};

/** Categories: open read; sales users may create expense categories for marketing discounts. */
export const requireFinancialWriteOrProjectSellingCatalogOnMutations: RequestHandler = (req, res, next) => {
  const method = (req.method ?? 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    next();
    return;
  }
  return requireAnyPermission(
    'financial.write',
    'project_selling.catalog.write',
    'project_selling.marketing_plans.write',
    'project_selling.agreements.write'
  )(req, res, next);
};

/** Payroll: GET requires payroll.read; mutations require payroll.write. */
export const requirePayrollAccess: RequestHandler = (req, res, next) => {
  const method = (req.method ?? 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return requirePermission('payroll.read')(req, res, next);
  }
  return requirePermission('payroll.write')(req, res, next);
};

/**
 * Run a permission guard only when the request path matches a prefix.
 * Use on shared `app.use('/api', …)` mounts so later routers (tasks, users, etc.)
 * are not blocked by unrelated route permissions.
 */
export function requirePermissionWhenPathStartsWith(
  pathPrefix: string,
  permission: Permission
): RequestHandler {
  const guard = requirePermission(permission);
  return (req, res, next) => {
    const path = req.path ?? req.url?.split('?')[0] ?? '';
    if (!path.startsWith(pathPrefix)) {
      next();
      return;
    }
    return guard(req, res, next);
  };
}

/**
 * Run a role guard only when the request path matches a prefix.
 * Use on shared `app.use('/api', …)` mounts so unrelated routes are not blocked.
 */
export function requireRoleWhenPathStartsWith(
  pathPrefix: string,
  ...roles: EnterpriseRole[]
): RequestHandler {
  const guard = requireRole(...roles);
  return (req, res, next) => {
    const path = req.path ?? req.url?.split('?')[0] ?? '';
    if (!path.startsWith(pathPrefix)) {
      next();
      return;
    }
    return guard(req, res, next);
  };
}

/** Payroll RBAC scoped to `/payroll…` paths only (see requirePermissionWhenPathStartsWith). */
export function requirePayrollAccessForPayrollPaths(pathPrefix = '/payroll'): RequestHandler {
  return (req, res, next) => {
    const path = req.path ?? req.url?.split('?')[0] ?? '';
    if (!path.startsWith(pathPrefix)) {
      next();
      return;
    }
    return requirePayrollAccess(req, res, next);
  };
}
