/**
 * AUTO-GENERATED — do not edit. Source: shared/rbac/permissions.ts
 * Regenerate: node scripts/ensure-shared-financial-cores.mjs
 */

/**
 * Enterprise RBAC — permission keys, role matrix, and helpers.
 * Synced to backend via scripts/ensure-shared-financial-cores.mjs
 */

export type EnterpriseRole =
  | 'super_admin'
  | 'company_admin'
  | 'accountant'
  | 'project_manager'
  | 'sales_user'
  | 'read_only';

export type Permission =
  | 'reports.trial_balance.read'
  | 'reports.balance_sheet.read'
  | 'reports.profit_loss.read'
  | 'reports.cash_flow.read'
  | 'payroll.read'
  | 'payroll.write'
  | 'users.read'
  | 'users.manage'
  | 'audit_logs.read'
  | 'financial.write'
  | 'permissions.read'
  | 'permissions.manage'
  | 'backups.read'
  | 'backups.manage';

export const ALL_PERMISSIONS: readonly Permission[] = [
  'reports.trial_balance.read',
  'reports.balance_sheet.read',
  'reports.profit_loss.read',
  'reports.cash_flow.read',
  'payroll.read',
  'payroll.write',
  'users.read',
  'users.manage',
  'audit_logs.read',
  'financial.write',
  'permissions.read',
  'permissions.manage',
  'backups.read',
  'backups.manage',
] as const;

export const ENTERPRISE_ROLE_LABELS: Record<EnterpriseRole, string> = {
  super_admin: 'Super Admin',
  company_admin: 'Company Admin',
  accountant: 'Accountant',
  project_manager: 'Project Manager',
  sales_user: 'Sales User',
  read_only: 'Read Only User',
};

export const PERMISSION_LABELS: Record<Permission, string> = {
  'reports.trial_balance.read': 'Trial Balance (read)',
  'reports.balance_sheet.read': 'Balance Sheet (read)',
  'reports.profit_loss.read': 'Profit & Loss (read)',
  'reports.cash_flow.read': 'Cash Flow (read)',
  'payroll.read': 'Payroll (read)',
  'payroll.write': 'Payroll (write)',
  'users.read': 'Users (read)',
  'users.manage': 'Users (manage)',
  'audit_logs.read': 'Audit logs (read)',
  'financial.write': 'Financial data (write)',
  'permissions.read': 'Permission matrix (read)',
  'permissions.manage': 'Permissions (manage)',
  'backups.read': 'Backups (read history)',
  'backups.manage': 'Backups (run & retry)',
};

const REPORTS_READ: Permission[] = [
  'reports.trial_balance.read',
  'reports.balance_sheet.read',
  'reports.profit_loss.read',
  'reports.cash_flow.read',
];

const ROLE_PERMISSIONS: Record<EnterpriseRole, ReadonlySet<Permission>> = {
  super_admin: new Set(ALL_PERMISSIONS),
  company_admin: new Set([
    ...REPORTS_READ,
    'payroll.read',
    'payroll.write',
    'users.read',
    'users.manage',
    'audit_logs.read',
    'financial.write',
    'permissions.read',
    'backups.read',
    'backups.manage',
  ]),
  accountant: new Set([
    ...REPORTS_READ,
    'payroll.read',
    'payroll.write',
    'audit_logs.read',
    'financial.write',
    'permissions.read',
  ]),
  project_manager: new Set([
    'reports.profit_loss.read',
    'reports.cash_flow.read',
    'financial.write',
  ]),
  sales_user: new Set(['financial.write']),
  read_only: new Set([...REPORTS_READ, 'payroll.read', 'audit_logs.read']),
};

/** Maps stored user.role values (legacy + new) to enterprise role slugs. */
export function resolveEnterpriseRole(role: string | undefined | null): EnterpriseRole {
  const key = normalizeRoleKey(role ?? '');
  const mapped = LEGACY_ROLE_TO_ENTERPRISE[key];
  if (mapped) return mapped;
  if (key in ROLE_PERMISSIONS) return key as EnterpriseRole;
  return 'read_only';
}

function normalizeRoleKey(role: string): string {
  return role.trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
}

const LEGACY_ROLE_TO_ENTERPRISE: Record<string, EnterpriseRole> = {
  super_admin: 'super_admin',
  admin: 'company_admin',
  company_admin: 'company_admin',
  manager: 'company_admin',
  accounts: 'accountant',
  accountant: 'accountant',
  project_manager: 'project_manager',
  team_lead: 'project_manager',
  task_contributor: 'read_only',
  sales_user: 'sales_user',
  read_only: 'read_only',
  read_only_user: 'read_only',
  viewer: 'read_only',
};

export function roleHasPermission(role: string | undefined | null, permission: Permission): boolean {
  const enterprise = resolveEnterpriseRole(role);
  return ROLE_PERMISSIONS[enterprise]?.has(permission) ?? false;
}

export function permissionsForRole(role: string | undefined | null): Permission[] {
  const enterprise = resolveEnterpriseRole(role);
  return [...(ROLE_PERMISSIONS[enterprise] ?? new Set())];
}

export function roleHasAnyPermission(role: string | undefined | null, permissions: Permission[]): boolean {
  return permissions.some((p) => roleHasPermission(role, p));
}

export function roleHasAllPermissions(role: string | undefined | null, permissions: Permission[]): boolean {
  return permissions.every((p) => roleHasPermission(role, p));
}

export type PermissionMatrixRow = {
  role: EnterpriseRole;
  label: string;
  permissions: Permission[];
};

export function buildPermissionMatrix(): PermissionMatrixRow[] {
  return (Object.keys(ROLE_PERMISSIONS) as EnterpriseRole[]).map((role) => ({
    role,
    label: ENTERPRISE_ROLE_LABELS[role],
    permissions: [...ROLE_PERMISSIONS[role]],
  }));
}

/** Roles assignable in User Management (stored values). */
export const ASSIGNABLE_ROLES: { value: string; label: string; enterpriseRole: EnterpriseRole }[] = [
  { value: 'Admin', label: 'Company Admin', enterpriseRole: 'company_admin' },
  { value: 'Accountant', label: 'Accountant', enterpriseRole: 'accountant' },
  { value: 'Project Manager', label: 'Project Manager', enterpriseRole: 'project_manager' },
  { value: 'Sales User', label: 'Sales User', enterpriseRole: 'sales_user' },
  { value: 'Read Only User', label: 'Read Only User', enterpriseRole: 'read_only' },
  { value: 'Manager', label: 'Manager (legacy → Company Admin)', enterpriseRole: 'company_admin' },
  { value: 'Accounts', label: 'Accounts (legacy → Accountant)', enterpriseRole: 'accountant' },
];
