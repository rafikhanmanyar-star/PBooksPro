
import { Page } from '../../types';

export interface ReportDefinition {
    id: string;
    title: string;
    group: 'Rental' | 'Project' | 'General';
    path: Page;
    subPath?: string; // Format: "MainTab:SubTab"
}

export const reportDefinitions: ReportDefinition[] = [
    // Rental Reports
    { id: 'rental-building-analysis', title: 'Building Analysis Report', group: 'Rental', path: 'rentalManagement', subPath: 'Reports:Building Analysis' },
    { id: 'rental-visual-layout', title: 'Building Visual Layout', group: 'Rental', path: 'rentalManagement', subPath: 'Reports:Visual Layout' },
    { id: 'rental-unit-status', title: 'Property Status Report', group: 'Rental', path: 'rentalManagement', subPath: 'Reports:Property Status' },
    { id: 'rental-owner-payouts', title: 'Owner Income Report', group: 'Rental', path: 'rentalManagement', subPath: 'Reports:Owner Income' },
    { id: 'rental-service-charges', title: 'Service Charges Deduction', group: 'Rental', path: 'rentalManagement', subPath: 'Reports:Service Charges Deduction' },
    { id: 'rental-tenant-ledger', title: 'Tenant Ledger Report', group: 'Rental', path: 'rentalManagement', subPath: 'Reports:Tenant Ledger' },
    { id: 'rental-vendor-ledger', title: 'Vendor Ledger (Rental)', group: 'Rental', path: 'rentalManagement', subPath: 'Reports:Vendor Ledger' },
    { id: 'rental-owner-security-deposit', title: 'Owner Security Deposit Report', group: 'Rental', path: 'rentalManagement', subPath: 'Reports:Owner Security Deposit' },
    { id: 'rental-broker-fees', title: 'Broker Fee Report', group: 'Rental', path: 'rentalManagement', subPath: 'Reports:Broker Fees' },
    
    // Project Reports
    { id: 'project-visual-layout', title: 'Project Visual Layout', group: 'Project', path: 'projectManagement', subPath: 'Reports:Visual Layout' },
    { id: 'project-summary', title: 'Project Summary Report', group: 'Project', path: 'projectManagement', subPath: 'Reports:Project Summary' },
    { id: 'project-pm-cost', title: 'Project Management Cost Report', group: 'Project', path: 'projectManagement', subPath: 'Reports:PM Cost' }, 
    { id: 'project-revenue', title: 'Revenue Analysis Report', group: 'Project', path: 'projectManagement', subPath: 'Reports:Revenue Analysis' },
    { id: 'project-income-category', title: 'Project Income by Category', group: 'Project', path: 'projectManagement', subPath: 'Reports:Income by Category' },
    { id: 'project-expense-category', title: 'Project Expense by Category', group: 'Project', path: 'projectManagement', subPath: 'Reports:Expense by Category' },
    { id: 'project-units', title: 'Project Units Report', group: 'Project', path: 'projectManagement', subPath: 'Reports:Project Units' },
    { id: 'project-client-ledger', title: 'Owner Ledger (Project)', group: 'Project', path: 'projectManagement', subPath: 'Reports:Owner Ledger' },
    { id: 'project-broker-report', title: 'Broker Report (Project)', group: 'Project', path: 'projectManagement', subPath: 'Reports:Broker Report' },
    { id: 'project-vendor-ledger', title: 'Vendor Ledger (Project)', group: 'Project', path: 'projectManagement', subPath: 'Reports:Vendor Ledger' },
    { id: 'project-contract-report', title: 'Contract Report', group: 'Project', path: 'projectManagement', subPath: 'Reports:Contract Report' },

    // General Reports
    { id: 'transfer-statistics', title: 'Transfer Statistics Report', group: 'General', path: 'dashboard', subPath: '' },
    { id: 'vendor-comparison', title: 'Vendor Comparison Report', group: 'General', path: 'vendorDirectory', subPath: '' },
];
