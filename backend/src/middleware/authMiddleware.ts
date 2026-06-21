import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { verifyAccessToken } from '../auth/jwt.js';
import { getPool } from '../db/pool.js';
import { sendFailure } from '../utils/apiResponse.js';
import { requirePermission as requirePermissionGuard } from './rbacMiddleware.js';
import type { Permission } from '../auth/permissions.js';
import { resolveUserPermissions } from '../modules/rbac/services/rbacPermissionResolver.js';
import { allCatalogPermissionKeys } from '../modules/rbac/services/rbacCatalogPermissions.js';
import { validateBreakGlassSession } from '../modules/rbac/services/rbacBreakGlassService.js';
import type { SessionType } from '../auth/jwt.js';
import type { EffectiveAccessContext } from '../auth/effectiveAccessContext.js';
import { isRbacV2AuthorizationEngineEnabled } from '../auth/rbacAuthorizationFeatureFlag.js';
import { authorizeV2ForRequest } from '../auth/authorizeV2.js';
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
  username?: string;
  name?: string;
  /** Resolved from tenant RBAC tables with legacy matrix fallback. */
  resolvedPermissions?: Permission[];
  /** C2 break-glass session metadata (when JWT sessionType = break_glass). */
  sessionType?: SessionType;
  breakGlassSessionId?: string;
  /** RBAC 2.0 Phase 3 — canonical authorization context when engine enabled. */
  effectiveAccess?: EffectiveAccessContext;
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

const AUTH_CACHE_TTL_MS = 45_000;
const AUTH_CACHE_MAX = 2_000;

type AuthCacheEntry = {
  userId: string;
  tenantId: string;
  role: string;
  username: string;
  name: string;
  organizationStatus: string;
  rejectionReason: string | null;
  resolvedPermissions: Permission[];
  expiresAt: number;
  /** RBAC V2: cached effective access context. Present only when V2 engine was active at fill time. */
  effectiveAccess?: EffectiveAccessContext;
  /** users.access_version at cache-fill time. Used for V2 staleness check. */
  accessVersion?: number;
  /** tenants.rbac_global_version at cache-fill time. Used for V2 staleness check. */
  tenantRbacGlobalVersion?: number;
};

const authUserCache = new Map<string, AuthCacheEntry>();

function authCacheKey(userId: string, tenantId: string): string {
  return `${userId}:${tenantId}`;
}

function getCachedAuthUser(userId: string, tenantId: string): AuthCacheEntry | null {
  const hit = authUserCache.get(authCacheKey(userId, tenantId));
  if (!hit) return null;
  if (Date.now() >= hit.expiresAt) {
    authUserCache.delete(authCacheKey(userId, tenantId));
    return null;
  }
  return hit;
}

/** Drop cached auth row after role/profile changes so the next request re-reads the database. */
export function invalidateAuthUserCache(userId: string, tenantId: string): void {
  authUserCache.delete(authCacheKey(userId, tenantId));
}

function setCachedAuthUser(entry: Omit<AuthCacheEntry, 'expiresAt'>): void {
  if (authUserCache.size >= AUTH_CACHE_MAX) {
    const oldest = authUserCache.keys().next().value;
    if (oldest) authUserCache.delete(oldest);
  }
  authUserCache.set(authCacheKey(entry.userId, entry.tenantId), {
    ...entry,
    expiresAt: Date.now() + AUTH_CACHE_TTL_MS,
  });
}

/**
 * Single cheap query to detect whether a cached V2 context is stale.
 * Reads only the two version counters that RBAC management increments on any
 * role/permission/assignment change. Returns null when the user row is missing.
 */
