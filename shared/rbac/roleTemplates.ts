/**
 * RBAC 2.0 — industry role templates (SSOT: permissionBundles.ts + permissions.ts).
 * Templates are SoD-safe: no create+approve pairs in a single template.
 */

import {
  permissionsForRole,
  PROJECT_SELLING_SALES_USER_PERMISSIONS,
  SECURITY_ADMINISTRATOR_PERMISSIONS,
  type Permission,
} from './permissions.js';
import { PROJECT_MANAGER_FINANCIAL_BUNDLE } from './permissionBundles.js';

export type RoleTemplateDefinition = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: 'industry' | 'administration';
  /** Permission keys assigned when template is instantiated (v1 + v2 catalog keys). */
  permissionKeys: readonly string[];
};

function without(...keys: readonly string[]) {
  const block = new Set(keys);
  return (list: readonly string[]) => list.filter((k) => !block.has(k));
}

/** Accountant — financial operations without approver SoD pairs in template. */
const ACCOUNTANT_TEMPLATE_KEYS: readonly string[] = without(
  'pev.approve',
  'procurement.quotations.approve',
  'purchase_order.approve',
  'goods_receipt.post',
  'goods_receipt.close'
)(permissionsForRole('accountant'));

/** Property manager — property, rental, customers (non-approve v2 from bundle). */
const PROPERTY_MANAGER_TEMPLATE_KEYS: readonly string[] = [
  'reports.cash_flow.read',
  'property.access',
  'property.buildings.view',
  'property.buildings.create',
  'property.buildings.edit',
  'property.properties.view',
  'property.properties.create',
  'property.properties.edit',
  'property.pm_cycles.view',
  'property.pm_cycles.edit',
  'rental.access',
  'rental.agreements.view',
  'rental.agreements.create',
  'rental.agreements.edit',
  'customers.access',
  'customers.recurring_invoices.view',
  'customers.recurring_invoices.create',
  'customers.recurring_invoices.edit',
];

/** HR manager — payroll prep + user read (no payroll.runs.approve). */
const HR_MANAGER_TEMPLATE_KEYS: readonly string[] = [
  'payroll.read',
  'payroll.write',
  'payroll.access',
  'payroll.runs.view',
  'payroll.runs.create',
  'users.read',
  'users.manage',
  'audit_logs.read',
];

/** Payroll officer — run preparation only (SoD: no approve). */
const PAYROLL_OFFICER_TEMPLATE_KEYS: readonly string[] = [
  'payroll.read',
  'payroll.access',
  'payroll.runs.view',
  'payroll.runs.create',
];

/** Procurement officer — create/edit without approve keys. */
const PROCUREMENT_OFFICER_TEMPLATE_KEYS: readonly string[] = [
  'procurement.access',
  'procurement.vendors.view',
  'procurement.vendors.create',
  'procurement.vendors.edit',
  'procurement.bills.view',
  'procurement.bills.create',
  'procurement.bills.edit',
  'procurement.quotations.create',
  'procurement.quotations.edit',
  'procurement.quotations.compare',
  'procurement.quotations.select',
  'procurement.price_history.read',
  'procurement.purchase_orders.create',
  'purchase_order.view',
  'purchase_order.create',
  'purchase_order.edit',
  'goods_receipt.view',
  'goods_receipt.create',
  'goods_receipt.edit',
];

/** Inventory controller — GRN without post (SoD: create vs post). */
const INVENTORY_CONTROLLER_TEMPLATE_KEYS: readonly string[] = [
  'goods_receipt.view',
  'goods_receipt.create',
  'goods_receipt.edit',
  'procurement.price_history.read',
  'purchase_order.view',
];

/** Company admin template — broad tenant admin without restricted registry keys. */
const COMPANY_ADMIN_TEMPLATE_KEYS: readonly string[] = without(
  'permissions.manage',
  'roles.manage',
  'users.role.assign',
  'billing.manage',
  'backups.manage',
  'workflow.admin',
  'pev.approve',
  'procurement.quotations.approve',
  'purchase_order.approve',
  'goods_receipt.post',
  'goods_receipt.close',
  'contracts.retention.override',
  'procurement.price_validation.override'
)(permissionsForRole('company_admin'));

export const ROLE_TEMPLATE_DEFINITIONS: readonly RoleTemplateDefinition[] = [
  {
    id: 'tpl_accountant',
    slug: 'accountant',
    name: 'Accountant',
    description: 'Financial operations, reporting, and procurement without approver permissions.',
    category: 'industry',
    permissionKeys: ACCOUNTANT_TEMPLATE_KEYS,
  },
  {
    id: 'tpl_property_manager',
    slug: 'property_manager',
    name: 'Property Manager',
    description: 'Property, rental, and facility management workflows.',
    category: 'industry',
    permissionKeys: PROPERTY_MANAGER_TEMPLATE_KEYS,
  },
  {
    id: 'tpl_project_manager',
    slug: 'project_manager',
    name: 'Project Manager',
    description: 'Project, budget, and procurement subset from PROJECT_MANAGER_FINANCIAL_BUNDLE.',
    category: 'industry',
    permissionKeys: PROJECT_MANAGER_FINANCIAL_BUNDLE,
  },
  {
    id: 'tpl_hr_manager',
    slug: 'hr_manager',
    name: 'HR Manager',
    description: 'Payroll preparation and user administration (no payroll approval).',
    category: 'industry',
    permissionKeys: HR_MANAGER_TEMPLATE_KEYS,
  },
  {
    id: 'tpl_payroll_officer',
    slug: 'payroll_officer',
    name: 'Payroll Officer',
    description: 'Prepare payroll runs — cannot approve own runs (SoD).',
    category: 'industry',
    permissionKeys: PAYROLL_OFFICER_TEMPLATE_KEYS,
  },
  {
    id: 'tpl_procurement_officer',
    slug: 'procurement_officer',
    name: 'Procurement Officer',
    description: 'Vendor, PO, and bill preparation without approval permissions.',
    category: 'industry',
    permissionKeys: PROCUREMENT_OFFICER_TEMPLATE_KEYS,
  },
  {
    id: 'tpl_sales_executive',
    slug: 'sales_executive',
    name: 'Sales Executive',
    description: 'Project selling catalog and agreement workflows.',
    category: 'industry',
    permissionKeys: PROJECT_SELLING_SALES_USER_PERMISSIONS as readonly Permission[],
  },
  {
    id: 'tpl_inventory_controller',
    slug: 'inventory_controller',
    name: 'Inventory Controller',
    description: 'Goods receipt preparation without GL posting.',
    category: 'industry',
    permissionKeys: INVENTORY_CONTROLLER_TEMPLATE_KEYS,
  },
  {
    id: 'tpl_company_admin',
    slug: 'company_admin',
    name: 'Company Admin',
    description: 'Tenant administrator template without restricted registry permissions.',
    category: 'administration',
    permissionKeys: COMPANY_ADMIN_TEMPLATE_KEYS,
  },
  {
    id: 'tpl_security_administrator',
    slug: 'security_administrator',
    name: 'Security Administrator',
    description: 'RBAC administration — roles, permissions, and user role assignment.',
    category: 'administration',
    permissionKeys: SECURITY_ADMINISTRATOR_PERMISSIONS as readonly Permission[],
  },
] as const;

export function getRoleTemplateById(id: string): RoleTemplateDefinition | undefined {
  return ROLE_TEMPLATE_DEFINITIONS.find((t) => t.id === id || t.slug === id);
}

export function listRoleTemplates(): readonly RoleTemplateDefinition[] {
  return ROLE_TEMPLATE_DEFINITIONS;
}
