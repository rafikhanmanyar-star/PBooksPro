/**
 * AUTO-GENERATED — do not edit. Source: shared/rbac/restrictedPermissions.ts
 * Regenerate: node scripts/ensure-shared-financial-cores.mjs
 */

/**
 * RBAC 2.0 — restricted permission registry (privilege ceiling).
 * Mirrors docs/security/PRIVILEGE_CEILING.md § Restricted Permission Registry.
 */

import type { Permission } from './permissions.js';

/** v1 runtime keys in the restricted registry. */
export const RESTRICTED_V1_PERMISSIONS: readonly Permission[] = [
  'roles.manage',
  'permissions.manage',
  'users.role.assign',
  'backups.manage',
  'workflow.admin',
  'billing.manage',
] as const;

/** v2 catalog keys in the restricted registry (Phase 2+ catalog-only until route guards migrate). */
export const RESTRICTED_V2_PERMISSION_KEYS: readonly string[] = [
  'permissions.delegate',
  'administration.roles.edit',
  'administration.permissions.edit',
  'administration.scopes.edit',
  'administration.scopes.delegate',
  'administration.backups.restore',
  'administration.audit.export',
  'audit_logs.rbac.read',
  'roles.assign.temporary',
  'roles.template.create',
  'roles.template.manage',
  'security.break_glass.activate',
  'security.system_owner.manage',
  'administration.approvals.final',
  'approve.payments',
  'accounting.journals.approve',
  'accounting.periods.close',
] as const;

export const RESTRICTED_PERMISSION_KEYS: readonly string[] = [
  ...RESTRICTED_V1_PERMISSIONS,
  ...RESTRICTED_V2_PERMISSION_KEYS,
] as const;

const RESTRICTED_SET = new Set<string>(RESTRICTED_PERMISSION_KEYS);

export function isRestrictedPermission(key: string): boolean {
  return RESTRICTED_SET.has(key);
}

/** Permissions security_administrator may hold / grant (RBAC administration bundle). */
export const SECURITY_ADMINISTRATOR_GRANTABLE: readonly Permission[] = [
  'roles.view',
  'roles.manage',
  'permissions.view',
  'permissions.manage',
  'users.role.assign',
] as const;

const SECURITY_ADMIN_GRANTABLE_SET = new Set<string>(SECURITY_ADMINISTRATOR_GRANTABLE);

export function isSecurityAdministratorGrantable(key: string): boolean {
  return SECURITY_ADMIN_GRANTABLE_SET.has(key);
}

/** Approve-type suffixes blocked from company_admin delegation ceiling. */
export const CEILING_BLOCKED_SUFFIXES = ['.approve'] as const;

/** v1 keys explicitly above company_admin delegation ceiling. */
export const COMPANY_ADMIN_CEILING_BLOCKED_V1: readonly Permission[] = [
  'permissions.manage',
  'roles.manage',
  'users.role.assign',
  'billing.manage',
  'backups.manage',
  'workflow.admin',
  'workflow.manage',
  'pev.approve',
  'purchase_order.approve',
  'procurement.quotations.approve',
  'goods_receipt.post',
  'goods_receipt.close',
  'contracts.retention.override',
  'procurement.price_validation.override',
] as const;

export function isCompanyAdminCeilingBlocked(key: string): boolean {
  if (isRestrictedPermission(key)) return true;
  if ((COMPANY_ADMIN_CEILING_BLOCKED_V1 as readonly string[]).includes(key)) return true;
  if (key.endsWith('.approve') || key.startsWith('approve.')) return true;
  if (key === 'accounting.journals.reverse' || key === 'accounting.periods.close') return true;
  if (key === 'permissions.delegate') return true;
  return false;
}
