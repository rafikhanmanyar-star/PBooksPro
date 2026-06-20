/**
 * RBAC 2.0 — delegation invariant (H3): actor must hold every permission being granted.
 * Operates on expanded permission sets (post expandBundles).
 */
import {
  ALL_PERMISSIONS,
  isKnownPermission,
  isSystemOwnerSlug,
  permissionSetHas,
  type Permission,
} from '../../../auth/permissions.js';
import { expandBundles, isSubsetOf } from './rbacPermissionExpansion.js';

export type DelegationDeniedDetails = {
  missingPermissions: string[];
  context: string;
};

export class DelegationDeniedError extends Error {
  readonly code = 'DELEGATION_DENIED' as const;
  readonly details: DelegationDeniedDetails;

  constructor(details: DelegationDeniedDetails) {
    super(`Delegation denied: actor lacks permissions: ${details.missingPermissions.join(', ')}`);
    this.name = 'DelegationDeniedError';
    this.details = details;
  }
}

function actorHasKey(actorPermissions: ReadonlySet<string>, key: string): boolean {
  if (actorPermissions.has(key)) return true;
  if (isKnownPermission(key) && permissionSetHas([...actorPermissions] as Permission[], key)) {
    return true;
  }
  return false;
}

/**
 * Raw-key delegation check (legacy). Prefer assertCanDelegateExpanded for pipeline use.
 */
export function assertCanDelegate(
  actorPermissions: readonly string[],
  targetPermissions: readonly string[],
  context: string,
  options?: { actorIsSystemOwner?: boolean; actorIsSuperAdmin?: boolean }
): void {
  if (options?.actorIsSystemOwner || options?.actorIsSuperAdmin) {
    return;
  }
  const actorSet = new Set(actorPermissions);
  const missing = targetPermissions.filter((key) => !actorHasKey(actorSet, key));
  if (missing.length > 0) {
    throw new DelegationDeniedError({ missingPermissions: missing, context });
  }
}

/**
 * Delegation on expanded sets — targetExpanded must be subset of actorExpanded.
 */
export function assertCanDelegateExpanded(
  actorExpanded: Set<string>,
  targetExpanded: Set<string>,
  context: string,
  options?: { actorIsSystemOwner?: boolean; actorIsSuperAdmin?: boolean }
): void {
  if (options?.actorIsSystemOwner || options?.actorIsSuperAdmin) {
    return;
  }
  if (isSubsetOf(targetExpanded, actorExpanded)) {
    return;
  }
  const missing = [...targetExpanded].filter((key) => !actorExpanded.has(key));
  throw new DelegationDeniedError({ missingPermissions: missing, context });
}

/**
 * Full delegation with bundle expansion (NR1).
 */
export function assertCanDelegateWithExpansion(
  actorPermissions: readonly string[],
  targetPermissions: readonly string[],
  context: string,
  options?: {
    actorIsSystemOwner?: boolean;
    actorIsSuperAdmin?: boolean;
    actorEnterpriseRole?: string | null;
    targetEnterpriseRole?: string | null;
  }
): void {
  if (options?.actorIsSystemOwner || options?.actorIsSuperAdmin) {
    return;
  }
  const actorExpanded = expandBundles(actorPermissions, options?.actorEnterpriseRole);
  const targetExpanded = expandBundles(targetPermissions, options?.targetEnterpriseRole);
  assertCanDelegateExpanded(actorExpanded, targetExpanded, context, options);
}

export function actorPermissionSetFromResolved(resolved: readonly Permission[]): Set<string> {
  return new Set(resolved);
}

export function isSuperAdminActor(roleSlugs: readonly string[]): boolean {
  return roleSlugs.some((s) => s === 'super_admin' || isSystemOwnerSlug(s));
}

export function allPermissionsForSuperActor(): readonly string[] {
  return ALL_PERMISSIONS;
}

export function computePermissionsAdded(
  before: readonly string[],
  after: readonly string[]
): string[] {
  const prev = new Set(before);
  return after.filter((k) => !prev.has(k));
}
