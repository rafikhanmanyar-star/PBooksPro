import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { extractClientIp, extractUserAgent } from '../../../utils/requestContext.js';

export type RbacAuditMeta = {
  actorType?: 'user' | 'system' | 'system_owner';
  sessionId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export function buildRbacAuditMeta(req: AuthedRequest): RbacAuditMeta {
  return {
    actorType: req.sessionType === 'break_glass' ? 'system_owner' : 'user',
    sessionId: req.breakGlassSessionId,
    ipAddress: extractClientIp(req),
    userAgent: extractUserAgent(req),
  };
}

export type SecurityMutationContext = {
  auditMeta?: RbacAuditMeta;
  breakGlass?: boolean;
};

export function buildSecurityMutationContext(req: AuthedRequest): SecurityMutationContext {
  return {
    auditMeta: buildRbacAuditMeta(req),
    breakGlass: req.sessionType === 'break_glass',
  };
}

export function mergeRbacAuditInput<T extends RbacAuditMeta>(
  input: T,
  meta?: RbacAuditMeta
): T & RbacAuditMeta {
  if (!meta) return input;
  return {
    ...input,
    actorType: meta.actorType ?? input.actorType ?? 'user',
    sessionId: meta.sessionId ?? input.sessionId,
    ipAddress: meta.ipAddress ?? input.ipAddress,
    userAgent: meta.userAgent ?? input.userAgent,
  };
}
