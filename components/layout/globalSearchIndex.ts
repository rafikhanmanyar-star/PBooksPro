import type { Page } from '../../types';

export interface NavigationSearchItem {
  id: string;
  label: string;
  subtitle: string;
  page: Page;
  initialTabs?: string[];
  keywords?: string[];
}

export interface SettingsSearchItem {
  id: string;
  categoryId: string;
  label: string;
  subtitle: string;
  keywords?: string[];
}

/** Primary app pages and modules — searchable by label and keywords. */
export const NAVIGATION_ITEMS: NavigationSearchItem[] = [
  { id: 'nav-dashboard', label: 'Dashboard', subtitle: 'Overview', page: 'dashboard', keywords: ['home', 'kpi'] },
  { id: 'nav-transactions', label: 'General Ledger', subtitle: 'Financials · Transactions', page: 'transactions', keywords: ['ledger', 'transactions', 'journal'] },
  { id: 'nav-accounting', label: 'Accounting', subtitle: 'Financials · Reports', page: 'accounting', keywords: ['financial statements', 'profit loss', 'balance sheet'] },
  { id: 'nav-personal-transactions', label: 'Personal Transactions', subtitle: 'Financials', page: 'personalTransactions', keywords: ['personal finance', 'cashbook'] },
  { id: 'nav-budgets', label: 'Budget Planner', subtitle: 'Financials', page: 'budgets', keywords: ['budget'] },
  { id: 'nav-payments', label: 'Payments', subtitle: 'Financials', page: 'payments', keywords: ['payment', 'disbursement'] },
  { id: 'nav-loans', label: 'Loan Manager', subtitle: 'Financials', page: 'loans', keywords: ['loan', 'borrow', 'lend'] },
  { id: 'nav-project-selling', label: 'Project Selling', subtitle: 'Selling', page: 'projectSelling', keywords: ['sales', 'marketing', 'agreements'] },
  { id: 'nav-project-invoices', label: 'Project Invoices', subtitle: 'Selling', page: 'projectInvoices', keywords: ['invoice', 'billing'] },
  { id: 'nav-investment-management', label: 'Investment Management', subtitle: 'Selling · Inv Mgmt', page: 'investmentManagement', keywords: ['investor', 'equity', 'fund'] },
  { id: 'nav-project-management', label: 'Project Construction', subtitle: 'Construction', page: 'projectManagement', keywords: ['project', 'construction', 'contracts', 'pev'] },
  { id: 'nav-bills', label: 'Bill Management', subtitle: 'Construction', page: 'bills', keywords: ['bill', 'vendor bill', 'payable'] },
  { id: 'nav-vendor-directory', label: 'Vendor Directory', subtitle: 'Construction', page: 'vendorDirectory', keywords: ['vendor', 'supplier'] },
  { id: 'nav-pm-config', label: 'PM Cycle', subtitle: 'Construction', page: 'pmConfig', keywords: ['project management cycle', 'pm'] },
  { id: 'nav-rental-management', label: 'Rental Management', subtitle: 'Rental', page: 'rentalManagement', keywords: ['rental', 'property', 'tenant'] },
  { id: 'nav-rental-invoices', label: 'Rental Invoices', subtitle: 'Rental', page: 'rentalInvoices', keywords: ['rent invoice'] },
  { id: 'nav-rental-agreements', label: 'Rental Agreements', subtitle: 'Rental', page: 'rentalAgreements', keywords: ['lease', 'tenancy'] },
  { id: 'nav-owner-payouts', label: 'Owner Payouts', subtitle: 'Rental', page: 'ownerPayouts', keywords: ['owner income', 'payout'] },
  { id: 'nav-rental-settings', label: 'Rental Setup', subtitle: 'Rental · Settings', page: 'rentalSettings', keywords: ['buildings', 'properties', 'units'] },
  { id: 'nav-payroll', label: 'Payroll Management', subtitle: 'People', page: 'payroll', keywords: ['salary', 'employee', 'payslip'] },
  { id: 'nav-contacts-page', label: 'Contacts', subtitle: 'People', page: 'contacts', keywords: ['client', 'customer', 'vendor contact'] },
  { id: 'nav-settings', label: 'Settings', subtitle: 'Configuration', page: 'settings', keywords: ['config', 'preferences', 'setup'] },
  { id: 'nav-import', label: 'Import Data', subtitle: 'System', page: 'import', keywords: ['import', 'upload', 'excel'] },
];

/** Settings sidebar sections — opens Configuration with the matching tab. */
export const SETTINGS_SECTIONS: SettingsSearchItem[] = [
  { id: 'settings-preferences', categoryId: 'preferences', label: 'Preferences', subtitle: 'Settings · General', keywords: ['theme', 'display', 'messaging'] },
  { id: 'settings-accounts', categoryId: 'accounts', label: 'Chart of Accounts', subtitle: 'Settings · Financial', keywords: ['account', 'category', 'coa', 'bank'] },
  { id: 'settings-assets', categoryId: 'assets', label: 'Assets', subtitle: 'Settings · Projects, units, rental buildings, rental properties', keywords: ['project', 'building', 'property', 'unit', 'rental'] },
  { id: 'settings-contacts', categoryId: 'contacts', label: 'Contacts', subtitle: 'Settings · Contact directory', keywords: ['client', 'vendor', 'owner', 'tenant'] },
  { id: 'settings-users', categoryId: 'users', label: 'User Management', subtitle: 'Settings · General', keywords: ['user', 'team'] },
  { id: 'settings-permissions', categoryId: 'permissions', label: 'Permissions', subtitle: 'Settings · Access control', keywords: ['role', 'rbac', 'access'] },
  { id: 'settings-backup', categoryId: 'backup', label: 'Backup Center', subtitle: 'Settings · General', keywords: ['backup', 'restore'] },
  { id: 'settings-data', categoryId: 'data', label: 'Data Management', subtitle: 'Settings · General', keywords: ['clear', 'delete', 'reset'] },
  { id: 'settings-about', categoryId: 'about', label: 'About', subtitle: 'Settings · System information', keywords: ['edition', 'version', 'deployment', 'cloud', 'desktop'] },
  { id: 'settings-license', categoryId: 'license', label: 'License & Subscription', subtitle: 'Settings · General', keywords: ['billing', 'subscription'] },
  { id: 'settings-setup-wizard', categoryId: 'setup-wizard', label: 'Setup Wizard', subtitle: 'Settings · General', keywords: ['onboarding', 'getting started'] },
  { id: 'settings-help', categoryId: 'help', label: 'Customer Success', subtitle: 'Settings · Help', keywords: ['help', 'support', 'guide'] },
  { id: 'settings-company', categoryId: 'company-manage', label: 'Company Management', subtitle: 'Settings · Company', keywords: ['company', 'organization'] },
  { id: 'settings-db-health', categoryId: 'db-health', label: 'Database Health', subtitle: 'Settings · Company', keywords: ['database', 'schema'] },
];

export function matchesSearchQuery(q: string, ...fields: (string | undefined)[]): boolean {
  return fields.some((f) => f?.toLowerCase().includes(q));
}
