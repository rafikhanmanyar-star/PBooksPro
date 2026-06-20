/**
 * RBAC 2.0 — privilege ceiling enforcement (H6).
 */
import {
  isCompanyAdminCeilingBlocked,
  isRestrictedPermission,
  isSecurityAdministratorGrantable,
} from '../../../auth/restrictedPermissions.js';
import { isSystemOwnerSlug } from '../../../auth/permissions.js';

export type PrivilegeCeilingDetails = {
  permission: string;
  context: string;
  actorTier: RbacActorTier;
  reason: string;
};

export class PrivilegeCeilingExceededError extends Error {
  readonly code = 'PRIVILEGE_CEILING_EXCEEDED' as const;
  readonly details: PrivilegeCeilingDetails;

  constructor(details: PrivilegeCeilingDetails) {
    super(`Privilege ceiling exceeded: ${details.permission} — ${details.reason}`);
    this.name = 'PrivilegeCeilingExceededError';
    this.details = details;
  }
}

export type RbacActorTier = 'T0' | 'T1' | 'T2' | 'T3' | 'T4' | 'T5';

export function resolveActorTier(input: {
  isSystemOwner: boolean;
  roleSlugs: readonly string[];
  hasPermissionsDelegate: boolean;
}): RbacActorTier {
  if (input.isSystemOwner) return 'T0';
  if (input.roleSlugs.some((s) => s === 'super_admin')) return 'T1';
  if (input.roleSlugs.some((s) => s === 'security_administrator')) return 'T2';
  if (input.roleSlugs.some((s) => s === 'company_admin') && input.hasPermissionsDelegate) return 'T3';
  if (
    input.roleSlugs.some((s) =>
      ['accountant', 'project_manager', 'sales_user'].includes(s)
    )
  ) {
    return 'T4';
  }
  return 'T5';
}

export function assertWithinPrivilegeCeiling(
  actorTier: RbacActorTier,
  actorPermissions: readonly string[],
  targetPermissions: readonly string[],
  context: string,
  options?: { actorRoleSlugs?: readonly string[] }
): void {
  if (actorTier === 'T0' || actorTier === 'T1') {
    return;
  }

  const actorSet = new Set(actorPermissions);
  const slugs = options?.actorRoleSlugs ?? [];

  for (const permission of targetPermissions) {
    if (isRestrictedPermission(permission)) {
      throw new PrivilegeCeilingExceededError({
        permission,
        context,
        actorTier,
        reason: 'Permission is in the restricted registry (super_admin only).',
      });
    }

    if (actorTier === 'T2') {
      if (!isSecurityAdministratorGrantable(permission)) {
        throw new PrivilegeCeilingExceededError({
          permission,
          context,
          actorTier,
          reason: 'Security Administrator may only grant RBAC administration permissions.',
        });
      }
    }

    if (actorTier === 'T3') {
      if (isCompanyAdminCeilingBlocked(permission)) {
        throw new PrivilegeCeilingExceededError({
          permission,
          context,
          actorTier,
          reason: 'Permission is above company_admin delegation ceiling.',
        });
      }
      if (permission === 'super_admin' || permission === 'security_administrator') {
        throw new PrivilegeCeilingExceededError({
          permission,
          context,
          actorTier,
          reason: 'Cannot assign sovereign or security administrator roles.',
        });
      }
    }

    if (actorTier === 'T4' || actorTier === 'T5') {
      throw new PrivilegeCeilingExceededError({
        permission,
        context,
        actorTier,
        reason: 'Actor tier cannot delegate permissions.',
      });
    }

    if (!actorSet.has(permission) && permission !== 'financial.write') {
      // Delegation service handles actor-holds-permission; ceiling only blocks tier violations.
    }

    if (
      slugs.some((s) => s === 'security_administrator') &&
      !isSecurityAdministratorGrantable(permission)
    ) {
      throw new PrivilegeCeilingExceededError({
        permission,
        context,
        actorTier: 'T2',
        reason: 'Security Administrator cannot grant business domain permissions.',
      });
    }
  }

  for (const slug of slugs) {
    if (isSystemOwnerSlug(slug)) return;
  }
}
