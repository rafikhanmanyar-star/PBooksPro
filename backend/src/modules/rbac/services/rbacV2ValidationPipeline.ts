/**
 * RBAC 2.0 — ordered validation pipeline for role mutations.
 *
 * Pipeline order (A5.1.2.1 / architecture §4.7):
 *   1. expandBundles(actor) + expandBundles(target)
 *   2. assertCanDelegateExpanded
 *   3. assertWithinPrivilegeCeiling
 *   4. assertNoSodViolation
 */
import type { Permission } from '../../../auth/permissions.js';
import { CATALOG_KEY_SET } from '../../../auth/permissionCatalog.js';
import { isKnownPermission } from '../../../auth/permissions.js';
import {
  assertCanDelegateExpanded,
  assertCanDelegateWithExpansion,
  computePermissionsAdded,
  isSuperAdminActor,
} from './rbacDelegationService.js';
import {
  assertWithinPrivilegeCeiling,
  resolveActorTier,
  type RbacActorTier,
} from './rbacPrivilegeCeilingService.js';
import {
  assertNoSodViolation,
  assertNoSodViolationOnUnion,
  findSodViolation,
  SodViolationError,
} from './rbacSodService.js';
import { DelegationDeniedError } from './rbacDelegationService.js';
import { PrivilegeCeilingExceededError } from './rbacPrivilegeCeilingService.js';
import { expandBundles, unionExpandedPermissionKeys } from './rbacPermissionExpansion.js';

export type ActorContext = {
  userId: string;
  tenantId: string;
  resolvedPermissions: Permission[];
  roleSlugs: string[];
  isSystemOwner: boolean;
};

export function validatePermissionKeysV2(keys: string[]): string[] {
  const invalid = keys.filter((k) => !isKnownPermission(k) && !CATALOG_KEY_SET.has(k));
  if (invalid.length > 0) {
    throw Object.assign(new Error(`Unknown permissions: ${invalid.join(', ')}`), {
      code: 'VALIDATION_ERROR',
    });
  }
  return keys;
}

function resolvePrimaryEnterpriseRole(actor: ActorContext): string | undefined {
  return actor.roleSlugs[0];
}

export function runRolePermissionValidation(
  actor: ActorContext,
  targetPermissions: readonly string[],
  context: string,
  enterpriseRoleSlug?: string | null
): void {
  const actorEnterpriseRole = resolvePrimaryEnterpriseRole(actor);
  const targetEnterpriseRole = enterpriseRoleSlug ?? actorEnterpriseRole;

  const actorExpanded = expandBundles(actor.resolvedPermissions, actorEnterpriseRole);
  const targetExpanded = expandBundles(targetPermissions, targetEnterpriseRole);

  const tier = resolveActorTier({
    isSystemOwner: actor.isSystemOwner,
    roleSlugs: actor.roleSlugs,
    hasPermissionsDelegate: actor.resolvedPermissions.includes('permissions.manage' as Permission),
  });

  const bypass = {
    actorIsSystemOwner: actor.isSystemOwner,
    actorIsSuperAdmin: isSuperAdminActor(actor.roleSlugs),
  };

  assertCanDelegateExpanded(actorExpanded, targetExpanded, context, bypass);

  assertWithinPrivilegeCeiling(
    tier,
    [...actorExpanded],
    [...targetExpanded],
    context,
    { actorRoleSlugs: actor.roleSlugs }
  );

  const violation = findSodViolation(targetExpanded, context);
  if (violation) {
    throw new SodViolationError(violation);
  }
}

export function runUserRoleUnionValidation(
  actor: ActorContext,
  rolePermissionSets: readonly (readonly string[])[],
  roleSlugs: readonly string[],
  context: string
): void {
  const allTarget = [...new Set(rolePermissionSets.flat())];
  runRolePermissionValidation(actor, allTarget, context);

  assertNoSodViolationOnUnion(rolePermissionSets, roleSlugs, context);
}

/**
 * SoD Enforcement Point #3 — PERMS_ADDED = newPermissions \ oldPermissions.
 * For each active holder, validate expanded effective union after additions.
 */
export function runRolePermissionUpdateHolderCheck(input: {
  permissionsBefore: readonly string[];
  permissionsAfter: readonly string[];
  holderRolePermissionSets: readonly (readonly string[])[];
  holderRoleSlugs: readonly string[];
  holderRoleIds: readonly string[];
  roleIdBeingUpdated: string;
}): void {
  const permsAdded = computePermissionsAdded(input.permissionsBefore, input.permissionsAfter);
  if (permsAdded.length === 0) return;

  const simulatedSets = input.holderRolePermissionSets.map((set, j) => {
    const rid = input.holderRoleIds[j];
    if (rid === input.roleIdBeingUpdated) {
      return [...new Set([...set, ...permsAdded])];
    }
    return [...set];
  });
  assertNoSodViolationOnUnion(simulatedSets, input.holderRoleSlugs, 'role_permission_update');
}

export {
  SodViolationError,
  DelegationDeniedError,
  PrivilegeCeilingExceededError,
  type RbacActorTier,
  computePermissionsAdded,
  expandBundles,
  assertCanDelegateWithExpansion,
};
