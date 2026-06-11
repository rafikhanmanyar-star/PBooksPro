import type { Request, Response, NextFunction } from 'express';
import { auditContextFromRequest, type AuditRequestContext } from '../services/enterpriseAuditService.js';
import type { AuthedRequest } from './authMiddleware.js';

export type RequestWithAuditContext = AuthedRequest & {
  auditContext?: AuditRequestContext;
};

/** Attach IP and user-agent for consistent audit_events writes. */
export function auditRequestContextMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  (req as RequestWithAuditContext).auditContext = auditContextFromRequest(req);
  next();
}