async function peekV2Versions(
  userId: string,
  tenantId: string,
): Promise<{ accessVersion: number; tenantRbacGlobalVersion: number } | null> {
  const pool = getPool();
  const r = await pool.query<{ access_version: number; rbac_global_version: number }>(
    `SELECT u.access_version, t.rbac_global_version
     FROM users u
     INNER JOIN tenants t ON t.id = u.tenant_id
     WHERE u.id = $1 AND u.tenant_id = $2`,
    [userId, tenantId],
  );
  const row = r.rows[0];
  if (!row) return null;
  return { accessVersion: row.access_version, tenantRbacGlobalVersion: row.rbac_global_version };
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
    const isBreakGlass = payload.sessionType === 'break_glass';

    if (isBreakGlass) {
      if (!payload.breakGlassSessionId) {
        sendFailure(res, 401, 'UNAUTHORIZED', 'Invalid break-glass token');
        return;
      }
      const pool = getPool();
      const client = await pool.connect();
      try {
        const session = await validateBreakGlassSession(
          payload.breakGlassSessionId,
          payload.tenantId,
          payload.sub,
          client
        );
        if (!session) {
          sendFailure(res, 401, 'BREAK_GLASS_EXPIRED', 'Break-glass session expired. Please sign in again.');
          return;
        }
        const r = await client.query<{
          id: string;
          tenant_id: string;
          role: string;
          username: string;
          name: string;
          is_active: boolean;
          organization_status: string;
          rejection_reason: string | null;
        }>(
          `SELECT u.id, ut.tenant_id, ut.role, u.username, u.name, u.is_active,
                  COALESCE(t.status, 'ACTIVE') AS organization_status, t.rejection_reason
           FROM user_tenants ut
           INNER JOIN users u ON u.id = ut.user_id
           INNER JOIN tenants t ON t.id = ut.tenant_id
           WHERE ut.user_id = $1 AND ut.tenant_id = $2`,
          [payload.sub, payload.tenantId]
        );
        if (r.rows.length === 0 || !r.rows[0].is_active) {
          sendFailure(res, 401, 'UNAUTHORIZED', 'Invalid or expired token');
          return;
        }
        const user = r.rows[0];
        req.userId = user.id;
        req.tenantId = payload.tenantId;
        req.role = user.role;
        req.username = user.username;
        req.name = user.name;
        req.sessionType = 'break_glass';
        req.breakGlassSessionId = payload.breakGlassSessionId;

        if (isRbacV2AuthorizationEngineEnabled()) {
          const authResult = await authorizeV2ForRequest(req, payload, user.role, client);
          if (!authResult.ok) {
            if (authResult.code === 'STALE_AV') {
              sendFailure(res, 401, 'TOKEN_STALE', 'Session expired. Please sign in again.');
              return;
            }
            sendFailure(res, 401, 'BREAK_GLASS_EXPIRED', 'Break-glass session expired. Please sign in again.');
            return;
          }
        } else {
          req.resolvedPermissions = allCatalogPermissionKeys();
        }
        next();
        return;
      } finally {
        client.release();
      }
    }

    const v2Engine = isRbacV2AuthorizationEngineEnabled();
    let cached = getCachedAuthUser(payload.sub, payload.tenantId);

    // V2: validate the cached context against the two version counters before trusting it.
    // One cheap SELECT replaces 3-5 full resolution queries on every cache hit. Counters
    // are incremented by RBAC management on any role/permission/assignment change, so a
    // mismatch correctly triggers re-resolution and a fresh STALE_AV check.
    if (v2Engine && cached?.effectiveAccess !== undefined) {
      const t0 = Date.now();
      const versions = await peekV2Versions(payload.sub, payload.tenantId);
      const peekMs = Date.now() - t0;
      const isStale =
        !versions ||
        versions.accessVersion !== cached.accessVersion ||
        versions.tenantRbacGlobalVersion !== cached.tenantRbacGlobalVersion;

      if (isStale) {
        invalidateAuthUserCache(payload.sub, payload.tenantId);
        cached = null;
        void import('../services/monitoring/monitoringCapture.js').then(({ captureMonitoringEvent }) => {
          captureMonitoringEvent({
            category: 'authentication',
            severity: 'info',
            message: `V2 auth cache invalidated (version changed, peek ${peekMs}ms)`,
            code: 'AUTH_CACHE_V2_STALE',
            route: req.originalUrl,
            method: req.method,
            statusCode: 0,
            requestId: (req as { requestId?: string }).requestId,
          });
        });
      } else {
        void import('../services/monitoring/monitoringCapture.js').then(({ captureMonitoringEvent }) => {
          captureMonitoringEvent({
            category: 'authentication',
            severity: 'info',
            message: `V2 auth cache hit (peek ${peekMs}ms)`,
            code: 'AUTH_CACHE_V2_HIT',
            route: req.originalUrl,
            method: req.method,
            statusCode: 0,
            requestId: (req as { requestId?: string }).requestId,
          });
        });
      }
    }

    let user: {
      id: string;
      tenant_id: string;
      role: string;
      username: string;
      name: string;
      is_active: boolean;
      organization_status: string;
      rejection_reason: string | null;
      access_version?: number;
      rbac_global_version?: number;
    };

    if (cached) {
      user = {
        id: cached.userId,
        tenant_id: cached.tenantId,
        role: cached.role,
        username: cached.username,
        name: cached.name,
        is_active: true,
        organization_status: cached.organizationStatus,
        rejection_reason: cached.rejectionReason,
      };
      req.resolvedPermissions = cached.resolvedPermissions;
      if (v2Engine && cached.effectiveAccess) {
        req.effectiveAccess = cached.effectiveAccess;
      }
    } else {
      const pool = getPool();
      const poolWaiting = pool.waitingCount;
      const r = await pool.query<{
        id: string;
        tenant_id: string;
        role: string;
        username: string;
        name: string;
        is_active: boolean;
        organization_status: string;
        rejection_reason: string | null;
        access_version: number;
        rbac_global_version: number;
      }>(
        `SELECT u.id, ut.tenant_id, ut.role, u.username, u.name, u.is_active,
                COALESCE(t.status, 'ACTIVE') AS organization_status, t.rejection_reason,
                u.access_version, t.rbac_global_version
         FROM user_tenants ut
         INNER JOIN users u ON u.id = ut.user_id
         INNER JOIN tenants t ON t.id = ut.tenant_id
         WHERE ut.user_id = $1 AND ut.tenant_id = $2`,
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
      user = r.rows[0];

      if (v2Engine) {
        const t0 = Date.now();
        const authResult = await authorizeV2ForRequest(req, payload, user.role);
        const resolveMs = Date.now() - t0;
        if (!authResult.ok && authResult.code === 'STALE_AV') {
          sendFailure(res, 401, 'TOKEN_STALE', 'Session expired. Please sign in again.');
          return;
        }
        if (!authResult.ok) {
          sendFailure(res, 401, 'UNAUTHORIZED', 'Invalid or expired token');
          return;
        }
        setCachedAuthUser({
          userId: user.id,
          tenantId: user.tenant_id,
          role: user.role,
          username: user.username,
          name: user.name,
          organizationStatus: user.organization_status,
          rejectionReason: user.rejection_reason,
          resolvedPermissions: req.resolvedPermissions ?? [],
          effectiveAccess: authResult.context,
          accessVersion: user.access_version,
          tenantRbacGlobalVersion: user.rbac_global_version,
        });
        void import('../services/monitoring/monitoringCapture.js').then(({ captureMonitoringEvent }) => {
          captureMonitoringEvent({
            category: 'authentication',
            severity: 'info',
            message: `V2 auth cache miss: resolved in ${resolveMs}ms, pool waiting=${poolWaiting}`,
            code: 'AUTH_CACHE_V2_MISS',
            route: req.originalUrl,
            method: req.method,
            statusCode: 0,
            requestId: (req as { requestId?: string }).requestId,
          });
        });
      } else {
        const resolvedPermissions = await resolveUserPermissions(user.tenant_id, user.id, user.role);
        req.resolvedPermissions = resolvedPermissions;
        setCachedAuthUser({
          userId: user.id,
          tenantId: user.tenant_id,
          role: user.role,
          username: user.username,
          name: user.name,
          organizationStatus: user.organization_status,
          rejectionReason: user.rejection_reason,
          resolvedPermissions,
        });
      }
    }

    if (isTokenRoleStale(payload.role, user.role)) {
      invalidateAuthUserCache(user.id, user.tenant_id);
      sendFailure(res, 401, 'TOKEN_STALE', 'Session expired. Please sign in again.');
      return;
    }
    req.userId = user.id;
    req.tenantId = payload.tenantId;
    req.role = user.role;
    req.username = user.username;
    req.name = user.name;
    req.sessionType = 'standard';

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
      `SELECT u.id, ut.tenant_id, ut.role, u.is_active
       FROM user_tenants ut
       INNER JOIN users u ON u.id = ut.user_id
       WHERE ut.user_id = $1 AND ut.tenant_id = $2`,
      [payload.sub, payload.tenantId]
    );
    if (r.rows.length > 0 && r.rows[0].is_active) {
      const user = r.rows[0];
      if (!isTokenRoleStale(payload.role, user.role)) {
        req.userId = user.id;
        req.tenantId = payload.tenantId;
        req.role = user.role;
      }
    }
  } catch {
    /* ignore invalid optional token */
  }
  next();
}

/** Require financial.write (journal posting, period close, etc.). */
export const requireLedgerRole: RequestHandler = requirePermissionGuard('financial.write');

/** Create/update/delete organization users (Settings → Users) */
export const requireOrgUserAdmin: RequestHandler = requirePermissionGuard('users.manage');

/** Personal transactions module — Admin / Super Admin only. */
export const requireAdminRole: RequestHandler = (req: AuthedRequest, res, next) => {
  if (!isAdminRole(req.role)) {
    sendFailure(res, 403, 'FORBIDDEN', 'Administrator access required');
    return;
  }
  next();
};
