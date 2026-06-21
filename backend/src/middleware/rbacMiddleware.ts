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
import { isV2AuthorizationActive } from '../auth/authorizationMode.js';
import { hasPermission } from '../auth/permissionEvaluator.js';
import { recordRbacDeny, recordRbacPermissionCheck } from '../auth/rbacV2Metrics.js';

export { permissionsForRole, resolveEnterpriseRole, roleHasPermission };

/**
 * Exclusive authorization — never OR legacy matrix with v2 evaluator.
 * Engine off → resolvedPermissions / legacy role matrix.
 * Engine on  → req.effectiveAccess + permissionEvaluator only.
 */
function requestHasPermission(req: AuthedRequest, permission: Permission): boolean {
  if (isV2AuthorizationActive()) {
    const ctx = req.effectiveAccess;
    if (!ctx) return false;
    const enterprise = resolveEnterpriseRole(req.role);
    return hasPermission(ctx, permission, enterprise);
  }
  const resolved = req.resolvedPermissions;
  if (resolved && resolved.length > 0) {
    return permissionSetHas(resolved, permission);
  }
  return roleHasPermission(req.role, permission);
}

function denyPermission(
  req: AuthedRequest,
  res: Parameters<RequestHandler>[1],
  permission: Permission | string
): void {
  if (isV2AuthorizationActive()) {
    recordRbacDeny(req, String(permission));
  }
  sendFailure(res, 403, 'FORBIDDEN', `Missing permission: ${permission}`);
}

/** Require a single permission (server-side enforcement). */
export function requirePermission(permission: Permission): RequestHandler {
  return (req, res, next) => {
    const authed = req as AuthedRequest;
    if (requestHasPermission(authed, permission)) {
      if (isV2AuthorizationActive()) {
        recordRbacPermissionCheck(authed, permission);
      }
      next();
      return;
    }
    denyPermission(authed, res, permission);
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

/**
 * Cross-tenant / platform administration guard.
 *
 * `platform.admin` is granted to NO tenant enterprise role (and is excluded from
 * ALL_PERMISSIONS), so on the tenant API this guard always denies — including tenant
 * Super Admins. Any route returning data for more than one tenant must NOT be mounted on
 * the tenant API; platform administration lives behind the admin portal's separate
 * `adminAuthMiddleware` (admin_users). This guard exists as defense-in-depth so that any
 * cross-tenant route accidentally mounted on the tenant API fails closed.
 */
export const requirePlatformAdmin: RequestHandler = requirePermission('platform.admin');

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

/** Payroll: GET requires payroll.read; approve/unapprove require payroll.runs.approve; wizard/summary mutations require payroll.runs.create. */
export const requirePayrollAccess: RequestHandler = (req, res, next) => {
  const method = (req.method ?? 'GET').toUpperCase();
  const path = req.path ?? req.url?.split('?')[0] ?? '';
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    if (/\/attendance-summaries|\/reports\/attendance-impact|\/reports\/lop/.test(path)) {
      return requireAnyPermission('payroll.runs.view', 'payroll.read')(req, res, next);
    }
    return requirePermission('payroll.read')(req, res, next);
  }
  if (/\/approve$|\/unapprove$/.test(path)) {
    return requireAnyPermission('payroll.runs.approve')(req, res, next);
  }
  if (/\/wizard\/start|\/attendance-summaries\/generate|\/process$/.test(path)) {
    return requireAnyPermission('payroll.runs.create', 'payroll.write')(req, res, next);
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

/** Attendance: GET requires attendance.read; DELETE requires attendance.delete or attendance.manage; mutations require attendance.write or attendance.manage. */
export const requireAttendanceAccess: RequestHandler = (req, res, next) => {
  const method = (req.method ?? 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return requirePermission('attendance.read')(req, res, next);
  }
  if (method === 'DELETE') {
    return requireAnyPermission('attendance.delete', 'attendance.manage')(req, res, next);
  }
  return requireAnyPermission('attendance.write', 'attendance.manage')(req, res, next);
};

/** Attendance RBAC scoped to `/attendance…` paths only. */
export function requireAttendanceAccessForAttendancePaths(pathPrefix = '/attendance'): RequestHandler {
  return (req, res, next) => {
    const path = req.path ?? req.url?.split('?')[0] ?? '';
    if (!path.startsWith(pathPrefix)) {
      next();
      return;
    }
    return requireAttendanceAccess(req, res, next);
  };
}

/** Leave: GET requires leave.read; approve/reject require leave.approve or leave.manage; cancel allows write/approve/manage; DELETE requires leave.delete or leave.manage; other mutations require leave.write or leave.manage. */
export const requireLeaveAccess: RequestHandler = (req, res, next) => {
  const method = (req.method ?? 'GET').toUpperCase();
  const path = req.path ?? req.url?.split('?')[0] ?? '';
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return requirePermission('leave.read')(req, res, next);
  }
  if (path.includes('/approve') || path.includes('/reject')) {
    return requireAnyPermission('leave.approve', 'leave.manage')(req, res, next);
  }
  if (path.includes('/cancel')) {
    return requireAnyPermission('leave.write', 'leave.approve', 'leave.manage')(req, res, next);
  }
  if (method === 'DELETE') {
    return requireAnyPermission('leave.delete', 'leave.manage')(req, res, next);
  }
  return requireAnyPermission('leave.write', 'leave.manage')(req, res, next);
};

/** Leave RBAC scoped to `/leaves…` paths only. */
export function requireLeaveAccessForLeavePaths(pathPrefix = '/leaves'): RequestHandler {
  return (req, res, next) => {
    const path = req.path ?? req.url?.split('?')[0] ?? '';
    if (!path.startsWith(pathPrefix)) {
      next();
      return;
    }
    return requireLeaveAccess(req, res, next);
  };
}
