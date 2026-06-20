/**
 * RBAC 2.0 — Separation of Duties enforcement.
 */
import { ALL_SOD_PAIRS } from '../../../auth/sodPairs.js';
import { expandPermissionKeys } from './rbacPermissionExpansion.js';

export type SodViolationDetails = {
  permissionA: string;
  permissionB: string;
  context: string;
  category: 'mandatory' | 'extended';
  domain: string;
  affectedUserCount?: number;
  sampleUserId?: string;
  roleId?: string;
  permissionsAdded?: string[];
};

export class SodViolationError extends Error {
  readonly code = 'SOD_VIOLATION' as const;
  readonly details: SodViolationDetails;

  constructor(details: SodViolationDetails) {
    super(
      `Separation of duties violation: ${details.permissionA} and ${details.permissionB} cannot be assigned together.`
    );
    this.name = 'SodViolationError';
    this.details = details;
  }
}

export function findSodViolation(
  effectivePermissions: ReadonlySet<string>,
  context: string
): SodViolationDetails | null {
  for (const pair of ALL_SOD_PAIRS) {
    if (effectivePermissions.has(pair.permissionA) && effectivePermissions.has(pair.permissionB)) {
      return {
        permissionA: pair.permissionA,
        permissionB: pair.permissionB,
        context,
        category: pair.category,
        domain: pair.domain,
      };
    }
  }
  return null;
}

export function assertNoSodViolation(
  permissionKeys: readonly string[],
  context: string,
  enterpriseRole?: string | null
): void {
  const expanded = expandPermissionKeys(permissionKeys, enterpriseRole);
  const violation = findSodViolation(expanded, context);
  if (violation) {
    throw new SodViolationError(violation);
  }
}

export function assertNoSodViolationOnUnion(
  rolePermissionSets: readonly (readonly string[])[],
  roleSlugs: readonly string[],
  context: string
): void {
  const merged = new Set<string>();
  rolePermissionSets.forEach((keys, index) => {
    const slug = roleSlugs[index];
    for (const k of expandPermissionKeys(keys, slug)) merged.add(k);
  });
  const violation = findSodViolation(merged, context);
  if (violation) {
    throw new SodViolationError(violation);
  }
}
