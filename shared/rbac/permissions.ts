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
  | 'billing.read'
  | 'billing.manage'
  | 'audit_logs.read'
  | 'financial.write'
  | 'permissions.read'
  | 'permissions.manage'
  | 'backups.read'
  | 'backups.manage'
  | 'pev.read'
  | 'pev.create'
  | 'pev.approve'
  | 'pev.post'
  | 'contracts.retention.view'
  | 'contracts.retention.edit'
  | 'contracts.retention.release'
  | 'contracts.retention.override'
  | 'project_selling.read'
  | 'project_selling.marketing_plans.write'
  | 'project_selling.agreements.write'
  | 'project_selling.invoices.write'
  | 'project_selling.payments.receive'
  | 'procurement.quotations.create'
  | 'procurement.quotations.edit'
  | 'procurement.quotations.approve'
  | 'procurement.quotations.compare'
  | 'procurement.quotations.select'
  | 'procurement.price_validation.override'
  | 'procurement.price_history.read'
  | 'purchase_order.view'
  | 'purchase_order.create'
  | 'purchase_order.edit'
  | 'purchase_order.approve'
  | 'purchase_order.cancel'
  | 'workflow.manage'
  | 'workflow.approve'
  | 'workflow.view'
  | 'workflow.admin'
  | 'goods_receipt.view'
  | 'goods_receipt.create'
  | 'goods_receipt.edit'
  | 'goods_receipt.post'
  | 'goods_receipt.close';

export const ALL_PERMISSIONS: readonly Permission[] = [
  'reports.trial_balance.read',
  'reports.balance_sheet.read',
  'reports.profit_loss.read',
  'reports.cash_flow.read',
  'payroll.read',
  'payroll.write',
  'users.read',
  'users.manage',
  'billing.read',
  'billing.manage',
  'audit_logs.read',
  'financial.write',
  'permissions.read',
  'permissions.manage',
  'backups.read',
  'backups.manage',
  'pev.read',
  'pev.create',
  'pev.approve',
  'pev.post',
  'contracts.retention.view',
  'contracts.retention.edit',
  'contracts.retention.release',
  'contracts.retention.override',
  'project_selling.read',
  'project_selling.marketing_plans.write',
  'project_selling.agreements.write',
  'project_selling.invoices.write',
  'project_selling.payments.receive',
  'procurement.quotations.create',
  'procurement.quotations.edit',
  'procurement.quotations.approve',
  'procurement.quotations.compare',
  'procurement.quotations.select',
  'procurement.price_validation.override',
  'procurement.price_history.read',
  'purchase_order.view',
  'purchase_order.create',
  'purchase_order.edit',
  'purchase_order.approve',
  'purchase_order.cancel',
  'workflow.manage',
  'workflow.approve',
  'workflow.view',
  'workflow.admin',
  'goods_receipt.view',
  'goods_receipt.create',
  'goods_receipt.edit',
  'goods_receipt.post',
  'goods_receipt.close',
] as const;

/** Project selling write keys (sales user bundle — not full financial.write). */
export const PROJECT_SELLING_WRITE_PERMISSIONS: readonly Permission[] = [
  'project_selling.marketing_plans.write',
  'project_selling.agreements.write',
  'project_selling.invoices.write',
  'project_selling.payments.receive',
] as const;

export const PROJECT_SELLING_SALES_USER_PERMISSIONS: readonly Permission[] = [
  'project_selling.read',
  ...PROJECT_SELLING_WRITE_PERMISSIONS,
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
  'billing.read': 'Billing & subscription (read)',
  'billing.manage': 'Billing & subscription (manage)',
  'audit_logs.read': 'Audit logs (read)',
  'financial.write': 'Financial data (write)',
  'permissions.read': 'Permission matrix (read)',
  'permissions.manage': 'Permissions (manage)',
  'backups.read': 'Backups (read history)',
  'backups.manage': 'Backups (run & retry)',
  'pev.read': 'Project expense vouchers (read)',
  'pev.create': 'Create expense voucher',
  'pev.approve': 'Approve expense voucher',
  'pev.post': 'Post expense voucher',
  'contracts.retention.view': 'View contract retention',
  'contracts.retention.edit': 'Edit contract retention',
  'contracts.retention.release': 'Release contract retention',
  'contracts.retention.override': 'Override retention alerts',
  'project_selling.read': 'Project selling (read)',
  'project_selling.marketing_plans.write': 'Marketing plans (create & submit)',
  'project_selling.agreements.write': 'Project agreements (create & convert)',
  'project_selling.invoices.write': 'Project selling invoices (create)',
  'project_selling.payments.receive': 'Project selling payments (receive)',
  'procurement.quotations.create': 'Create vendor quotation',
  'procurement.quotations.edit': 'Edit vendor quotation',
  'procurement.quotations.approve': 'Approve vendor quotation',
  'procurement.quotations.compare': 'Compare vendor quotations',
  'procurement.quotations.select': 'Select preferred vendor quotation',
  'procurement.price_validation.override': 'Override price validation',
  'procurement.price_history.read': 'View vendor price history',
  'purchase_order.view': 'View purchase orders',
  'purchase_order.create': 'Create purchase orders',
  'purchase_order.edit': 'Edit purchase orders',
  'purchase_order.approve': 'Approve purchase orders',
  'purchase_order.cancel': 'Cancel purchase orders',
  'workflow.manage': 'Manage workflow settings',
  'workflow.approve': 'Approve workflow requests',
  'workflow.view': 'View approval queue',
  'workflow.admin': 'Workflow administration',
  'goods_receipt.view': 'View goods receipts',
  'goods_receipt.create': 'Create goods receipts',
  'goods_receipt.edit': 'Edit goods receipts',
  'goods_receipt.post': 'Post goods receipts',
  'goods_receipt.close': 'Close goods receipts',
};

