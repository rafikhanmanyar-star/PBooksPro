/**
 * RBAC 2.0 — permission bundle registry (single source of truth).
 * Mirrors docs/security/PERMISSION_MIGRATION_MAP.md §2, §11, §12.
 * Metadata only in Phase 1 — no runtime authorization expansion.
 */

import type { PermissionBundleDefinition } from './permissionTypes.js';

/** Canonical v2 keys expanded from financial.write (PERMISSION_MIGRATION_MAP §2). */
export const FINANCIAL_WRITE_BUNDLE = [
  // Accounting
  'accounting.access',
  'accounting.chart_of_accounts.view',
  'accounting.chart_of_accounts.create',
  'accounting.chart_of_accounts.edit',
  'accounting.chart_of_accounts.delete',
  'accounting.categories.view',
  'accounting.categories.create',
  'accounting.categories.edit',
  'accounting.categories.delete',
  'accounting.journals.view',
  'accounting.journals.create',
  'accounting.journals.reverse',
  'accounting.transactions.view',
  'accounting.transactions.create',
  'accounting.transactions.edit',
  'accounting.periods.view',
  'accounting.periods.open',
  'accounting.periods.close',
  'accounting.budgets.view',
  'accounting.budgets.create',
  'accounting.budgets.edit',
  'accounting.budgets.delete',
  'accounting.investor_journals.create',
  'accounting.transaction_audit.create',
  // Procurement
  'procurement.access',
  'procurement.vendors.view',
  'procurement.vendors.create',
  'procurement.vendors.edit',
  'procurement.vendors.delete',
  'procurement.bills.view',
  'procurement.bills.create',
  'procurement.bills.edit',
  'procurement.bills.delete',
  'procurement.quotations.create',
  'procurement.quotations.edit',
  // Property & rental
  'property.access',
  'property.buildings.view',
  'property.buildings.create',
  'property.buildings.edit',
  'property.buildings.delete',
  'property.properties.view',
  'property.properties.create',
  'property.properties.edit',
  'property.properties.delete',
  'rental.access',
  'rental.agreements.view',
  'rental.agreements.create',
  'rental.agreements.edit',
  'rental.agreements.delete',
  // Projects & construction
  'projects.access',
  'projects.contracts.view',
  'projects.contracts.create',
  'projects.contracts.edit',
  'projects.contracts.delete',
  'projects.contractors.view',
  'projects.contractors.create',
  'projects.contractors.edit',
  'projects.contractors.delete',
  // Customers
  'customers.access',
  'customers.recurring_invoices.view',
  'customers.recurring_invoices.create',
  'customers.recurring_invoices.edit',
  'customers.recurring_invoices.delete',
  // Facility / PM
  'property.pm_cycles.view',
  'property.pm_cycles.edit',
  // Administration
  'administration.settings.view',
  'administration.settings.edit',
  'administration.locks.edit',
  // Reports (write-capable)
  'reports.custom.create',
  'reports.custom.edit',
  'reports.custom.delete',
  'reports.custom.export',
  'reports.designer.edit',
] as const;

export type FinancialWriteBundleKey = (typeof FINANCIAL_WRITE_BUNDLE)[number];

/**
 * Standalone personal ledger keys — explicitly excluded from FINANCIAL_WRITE_BUNDLE (§12).
 */
export const PERSONAL_FINANCE_STANDALONE = [
  'personal.finance.view',
  'personal.finance.create',
  'personal.finance.edit',
  'personal.finance.delete',
] as const;

/** v2 subset when financial.write expands for project_manager (PERMISSION_MIGRATION_MAP §11). */
export const PROJECT_MANAGER_FINANCIAL_BUNDLE_V2 = [
  'projects.access',
  'projects.contracts.view',
  'projects.contracts.create',
  'projects.contracts.edit',
  'projects.contracts.delete',
  'projects.contractors.view',
  'projects.contractors.create',
  'projects.contractors.edit',
  'projects.contractors.delete',
  'accounting.budgets.view',
  'accounting.budgets.create',
  'accounting.budgets.edit',
  'property.buildings.view',
  'property.buildings.create',
  'property.buildings.edit',
  'property.properties.view',
  'property.properties.create',
  'property.properties.edit',
  'procurement.vendors.view',
] as const;

