import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { verifyAccessToken } from '../auth/jwt.js';
import { getPool } from '../db/pool.js';
import { sendFailure } from '../utils/apiResponse.js';

export type AuthedRequest = Request & {
  userId?: string;
  tenantId?: string;
  role?: string;
};

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
    }>(
      `SELECT id, tenant_id, role, is_active
       FROM users
       WHERE id = $1 AND tenant_id = $2`,
      [payload.sub, payload.tenantId]
    );
    if (r.rows.length === 0 || !r.rows[0].is_active) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Invalid or expired token');
      return;
    }
    const user = r.rows[0];
    req.userId = user.id;
    req.tenantId = user.tenant_id;
    req.role = user.role;
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
      `SELECT id, tenant_id, role, is_active
       FROM users
       WHERE id = $1 AND tenant_id = $2`,
      [payload.sub, payload.tenantId]
    );
    if (r.rows.length > 0 && r.rows[0].is_active) {
      const user = r.rows[0];
      req.userId = user.id;
      req.tenantId = user.tenant_id;
      req.role = user.role;
    }
  } catch {
    /* ignore invalid optional token */
  }
  next();
}

/** Require Admin / Accounts / Accountant for financial writes */
export const requireLedgerRole: RequestHandler = (req, res, next) => {
  const r = (req as AuthedRequest).role?.toLowerCase() ?? '';
  if (
    r === 'admin' ||
    r === 'accountant' ||
    r === 'accounts' ||
    r === 'super_admin'
  ) {
    next();
    return;
  }
  sendFailure(res, 403, 'FORBIDDEN', 'Insufficient permissions');
};

/** Create/update/delete organization users (Settings → Users) */
export const requireOrgUserAdmin: RequestHandler = (req, res, next) => {
  const r = (req as AuthedRequest).role?.toLowerCase() ?? '';
  if (r === 'admin' || r === 'super_admin') {
    next();
    return;
  }
  sendFailure(res, 403, 'FORBIDDEN', 'Admin access required');
};