const PEV_ALL: Permission[] = ['pev.read', 'pev.create', 'pev.approve', 'pev.post'];
const PEV_PM: Permission[] = ['pev.read', 'pev.create'];
const RETENTION_VIEW: Permission[] = ['contracts.retention.view'];
const RETENTION_EDIT: Permission[] = ['contracts.retention.edit'];
const RETENTION_RELEASE: Permission[] = ['contracts.retention.release'];
const RETENTION_OVERRIDE: Permission[] = ['contracts.retention.override'];

const REPORTS_READ: Permission[] = [
  'reports.trial_balance.read',
  'reports.balance_sheet.read',
  'reports.profit_loss.read',
  'reports.cash_flow.read',
];

const PROCUREMENT_ALL: Permission[] = [
  'procurement.quotations.create',
  'procurement.quotations.edit',
  'procurement.quotations.approve',
  'procurement.quotations.compare',
  'procurement.quotations.select',
  'procurement.price_validation.override',
  'procurement.price_history.read',
  'purchase_order.view',
  'purchase_order.create',
  'purchase_order.edit',
  'purchase_order.approve',
  'purchase_order.cancel',
];

const WORKFLOW_ALL: Permission[] = [
  'workflow.manage',
  'workflow.approve',
  'workflow.view',
  'workflow.admin',
];

const GOODS_RECEIPT_ALL: Permission[] = [
  'goods_receipt.view',
  'goods_receipt.create',
  'goods_receipt.edit',
  'goods_receipt.post',
  'goods_receipt.close',
];

const ROLE_PERMISSIONS: Record<EnterpriseRole, ReadonlySet<Permission>> = {
  super_admin: new Set(ALL_PERMISSIONS),
  company_admin: new Set([
    ...REPORTS_READ,
    'payroll.read',
    'payroll.write',
    'users.read',
    'users.manage',
    'billing.read',
    'billing.manage',
    'audit_logs.read',
    'financial.write',
    'permissions.read',
    'backups.read',
    'backups.manage',
    ...PEV_ALL,
    ...RETENTION_VIEW,
    ...RETENTION_EDIT,
    ...RETENTION_RELEASE,
    ...RETENTION_OVERRIDE,
    ...PROCUREMENT_ALL,
    ...WORKFLOW_ALL,
    ...GOODS_RECEIPT_ALL,
  ]),
  accountant: new Set([
    ...REPORTS_READ,
    'payroll.read',
    'payroll.write',
    'billing.read',
    'audit_logs.read',
    'financial.write',
    'permissions.read',
    ...PEV_ALL,
    ...RETENTION_VIEW,
    ...RETENTION_EDIT,
    ...RETENTION_RELEASE,
    ...PROCUREMENT_ALL,
    'workflow.approve',
    'workflow.view',
    ...GOODS_RECEIPT_ALL,
  ]),
  project_manager: new Set([
    'reports.profit_loss.read',
    'reports.cash_flow.read',
    'financial.write',
    ...PEV_PM,
    ...RETENTION_VIEW,
    ...RETENTION_EDIT,
    ...RETENTION_RELEASE,
    'procurement.quotations.create',
    'procurement.quotations.edit',
    'procurement.quotations.compare',
    'procurement.quotations.select',
    'procurement.price_history.read',
    'purchase_order.view',
    'purchase_order.create',
    'purchase_order.edit',
    'workflow.view',
    'goods_receipt.view',
    'goods_receipt.create',
    'goods_receipt.edit',
  ]),
  sales_user: new Set([...PROJECT_SELLING_SALES_USER_PERMISSIONS]),
  read_only: new Set([
    ...REPORTS_READ,
    'payroll.read',
    'audit_logs.read',
    'pev.read',
    ...RETENTION_VIEW,
    'procurement.price_history.read',
    'purchase_order.view',
    'workflow.view',
    'goods_receipt.view',
  ]),
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

/** Full financial.write or any project-selling write permission. */
export function roleCanWriteProjectSelling(role: string | undefined | null): boolean {
  return (
    roleHasPermission(role, 'financial.write') ||
    roleHasAnyPermission(role, [...PROJECT_SELLING_WRITE_PERMISSIONS])
  );
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
