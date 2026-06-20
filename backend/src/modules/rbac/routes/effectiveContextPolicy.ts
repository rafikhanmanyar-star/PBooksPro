/**
 * A5.1.3.1 — effective-context endpoint access policy (current user only).
 */
import type { EffectiveAccessContext } from '../../../auth/effectiveAccessContext.js';

export type EffectiveContextAccessError = {
  status: number;
  code: string;
  message: string;
};

export function validateEffectiveContextAccess(input: {
  engineEnabled: boolean;
  tenantId?: string;
  userId?: string;
  /** True when any userId query parameter is present (admin lookup forbidden). */
  hasUserIdQueryParam?: boolean;
  effectiveAccess?: EffectiveAccessContext | null;
}): EffectiveContextAccessError | null {
  if (!input.engineEnabled) {
    return {
      status: 503,
      code: 'FEATURE_DISABLED',
      message: 'RBAC v2 authorization engine is not enabled',
    };
  }
  if (input.hasUserIdQueryParam) {
    return {
      status: 400,
      code: 'INVALID_QUERY',
      message: 'userId query parameter is not supported; effective context is current user only',
    };
  }
  if (!input.tenantId || !input.userId) {
    return { status: 401, code: 'UNAUTHORIZED', message: 'Unauthorized' };
  }
  const ctx = input.effectiveAccess;
  if (!ctx) {
    return {
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Authorization context not resolved',
    };
  }
  if (ctx.userId !== input.userId || ctx.tenantId !== input.tenantId) {
    return {
      status: 403,
      code: 'FORBIDDEN',
      message: 'Effective context is available for the authenticated user only',
    };
  }
  return null;
}

export function serializeEffectiveContext(ctx: EffectiveAccessContext) {
  return {
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    permissions: ctx.permissions,
    roles: ctx.roles,
    scopes: ctx.scopes,
    accessVersion: ctx.accessVersion,
    roleVersionHash: ctx.roleVersionHash,
    breakGlassSessionId: ctx.breakGlassSessionId,
    breakGlassExpiresAt: ctx.breakGlassExpiresAt,
    isBreakGlass: ctx.isBreakGlass,
    resolvedAt: ctx.resolvedAt,
  };
}
