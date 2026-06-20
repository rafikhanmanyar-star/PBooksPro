/**
 * Expand permission keys via permissionBundles.ts (NR1 — single expansion source).
 *
 * `expandBundles` is the canonical name used in architecture docs and the validation pipeline.
 * Expansion MUST run before delegation, privilege ceiling, and SoD checks.
 */
import { expandBundleAlias } from '../../../auth/permissionBundles.js';
import { resolveEnterpriseRole } from '../../../auth/permissions.js';

export function expandPermissionKeys(
  keys: readonly string[],
  enterpriseRole?: string | null
): Set<string> {
  const role = enterpriseRole ?? undefined;
  const expanded = new Set<string>();
  for (const key of keys) {
    expanded.add(key);
    if (key === 'financial.write') {
      for (const child of expandBundleAlias(key, role)) {
        expanded.add(child);
      }
    }
  }
  return expanded;
}

/** Architecture alias — same as expandPermissionKeys. */
export function expandBundles(
  keys: readonly string[],
  enterpriseRole?: string | null
): Set<string> {
  return expandPermissionKeys(keys, enterpriseRole);
}

export function unionExpandedPermissionKeys(
  rolePermissionSets: readonly (readonly string[])[],
  enterpriseRoles: readonly (string | null | undefined)[]
): Set<string> {
  const merged = new Set<string>();
  rolePermissionSets.forEach((keys, index) => {
    const role = enterpriseRoles[index] ?? undefined;
    for (const k of expandPermissionKeys(keys, role)) merged.add(k);
  });
  return merged;
}

export function resolveEnterpriseRoleForSlug(slug: string): string {
  return resolveEnterpriseRole(slug);
}

export function isSubsetOf(candidate: Set<string>, superset: Set<string>): boolean {
  for (const key of candidate) {
    if (!superset.has(key)) return false;
  }
  return true;
}
