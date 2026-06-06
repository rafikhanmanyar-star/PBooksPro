import type { RequestHandler } from 'express';
import type { AuthedRequest } from './authMiddleware.js';
import { sendFailure } from '../utils/apiResponse.js';

/** Roles allowed to create/update/delete financial records (matches Settings → Users descriptions). */
const FINANCIAL_WRITE_ROLES = new Set([
  'admin',
  'super_admin',
  'manager',
  'accounts',
  'accountant',
  'project manager',
]);

function normalizedRole(req: AuthedRequest): string {
  return (req.role ?? '').trim().toLowerCase();
}

/** Block mutations for Cashier, Task Contributor, Store Manager, Inventory Manager, Team Lead, viewer, etc. */
export const requireFinancialWriteRole: RequestHandler = (req, res, next) => {
  const r = normalizedRole(req as AuthedRequest);
  if (FINANCIAL_WRITE_ROLES.has(r)) {
    next();
    return;
  }
  sendFailure(res, 403, 'FORBIDDEN', 'Insufficient permissions for this operation');
};

/** Apply financial write role check only on mutating HTTP methods. */
export const requireFinancialWriteOnMutations: RequestHandler = (req, res, next) => {
  const method = (req.method ?? 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    next();
    return;
  }
  return requireFinancialWriteRole(req, res, next);
};
