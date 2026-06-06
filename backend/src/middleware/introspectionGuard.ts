import type { Request, Response, NextFunction, RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { sendFailure } from '../utils/apiResponse.js';
import type { AuthedRequest } from './authMiddleware.js';

function isAdminRole(role: string | undefined): boolean {
  const r = (role ?? '').toLowerCase().replace(/\s+/g, '_');
  return r === 'admin' || r === 'super_admin';
}

/** Rate-limit unauthenticated discovery / tenant directory endpoints. */
export const publicIntrospectionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    data: null,
    error: { code: 'RATE_LIMIT', message: 'Too many requests. Try again shortly.' },
  },
});

export const tenantDirectoryLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    data: null,
    error: { code: 'RATE_LIMIT', message: 'Too many requests. Try again shortly.' },
  },
});

/**
 * When DISCOVERY_TOKEN is set, require `X-Discovery-Token` header or `?token=` query to match.
 * LAN clients can configure the shared secret; unset env keeps discover open (UDP still broadcasts).
 */
export function requireDiscoveryToken(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.DISCOVERY_TOKEN?.trim();
  if (!expected) {
    next();
    return;
  }
  const header = req.headers['x-discovery-token'];
  const query = typeof req.query.token === 'string' ? req.query.token : '';
  const provided = (typeof header === 'string' ? header : '') || query;
  if (provided === expected) {
    next();
    return;
  }
  sendFailure(res, 403, 'FORBIDDEN', 'Discovery token required');
}

/**
 * GET /api/server/connected-clients — authenticated admins only unless explicitly opened.
 */
export const requireConnectedClientsAccess: RequestHandler = (req, res, next) => {
  if (process.env.ALLOW_PUBLIC_CONNECTED_CLIENTS === 'true') {
    next();
    return;
  }
  const authed = req as AuthedRequest;
  if (!authed.userId || !authed.tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Authentication required');
    return;
  }
  if (!isAdminRole(authed.role)) {
    sendFailure(res, 403, 'FORBIDDEN', 'Admin access required');
    return;
  }
  next();
};

/**
 * When PUBLIC_TENANT_DIRECTORY=false, hide tenant list from anonymous callers (manual tenant id entry still works).
 */
export function requireTenantDirectoryAccess(req: Request, res: Response, next: NextFunction): void {
  if (process.env.PUBLIC_TENANT_DIRECTORY !== 'false') {
    next();
    return;
  }
  const authed = req as AuthedRequest;
  if (authed.userId && authed.tenantId) {
    next();
    return;
  }
  sendFailure(
    res,
    403,
    'FORBIDDEN',
    'Tenant directory is restricted. Enter your organization ID on the login screen.'
  );
}
