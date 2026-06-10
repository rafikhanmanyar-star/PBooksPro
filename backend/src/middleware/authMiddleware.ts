import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { verifyAccessToken } from '../auth/jwt.js';
import { getPool } from '../db/pool.js';
import { sendFailure } from '../utils/apiResponse.js';
import { requirePermission } from './rbacMiddleware.js';
import {
  isDemoEnvironmentEnabled,
  isDemoMasterTenant,
  isDemoPublicTenant,
} from '../constants/demoEnvironment.js';
import {
  isOrganizationStatus,
  isOrganizationApprovalEnabled,
} from '../constants/organizationStatus.js';

export type AuthedRequest = Request & {
  userId?: string;
  tenantId?: string;
  role?: string;
};

function normalizeRole(role: string | undefined): string {
  return (role ?? '').toLowerCase().replace(/\s+/g, '_');
}

/** True when JWT role no longer matches the database (user must re-login). */
export function isTokenRoleStale(tokenRole: string, dbRole: string): boolean {
  return normalizeRole(tokenRole) !== normalizeRole(dbRole);
}

export function isAdminRole(role: string | undefined): boolean {
  const r = (role ?? '').toLowerCase().replace(/\s+/g, '_');
  return r === 'admin' || r === 'super_admin';
}

/** Validates JWT and re-checks user is active with current role from the database. */
export async function authMiddleware(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    void import('../services/monitoring/monitoringCapture.js').then(({ captureMonitoringEvent }) => {
      captureMonitoringEvent({
        category: 'authentication',
        severity: 'warn',
        message: 'Missing or invalid Authorization header',
        code: 'UNAUTHORIZED',
        route: req.originalUrl,
        method: req.method,
        statusCode: 401,
        requestId: (req as { requestId?: string }).requestId,
      });
    });
    sendFailure(res, 401, 'UNAUTHORIZED', 'Missing or invalid Authorization header');
    return;
  }
  const token = auth.slice(7);
  try {
    const payload = verifyAccessToken(token);
    const pool = getPool();
    const r = await pool.query<{
      id: string;
      tenant_id: string;
      role: string;
      is_active: boolean;
      organization_status: string;
      rejection_reason: string | null;
    }>(
      `SELECT u.id, u.tenant_id, ut.role, u.is_active,
              COALESCE(t.status, 'ACTIVE') AS organization_status, t.rejection_reason
       FROM users u
       JOIN user_tenants ut ON ut.user_id = u.id AND ut.tenant_id = u.tenant_id
       JOIN tenants t ON t.id = u.tenant_id
       WHERE u.id = $1 AND u.tenant_id = $2`,
      [payload.sub, payload.tenantId]
    );
    if (r.rows.length === 0 || !r.rows[0].is_active) {
      void import('../services/monitoring/monitoringCapture.js').then(({ captureMonitoringEvent }) => {
        captureMonitoringEvent({
          category: 'authentication',
          severity: 'warn',
          message: 'Invalid or expired token',
          code: 'UNAUTHORIZED',
          route: req.originalUrl,
          method: req.method,
          statusCode: 401,
          requestId: (req as { requestId?: string }).requestId,
        });
      });
      sendFailure(res, 401, 'UNAUTHORIZED', 'Invalid or expired token');
      return;
    }
    const user = r.rows[0];
    if (isTokenRoleStale(payload.role, user.role)) {
      sendFailure(res, 401, 'TOKEN_STALE', 'Session expired. Please sign in again.');
      return;
    }
    req.userId = user.id;
    req.tenantId = user.tenant_id;
    req.role = user.role;

    if (isDemoEnvironmentEnabled() && isDemoMasterTenant(req.tenantId)) {
      sendFailure(res, 403, 'DEMO_MASTER_PROTECTED', 'This organization is not available for interactive access.');
      return;
    }

    const roleNorm = normalizeRole(user.role);
    if (
      isOrganizationApprovalEnabled() &&
      !isDemoPublicTenant(req.tenantId!) &&
      roleNorm !== 'super_admin'
    ) {
      const orgStatus = isOrganizationStatus(user.organization_status)
        ? user.organization_status
        : 'ACTIVE';
      if (orgStatus !== 'ACTIVE') {
        const code =
          orgStatus === 'PENDING'
            ? 'ORG_PENDING_APPROVAL'
            : orgStatus === 'REJECTED'
              ? 'ORG_REGISTRATION_REJECTED'
              : 'ORG_SUSPENDED';
        sendFailure(res, 403, code, 'Organization access is not available.', {
          organizationStatus: orgStatus,
          rejectionReason: user.rejection_reason ?? undefined,
        });
        return;
      }
    }
    if (isDemoPublicTenant(req.tenantId)) {
      res.setHeader('X-PBooks-Demo-Session', 'true');
      if (
        process.env.DEMO_READ_ONLY === 'true' &&
        !['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())
      ) {
        sendFailure(
          res,
          403,
          'DEMO_READ_ONLY',
          'The live demo is view-only. Changes reset daily and do not affect the master template.'
        );
        return;
      }
    }

    next();
  } catch {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Invalid or expired token');
  }
}

/** Populates req.userId/tenantId/role when a valid Bearer token is present; never rejects. */
export async function optionalAuthMiddleware(
  req: AuthedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    next();
    return;
  }
  const token = auth.slice(7);
  try {
    const payload = verifyAccessToken(token);
    const pool = getPool();
    const r = await pool.query<{
      id: string;
      tenant_id: string;
      role: string;
      is_active: boolean;
    }>(
      `SELECT u.id, u.tenant_id, ut.role, u.is_active
       FROM users u
       JOIN user_tenants ut ON ut.user_id = u.id AND ut.tenant_id = u.tenant_id
       WHERE u.id = $1 AND u.tenant_id = $2`,
      [payload.sub, payload.tenantId]
    );
    if (r.rows.length > 0 && r.rows[0].is_active) {
      const user = r.rows[0];
      if (!isTokenRoleStale(payload.role, user.role)) {
        req.userId = user.id;
        req.tenantId = user.tenant_id;
        req.role = user.role;
      }
    }
  } catch {
    /* ignore invalid optional token */
  }
  next();
}

/** Require financial.write (journal posting, period close, etc.). */
export const requireLedgerRole: RequestHandler = requirePermission('financial.write');

/** Create/update/delete organization users (Settings → Users) */
export const requireOrgUserAdmin: RequestHandler = requirePermission('users.manage');

/** Personal transactions module — Admin / Super Admin only. */
export const requireAdminRole: RequestHandler = (req: AuthedRequest, res, next) => {
  if (!isAdminRole(req.role)) {
    sendFailure(res, 403, 'FORBIDDEN', 'Administrator access required');
    return;
  }
  next();
};
