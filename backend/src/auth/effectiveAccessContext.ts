/**
 * RBAC 2.0 Phase 3 — canonical authorization context.
 */
import type { ActiveRoleAssignment } from './rbacPermissionResolver.js';

import type { DataScopeGrant } from './dataScopeTypes.js';
import type { ApprovalCapability } from './approvalTypes.js';

export type EffectiveAccessContext = {
  userId: string;
  tenantId: string;
  permissions: readonly string[];
  roles: readonly { slug: string; roleId: string }[];
  scopes: readonly DataScopeGrant[];
  approvalCapabilities: readonly ApprovalCapability[];
  accessVersion: number;
  /** Composite access version hash (Architecture V2 §2.5). */
  roleVersionHash: string;
  breakGlassSessionId: string | null;
  /** ISO timestamp from break_glass_sessions.expires_at when break-glass active. */
  breakGlassExpiresAt: string | null;
  isBreakGlass: boolean;
  resolvedAt: string;
};

export function buildEffectiveAccessContext(input: {
  userId: string;
  tenantId: string;
  permissions: readonly string[];
  assignments: readonly ActiveRoleAssignment[];
  scopes?: readonly DataScopeGrant[];
  approvalCapabilities?: readonly ApprovalCapability[];
  accessVersion: number;
  roleVersionHash: string;
  breakGlassSessionId?: string | null;
  breakGlassExpiresAt?: string | null;
}): EffectiveAccessContext {
  return {
    userId: input.userId,
    tenantId: input.tenantId,
    permissions: input.permissions,
    roles: input.assignments.map((a) => ({ slug: a.slug, roleId: a.roleId })),
    scopes: input.scopes ?? [],
    approvalCapabilities: input.approvalCapabilities ?? [],
    accessVersion: input.accessVersion,
    roleVersionHash: input.roleVersionHash,
    breakGlassSessionId: input.breakGlassSessionId ?? null,
    breakGlassExpiresAt: input.breakGlassExpiresAt ?? null,
    isBreakGlass: Boolean(input.breakGlassSessionId),
    resolvedAt: new Date().toISOString(),
  };
}

export function effectivePermissionsSet(ctx: EffectiveAccessContext): Set<string> {
  return new Set(ctx.permissions);
}
