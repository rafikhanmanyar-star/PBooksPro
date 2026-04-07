import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { verifyAccessToken } from '../auth/jwt.js';
import { sendFailure } from '../utils/apiResponse.js';

export type AuthedRequest = Request & {
  userId?: string;
  tenantId?: string;
  role?: string;
};

export function authMiddleware(req: AuthedRequest, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Missing or invalid Authorization header');
    return;
  }
  const token = auth.slice(7);
  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.sub;
    req.tenantId = payload.tenantId;
    req.role = payload.role;
    next();
  } catch {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Invalid or expired token');
  }
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
