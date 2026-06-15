/**
 * Guided product tour definitions (shared).
 */

import type { Page } from '../../types';

export type ProductTourId =
  | 'dashboard'
  | 'accounting'
  | 'property_management'
  | 'construction_projects'
  | 'reports'
  | 'demo_overview';

export type TourPrepareAction =
  | 'openKpiPanel'
  | 'openKpiReports'
  | 'openAccountingTrialBalance'
  | 'openAccountingOverviewReport'
  | 'openAccountingProfitLoss'
  | 'openSettingsContacts'
  | 'openSettingsAssets'
  | 'openSettingsChartOfAccounts'
  | 'openProjectSellingMarketing'
  | 'openProjectSellingAgreements'
  | 'openProjectSellingInvoices'
  | 'openProjectSellingCollections'
  | 'openProjectConstructionContracts'
  | 'openProjectConstructionBills'
  | 'openRentalAgreements'
  | 'openRentalInvoices'
  | 'openRentalCollections';

export type ProductTourStep = {
  id: string;
  title: string;
  body: string;
  selector: string;
  page?: Page;
  prepare?: TourPrepareAction;
};

export type ProductTourDefinition = {
  id: ProductTourId;
  title: string;
  description: string;
  steps: ProductTourStep[];
};

export const PRODUCT_TOUR_IDS: ProductTourId[] = [
  'dashboard',
  'accounting',
  'property_management',
  'construction_projects',
  'reports',
];

