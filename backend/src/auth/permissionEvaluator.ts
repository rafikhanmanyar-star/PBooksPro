/**
 * RBAC 2.0 Phase 3 — pure permission evaluation (no I/O).
 */
import type { EffectiveAccessContext } from './effectiveAccessContext.js';
import { effectivePermissionsSet } from './effectiveAccessContext.js';
import { expandBundleAlias } from './permissionBundles.js';
import { permissionSetHas, type Permission } from './permissions.js';

function expandedRequiredKeys(key: string, enterpriseRole?: string | null): string[] {
  return [...expandBundleAlias(key, enterpriseRole)];
}

export function hasPermission(
  ctx: EffectiveAccessContext,
  permissionKey: string,
  enterpriseRole?: string | null
): boolean {
  const granted = effectivePermissionsSet(ctx);
  // v1 bundle alias held directly (e.g. super_admin ALL_PERMISSIONS includes financial.write).
  if (granted.has(permissionKey)) return true;
  const expanded = expandedRequiredKeys(permissionKey, enterpriseRole);
  // v2 expanded grants (unionExpandedPermissions) satisfy bundle checks without the alias key.
  return expanded.every((required) => granted.has(required));
}

export function hasAnyPermission(
  ctx: EffectiveAccessContext,
  permissionKeys: readonly string[],
  enterpriseRole?: string | null
): boolean {
  return permissionKeys.some((key) => hasPermission(ctx, key, enterpriseRole));
}

export function hasAllPermissions(
  ctx: EffectiveAccessContext,
  permissionKeys: readonly string[],
  enterpriseRole?: string | null
): boolean {
  return permissionKeys.every((key) => hasPermission(ctx, key, enterpriseRole));
}

/** Legacy v1 Permission type check against effective context. */
export function hasLegacyPermission(ctx: EffectiveAccessContext, permission: Permission): boolean {
  const asStrings = ctx.permissions as readonly Permission[];
  return permissionSetHas(asStrings, permission);
}
