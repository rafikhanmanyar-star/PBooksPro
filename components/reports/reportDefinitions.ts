
import { Page } from '../../types';

export interface ReportDefinition {
    id: string;
    title: string;
    group: 'Rental' | 'Project' | 'Accounting' | 'General';
    path: Page;
    subPath?: string; // Format: "MainTab:SubTab"
}

export const reportDefinitions: ReportDefinition[] = [
    // Rental Reports
    { id: 'rental-building-analysis', title: 'Building Analysis Report', group: 'Rental', path: 'rentalManagement', subPath: 'Reports:Building Analysis' },
    { id: 'rental-visual-layout', title: 'Building Visual Layout', group: 'Rental', path: 'rentalManagement', subPath: 'Reports:Visual Layout' },
    { id: 'rental-unit-status', title: 'Property Status Report', group: 'Rental', path: 'rentalManagement', subPath: 'Reports:Tabular Layout' },
    { id: 'rental-agreement-expiry', title: 'Agreement Expiry Report', group: 'Rental', path: 'rentalManagement', subPath: 'Reports:Agreement Expiry' },
    { id: 'rental-bm-analysis', title: 'BM Analysis Report', group: 'Rental', path: 'rentalManagement', subPath: 'Reports:BM Analysis' },
    { id: 'rental-invoice-payment-analysis', title: 'Invoice & Payment Analysis', group: 'Rental', path: 'rentalManagement', subPath: 'Reports:Invoice & Payment Analysis' },
    { id: 'rental-owner-payouts', title: 'Owner Rental Income', group: 'Rental', path: 'rentalManagement', subPath: 'Reports:Owner Rental Income' },
    { id: 'rental-owner-income-summary', title: 'Owner Rental Income Summary', group: 'Rental', path: 'rentalManagement', subPath: 'Reports:Owner Rental Income Summary' },
    { id: 'rental-service-charges', title: 'Service Charges Deduction', group: 'Rental', path: 'rentalManagement', subPath: 'Reports:Service Charges Deduction' },
    { id: 'rental-tenant-ledger', title: 'Tenant Ledger Report', group: 'Rental', path: 'rentalManagement', subPath: 'Reports:Tenant Ledger' },
    { id: 'rental-vendor-ledger', title: 'Vendor Ledger (Rental)', group: 'Rental', path: 'rentalManagement', subPath: 'Reports:Vendor Ledger' },
    { id: 'rental-owner-security-deposit', title: 'Security Deposit Report', group: 'Rental', path: 'rentalManagement', subPath: 'Reports:Security Deposit' },
    { id: 'rental-broker-fees', title: 'Broker Fee Report', group: 'Rental', path: 'rentalManagement', subPath: 'Reports:Broker Fees' },
    { id: 'rental-receivable', title: 'Rental Receivable', group: 'Rental', path: 'rentalManagement', subPath: 'Reports:Rental Receivable' },

    // Project Reports
    { id: 'project-visual-layout', title: 'Project Visual Layout', group: 'Project', path: 'projectManagement', subPath: 'Reports:Visual Layout' },
    { id: 'project-summary', title: 'Project Summary Report', group: 'Project', path: 'projectManagement', subPath: 'Reports:Project Summary' },
    { id: 'project-marketing-activity', title: 'Marketing Activity Report', group: 'Project', path: 'projectManagement', subPath: 'Reports:Marketing Activity' },
    { id: 'project-pm-cost', title: 'Project Management Cost Report', group: 'Project', path: 'projectManagement', subPath: 'Reports:PM Cost' },
    { id: 'project-revenue', title: 'Revenue Analysis Report', group: 'Project', path: 'projectManagement', subPath: 'Reports:Revenue Analysis' },
    { id: 'project-income-category', title: 'Project Income by Category', group: 'Project', path: 'projectManagement', subPath: 'Reports:Income by Category' },
    { id: 'project-expense-category', title: 'Project Expense by Category', group: 'Project', path: 'projectManagement', subPath: 'Reports:Expense by Category' },
    { id: 'project-pev-register', title: 'Project Expense Register', group: 'Project', path: 'projectManagement', subPath: 'Reports:Petty cash report' },
    { id: 'project-pev-by-category', title: 'Project Expenses by Category', group: 'Project', path: 'projectManagement', subPath: 'Reports:Petty cash report' },
    { id: 'project-units', title: 'Project Units Report', group: 'Project', path: 'projectManagement', subPath: 'Reports:Project Units' },
    { id: 'project-client-ledger', title: 'Owner Ledger (Project)', group: 'Project', path: 'projectManagement', subPath: 'Reports:Owner Ledger' },
    { id: 'project-broker-report', title: 'Broker Report (Project)', group: 'Project', path: 'projectManagement', subPath: 'Reports:Broker Report' },
    { id: 'project-vendor-ledger', title: 'Vendor Ledger (Project)', group: 'Project', path: 'projectManagement', subPath: 'Reports:Vendor Ledger' },
    { id: 'project-contract-report', title: 'Contract Report', group: 'Project', path: 'projectManagement', subPath: 'Reports:Contract Report' },
    { id: 'project-material-report', title: 'Material Report', group: 'Project', path: 'projectManagement', subPath: 'Reports:Material Report' },
    { id: 'project-budget-vs-actual', title: 'Budget vs Actual Report', group: 'Project', path: 'projectManagement', subPath: 'Reports:Budget vs Actual' },
    { id: 'project-custom-report-builder', title: 'Custom Report Builder', group: 'Project', path: 'projectManagement', subPath: 'Reports:Custom Report Builder' },
    // Accounting — financial statements (consolidated / per-project)
    { id: 'accounting-profit-loss', title: 'Profit & Loss Report', group: 'Accounting', path: 'accounting', subPath: 'Reports:Profit & Loss' },
    { id: 'accounting-balance-sheet', title: 'Balance Sheet Report', group: 'Accounting', path: 'accounting', subPath: 'Reports:Balance Sheet' },
    { id: 'accounting-trial-balance', title: 'Trial Balance Report', group: 'Accounting', path: 'accounting', subPath: 'Reports:Trial Balance' },
    { id: 'accounting-reconciliation', title: 'Financial Reconciliation', group: 'Accounting', path: 'accounting', subPath: 'Reports:Reconciliation' },
    { id: 'accounting-cash-flows', title: 'Cash Flow Report', group: 'Accounting', path: 'accounting', subPath: 'Reports:Cash Flows' },
    { id: 'accounting-investor-distribution', title: 'Investor Distribution Report', group: 'Accounting', path: 'accounting', subPath: 'Reports:Investor Distribution' },
    { id: 'accounting-overview', title: 'Overview Reports', group: 'Accounting', path: 'accounting', subPath: 'Reports:Overview Reports' },
    { id: 'accounting-bank-accounts', title: 'Bank Accounts Report', group: 'Accounting', path: 'accounting', subPath: 'Reports:Bank Accounts' },
    { id: 'accounting-consistency', title: 'Account Consistency Report', group: 'Accounting', path: 'accounting', subPath: 'Reports:Account Consistency' },

    // General Reports
    { id: 'transfer-statistics', title: 'Transfer Statistics Report', group: 'General', path: 'dashboard', subPath: '' },
    { id: 'vendor-comparison', title: 'Vendor Comparison Report', group: 'General', path: 'vendorDirectory', subPath: '' },
];
