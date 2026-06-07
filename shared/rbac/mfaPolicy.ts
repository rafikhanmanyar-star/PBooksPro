/**
 * Roles that must use MFA to sign in (enterprise role slugs + legacy aliases).
 */

import { resolveEnterpriseRole, type EnterpriseRole } from './permissions.js';

export const MFA_REQUIRED_ENTERPRISE_ROLES: readonly EnterpriseRole[] = [
  'super_admin',
  'company_admin',
  'accountant',
] as const;

export function enterpriseRoleRequiresMfa(role: EnterpriseRole): boolean {
  return (MFA_REQUIRED_ENTERPRISE_ROLES as readonly string[]).includes(role);
}

export function userRoleRequiresMfa(role: string | undefined | null): boolean {
  return enterpriseRoleRequiresMfa(resolveEnterpriseRole(role));
}
