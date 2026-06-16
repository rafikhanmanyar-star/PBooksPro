/**
 * AUTO-GENERATED — do not edit. Source: shared/rbac/permissionGroups.ts
 * Regenerate: node scripts/ensure-shared-financial-cores.mjs
 */

import { ALL_PERMISSIONS, PERMISSION_LABELS, type Permission } from './permissions.js';

export type PermissionGroup = {
  module: string;
  label: string;
  permissions: { key: Permission; label: string }[];
};

const MODULE_LABELS: Record<string, string> = {
  reports: 'Reports',
  payroll: 'Payroll',
  users: 'Users',
  billing: 'Billing',
  audit_logs: 'Audit',
  financial: 'Financial',
  permissions: 'RBAC',
  roles: 'RBAC',
  backups: 'Backups',
  pev: 'Project Expense Vouchers',
  contracts: 'Contracts',
  project_selling: 'Project Selling',
  procurement: 'Procurement',
  purchase_order: 'Purchase Orders',
  workflow: 'Workflow',
  goods_receipt: 'Goods Receipt',
};

function moduleForPermission(key: Permission): string {
  const root = key.split('.')[0] ?? key;
  if (root === 'roles' || root === 'permissions') return 'rbac';
  return root;
}

function labelForModule(module: string): string {
  if (module === 'rbac') return 'RBAC';
  return MODULE_LABELS[module] ?? module.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Group all system permissions by module for catalog and role editor UIs. */
export function buildPermissionGroups(): PermissionGroup[] {
  const byModule = new Map<string, { key: Permission; label: string }[]>();
  for (const key of ALL_PERMISSIONS) {
    const module = moduleForPermission(key);
    const list = byModule.get(module) ?? [];
    list.push({ key, label: PERMISSION_LABELS[key] });
    byModule.set(module, list);
  }
  return [...byModule.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([module, permissions]) => ({
      module,
      label: labelForModule(module),
      permissions: permissions.sort((a, b) => a.label.localeCompare(b.label)),
    }));
}
