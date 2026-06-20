/**
 * RBAC 2.0 — role version hash (Phase 3 cache invalidation foundation).
 * Aligns with RBAC_2_ARCHITECTURE_V2.md §2.5.
 */
import { createHash } from 'node:crypto';

export function computeRoleVersionHash(input: {
  tenantId: string;
  roleId: string;
  version: number;
  permissionKeys: readonly string[];
}): string {
  const sorted = [...input.permissionKeys].sort().join('\n');
  const payload = `${input.tenantId}|${input.roleId}|${input.version}|${sorted}`;
  return createHash('sha256').update(payload).digest('hex');
}

export function computeUserAccessVersionHash(input: {
  tenantId: string;
  userId: string;
  accessVersion: number;
  assignedRoleVersionHashes: readonly string[];
  isActive: boolean;
}): string {
  const rolePart = [...input.assignedRoleVersionHashes].sort().join('|');
  const payload = `${input.tenantId}|${input.userId}|${input.accessVersion}|${input.isActive}|${rolePart}`;
  return createHash('sha256').update(payload).digest('hex');
}

/** Phase 3 prep — break-glass access hash (session-bound; not JWT av in Phase 2). */
export function computeBreakGlassAccessHash(input: {
  tenantId: string;
  userId: string;
  sessionId: string;
  expiresAt: string;
}): string {
  const payload = `${input.tenantId}|${input.userId}|${input.sessionId}|${input.expiresAt}|break_glass`;
  return createHash('sha256').update(payload).digest('hex');
}
