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

export type TourPrepareAction = 'openKpiPanel' | 'openKpiReports' | 'openAccountingTrialBalance';

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
        title: 'Dashboard reports',
        body: 'Overview report tabs on the dashboard provide building funds, bank positions, and transfer statistics.',
        selector: '[data-tour="dashboard-report-tabs"]',
        page: 'dashboard',
      },
    ],
  },
  demo_overview: {
    id: 'demo_overview',
    title: 'Live demo tour',
    description: 'Quick orientation for the demo environment.',
    steps: [
      {
        id: 'dashboard',
        title: 'Executive Dashboard',
        body: 'See portfolio KPIs, cash position, and alerts at a glance.',
        selector: '[data-tour="nav-dashboard"]',
        page: 'dashboard',
      },
      {
        id: 'rental',
        title: 'Property & Rental Management',
        body: 'Manage buildings, units, agreements, invoicing, and tenant ledgers.',
        selector: '[data-tour="nav-rental"]',
      },
      {
        id: 'projects',
        title: 'Construction Projects',
        body: 'Track project costing, installments, vendors, and job profitability.',
        selector: '[data-tour="nav-projects"]',
      },
      {
        id: 'ledger',
        title: 'Financial Ledger & Reports',
        body: 'Explore transactions, trial balance, P&L, and 30+ real estate reports.',
        selector: '[data-tour="nav-ledger"]',
      },
    ],
  },
};

export function getTourDefinition(tourId: ProductTourId): ProductTourDefinition {
  return PRODUCT_TOURS[tourId];
}