/** v1 keys always granted to project_manager with financial.write (PERMISSION_MIGRATION_MAP §11). */
export const PROJECT_MANAGER_FINANCIAL_BUNDLE_V1 = [
  'reports.profit_loss.read',
  'reports.cash_flow.read',
  'project_selling.read',
  'pev.read',
  'pev.create',
  'contracts.retention.view',
  'contracts.retention.edit',
  'contracts.retention.release',
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
] as const;

export const PROJECT_MANAGER_FINANCIAL_BUNDLE = [
  ...PROJECT_MANAGER_FINANCIAL_BUNDLE_V1,
  ...PROJECT_MANAGER_FINANCIAL_BUNDLE_V2,
] as const;

export const BUNDLE_REGISTRY: readonly PermissionBundleDefinition[] = [
  {
    id: 'FINANCIAL_WRITE',
    aliasKey: 'financial.write',
    label: 'Financial data (write)',
    description:
      'Canonical v2 expansion for the v1 financial.write bundle alias. Excludes approve-type keys and personal.finance.* (§12).',
    keys: FINANCIAL_WRITE_BUNDLE,
  },
  {
    id: 'PROJECT_MANAGER_FINANCIAL',
    aliasKey: 'financial.write',
    label: 'Financial data (write) — project manager subset',
    description: 'Reduced expansion when enterprise role is project_manager (PERMISSION_MIGRATION_MAP §11).',
    keys: PROJECT_MANAGER_FINANCIAL_BUNDLE,
    enterpriseRole: 'project_manager',
  },
] as const;

const FINANCIAL_WRITE_SET = new Set<string>(FINANCIAL_WRITE_BUNDLE);
const PERSONAL_FINANCE_SET = new Set<string>(PERSONAL_FINANCE_STANDALONE);
const PM_V2_SET = new Set<string>(PROJECT_MANAGER_FINANCIAL_BUNDLE_V2);

/** Metadata-only expansion preview (Phase 3 PermissionEngine will use this registry). */
export function expandBundleAlias(
  aliasKey: string,
  enterpriseRole?: string | null
): readonly string[] {
  if (aliasKey !== 'financial.write') {
    return [aliasKey];
  }
  if (enterpriseRole === 'project_manager') {
    return PROJECT_MANAGER_FINANCIAL_BUNDLE;
  }
  return FINANCIAL_WRITE_BUNDLE;
}

export function isInFinancialWriteBundle(key: string): boolean {
  return FINANCIAL_WRITE_SET.has(key);
}

export function isPersonalFinanceKey(key: string): boolean {
  return PERSONAL_FINANCE_SET.has(key);
}

export function assertBundleIntegrity(): string[] {
  const errors: string[] = [];

  for (const key of PERSONAL_FINANCE_STANDALONE) {
    if (FINANCIAL_WRITE_SET.has(key)) {
      errors.push(`personal.finance key must not be in FINANCIAL_WRITE_BUNDLE: ${key}`);
    }
  }

  for (const key of PROJECT_MANAGER_FINANCIAL_BUNDLE_V2) {
    if (!FINANCIAL_WRITE_SET.has(key)) {
      errors.push(`PROJECT_MANAGER_FINANCIAL_BUNDLE_V2 key not in FINANCIAL_WRITE_BUNDLE: ${key}`);
    }
  }

  for (const def of BUNDLE_REGISTRY) {
    if (def.aliasKey === 'financial.write' && def.keys.some((k) => k === 'financial.write')) {
      errors.push(`Bundle ${def.id} must not include its own alias key`);
    }
  }

  return errors;
}

export function getBundleRegistry(): readonly PermissionBundleDefinition[] {
  return BUNDLE_REGISTRY;
}

export { FINANCIAL_WRITE_SET, PERSONAL_FINANCE_SET, PM_V2_SET };