export const PRODUCT_TOURS: Record<ProductTourId, ProductTourDefinition> = {
  dashboard: {
    id: 'dashboard',
    title: 'Dashboard Tour',
    description: 'KPIs, cash flow, and executive overview.',
    steps: [
      {
        id: 'nav',
        title: 'Dashboard navigation',
        body: 'Open the executive dashboard anytime from the sidebar. It is your command center for portfolio health.',
        selector: '[data-tour="nav-dashboard"]',
        page: 'dashboard',
      },
      {
        id: 'kpis',
        title: 'Key performance indicators',
        body: 'Pinned KPI cards surface balances, receivables, occupancy, and fund positions. Click any card to drill into details.',
        selector: '[data-tour="dashboard-kpis"]',
        page: 'dashboard',
      },
      {
        id: 'cashflow',
        title: 'Cash flow chart',
        body: 'Track income versus expense trends over recent months. Use this to spot seasonality and cash pressure early.',
        selector: '[data-tour="dashboard-cashflow"]',
        page: 'dashboard',
      },
      {
        id: 'activity',
        title: 'Recent activity',
        body: 'A live feed of the latest transactions helps you verify postings without opening the full ledger.',
        selector: '[data-tour="dashboard-activity"]',
        page: 'dashboard',
      },
    ],
  },
  accounting: {
    id: 'accounting',
    title: 'Accounting Tour',
    description: 'General ledger, filters, and transaction entry.',
    steps: [
      {
        id: 'nav',
        title: 'General Ledger',
        body: 'All journal activity flows through the General Ledger. This is the source of truth for financial statements.',
        selector: '[data-tour="nav-ledger"]',
        page: 'transactions',
      },
      {
        id: 'filters',
        title: 'Ledger filters',
        body: 'Filter by date range, account, category, project, or building. Group results by date or category for analysis.',
        selector: '[data-tour="ledger-filters"]',
        page: 'transactions',
      },
      {
        id: 'summary',
        title: 'Running totals',
        body: 'Summary tiles show filtered debits, credits, and net movement so you can reconcile before exporting.',
        selector: '[data-tour="ledger-summary"]',
        page: 'transactions',
      },
      {
        id: 'add',
        title: 'Record transactions',
        body: 'Add income, expenses, transfers, and journal entries. Double-entry rules keep your books balanced.',
        selector: '[data-tour="ledger-add"]',
        page: 'transactions',
      },
      {
        id: 'budgets',
        title: 'Budget planner',
        body: 'Set annual budgets by category and compare actuals in reports. Open Budget Planner from Financials.',
        selector: '[data-tour="nav-budgets"]',
        page: 'budgets',
      },
    ],
  },
  property_management: {
    id: 'property_management',
    title: 'Property Management Tour',
    description: 'Rental setup, agreements, billing, and payouts.',
    steps: [
      {
        id: 'nav',
        title: 'Rental module',
        body: 'Manage the full rental lifecycle — properties, agreements, invoices, service charges, and owner payouts.',
        selector: '[data-tour="nav-rental"]',
        page: 'rentalManagement',
      },
      {
        id: 'subnav',
        title: 'Rental workspace',
        body: 'Switch between setup, agreements, invoices, bills, and payouts using the module navigation bar.',
        selector: '[data-tour="rental-subnav"]',
        page: 'rentalManagement',
      },
      {
        id: 'agreements',
        title: 'Rental agreements',
        body: 'Create and renew tenant agreements, link units, and auto-generate recurring invoices from terms.',
        selector: '[data-tour="rental-agreements"]',
        page: 'rentalManagement',
      },
      {
        id: 'reports',
        title: 'Rental reports',
        body: 'Access owner income, tenant ledgers, receivables, and building analysis from the Reports menu.',
        selector: '[data-tour="rental-reports"]',
        page: 'rentalManagement',
      },
    ],
  },
  construction_projects: {
    id: 'construction_projects',
    title: 'Construction Projects Tour',
    description: 'Project costing, bills, contracts, and job profitability.',
    steps: [
      {
        id: 'nav',
        title: 'Construction module',
        body: 'Track job costing, vendor bills, contracts, and investor equity for construction projects.',
        selector: '[data-tour="nav-projects"]',
        page: 'projectManagement',
      },
      {
        id: 'subnav',
        title: 'Project workspace',
        body: 'Operational tabs cover contracts, bills, payouts, and layouts. Operational reports stay here; financial statements live under Accounting.',
        selector: '[data-tour="project-subnav"]',
        page: 'projectManagement',
      },
      {
        id: 'bills',
        title: 'Project bills',
        body: 'Record vendor bills against projects and categories. Payments update job cost and vendor ledgers.',
        selector: '[data-tour="project-bills"]',
        page: 'projectManagement',
      },
      {
        id: 'reports',
        title: 'Project reports',
        body: 'Run project-specific operational reports from the Reports section. P&L, trial balance, and cash flow are under Accounting in the sidebar.',
        selector: '[data-tour="project-reports"]',
        page: 'projectManagement',
      },
    ],
  },
  reports: {
    id: 'reports',
    title: 'Reports Tour',
    description: 'KPI panel, favorites, and financial statements.',
    steps: [
      {
        id: 'panel-toggle',
        title: 'Analytics panel',
        body: 'Open the right-hand panel for KPIs, favorite reports, and keyboard shortcuts.',
        selector: '[data-tour="kpi-panel-toggle"]',
        page: 'dashboard',
      },
      {
        id: 'reports-tab',
        title: 'Reports library',
        body: 'Browse 30+ real-estate reports — trial balance, P&L, owner payouts, and project summaries.',
        selector: '[data-tour="kpi-reports-tab"]',
        page: 'dashboard',
        prepare: 'openKpiReports',
      },
      {
        id: 'trial-balance',
        title: 'Trial balance',
        body: 'Validate debits and credits across all accounts. Open from Accounting in the sidebar or KPI favorites.',
        selector: '[data-tour="report-trial-balance"]',
        page: 'accounting',
        prepare: 'openAccountingTrialBalance',
      },
      {
        id: 'dashboard-reports',
        title: 'Portfolio reports',
        body: 'Overview, bank accounts, and account consistency reports live under Accounting in the sidebar.',
        selector: '[data-tour="accounting-overview-report"]',
        page: 'accounting',
        prepare: 'openAccountingOverviewReport',
      },
    ],
  },
  demo_overview: {
    id: 'demo_overview',
    title: 'Live demo tour',
    description: 'End-to-end walkthrough from setup through project selling, construction, rental, and P&L.',
    steps: [
      {
        id: 'welcome',
        title: 'Welcome to the live demo',
        body: 'Sample properties, projects, and ledger data are pre-loaded. This tour follows the full workflow from setup to your Profit & Loss statement.',
        selector: '[data-tour="nav-dashboard"]',
        page: 'dashboard',
      },
      {
        id: 'contacts',
        title: '1 · Add contacts',
        body: 'Start in Settings → Contacts. Add owners, tenants, brokers, vendors, and staff — they power agreements, invoices, and ledgers.',
        selector: '[data-tour="settings-contacts"]',
        page: 'settings',
        prepare: 'openSettingsContacts',
      },
      {
        id: 'assets',
        title: '2 · Register assets',
        body: 'Under Settings → Assets, add buildings, rental properties, construction projects, and sellable units.',
        selector: '[data-tour="settings-assets"]',
        page: 'settings',
        prepare: 'openSettingsAssets',
      },
      {
        id: 'chart-of-accounts',
        title: '3 · Chart of accounts',
        body: 'Configure bank accounts, income, expense, and equity categories so every transaction posts to the right ledger.',
        selector: '[data-tour="settings-chart-of-accounts"]',
        page: 'settings',
        prepare: 'openSettingsChartOfAccounts',
      },
      {
        id: 'selling-plan',
        title: '4 · Project selling — plan',
        body: 'Open Project selling → Marketing to define installment plans, amenities, and unit pricing before booking sales.',
        selector: '[data-tour="selling-plan"]',
        page: 'projectSelling',
        prepare: 'openProjectSellingMarketing',
      },
      {
        id: 'selling-agreements',
        title: '5 · Sales agreements',
        body: 'Create buyer agreements, link units, and attach installment plans. Invoices generate automatically from terms.',
        selector: '[data-tour="selling-agreements"]',
        page: 'projectSelling',
        prepare: 'openProjectSellingAgreements',
      },
      {
        id: 'selling-invoices',
        title: '6 · Sales invoices',
        body: 'Review installment invoices, send reminders, and track outstanding buyer receivables.',
        selector: '[data-tour="selling-invoices"]',
        page: 'projectSelling',
        prepare: 'openProjectSellingInvoices',
      },
      {
        id: 'selling-collections',
        title: '7 · Payment receiving',
        body: 'Record buyer payments in Collections. Receipts update unit balances and flow to the general ledger.',
        selector: '[data-tour="selling-collections"]',
        page: 'projectSelling',
        prepare: 'openProjectSellingCollections',
      },
      {
        id: 'vendors',
        title: '8 · Procurement',
        body: 'Add construction vendors and suppliers. Their bills, quotations, and payment history stay in one place.',
        selector: '[data-tour="vendor-directory"]',
        page: 'vendorDirectory',
      },
      {
        id: 'construction-contracts',
        title: '9 · Construction contracts',
        body: 'In Project construction → Contracts, link vendors to jobs and track committed costs against each project.',
        selector: '[data-tour="project-contracts"]',
        page: 'projectManagement',
        prepare: 'openProjectConstructionContracts',
      },
      {
        id: 'construction-bills',
        title: '10 · Vendor bills',
        body: 'Record vendor bills against projects and cost categories. Approved bills update job cost and accounts payable.',
        selector: '[data-tour="project-bills"]',
        page: 'projectManagement',
        prepare: 'openProjectConstructionBills',
      },
      {
        id: 'construction-payments',
        title: '11 · Bill payments',
        body: 'Pay approved bills from the Bills screen. Payments reduce payables and post to your cash and expense accounts.',
        selector: '[data-tour="project-bills"]',
        page: 'projectManagement',
        prepare: 'openProjectConstructionBills',
      },
      {
        id: 'rental-agreements',
        title: '12 · Rental agreements',
        body: 'In Rental → Agreements, create tenant leases, link units, and set recurring rent terms.',
        selector: '[data-tour="rental-agreements"]',
        page: 'rentalManagement',
        prepare: 'openRentalAgreements',
      },
      {
        id: 'rental-invoices',
        title: '13 · Rental invoices',
        body: 'Generate rent invoices from agreements. Track due dates, partial payments, and tenant balances.',
        selector: '[data-tour="rental-invoices"]',
        page: 'rentalManagement',
        prepare: 'openRentalInvoices',
      },
      {
        id: 'rental-collections',
        title: '14 · Rent payment receiving',
        body: 'Record tenant payments in Collections. Receipts update receivables and owner payout calculations.',
        selector: '[data-tour="rental-collections"]',
        page: 'rentalManagement',
        prepare: 'openRentalCollections',
      },
      {
        id: 'rental-reports',
        title: '15 · Rental reports',
        body: 'Open rental reports for tenant ledgers, receivables, owner income, and building analysis.',
        selector: '[data-tour="rental-reports"]',
        page: 'rentalManagement',
      },
      {
        id: 'profit-loss',
        title: '16 · Profit & Loss statement',
        body: 'Finish in Accounting → Profit & Loss. See revenue, costs, and net income across projects, rental, and portfolio.',
        selector: '[data-tour="report-profit-loss"]',
        page: 'accounting',
        prepare: 'openAccountingProfitLoss',
      },
    ],
  },
};

export function getTourDefinition(tourId: ProductTourId): ProductTourDefinition {
  return PRODUCT_TOURS[tourId];
}
