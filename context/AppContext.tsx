
import React, { createContext, useContext, useReducer, useEffect, useCallback, useState, useRef, useMemo } from 'react';
import { AppState, AppAction, Transaction, TransactionType, Account, Category, AccountType, LoanSubtype, InvoiceStatus, TransactionLogEntry, Page, ContractStatus, User, UserRole, ProjectAgreementStatus, Bill, SalesReturn, SalesReturnStatus, SalesReturnReason, Contact, Vendor, Invoice, RecurringInvoiceTemplate } from '../types';
import useDatabaseState from '../hooks/useDatabaseState';
import { useDatabaseStateFallback } from '../hooks/useDatabaseStateFallback';
import { runAllMigrations, needsMigration } from '../services/database/migration';
import { getDatabaseService } from '../services/database/databaseService';
import { useAuth } from './AuthContext';
import { getAppStateApiService } from '../services/api/appStateApi';
import { logger } from '../services/logger';
import packageJson from '../package.json';
import { shouldSyncAction } from '../services/sync/dataFilter';
import InitializationScreen from '../components/InitializationScreen';
import { getSyncQueue } from '../services/syncQueue';
import { getSyncManager } from '../services/sync/syncManager';
import { getConnectionMonitor } from '../services/connectionMonitor';
import { SyncOperationType } from '../types/sync';
import { getLastSyncTimestamp, setLastSyncTimestamp, isLastSyncRecent, clearLastSyncTimestamp } from '../utils/lastSyncStorage';
// PERFORMANCE: Module-level constant set of action types that trigger API sync.
// Previously this 60+ entry Set was re-created on EVERY dispatch call inside useCallback.
const SYNC_TO_API_ACTIONS = new Set<string>([
    // Financial transactions
    'ADD_TRANSACTION', 'UPDATE_TRANSACTION', 'DELETE_TRANSACTION', 'BATCH_ADD_TRANSACTIONS', 'RESTORE_TRANSACTION',
    // Accounts
    'ADD_ACCOUNT', 'UPDATE_ACCOUNT', 'DELETE_ACCOUNT',
    // Contacts
    'ADD_CONTACT', 'UPDATE_CONTACT', 'DELETE_CONTACT',
    // Vendors
    'ADD_VENDOR', 'UPDATE_VENDOR', 'DELETE_VENDOR',
    // Categories
    'ADD_CATEGORY', 'UPDATE_CATEGORY', 'DELETE_CATEGORY',
    // Projects & Properties
    'ADD_PROJECT', 'UPDATE_PROJECT', 'DELETE_PROJECT',
    'ADD_BUILDING', 'UPDATE_BUILDING', 'DELETE_BUILDING',
    'ADD_PROPERTY', 'UPDATE_PROPERTY', 'DELETE_PROPERTY',
    'ADD_UNIT', 'UPDATE_UNIT', 'DELETE_UNIT',
    // Invoices & Bills
    'ADD_INVOICE', 'UPDATE_INVOICE', 'DELETE_INVOICE',
    'ADD_BILL', 'UPDATE_BILL', 'DELETE_BILL',
    // Recurring Invoice Templates
    'ADD_RECURRING_TEMPLATE', 'UPDATE_RECURRING_TEMPLATE', 'DELETE_RECURRING_TEMPLATE',
    // Budgets
    'ADD_BUDGET', 'UPDATE_BUDGET', 'DELETE_BUDGET',
    // Agreements
    'ADD_RENTAL_AGREEMENT', 'UPDATE_RENTAL_AGREEMENT', 'DELETE_RENTAL_AGREEMENT',
    'ADD_PROJECT_AGREEMENT', 'UPDATE_PROJECT_AGREEMENT', 'DELETE_PROJECT_AGREEMENT', 'CANCEL_PROJECT_AGREEMENT',
    // Sales Returns
    'ADD_SALES_RETURN', 'UPDATE_SALES_RETURN', 'DELETE_SALES_RETURN', 'MARK_RETURN_REFUNDED',
    // Contracts
    'ADD_CONTRACT', 'UPDATE_CONTRACT', 'DELETE_CONTRACT',
    // Organization settings
    'UPDATE_AGREEMENT_SETTINGS', 'UPDATE_PROJECT_AGREEMENT_SETTINGS',
    'UPDATE_RENTAL_INVOICE_SETTINGS', 'UPDATE_PROJECT_INVOICE_SETTINGS',
    'UPDATE_PRINT_SETTINGS', 'UPDATE_WHATSAPP_TEMPLATES',
    'ADD_INSTALLMENT_PLAN', 'UPDATE_INSTALLMENT_PLAN', 'DELETE_INSTALLMENT_PLAN',
    'ADD_PLAN_AMENITY', 'UPDATE_PLAN_AMENITY', 'DELETE_PLAN_AMENITY',
    'ADD_INVENTORY_ITEM', 'UPDATE_INVENTORY_ITEM', 'DELETE_INVENTORY_ITEM',
    'UPDATE_PM_COST_PERCENTAGE',
    // General settings
    'TOGGLE_SYSTEM_TRANSACTIONS', 'TOGGLE_COLOR_CODING', 'TOGGLE_BEEP_ON_SAVE', 'TOGGLE_DATE_PRESERVATION',
    'UPDATE_DEFAULT_PROJECT', 'UPDATE_DASHBOARD_CONFIG',
    // PM Cycle Allocations
    'ADD_PM_CYCLE_ALLOCATION', 'UPDATE_PM_CYCLE_ALLOCATION', 'DELETE_PM_CYCLE_ALLOCATION',
]);

// Lazy import AppStateRepository to avoid initialization issues during module load
// It will be imported when actually needed
let AppStateRepositoryClass: any = null;
let importPromise: Promise<any> | null = null;

async function getAppStateRepository() {
    if (!AppStateRepositoryClass) {
        if (!importPromise) {
            importPromise = import('../services/database/repositories/appStateRepository').then(module => {
                AppStateRepositoryClass = module.AppStateRepository;
                return AppStateRepositoryClass;
            }).catch(error => {
                console.error('❌ Failed to load AppStateRepository:', error);
                importPromise = null; // Reset so we can retry
                throw new Error(`Failed to load AppStateRepository: ${error instanceof Error ? error.message : String(error)}`);
            });
        }
        await importPromise;
    }
    return new AppStateRepositoryClass();
}

const SYSTEM_ACCOUNTS: Account[] = [
    { id: 'sys-acc-cash', name: 'Cash', type: AccountType.BANK, balance: 0, isPermanent: true, description: 'Default cash account' },
    { id: 'sys-acc-ar', name: 'Accounts Receivable', type: AccountType.ASSET, balance: 0, isPermanent: true, description: 'System account for unpaid invoices' },
    { id: 'sys-acc-ap', name: 'Accounts Payable', type: AccountType.LIABILITY, balance: 0, isPermanent: true, description: 'System account for unpaid bills and salaries' },
    { id: 'sys-acc-equity', name: 'Owner Equity', type: AccountType.EQUITY, balance: 0, isPermanent: true, description: 'System account for owner capital and equity' },
    { id: 'sys-acc-clearing', name: 'Internal Clearing', type: AccountType.BANK, balance: 0, isPermanent: true, description: 'System account for internal transfers and equity clearing' }
];

const DEFAULT_ADMIN: User = {
    id: 'sys-admin',
    username: 'admin',
    name: 'Administrator',
    role: 'Admin',
    password: '' // Empty string signifies no password set
};

const SYSTEM_CATEGORIES: Category[] = [
    // Income
    { id: 'sys-cat-rent-inc', name: 'Rental Income', type: TransactionType.INCOME, isPermanent: true, isRental: true },
    { id: 'sys-cat-svc-inc', name: 'Service Charge Income', type: TransactionType.INCOME, isPermanent: true, isRental: true },
    { id: 'sys-cat-sec-dep', name: 'Security Deposit', type: TransactionType.INCOME, isPermanent: true, isRental: true },
    { id: 'sys-cat-proj-list', name: 'Project Listed Income', type: TransactionType.INCOME, isPermanent: true },
    { id: 'sys-cat-unit-sell', name: 'Unit Selling Income', type: TransactionType.INCOME, isPermanent: true },
    { id: 'sys-cat-penalty-inc', name: 'Penalty Income', type: TransactionType.INCOME, isPermanent: true },
    { id: 'sys-cat-own-eq', name: 'Owner Equity', type: TransactionType.INCOME, isPermanent: true },
    { id: 'sys-cat-own-svc-pay', name: 'Owner Service Charge Payment', type: TransactionType.INCOME, isPermanent: true, isRental: true },

    // Expense
    { id: 'sys-cat-sal-adv', name: 'Salary Advance', type: TransactionType.EXPENSE, isPermanent: true },
    { id: 'sys-cat-proj-sal', name: 'Project Staff Salary', type: TransactionType.EXPENSE, isPermanent: true },
    { id: 'sys-cat-rent-sal', name: 'Rental Staff Salary', type: TransactionType.EXPENSE, isPermanent: true },
    { id: 'sys-cat-bld-maint', name: 'Building Maintenance', type: TransactionType.EXPENSE, isPermanent: true, isRental: true },
    { id: 'sys-cat-bld-util', name: 'Building Utilities', type: TransactionType.EXPENSE, isPermanent: true, isRental: true },
    { id: 'sys-cat-own-pay', name: 'Owner Payout', type: TransactionType.EXPENSE, isPermanent: true, isRental: true },
    { id: 'sys-cat-own-sec-pay', name: 'Owner Security Payout', type: TransactionType.EXPENSE, isPermanent: true, isRental: true },
    { id: 'sys-cat-sec-ref', name: 'Security Deposit Refund', type: TransactionType.EXPENSE, isPermanent: true, isRental: true },
    { id: 'sys-cat-prop-rep-own', name: 'Property Repair (Owner)', type: TransactionType.EXPENSE, isPermanent: true, isRental: true },
    { id: 'sys-cat-prop-rep-ten', name: 'Property Repair (Tenant)', type: TransactionType.EXPENSE, isPermanent: true, isRental: true },
    { id: 'sys-cat-brok-fee', name: 'Broker Fee', type: TransactionType.EXPENSE, isPermanent: true },
    { id: 'sys-cat-rebate', name: 'Rebate Amount', type: TransactionType.EXPENSE, isPermanent: true },
    { id: 'sys-cat-pm-cost', name: 'Project Management Cost', type: TransactionType.EXPENSE, isPermanent: true },
    { id: 'sys-cat-own-with', name: 'Owner Withdrawn', type: TransactionType.EXPENSE, isPermanent: true },

    // Discounts (Virtual Expenses)
    { id: 'sys-cat-disc-cust', name: 'Customer Discount', type: TransactionType.EXPENSE, isPermanent: true },
    { id: 'sys-cat-disc-flr', name: 'Floor Discount', type: TransactionType.EXPENSE, isPermanent: true },
    { id: 'sys-cat-disc-lump', name: 'Lump Sum Discount', type: TransactionType.EXPENSE, isPermanent: true },
    { id: 'sys-cat-disc-misc', name: 'Misc Discount', type: TransactionType.EXPENSE, isPermanent: true },

    // Legacy
    { id: 'sys-cat-svc-deduct', name: 'Service Charge Deduction', type: TransactionType.EXPENSE, isPermanent: true, isRental: true },

    // Payroll
    { id: 'sys-cat-sal-exp', name: 'Salary Expenses', type: TransactionType.EXPENSE, isPermanent: true },
];

const DEFAULT_INVOICE_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800&family=Work+Sans:wght@400;500;600;700&display=swap');
        body { font-family: 'Nunito', 'Work Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif; padding: 40px; color: #374151; line-height: 1.5; max-width: 800px; margin: 0 auto; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 60px; border-bottom: 2px solid #f1f5f9; padding-bottom: 20px; }
        .company-info h1 { margin: 0; color: #4f46e5; font-size: 24px; text-transform: uppercase; letter-spacing: 1px; }
        .company-info p { margin: 4px 0; font-size: 14px; color: #64748b; white-space: pre-line; }
        .logo-container img { max-height: 80px; width: auto; margin-bottom: 10px; }
        .invoice-title { text-align: right; }
        .invoice-title h2 { margin: 0; font-size: 32px; color: #1e293b; font-weight: 800; letter-spacing: -1px; }
        .invoice-meta { margin-top: 10px; font-size: 14px; }
        .meta-row { display: flex; justify-content: flex-end; gap: 20px; margin-bottom: 4px; }
        .label { color: #64748b; font-weight: 600; }
        .value { font-weight: 500; }
        
        .bill-to-section { margin-bottom: 40px; display: flex; justify-content: space-between; }
        .bill-to h3 { font-size: 12px; text-transform: uppercase; color: #94a3b8; letter-spacing: 1px; margin-bottom: 8px; }
        .bill-to p { margin: 2px 0; font-weight: 500; color: #0f172a; }
        .client-name { font-size: 18px; font-weight: 700; margin-bottom: 4px !important; }
        
        table { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
        th { text-align: left; padding: 12px 16px; background-color: #f8fafc; color: #475569; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #e2e8f0; }
        td { padding: 16px; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
        .amount-col { text-align: right; font-weight: 600; color: #0f172a; width: 150px; }
        
        .totals-section { display: flex; justify-content: flex-end; }
        .totals-table { width: 300px; border-collapse: collapse; }
        .totals-table td { padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
        .totals-table .total-row td { border-top: 2px solid #0f172a; border-bottom: none; padding-top: 12px; font-size: 16px; font-weight: 700; color: #0f172a; }
        .totals-table .label { color: #64748b; }
        .totals-table .value { text-align: right; }
        
        .footer { margin-top: 60px; padding-top: 20px; border-top: 1px solid #f1f5f9; text-align: center; font-size: 12px; color: #94a3b8; }
        
        .status-stamp { position: fixed; top: 40%; left: 50%; transform: translate(-50%, -50%) rotate(-15deg); border: 4px solid rgba(220, 38, 38, 0.2); color: rgba(220, 38, 38, 0.2); font-size: 80px; font-weight: 900; text-transform: uppercase; padding: 20px; pointer-events: none; z-index: -1; font-family: 'Nunito', 'Work Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
        .status-paid { border-color: rgba(16, 185, 129, 0.2); color: rgba(16, 185, 129, 0.2); }
        .barcode { font-family: 'IDAutomationHC39M', 'Courier New', 'Courier', monospace; font-weight: normal; letter-spacing: 0.15em; font-size: 1.1em; }
    </style>
</head>
<body>
    {statusStamp}
    
    <div class="header">
        <div class="company-info">
            <div class="logo-container">{logoImg}</div>
            <h1>{companyName}</h1>
            <p>{companyAddress}</p>
            <p>{companyContact}</p>
        </div>
        <div class="invoice-title">
            <h2>INVOICE</h2>
            <div class="invoice-meta">
                <div class="meta-row"><span class="label">Invoice #</span> <span class="value">{invoiceNumber}</span></div>
                <div class="meta-row"><span class="label">Date</span> <span class="value">{issueDate}</span></div>
                <div class="meta-row"><span class="label">Due Date</span> <span class="value">{dueDate}</span></div>
            </div>
        </div>
    </div>

    <div class="bill-to-section">
        <div class="bill-to">
            <h3>Bill To</h3>
            <p class="client-name">{contactName}</p>
            <p>{contactPhone}</p>
            <p>{contactAddress}</p>
        </div>
        <div class="bill-to" style="text-align: right;">
            <h3>Property / Unit</h3>
            <p class="client-name">{contextName}</p>
            <p>{contextSub}</p>
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th>Description</th>
                <th class="amount-col">Amount</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td>
                    <strong>{invoiceType}</strong>
                    <div style="font-size: 13px; color: #64748b; margin-top: 4px;">{description}</div>
                </td>
                <td class="amount-col">{amount}</td>
            </tr>
            {extraRows}
        </tbody>
    </table>

    <div class="totals-section">
        <table class="totals-table">
            <tr>
                <td class="label">Subtotal</td>
                <td class="value">{amount}</td>
            </tr>
            <tr>
                <td class="label">Amount Paid</td>
                <td class="value" style="color: #10b981;">{paidAmount}</td>
            </tr>
            <tr class="total-row">
                <td>Balance Due</td>
                <td class="value">{balanceDue}</td>
            </tr>
        </table>
    </div>

    <div class="footer">
        <p>{footerText}</p>
        <p>Thank you for your business!</p>
    </div>
</body>
</html>`;

const initialState: AppState = {
    users: [DEFAULT_ADMIN],
    currentUser: null,
    accounts: SYSTEM_ACCOUNTS,
    contacts: [],
    vendors: [],
    categories: SYSTEM_CATEGORIES,
    projects: [],
    buildings: [],
    properties: [],
    units: [],
    transactions: [],
    invoices: [],
    bills: [],
    rentalAgreements: [],
    projectAgreements: [],
    salesReturns: [],
    contracts: [],
    budgets: [],
    recurringInvoiceTemplates: [],
    printSettings: {
        companyName: 'My Company',
        companyAddress: '',
        companyContact: '',
        showLogo: true,
        showDatePrinted: true
    },
    whatsAppTemplates: {
        invoiceReminder: 'Dear {contactName}, Invoice #{invoiceNumber} for {subject} is due on {dueDate}. Amount: {amount}.',
        invoiceReceipt: 'Dear {contactName}, Payment of {paidAmount} received for Invoice #{invoiceNumber}. Balance: {balance}.',
        billPayment: 'Dear {contactName}, Bill #{billNumber} has been paid. Amount: {paidAmount}.',
        billToOwner: 'Dear {contactName}, Maintenance bill #{billNumber} for your property. Amount: {amount}.',
        billToTenant: 'Dear {contactName}, Maintenance bill #{billNumber}. Amount: {amount}. {note}',
        vendorGreeting: 'Hello {contactName},',
        ownerPayoutLedger: 'Dear {contactName},\n\nHere is your {payoutType} statement:\n\nCollected: {collected}\nExpenses: {expenses}\nPaid to you: {paid}\n─────────────\nBalance Due: {balance}\n\nFor any queries, please contact us.',
        brokerPayoutLedger: 'Dear {contactName},\n\nHere is your commission statement:\n\nTotal Earned: {earned}\nTotal Paid: {paid}\n─────────────\nBalance Due: {balance}\n\nFor any queries, please contact us.',
        payoutConfirmation: 'Dear {contactName},\n\nA {payoutType} payment of {amount} has been made to you.\nReference: {reference}\n\nThank you.',
    },
    invoiceHtmlTemplate: DEFAULT_INVOICE_TEMPLATE,
    dashboardConfig: { visibleKpis: [] },
    installmentPlans: [],
    planAmenities: [],
    agreementSettings: { prefix: 'AGR-', nextNumber: 1, padding: 4 },
    projectAgreementSettings: { prefix: 'P-AGR-', nextNumber: 1, padding: 4 },
    rentalInvoiceSettings: { prefix: 'INV-', nextNumber: 1, padding: 5, autoSendInvoiceWhatsApp: false },
    projectInvoiceSettings: { prefix: 'P-INV-', nextNumber: 1, padding: 5 },
    showSystemTransactions: false,
    enableColorCoding: true,
    enableBeepOnSave: false,
    enableDatePreservation: false,
    lastPreservedDate: undefined,
    pmCostPercentage: 0,
    defaultProjectId: undefined,
    errorLog: [],
    transactionLog: [],
    currentPage: 'dashboard',
    editingEntity: null,
    initialTransactionType: null,
    initialTransactionFilter: null,
    initialTabs: [],
    initialImportType: null,
    quotations: [],
    documents: [],
}

// Create context - use any temporarily to avoid TDZ issues, then cast to proper type
// This ensures the context is created even if types aren't fully initialized yet
const AppContext = createContext<any>(undefined) as React.Context<{ state: AppState; dispatch: React.Dispatch<AppAction>; isInitialDataLoading?: boolean } | undefined>;

// Helper to auto-update contract status based on payments
const updateContractStatus = (state: AppState, contractId: string | undefined): AppState => {
    if (!contractId || !state.contracts) return state;

    const contract = state.contracts.find(c => c.id === contractId);
    if (!contract || contract.status === ContractStatus.TERMINATED) return state;

    const totalPaid = state.transactions
        .filter(t => t.contractId === contractId)
        .reduce((sum, t) => sum + t.amount, 0);

    const isFullyPaid = totalPaid >= (contract.totalAmount - 1.0);

    let newStatus = contract.status;

    if (isFullyPaid && contract.status === ContractStatus.ACTIVE) {
        newStatus = ContractStatus.COMPLETED;
    } else if (!isFullyPaid && contract.status === ContractStatus.COMPLETED) {
        newStatus = ContractStatus.ACTIVE;
    }

    if (newStatus !== contract.status) {
        const newContracts = state.contracts.map(c => c.id === contractId ? { ...c, status: newStatus } : c);
        return { ...state, contracts: newContracts };
    }
    return state;
};

const applyTransactionEffect = (state: AppState, tx: Transaction, isAdd: boolean): AppState => {
    const factor = isAdd ? 1 : -1;
    let newState = { ...state };

    // 1. Account Balances
    newState.accounts = newState.accounts.map(acc => {
        let change = 0;
        if (tx.type === TransactionType.INCOME && acc.id === tx.accountId) change = tx.amount;
        else if (tx.type === TransactionType.EXPENSE && acc.id === tx.accountId) change = -tx.amount;
        else if (tx.type === TransactionType.TRANSFER) {
            if (acc.id === tx.fromAccountId) change = -tx.amount;
            if (acc.id === tx.toAccountId) change = tx.amount;
        }
        else if (tx.type === TransactionType.LOAN && acc.id === tx.accountId) {
            if (tx.subtype === LoanSubtype.RECEIVE || tx.subtype === LoanSubtype.COLLECT) change = tx.amount;
            else change = -tx.amount;
        }

        if (change !== 0) return { ...acc, balance: acc.balance + (change * factor) };
        return acc;
    });

    // 2. Invoice Status
    if (tx.invoiceId) {
        newState.invoices = newState.invoices.map(inv => {
            if (inv.id === tx.invoiceId) {
                const newPaid = Math.max(0, (inv.paidAmount || 0) + (tx.amount * factor));
                let newStatus = inv.status;
                if (newPaid >= inv.amount - 0.1) newStatus = InvoiceStatus.PAID;
                else if (newPaid > 0.1) newStatus = InvoiceStatus.PARTIALLY_PAID;
                else newStatus = InvoiceStatus.UNPAID;
                return { ...inv, paidAmount: newPaid, status: newStatus };
            }
            return inv;
        });
    }

    // 3. Bill Status
    if (tx.billId) {
        newState.bills = newState.bills.map(b => {
            if (b.id === tx.billId) {
                const newPaid = Math.max(0, (b.paidAmount || 0) + (tx.amount * factor));
                let newStatus = b.status;
                // Use consistent threshold of 0.01 for "fully paid" check
                const threshold = 0.01;
                const wasFullyPaid = (b.paidAmount || 0) >= b.amount - threshold;
                const isNowFullyPaid = newPaid >= b.amount - threshold;

                if (newPaid >= b.amount - threshold) newStatus = InvoiceStatus.PAID;
                else if (newPaid > threshold) newStatus = InvoiceStatus.PARTIALLY_PAID;
                else newStatus = InvoiceStatus.UNPAID;

                // NOTE: Refunds no longer use bills - they are tracked directly via transactions
                // Sales Return status is updated in the refund payment handler

                return { ...b, paidAmount: newPaid, status: newStatus };
            }
            return b;
        });
    }

    return newState;
};

// Helper for log creation
const createLogEntry = (action: TransactionLogEntry['action'], entityType: TransactionLogEntry['entityType'], entityId: string, description: string, user: User | null, data?: any): TransactionLogEntry => ({
    id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
    timestamp: new Date().toISOString(),
    action,
    entityType,
    entityId,
    description,
    userId: user?.id || 'system',
    userLabel: user?.name || 'System',
    data
});

const reducer = (state: AppState, action: AppAction): AppState => {
    // Real-time sync is now handled via Socket.IO in the backend with tenant isolation
    // but some actions like DELETE need to run logic. However, for SYNC_REQUEST (SET_STATE), we just replace state.
    // For single actions broadcasted, we apply them normally.

    switch (action.type) {
        case 'SET_STATE':
            return { ...state, ...action.payload };
        case 'BATCH_UPSERT_ENTITIES': {
            const entities = action.payload;
            let newState = { ...state };

            for (const [entityKey, items] of Object.entries(entities)) {
                if (!Array.isArray(items)) continue;

                // Get the current array from state
                const currentArray = (newState as any)[entityKey];
                if (!Array.isArray(currentArray)) continue;

                // Create a map for fast lookup
                const itemMap = new Map(currentArray.map(item => [item.id, item]));

                // Upsert items from payload
                items.forEach(item => {
                    itemMap.set(item.id, { ...(itemMap.get(item.id) || {}), ...item });
                });

                // Update state with new array
                (newState as any)[entityKey] = Array.from(itemMap.values());
            }

            return newState;
        }
        case 'SET_PAGE':
            return { ...state, currentPage: action.payload };
        case 'LOGIN':
            return { ...state, currentUser: action.payload, currentPage: 'dashboard' };
        case 'LOGOUT':
            return { ...state, currentUser: null, currentPage: 'dashboard' };
        case 'SET_INITIAL_TABS':
            return { ...state, initialTabs: action.payload };
        case 'CLEAR_INITIAL_TABS':
            return { ...state, initialTabs: [] };
        case 'SET_INITIAL_TRANSACTION_TYPE':
            return { ...state, initialTransactionType: action.payload };
        case 'CLEAR_INITIAL_TRANSACTION_TYPE':
            return { ...state, initialTransactionType: null };
        case 'SET_INITIAL_TRANSACTION_FILTER':
            return { ...state, initialTransactionFilter: action.payload };
        case 'SET_INITIAL_IMPORT_TYPE':
            return { ...state, initialImportType: action.payload };
        case 'CLEAR_INITIAL_IMPORT_TYPE':
            return { ...state, initialImportType: null };
        case 'SET_EDITING_ENTITY':
            return { ...state, editingEntity: action.payload };
        case 'CLEAR_EDITING_ENTITY':
            return { ...state, editingEntity: null };
        case 'SET_UPDATE_AVAILABLE':
            return state;
        case 'UPDATE_INVOICE_TEMPLATE':
            return { ...state, invoiceHtmlTemplate: action.payload };

        // --- TRANSACTION HANDLERS ---
        case 'ADD_TRANSACTION': {
            const tx = action.payload as Transaction;

            // Deduplicate: check if transaction with same ID exists
            const existingTxIndex = state.transactions.findIndex(t => t.id === tx.id);
            if (existingTxIndex >= 0) {
                // If it's a remote update or we already have it, just update it if needed or ignore
                // For transactions, we usually want to update it to ensure we have latest status/amounts
                const updatedTransactions = [...state.transactions];
                updatedTransactions[existingTxIndex] = { ...updatedTransactions[existingTxIndex], ...tx };

                let newStateWithTx = { ...state, transactions: updatedTransactions };
                // Re-apply effects (careful: this might duplicate effects if not idempotent)
                // However, applyTransactionEffect is usually additive/subtractive based on amounts
                // For deduplication, we should only apply if it was NOT already there, 
                // BUT if the amount changed, we might need to adjust.
                // For now, let's keep it simple: if it exists, replace data but don't re-apply effects 
                // unless we find a reason to. Most ADD_TRANSACTION calls are for NEW things. 
                // Remote ones (from WebSocket/Sync) should use UPDATE_TRANSACTION if they change things.
                return newStateWithTx;
            }

            let newStateWithTx = { ...state, transactions: [...state.transactions, tx] };
            newStateWithTx = applyTransactionEffect(newStateWithTx, tx, true);
            if (tx.contractId) newStateWithTx = updateContractStatus(newStateWithTx, tx.contractId);
            const logEntry = createLogEntry('CREATE', 'Transaction', tx.id, `Created ${tx.type}: ${tx.description} (${tx.amount})`, state.currentUser, tx);
            newStateWithTx.transactionLog = [logEntry, ...(state.transactionLog || [])];
            return newStateWithTx;
        }

        case 'UPDATE_TRANSACTION': {
            const updatedTx = action.payload as Transaction;
            const originalTx = state.transactions.find(t => t.id === updatedTx.id);
            if (!originalTx) return state;
            let tempState = applyTransactionEffect(state, originalTx, false);
            tempState = applyTransactionEffect(tempState, updatedTx, true);
            tempState.transactions = tempState.transactions.map(t => t.id === updatedTx.id ? updatedTx : t);
            if (originalTx.contractId) tempState = updateContractStatus(tempState, originalTx.contractId);
            if (updatedTx.contractId && updatedTx.contractId !== originalTx.contractId) tempState = updateContractStatus(tempState, updatedTx.contractId);
            else if (updatedTx.contractId) tempState = updateContractStatus(tempState, updatedTx.contractId);
            const logEntry = createLogEntry('UPDATE', 'Transaction', updatedTx.id, `Updated ${updatedTx.type}: ${updatedTx.description}`, state.currentUser, { original: originalTx, new: updatedTx });
            tempState.transactionLog = [logEntry, ...(state.transactionLog || [])];
            return tempState;
        }

        case 'DELETE_TRANSACTION': {
            const txId = action.payload;
            const tx = state.transactions.find(t => t.id === txId);
            if (!tx) return state;
            const newStateWithoutTx = { ...state, transactions: state.transactions.filter(t => t.id !== txId) };
            const finalState = applyTransactionEffect(newStateWithoutTx, tx, false);
            if (tx.contractId) Object.assign(finalState, updateContractStatus(finalState, tx.contractId));
            const logEntry = createLogEntry('DELETE', 'Transaction', tx.id, `Deleted ${tx.type}: ${tx.description}`, state.currentUser, tx);
            finalState.transactionLog = [logEntry, ...(state.transactionLog || [])];
            return finalState;
        }

        case 'BATCH_ADD_TRANSACTIONS': {
            const txs = action.payload as Transaction[];
            let batchState = { ...state, transactions: [...state.transactions, ...txs] };
            txs.forEach(tx => {
                batchState = applyTransactionEffect(batchState, tx, true);
                if (tx.contractId) batchState = updateContractStatus(batchState, tx.contractId);
            });
            const logEntry = createLogEntry('CREATE', 'Transaction', 'BATCH', `Batch added ${txs.length} transactions`, state.currentUser);
            batchState.transactionLog = [logEntry, ...(state.transactionLog || [])];
            return batchState;
        }

        case 'RESTORE_TRANSACTION': {
            const txToRestore = action.payload as Transaction;
            if (state.transactions.find(t => t.id === txToRestore.id)) return state; // Already exists
            let restoredState = { ...state, transactions: [...state.transactions, txToRestore] };
            restoredState = applyTransactionEffect(restoredState, txToRestore, true);
            if (txToRestore.contractId) restoredState = updateContractStatus(restoredState, txToRestore.contractId);
            const logEntry = createLogEntry('RESTORE', 'Transaction', txToRestore.id, `Restored ${txToRestore.type}: ${txToRestore.description}`, state.currentUser, txToRestore);
            restoredState.transactionLog = [logEntry, ...(state.transactionLog || [])];
            return restoredState;
        }

        // --- ACCOUNT HANDLERS ---
        case 'ADD_ACCOUNT':
            return { ...state, accounts: [...state.accounts, action.payload] };
        case 'UPDATE_ACCOUNT':
            return { ...state, accounts: state.accounts.map(a => a.id === action.payload.id ? action.payload : a) };
        case 'DELETE_ACCOUNT':
            return { ...state, accounts: state.accounts.filter(a => a.id !== action.payload) };

        // --- CONTACT HANDLERS ---
        case 'ADD_CONTACT': {
            const contactToAdd = {
                ...action.payload,
                userId: action.payload?.userId || state.currentUser?.id || undefined,
                createdAt: action.payload?.createdAt || new Date().toISOString(),
                updatedAt: action.payload?.updatedAt || new Date().toISOString()
            };
            // Prevent duplicate contacts by ID
            if (state.contacts.find(c => c.id === contactToAdd.id)) {
                return state; // Already exists
            }
            return { ...state, contacts: [...state.contacts, contactToAdd] };
        }
        case 'UPDATE_CONTACT':
            return { ...state, contacts: state.contacts.map(c => c.id === action.payload.id ? action.payload : c) };
        case 'DELETE_CONTACT':
            return { ...state, contacts: state.contacts.filter(c => c.id !== action.payload) };

        // --- VENDOR HANDLERS ---
        case 'ADD_VENDOR': {
            const vendorToAdd = {
                ...action.payload,
                userId: action.payload?.userId || state.currentUser?.id || undefined,
                createdAt: action.payload?.createdAt || new Date().toISOString(),
                updatedAt: action.payload?.updatedAt || new Date().toISOString()
            };
            if (state.vendors.find(v => v.id === vendorToAdd.id)) {
                return { ...state, vendors: state.vendors.map(v => v.id === vendorToAdd.id ? vendorToAdd : v) };
            }
            return { ...state, vendors: [...state.vendors, vendorToAdd] };
        }
        case 'UPDATE_VENDOR':
            return { ...state, vendors: state.vendors.map(v => v.id === action.payload.id ? action.payload : v) };
        case 'DELETE_VENDOR':
            return { ...state, vendors: state.vendors.filter(v => v.id !== action.payload) };

        // --- ENTITY HANDLERS (Projects, Buildings, etc) ---
        case 'ADD_PROJECT':
            // Check if project already exists (prevents duplicates from WebSocket events)
            const existingProject = state.projects.find(p => p.id === action.payload.id);
            if (existingProject) {
                // If exists, update it instead of adding duplicate
                return { ...state, projects: state.projects.map(p => p.id === action.payload.id ? action.payload : p) };
            }
            return { ...state, projects: [...state.projects, action.payload] };
        case 'UPDATE_PROJECT':
            return { ...state, projects: state.projects.map(p => p.id === action.payload.id ? action.payload : p) };
        case 'DELETE_PROJECT':
            return { ...state, projects: state.projects.filter(p => p.id !== action.payload) };

        case 'ADD_BUILDING':
            // Check if building already exists (prevents duplicates from WebSocket events)
            const existingBuilding = state.buildings.find(b => b.id === action.payload.id);
            if (existingBuilding) {
                // If exists, update it instead of adding duplicate
                return { ...state, buildings: state.buildings.map(b => b.id === action.payload.id ? action.payload : b) };
            }
            return { ...state, buildings: [...state.buildings, action.payload] };
        case 'UPDATE_BUILDING':
            return { ...state, buildings: state.buildings.map(b => b.id === action.payload.id ? action.payload : b) };
        case 'DELETE_BUILDING':
            return { ...state, buildings: state.buildings.filter(b => b.id !== action.payload) };

        case 'ADD_PROPERTY':
            // Check if property already exists (prevents duplicates from WebSocket events)
            const existingProperty = state.properties.find(p => p.id === action.payload.id);
            if (existingProperty) {
                // If exists, update it instead of adding duplicate
                return { ...state, properties: state.properties.map(p => p.id === action.payload.id ? action.payload : p) };
            }
            return { ...state, properties: [...state.properties, action.payload] };
        case 'UPDATE_PROPERTY':
            return { ...state, properties: state.properties.map(p => p.id === action.payload.id ? action.payload : p) };
        case 'DELETE_PROPERTY':
            return { ...state, properties: state.properties.filter(p => p.id !== action.payload) };

        case 'ADD_UNIT':
            // Check if unit already exists (prevents duplicates from WebSocket events)
            const existingUnit = state.units.find(u => u.id === action.payload.id);
            if (existingUnit) {
                // If exists, update it instead of adding duplicate
                return { ...state, units: state.units.map(u => u.id === action.payload.id ? action.payload : u) };
            }
            return { ...state, units: [...state.units, action.payload] };
        case 'UPDATE_UNIT':
            return { ...state, units: state.units.map(u => u.id === action.payload.id ? action.payload : u) };
        case 'DELETE_UNIT':
            return { ...state, units: state.units.filter(u => u.id !== action.payload) };

        case 'ADD_CATEGORY':
            // Check if category already exists (prevents duplicates from WebSocket events)
            const existingCategory = state.categories.find(c => c.id === action.payload.id);
            if (existingCategory) {
                // If exists, update it instead of adding duplicate
                return { ...state, categories: state.categories.map(c => c.id === action.payload.id ? action.payload : c) };
            }
            return { ...state, categories: [...state.categories, action.payload] };
        case 'UPDATE_CATEGORY':
            return { ...state, categories: state.categories.map(c => c.id === action.payload.id ? action.payload : c) };
        case 'DELETE_CATEGORY':
            return { ...state, categories: state.categories.filter(c => c.id !== action.payload) };

        case 'ADD_USER':
            return { ...state, users: [...state.users, action.payload] };
        case 'UPDATE_USER':
            return { ...state, users: state.users.map(u => u.id === action.payload.id ? action.payload : u) };
        case 'DELETE_USER':
            return { ...state, users: state.users.filter(u => u.id !== action.payload) };

        // --- INVOICE/BILL HANDLERS ---
        case 'ADD_INVOICE':
            if (state.invoices.find(i => i.id === action.payload.id)) {
                return { ...state, invoices: state.invoices.map(i => i.id === action.payload.id ? action.payload : i) };
            }
            return { ...state, invoices: [...state.invoices, action.payload] };
        case 'UPDATE_INVOICE':
            return { ...state, invoices: state.invoices.map(i => i.id === action.payload.id ? action.payload : i) };
        case 'DELETE_INVOICE':
            return { ...state, invoices: state.invoices.filter(i => i.id !== action.payload) };

        case 'ADD_BILL':
            if (state.bills.find(b => b.id === action.payload.id)) {
                return { ...state, bills: state.bills.map(b => b.id === action.payload.id ? action.payload : b) };
            }
            return { ...state, bills: [...state.bills, action.payload] };
        case 'UPDATE_BILL': {
            const updatedBill = action.payload as Bill;
            const originalBill = state.bills.find(b => b.id === updatedBill.id);
            if (!originalBill) return state;

            let newState = { ...state, bills: state.bills.map(b => b.id === updatedBill.id ? updatedBill : b) };

            // Update related PM cycle allocation when bill payment status changes
            const paymentChanged = originalBill.paidAmount !== updatedBill.paidAmount || originalBill.status !== updatedBill.status;
            if (paymentChanged && state.pmCycleAllocations) {
                const relatedAllocation = state.pmCycleAllocations.find(a => a.billId === updatedBill.id);
                if (relatedAllocation) {
                    const updatedAllocation = {
                        ...relatedAllocation,
                        paidAmount: updatedBill.paidAmount || 0,
                        status: updatedBill.status === InvoiceStatus.PAID ? 'paid' :
                            updatedBill.status === InvoiceStatus.PARTIALLY_PAID ? 'partially_paid' : 'unpaid'
                    };
                    newState.pmCycleAllocations = newState.pmCycleAllocations.map(a =>
                        a.id === updatedAllocation.id ? updatedAllocation : a
                    );
                }
            }

            // If contractId is being added or changed, update existing transactions
            const contractIdChanged = updatedBill.contractId !== originalBill.contractId;
            const hasPayments = updatedBill.paidAmount > 0;

            if (contractIdChanged) {
                // If bill had a contract and it's being changed or removed, unlink transactions from old contract
                if (originalBill.contractId) {
                    newState.transactions = newState.transactions.map(tx => {
                        if (tx.billId === updatedBill.id && tx.contractId === originalBill.contractId) {
                            // Remove contractId from transaction (unless it's being set to a new contract)
                            return { ...tx, contractId: updatedBill.contractId || undefined };
                        }
                        return tx;
                    });
                    // Update old contract status
                    newState = updateContractStatus(newState, originalBill.contractId);
                }

                // If bill is being linked to a contract (new or changed), link transactions to new contract
                if (updatedBill.contractId) {
                    // Link all bill transactions to the new contract
                    newState.transactions = newState.transactions.map(tx => {
                        if (tx.billId === updatedBill.id) {
                            return { ...tx, contractId: updatedBill.contractId };
                        }
                        return tx;
                    });

                    // Update contract status to reflect the payments
                    newState = updateContractStatus(newState, updatedBill.contractId);
                }
            }

            return newState;
        }
        case 'DELETE_BILL':
            return { ...state, bills: state.bills.filter(b => b.id !== action.payload) };

        // --- PM CYCLE ALLOCATIONS ---
        case 'ADD_PM_CYCLE_ALLOCATION':
            return {
                ...state,
                pmCycleAllocations: [...(state.pmCycleAllocations || []), action.payload]
            };
        case 'UPDATE_PM_CYCLE_ALLOCATION':
            return {
                ...state,
                pmCycleAllocations: (state.pmCycleAllocations || []).map(a =>
                    a.id === action.payload.id ? action.payload : a
                )
            };
        case 'DELETE_PM_CYCLE_ALLOCATION':
            return {
                ...state,
                pmCycleAllocations: (state.pmCycleAllocations || []).filter(a => a.id !== action.payload)
            };

        case 'ADD_QUOTATION':
            return { ...state, quotations: [...(state.quotations || []), action.payload] };
        case 'UPDATE_QUOTATION':
            return { ...state, quotations: (state.quotations || []).map(q => q.id === action.payload.id ? action.payload : q) };
        case 'DELETE_QUOTATION':
            return { ...state, quotations: (state.quotations || []).filter(q => q.id !== action.payload) };
        case 'ADD_DOCUMENT':
            return { ...state, documents: [...(state.documents || []), action.payload] };
        case 'UPDATE_DOCUMENT':
            return { ...state, documents: (state.documents || []).map(d => d.id === action.payload.id ? action.payload : d) };
        case 'DELETE_DOCUMENT':
            return { ...state, documents: (state.documents || []).filter(d => d.id !== action.payload) };

        case 'ADD_BUDGET':
            return { ...state, budgets: [...state.budgets, action.payload] };
        case 'UPDATE_BUDGET':
            return { ...state, budgets: state.budgets.map(b => b.id === action.payload.id ? action.payload : b) };
        case 'DELETE_BUDGET':
            return { ...state, budgets: state.budgets.filter(b => b.id !== action.payload) };

        // --- AGREEMENT HANDLERS ---
        case 'ADD_RENTAL_AGREEMENT':
            return { ...state, rentalAgreements: [...state.rentalAgreements, action.payload] };
        case 'UPDATE_RENTAL_AGREEMENT':
            return { ...state, rentalAgreements: state.rentalAgreements.map(r => r.id === action.payload.id ? action.payload : r) };
        case 'DELETE_RENTAL_AGREEMENT':
            return { ...state, rentalAgreements: state.rentalAgreements.filter(r => r.id !== action.payload) };

        case 'ADD_PROJECT_AGREEMENT':
            return {
                ...state,
                projectAgreements: [
                    ...state.projectAgreements,
                    { ...action.payload, userId: action.payload?.userId || state.currentUser?.id || undefined }
                ]
            };
        case 'UPDATE_PROJECT_AGREEMENT':
            return { ...state, projectAgreements: state.projectAgreements.map(p => p.id === action.payload.id ? action.payload : p) };
        case 'DELETE_PROJECT_AGREEMENT':
            return { ...state, projectAgreements: state.projectAgreements.filter(p => p.id !== action.payload) };
        case 'CANCEL_PROJECT_AGREEMENT': {
            const { agreementId, penaltyPercentage, penaltyAmount, refundAmount, penaltyCategoryId, salesReturnId } = action.payload;
            const updatedAgreement = state.projectAgreements.find(pa => pa.id === agreementId);
            if (!updatedAgreement) return state;

            // Update agreement status and cancellation details
            const newAgreements = state.projectAgreements.map(pa =>
                pa.id === agreementId ? { ...pa, status: ProjectAgreementStatus.CANCELLED, cancellationDetails: { date: new Date().toISOString(), penaltyAmount, penaltyPercentage, refundAmount } } : pa
            );

            let newState = { ...state, projectAgreements: newAgreements };

            // 1. Update unit status to unsold (clear contactId from units)
            if (updatedAgreement.unitIds && updatedAgreement.unitIds.length > 0) {
                newState.units = newState.units.map(unit => {
                    if (updatedAgreement.unitIds.includes(unit.id)) {
                        return { ...unit, contactId: undefined };
                    }
                    return unit;
                });
            }

            // 2. Zero out pending invoices (set paidAmount = amount to void them for balance sheet)
            const agreementInvoices = newState.invoices.filter(inv => inv.agreementId === agreementId);
            const pendingInvoices = agreementInvoices.filter(inv =>
                inv.status === InvoiceStatus.UNPAID || inv.status === InvoiceStatus.PARTIALLY_PAID
            );

            // Zero out pending invoices by setting paidAmount = amount (voids them for balance sheet)
            // Also add a description to mark them as voided from cancelled agreement
            newState.invoices = newState.invoices.map(inv => {
                if (pendingInvoices.some(pInv => pInv.id === inv.id)) {
                    return {
                        ...inv,
                        paidAmount: inv.amount,
                        status: InvoiceStatus.PAID, // Mark as paid to void them
                        description: `VOIDED (Cancelled Agreement #${updatedAgreement.agreementNumber}) - ${inv.description || ''}`.trim()
                    };
                }
                return inv;
            });

            // 3. Record Penalty - Reduce Unit Selling Income AND add as Penalty Income
            if (penaltyAmount > 0) {
                // Get Unit Selling Income category to reduce it
                const unitSellingCategoryId = updatedAgreement.sellingPriceCategoryId;
                if (!unitSellingCategoryId) {
                    return newState;
                }

                // Find or use Penalty Income category
                let penaltyCategoryId = state.categories.find(c => c.name === 'Penalty Income')?.id;
                if (!penaltyCategoryId) {
                    console.warn('Penalty Income category not found');
                    return newState;
                }

                // Use Cash account for the penalty reduction transaction
                // This ensures the penalty reduction appears in P&L (not excluded like Internal Clearing)
                const cashAccount = state.accounts.find(a => a.name === 'Cash') || state.accounts.find(a => a.type === AccountType.BANK);
                if (!cashAccount) {
                    return newState;
                }

                // Step 1: Reduce Unit Selling Income by penalty amount (expense with Unit Selling Income category)
                // This reduces income in P&L when sales return is processed
                const reduceIncomeByPenaltyTx: Transaction = {
                    id: `reduce-income-penalty-${Date.now()}`,
                    type: TransactionType.EXPENSE, // Expense reduces income (via category)
                    amount: Math.round(penaltyAmount), // Round to whole number
                    date: new Date().toISOString().split('T')[0],
                    description: `Revenue Reduction - Penalty for Cancelled Agreement #${updatedAgreement.agreementNumber}`,
                    accountId: cashAccount.id, // Use Cash account so it appears in P&L
                    contactId: updatedAgreement.clientId,
                    projectId: updatedAgreement.projectId,
                    categoryId: unitSellingCategoryId, // Unit Selling Income category to reduce it
                    agreementId: agreementId
                };
                newState.transactions = [...newState.transactions, reduceIncomeByPenaltyTx];
                newState = applyTransactionEffect(newState, reduceIncomeByPenaltyTx, true);

                // Step 2: Add Penalty as INCOME in Penalty Income category
                const penaltyTx: Transaction = {
                    id: `penalty-${Date.now()}`,
                    type: TransactionType.INCOME, // Penalty is income to company
                    amount: Math.round(penaltyAmount), // Round to whole number
                    date: new Date().toISOString().split('T')[0],
                    description: `Cancellation Penalty - Agreement #${updatedAgreement.agreementNumber} (${penaltyPercentage}% of ${updatedAgreement.sellingPrice.toLocaleString()})`,
                    accountId: cashAccount.id, // Use Cash account (penalty is retained)
                    contactId: updatedAgreement.clientId,
                    projectId: updatedAgreement.projectId,
                    categoryId: penaltyCategoryId, // Penalty Income category
                    agreementId: agreementId
                };
                newState.transactions = [...newState.transactions, penaltyTx];
                newState = applyTransactionEffect(newState, penaltyTx, true);
            }

            // 4. Record Refundable Amount
            // NOTE: We do NOT reduce income by refund amount at this point
            // The refund amount will reduce income only when it's actually paid to the owner
            // This ensures P&L shows correct figures:
            // - After sales return processed: Unit Selling Income = (original income - penalty)
            // - After refund paid: Unit Selling Income = (original income - penalty - refund)
            if (refundAmount > 0) {
                // No transaction is created here - the refund reduction will happen when refund is paid
                // The refund amount is tracked in the Sales Return record
                // When refund is paid via ProjectOwnerPayoutModal, it will:
                // 1. Create an EXPENSE transaction with Unit Selling Income category
                // 2. This will reduce Unit Selling Income in P&L (revenue reduction)
                // 3. Reduce Cash/Bank account (cash outflow)
            }

            return newState;
        }

        case 'ADD_SALES_RETURN':
            return { ...state, salesReturns: [...(state.salesReturns || []), action.payload] };
        case 'UPDATE_SALES_RETURN':
            return { ...state, salesReturns: (state.salesReturns || []).map(sr => sr.id === action.payload.id ? action.payload : sr) };
        case 'DELETE_SALES_RETURN':
            return { ...state, salesReturns: (state.salesReturns || []).filter(sr => sr.id !== action.payload) };
        case 'PROCESS_SALES_RETURN': {
            const returnRecord = state.salesReturns.find(sr => sr.id === action.payload.returnId);
            if (!returnRecord) return state;
            return {
                ...state,
                salesReturns: state.salesReturns.map(sr =>
                    sr.id === action.payload.returnId
                        ? { ...sr, status: SalesReturnStatus.PROCESSED, processedDate: new Date().toISOString() }
                        : sr
                )
            };
        }
        case 'MARK_RETURN_REFUNDED': {
            const returnRecord = state.salesReturns.find(sr => sr.id === action.payload.returnId);
            if (!returnRecord) return state;
            return {
                ...state,
                salesReturns: state.salesReturns.map(sr =>
                    sr.id === action.payload.returnId
                        ? { ...sr, status: SalesReturnStatus.REFUNDED, refundedDate: action.payload.refundDate }
                        : sr
                )
            };
        }
        case 'ADD_CONTRACT':
            return { ...state, contracts: [...(state.contracts || []), action.payload] };
        case 'UPDATE_CONTRACT':
            return { ...state, contracts: (state.contracts || []).map(c => c.id === action.payload.id ? action.payload : c) };
        case 'DELETE_CONTRACT':
            return { ...state, contracts: (state.contracts || []).filter(c => c.id !== action.payload) };

        // --- RECURRING TEMPLATES ---
        case 'ADD_RECURRING_TEMPLATE':
            return { ...state, recurringInvoiceTemplates: [...state.recurringInvoiceTemplates, action.payload] };
        case 'UPDATE_RECURRING_TEMPLATE':
            return { ...state, recurringInvoiceTemplates: state.recurringInvoiceTemplates.map(t => t.id === action.payload.id ? action.payload : t) };
        case 'DELETE_RECURRING_TEMPLATE':
            return { ...state, recurringInvoiceTemplates: state.recurringInvoiceTemplates.filter(t => t.id !== action.payload) };


        // --- SETTINGS ---
        case 'UPDATE_DASHBOARD_CONFIG':
            return { ...state, dashboardConfig: action.payload };
        case 'UPDATE_AGREEMENT_SETTINGS':
            return { ...state, agreementSettings: action.payload };
        case 'UPDATE_PROJECT_AGREEMENT_SETTINGS':
            return { ...state, projectAgreementSettings: action.payload };
        case 'UPDATE_RENTAL_INVOICE_SETTINGS':
            return { ...state, rentalInvoiceSettings: action.payload };
        case 'UPDATE_PROJECT_INVOICE_SETTINGS':
            return { ...state, projectInvoiceSettings: action.payload };
        case 'UPDATE_PRINT_SETTINGS':
            return { ...state, printSettings: action.payload };
        case 'UPDATE_WHATSAPP_TEMPLATES':
            return { ...state, whatsAppTemplates: action.payload };
        case 'ADD_INSTALLMENT_PLAN':
            return { ...state, installmentPlans: [...state.installmentPlans, action.payload] };
        case 'UPDATE_INSTALLMENT_PLAN':
            return { ...state, installmentPlans: state.installmentPlans.map(p => p.id === action.payload.id ? action.payload : p) };
        case 'DELETE_INSTALLMENT_PLAN':
            return { ...state, installmentPlans: state.installmentPlans.filter(p => p.id !== action.payload) };
        case 'ADD_PLAN_AMENITY':
            return { ...state, planAmenities: [...(state.planAmenities || []), action.payload] };
        case 'UPDATE_PLAN_AMENITY':
            return { ...state, planAmenities: (state.planAmenities || []).map(a => a.id === action.payload.id ? action.payload : a) };
        case 'DELETE_PLAN_AMENITY':
            return { ...state, planAmenities: (state.planAmenities || []).filter(a => a.id !== action.payload) };

        case 'UPDATE_PM_COST_PERCENTAGE':
            return { ...state, pmCostPercentage: action.payload };
        case 'UPDATE_DEFAULT_PROJECT':
            return { ...state, defaultProjectId: action.payload };
        case 'SET_LAST_SERVICE_CHARGE_RUN':
            return { ...state, lastServiceChargeRun: action.payload };

        case 'TOGGLE_SYSTEM_TRANSACTIONS': return { ...state, showSystemTransactions: action.payload };
        case 'TOGGLE_COLOR_CODING': return { ...state, enableColorCoding: action.payload };
        case 'TOGGLE_BEEP_ON_SAVE': return { ...state, enableBeepOnSave: action.payload };
        case 'TOGGLE_DATE_PRESERVATION': return { ...state, enableDatePreservation: action.payload };
        case 'UPDATE_PRESERVED_DATE': return { ...state, lastPreservedDate: action.payload };

        case 'ADD_ERROR_LOG':
            return { ...state, errorLog: [action.payload, ...state.errorLog].slice(0, 50) };
        case 'CLEAR_ERROR_LOG':
            return { ...state, errorLog: [] };

        case 'RESET_TRANSACTIONS': {
            const logEntry = createLogEntry('CLEAR_ALL', 'Transactions', undefined, 'Cleared all transactions, invoices, bills, contracts, agreements, and sales returns', state.currentUser, undefined);
            return {
                ...state,
                transactions: [],
                invoices: [],
                bills: [],
                contracts: [],
                rentalAgreements: [],
                projectAgreements: [],
                salesReturns: [],
                // Preserve settings: recurringInvoiceTemplates, accounts (balances reset), contacts, categories, projects, buildings, properties, units
                accounts: state.accounts.map(acc => ({ ...acc, balance: 0 })),
                transactionLog: [logEntry, ...(state.transactionLog || [])]
            };
        }
        case 'LOAD_SAMPLE_DATA':
            // Return initial state (or a sample set if defined)
            return { ...initialState, users: state.users, printSettings: state.printSettings }; // Keep users/settings

        default:
            return state;
    }
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // Get auth status - must be called unconditionally at top level
    // AuthProvider wraps AppProvider in index.tsx, so this should work
    const auth = useAuth();

    // Track previous auth state to detect when user re-authenticates
    const prevAuthRef = React.useRef<boolean>(false);
    const prevTenantIdRef = React.useRef<string | null>(null);
    const isAuthenticated = auth.isAuthenticated;

    // Track tenant ID to detect tenant switches
    // Read directly from localStorage to avoid circular dependency issues
    const currentTenantId = React.useMemo(() => {
        try {
            if (typeof window !== 'undefined') {
                return localStorage.getItem('tenant_id');
            }
            return null;
        } catch (error) {
            console.warn('Failed to get tenant ID:', error);
            return null;
        }
    }, [isAuthenticated]);

    const [isInitializing, setIsInitializing] = useState(true);
    const [isInitialDataLoading, setIsInitialDataLoading] = useState(false);
    const [initMessage, setInitMessage] = useState('Initializing application...');
    const [initProgress, setInitProgress] = useState(0);
    const [useFallback, setUseFallback] = useState(false);
    const [initError, setInitError] = useState<string | null>(null);
    const [loadProgress, setLoadProgress] = useState<{ loaded: number; total: number } | null>(null);

    // 1. Initialize State with Database (with fallback to localStorage)
    // Hooks must be called unconditionally - always call both hooks
    // Then use the appropriate one based on useFallback state
    // Add error boundary logging before hooks

    const [dbState, setDbState, dbStateHelpers] = useDatabaseState<AppState>('finance_app_state_v4', initialState);
    const [fallbackState, setFallbackState] = useDatabaseStateFallback<AppState>('finance_app_state_v4', initialState);


    // Initialize storedState safely - use initialState as fallback if hooks aren't ready
    const storedState = (useFallback ? fallbackState : dbState) || initialState;
    const setStoredState = useFallback ? setFallbackState : setDbState;
    // Single saver contract: persist only via hook’s saveNow (see doc/DB_STATE_LOADER_SAVER_CONTRACT.md)
    const saveNow = dbStateHelpers?.saveNow;

    // Use a ref to track storedState to avoid initialization issues in dependency arrays
    // Initialize ref with initialState to ensure it's always defined
    const storedStateRef = useRef<AppState>(initialState);
    // Ref for dispatch so init effect (declared before useReducer) can update reducer when background sync completes
    const dispatchRef = useRef<React.Dispatch<AppAction> | null>(null);
    useEffect(() => {
        if (storedState) {
            storedStateRef.current = storedState;
        }
    }, [storedState]);

    // 2. Version check and logout on version update or app relaunch
    useEffect(() => {
        const VERSION_STORAGE_KEY = 'app_version';
        const SESSION_FLAG_KEY = 'app_session_active';
        const currentVersion = packageJson.version;

        // Check if app was just launched (no session flag) or version changed
        const isAppRelaunched = !sessionStorage.getItem(SESSION_FLAG_KEY);
        const storedVersion = localStorage.getItem(VERSION_STORAGE_KEY);
        const versionChanged = storedVersion !== null && storedVersion !== currentVersion;
        const isFirstInstall = storedVersion === null;

        // Always update version if it doesn't exist or changed
        if (isFirstInstall || versionChanged) {
            localStorage.setItem(VERSION_STORAGE_KEY, currentVersion);
        }

        // Logout user if app relaunched OR version changed
        // Use functional update to avoid accessing storedState before initialization
        setStoredState(prev => {
            if (prev.currentUser && (isAppRelaunched || versionChanged)) {
                const reason = versionChanged ? `Version changed (${storedVersion} -> ${currentVersion})` : 'Application relaunched';
                return { ...prev, currentUser: null };
            }
            return prev;
        });

        // Also clear from database if needed (check after state update)
        if (isAppRelaunched || versionChanged) {
            // Clear from database if available (async, don't block)
            (async () => {
                try {
                    const dbService = getDatabaseService();
                    if (dbService.isReady()) {
                        const appStateRepo = await getAppStateRepository();
                        const currentState = await appStateRepo.loadState();
                        if (currentState.currentUser) {
                            currentState.currentUser = null;
                            await appStateRepo.saveState(currentState, true);
                            logger.logCategory('database', '✅ Cleared user from database');
                        }
                    }
                } catch (error) {
                    logger.warnCategory('database', '⚠️ Could not clear user from database:', error);
                }
            })();
        }

        // Set session flag to indicate app is running
        sessionStorage.setItem(SESSION_FLAG_KEY, 'true');

        // Clear session flag when page unloads (app closes)
        const handleBeforeUnload = () => {
            sessionStorage.removeItem(SESSION_FLAG_KEY);
        };
        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, []); // Run only once on mount

    // 3. Run migration on mount if needed
    useEffect(() => {
        let isMounted = true;
        let timeoutId: NodeJS.Timeout;
        let forceTimeoutId: NodeJS.Timeout;

        const runMigration = async () => {
            try {

                // Safety timeout - if initialization takes more than 30 seconds, show error
                timeoutId = setTimeout(() => {
                    if (isMounted) {
                        console.warn('⚠️ Initialization timeout - continuing anyway');
                        setInitMessage('Taking longer than expected...');
                    }
                }, 30000);

                // Force continue after 45 seconds no matter what
                forceTimeoutId = setTimeout(() => {
                    if (isMounted) {
                        console.warn('⚠️ Force continuing initialization after 45 seconds');
                        setUseFallback(true);
                        setIsInitializing(false);
                    }
                }, 45000);

                setInitMessage('Checking for data migration...');
                setInitProgress(5);

                if (needsMigration()) {
                    setInitMessage('Migrating data from localStorage to SQL database...');
                    setInitProgress(10);

                    const result = await runAllMigrations((progress, message) => {
                        if (isMounted) {
                            setInitProgress(progress);
                            setInitMessage(message);
                        }
                    });

                    if (!isMounted) return;
                    if (timeoutId) clearTimeout(timeoutId);
                    if (forceTimeoutId) clearTimeout(forceTimeoutId);

                    if (!result.success) {
                        const errorMsg = result.error || 'Migration failed';
                        setInitMessage(`Migration error: ${errorMsg}`);
                        console.error('Migration failed:', result.error);
                        // Still continue - user can retry later
                        setTimeout(() => {
                            if (isMounted) setIsInitializing(false);
                        }, 2000);
                    } else if (result.migrated) {
                        const recordCount = Object.values(result.recordCounts || {}).reduce((a, b) => a + b, 0);

                        // Reload state after migration
                        setInitMessage(`Loading migrated data (${recordCount} records)...`);
                        setInitProgress(95);
                        const appStateRepo = await getAppStateRepository();
                        const migratedState = await appStateRepo.loadState();

                        if (isMounted) {
                            setStoredState(migratedState as AppState);
                            setInitProgress(100);
                            setInitMessage('Migration completed successfully!');
                            setTimeout(() => setIsInitializing(false), 800);
                        }
                    } else {
                        // No migration needed
                        setInitProgress(100);
                        setInitMessage('Ready!');
                        setTimeout(() => {
                            if (isMounted) setIsInitializing(false);
                        }, 300);
                    }
                } else {
                    // No migration needed, just loading
                    setInitMessage('Loading application data...');
                    setInitProgress(50);

                    // Check if user is authenticated (cloud mode)
                    if (isAuthenticated) {
                        // OFFLINE-FIRST: Load from local DB first, show UI, then sync with cloud in background
                        try {
                            const { apiClient } = await import('../services/api/client');
                            const currentTenantId = apiClient.getTenantId();

                            // CRITICAL: Restore offline transactions from sync queue before any load
                            let offlineTransactions: Transaction[] = [];
                            let offlineContacts: Contact[] = [];
                            let offlineInvoices: Invoice[] = [];
                            let offlineBills: Bill[] = [];
                            let offlineAccounts: Account[] = [];
                            let offlineCategories: Category[] = [];
                            let offlineVendors: Vendor[] = [];
                            let offlineRecurringTemplates: RecurringInvoiceTemplate[] = [];

                            try {
                                const syncQueue = getSyncQueue();
                                if (currentTenantId) {
                                    const pendingItems = await syncQueue.getPendingItems(currentTenantId);
                                    logger.logCategory('sync', `📦 Found ${pendingItems.length} pending sync items to restore`);
                                    for (const item of pendingItems) {
                                        if (item.type === 'transaction' && item.action === 'create') {
                                            offlineTransactions.push(item.data as Transaction);
                                        } else if (item.type === 'contact' && item.action === 'create') {
                                            offlineContacts.push(item.data as Contact);
                                        } else if (item.type === 'invoice' && item.action === 'create') {
                                            offlineInvoices.push(item.data as Invoice);
                                        } else if (item.type === 'bill' && item.action === 'create') {
                                            offlineBills.push(item.data as Bill);
                                        } else if (item.type === 'account' && item.action === 'create') {
                                            offlineAccounts.push(item.data as Account);
                                        } else if (item.type === 'category' && item.action === 'create') {
                                            offlineCategories.push(item.data as Category);
                                        } else if (item.type === 'vendor' && item.action === 'create') {
                                            offlineVendors.push(item.data as Vendor);
                                        } else if (item.type === 'recurring_invoice_template' && item.action === 'create') {
                                            offlineRecurringTemplates.push(item.data as RecurringInvoiceTemplate);
                                        }
                                    }
                                    logger.logCategory('sync', `✅ Extracted offline data from sync queue:`, {
                                        transactions: offlineTransactions.length,
                                        contacts: offlineContacts.length,
                                        invoices: offlineInvoices.length,
                                        bills: offlineBills.length,
                                        accounts: offlineAccounts.length,
                                        categories: offlineCategories.length,
                                        vendors: offlineVendors.length,
                                        recurringTemplates: offlineRecurringTemplates.length
                                    });
                                }
                            } catch (syncQueueError) {
                                logger.warnCategory('sync', '⚠️ Could not load sync queue items:', syncQueueError);
                            }

                            // Clear local database ONLY when tenant actually changed (not on every startup)
                            try {
                                const dbService = getDatabaseService();
                                if (dbService.isReady()) {
                                    const { AppSettingsRepository } = await import('../services/database/repositories/index');
                                    const settingsRepo = new AppSettingsRepository();
                                    const localTenantId = settingsRepo.getSetting('tenantId') ?? null;
                                    const effectiveTenantId = (auth.tenant?.id || auth.user?.tenantId) ?? null;

                                    if (effectiveTenantId && localTenantId != null && String(localTenantId) !== String(effectiveTenantId)) {
                                        logger.logCategory('sync', `🔄 Tenant changed (local: ${localTenantId} → current: ${effectiveTenantId}), clearing local DB for new tenant`);
                                        const { ContactsRepository, TransactionsRepository, AccountsRepository,
                                            CategoriesRepository, ProjectsRepository, BuildingsRepository,
                                            PropertiesRepository, UnitsRepository, InvoicesRepository,
                                            BillsRepository, BudgetsRepository, RentalAgreementsRepository,
                                            ProjectAgreementsRepository, ContractsRepository,
                                            QuotationsRepository, DocumentsRepository,
                                            RecurringTemplatesRepository, PMCycleAllocationsRepository,
                                            VendorsRepository } = await import('../services/database/repositories/index');
                                        const repos = [
                                            new ContactsRepository(), new TransactionsRepository(), new AccountsRepository(),
                                            new CategoriesRepository(), new ProjectsRepository(), new BuildingsRepository(),
                                            new PropertiesRepository(), new UnitsRepository(), new InvoicesRepository(),
                                            new BillsRepository(), new BudgetsRepository(), new RentalAgreementsRepository(),
                                            new ProjectAgreementsRepository(), new ContractsRepository(),
                                            new QuotationsRepository(), new DocumentsRepository(),
                                            new RecurringTemplatesRepository(), new PMCycleAllocationsRepository(),
                                            new VendorsRepository()
                                        ];
                                        for (const repo of repos) {
                                            await repo.deleteAllUnfiltered();
                                        }
                                        settingsRepo.setSetting('tenantId', effectiveTenantId);
                                    } else if (effectiveTenantId && (localTenantId == null || localTenantId === '')) {
                                        settingsRepo.setSetting('tenantId', effectiveTenantId);
                                        logger.logCategory('database', '✅ Set tenantId in local settings (first time or was unset)');
                                    } else {
                                        logger.logCategory('database', '✅ Same tenant, not clearing local DB — offline-first: using existing local data');
                                    }
                                }
                            } catch (clearError) {
                                console.warn('⚠️ Could not check/clear local database data:', clearError);
                            }

                            // STEP 1 (offline-first): Load from local DB and show UI immediately
                            try {
                                const dbService = getDatabaseService();
                                if (!dbService.isReady()) {
                                    setInitMessage('Initializing database...');
                                    setInitProgress(60);
                                    await dbService.initialize();
                                    logger.logCategory('database', '✅ Database ready');
                                }
                            } catch (dbError) {
                                logger.warnCategory('database', '⚠️ Database initialization failed, using localStorage fallback:', dbError);
                                setUseFallback(true);
                                setInitMessage('Using localStorage (database unavailable)...');
                            }

                            setInitMessage('Loading application data from database...');
                            setInitProgress(70);
                            try {
                                const appStateRepo = await getAppStateRepository();
                                const loadedState = await appStateRepo.loadState();
                                if (isMounted) {
                                    setStoredState(loadedState as AppState);
                                    logger.logCategory('database', '✅ Database state loaded (offline-first), UI will show from local');
                                }
                            } catch (loadErr) {
                                logger.warnCategory('database', '⚠️ Load from local failed, continuing with current state:', loadErr);
                            }

                            if (!isMounted) return;
                            if (timeoutId) clearTimeout(timeoutId);
                            if (forceTimeoutId) clearTimeout(forceTimeoutId);
                            setInitProgress(100);
                            setInitMessage('Ready!');
                            setTimeout(() => {
                                if (isMounted) setIsInitializing(false);
                            }, 300);

                            // STEP 2: Background sync with cloud — delay start so UI stays responsive, then defer heavy updates
                            const BACKGROUND_SYNC_DELAY_MS = 1000;
                            setTimeout(() => {
                                (async function runBackgroundCloudSync() {
                                    try {
                                        const apiService = getAppStateApiService();
                                        let apiState: Partial<AppState>;
                                        try {
                                            const dbService = getDatabaseService();
                                            let baseline: Partial<AppState> | null = null;
                                            if (dbService.isReady()) {
                                                const appStateRepo = await getAppStateRepository();
                                                baseline = await appStateRepo.loadState();
                                            }
                                            const lastSync = currentTenantId ? getLastSyncTimestamp(currentTenantId) : null;
                                            const hasBaseline = baseline && (
                                                (baseline.projects?.length ?? 0) > 0 ||
                                                (baseline.transactions?.length ?? 0) > 0 ||
                                                (baseline.contacts?.length ?? 0) > 0
                                            );
                                            if (currentTenantId && lastSync && hasBaseline && isLastSyncRecent(currentTenantId)) {
                                                apiState = await apiService.loadStateViaIncrementalSync(lastSync, baseline as Partial<AppState>);
                                                logger.logCategory('sync', '[CloudSync] Background: used incremental sync, entities:', Object.keys(apiState || {}).filter(k => Array.isArray((apiState as any)?.[k])).join(', '));
                                            } else {
                                                const syncManager = getSyncManager();
                                                try {
                                                    apiState = await apiService.loadStateBulkChunked(
                                                        (loaded, total) => syncManager.setPullProgress(loaded, total || null),
                                                        200
                                                    );
                                                    syncManager.clearPullProgress();
                                                    logger.logCategory('sync', '[CloudSync] Background: full bulk load done, entities:', Object.keys(apiState || {}).filter(k => Array.isArray((apiState as any)?.[k])).join(', '));
                                                } catch (chunkErr) {
                                                    logger.warnCategory('sync', '[CloudSync] Chunked load failed, falling back to loadState:', chunkErr);
                                                    console.error('[CloudSync] loadStateBulkChunked failed:', chunkErr);
                                                    syncManager.clearPullProgress();
                                                    apiState = await apiService.loadState();
                                                }
                                            }
                                        } catch (incErr) {
                                            logger.warnCategory('sync', '⚠️ Background incremental sync failed, full load:', incErr);
                                            console.error('[CloudSync] Incremental sync failed, attempting full load:', incErr);
                                            if (currentTenantId) clearLastSyncTimestamp(currentTenantId);
                                            getSyncManager().clearPullProgress();
                                            const syncManager = getSyncManager();
                                            try {
                                                apiState = await apiService.loadStateBulkChunked(
                                                    (loaded, total) => syncManager.setPullProgress(loaded, total || null),
                                                    200
                                                );
                                                syncManager.clearPullProgress();
                                            } catch (chunkErr) {
                                                logger.warnCategory('sync', '⚠️ Chunked load failed, falling back to loadState:', chunkErr);
                                                console.error('[CloudSync] Chunked load failed (fallback to loadState):', chunkErr);
                                                syncManager.clearPullProgress();
                                                apiState = await apiService.loadState();
                                            }
                                        }
                                        if (currentTenantId) {
                                            setLastSyncTimestamp(currentTenantId, new Date().toISOString());
                                        }

                                        const apiTransactionsMap = new Map((apiState.transactions || []).map(tx => [tx.id, tx]));
                                        const apiContactsMap = new Map((apiState.contacts || []).map(c => [c.id, c]));
                                        const apiInvoicesMap = new Map((apiState.invoices || []).map(i => [i.id, i]));
                                        const apiBillsMap = new Map((apiState.bills || []).map(b => [b.id, b]));
                                        const apiAccountsMap = new Map((apiState.accounts || []).map(a => [a.id, a]));
                                        const apiCategoriesMap = new Map((apiState.categories || []).map(c => [c.id, c]));
                                        const apiVendorsMap = new Map((apiState.vendors || []).map(v => [v.id, v]));
                                        for (const t of offlineTransactions) apiTransactionsMap.set(t.id, t);
                                        for (const c of offlineContacts) apiContactsMap.set(c.id, c);
                                        for (const i of offlineInvoices) apiInvoicesMap.set(i.id, i);
                                        for (const b of offlineBills) apiBillsMap.set(b.id, b);
                                        for (const a of offlineAccounts) apiAccountsMap.set(a.id, a);
                                        for (const c of offlineCategories) apiCategoriesMap.set(c.id, c);
                                        for (const v of offlineVendors) apiVendorsMap.set(v.id, v);
                                        const apiRecurringTemplatesMap = new Map((apiState.recurringInvoiceTemplates || []).map(t => [t.id, t]));
                                        for (const t of offlineRecurringTemplates) apiRecurringTemplatesMap.set(t.id, t);
                                        const mergedRecurringTemplates = Array.from(apiRecurringTemplatesMap.values());

                                        const fullState: AppState = {
                                            ...storedStateRef.current,
                                            accounts: Array.from(apiAccountsMap.values()),
                                            contacts: Array.from(apiContactsMap.values()),
                                            transactions: Array.from(apiTransactionsMap.values()),
                                            categories: Array.from(apiCategoriesMap.values()),
                                            projects: apiState.projects || [],
                                            buildings: apiState.buildings || [],
                                            properties: apiState.properties || [],
                                            units: apiState.units || [],
                                            invoices: Array.from(apiInvoicesMap.values()),
                                            bills: Array.from(apiBillsMap.values()),
                                            budgets: apiState.budgets || [],
                                            rentalAgreements: apiState.rentalAgreements || [],
                                            projectAgreements: apiState.projectAgreements || [],
                                            installmentPlans: apiState.installmentPlans || [],
                                            planAmenities: apiState.planAmenities || [],
                                            contracts: apiState.contracts || [],
                                            salesReturns: apiState.salesReturns || [],
                                            quotations: apiState.quotations || [],
                                            documents: apiState.documents || [],
                                            recurringInvoiceTemplates: mergedRecurringTemplates,
                                            pmCycleAllocations: apiState.pmCycleAllocations || [],
                                            vendors: Array.from(apiVendorsMap.values()),
                                            transactionLog: apiState.transactionLog || [],
                                        };

                                        // Defer heavy state update and save so main thread stays responsive.
                                        const applyUpdate = () => {
                                            setStoredState(fullState);
                                            dispatchRef.current?.({ type: 'SET_STATE', payload: fullState, _isRemote: true } as any);
                                            const dbReady = !useFallback && getDatabaseService().isReady() && saveNow;
                                            logger.logCategory('sync', `[CloudSync] Merged API state: accounts=${fullState.accounts?.length ?? 0} contacts=${fullState.contacts?.length ?? 0} transactions=${fullState.transactions?.length ?? 0} installmentPlans=${fullState.installmentPlans?.length ?? 0} pmCycleAllocations=${fullState.pmCycleAllocations?.length ?? 0} | willSaveToLocal=${!!dbReady}`);
                                            if (dbReady) {
                                                saveNow(fullState, { disableSyncQueueing: true }).then(() => {
                                                    logger.logCategory('sync', '[CloudSync] Background sync: saved to local SQLite successfully');
                                                }).catch((saveError: unknown) => {
                                                    console.warn('[CloudSync] Background sync: could not save to local database:', saveError);
                                                });
                                            } else {
                                                logger.logCategory('sync', '[CloudSync] Background sync: skipping local save (useFallback or db not ready)');
                                            }
                                        };
                                        if (typeof requestIdleCallback !== 'undefined') {
                                            requestIdleCallback(applyUpdate, { timeout: 200 });
                                        } else {
                                            setTimeout(applyUpdate, 0);
                                        }
                                    } catch (bgError) {
                                        logger.warnCategory('sync', '⚠️ Background cloud sync failed (app continues with local data):', bgError);
                                        console.error('[CloudSync] Background sync error (check network, API URL, auth):', bgError);
                                    }
                                })();
                            }, BACKGROUND_SYNC_DELAY_MS);
                        } catch (initError) {
                            console.error('⚠️ Authenticated init error:', initError);
                            setInitMessage('Using local data...');
                            if (!isMounted) return;
                            if (timeoutId) clearTimeout(timeoutId);
                            if (forceTimeoutId) clearTimeout(forceTimeoutId);
                            setInitProgress(100);
                            setInitMessage('Ready!');
                            setTimeout(() => {
                                if (isMounted) setIsInitializing(false);
                            }, 300);
                        }
                    } else {
                        // Load from local database (offline mode)
                        // Try to initialize database (but don't fail if it doesn't work)
                        try {
                            const dbService = getDatabaseService();
                            if (!dbService.isReady()) {
                                setInitMessage('Initializing database...');
                                setInitProgress(60);
                                await dbService.initialize();
                                logger.logCategory('database', '✅ Database ready');
                            }
                        } catch (dbError) {
                            logger.warnCategory('database', '⚠️ Database initialization failed, using localStorage fallback:', dbError);
                            setUseFallback(true);
                            setInitMessage('Using localStorage (database unavailable)...');
                            // Continue anyway - app can work without database
                        }

                        // Load state from database explicitly so we know it's in React before finishing init.
                        // (Previously we only checked dbService.isReady(), so UI could show empty state briefly.)
                        setInitMessage('Loading application data from database...');
                        setInitProgress(70);

                        try {
                            const appStateRepo = await getAppStateRepository();
                            const loadedState = await appStateRepo.loadState();
                            if (isMounted) {
                                setStoredState(loadedState as AppState);
                                logger.logCategory('database', '✅ Database state loaded for offline init');
                            }
                        } catch (loadErr) {
                            logger.warnCategory('database', '⚠️ Offline path loadState failed, continuing:', loadErr);
                        }

                        if (!isMounted) return;
                        if (timeoutId) clearTimeout(timeoutId);
                        if (forceTimeoutId) clearTimeout(forceTimeoutId);

                        setInitProgress(100);
                        setInitMessage('Ready!');
                        setTimeout(() => {
                            if (isMounted) setIsInitializing(false);
                        }, 300);
                    }
                }
            } catch (error) {
                if (!isMounted) return;
                if (timeoutId) clearTimeout(timeoutId);
                if (forceTimeoutId) clearTimeout(forceTimeoutId);

                console.error('❌ Initialization error:', error);
                const errorMsg = error instanceof Error ? error.message : 'Unknown initialization error';

                // Log error
                try {
                    const { getErrorLogger } = await import('../services/errorLogger');
                    getErrorLogger().logError(error instanceof Error ? error : new Error(String(error)), {
                        errorType: 'initialization',
                        componentStack: 'AppProvider initialization'
                    });
                } catch (logError) {
                    console.error('Failed to log initialization error:', logError);
                }

                setInitMessage(`⚠️ Warning: ${errorMsg}. Using localStorage fallback.`);
                // Switch to fallback mode
                setUseFallback(true);
                // Still allow app to continue with initial state - don't block the UI
                setTimeout(() => {
                    if (isMounted) {
                        setIsInitializing(false);
                    }
                }, 2000);
            }
        };

        runMigration();

        return () => {
            isMounted = false;
            if (timeoutId) clearTimeout(timeoutId);
            if (forceTimeoutId) clearTimeout(forceTimeoutId);
        };
    }, []);

    // 2. Wrap Reducer to Persist - OPTIMIZED: Skip sync for navigation actions
    const reducerWithPersistence = useCallback((state: AppState, action: AppAction) => {
        const newState = reducer(state, action);

        // Optimization: If state didn't change (e.g. duplicate add), do nothing (no sync, no persistence)
        if (newState === state) {
            return newState;
        }

        // Sync to API if authenticated (cloud mode)
        // IMPORTANT: Only organization data is synced, not user-specific preferences
        if (isAuthenticated && !(action as any)._isRemote) {
            // Skip user-specific actions (UI preferences, navigation, etc.)
            // These include: enableBeepOnSave, dashboardConfig, defaultProjectId, etc.
            if (!shouldSyncAction(action)) {
                return newState;
            }

            // Only trigger API sync for organization data actions
            // User preferences (enableBeepOnSave, dashboardConfig, defaultProjectId, etc.) are NOT synced
            // PERFORMANCE: SYNC_TO_API_ACTIONS is now a module-level constant (avoids
            // re-creating a 60+ entry Set on every dispatch call)

            if (!SYNC_TO_API_ACTIONS.has(action.type)) {
                return newState;
            }

            const getDeleteSyncTarget = (action: AppAction): { type: SyncOperationType; id: string } | null => {
                switch (action.type) {
                    case 'DELETE_INVOICE':
                        return { type: 'invoice', id: action.payload as string };
                    case 'DELETE_TRANSACTION':
                        return { type: 'transaction', id: action.payload as string };
                    case 'DELETE_RECURRING_TEMPLATE':
                        return { type: 'recurring_invoice_template', id: action.payload as string };
                    default:
                        return null;
                }
            };

            const prunePendingSyncItems = async (currentUser: User | null, action: AppAction) => {
                const target = getDeleteSyncTarget(action);
                const tenantId = currentUser?.tenant?.id;
                if (!target || !tenantId) return;

                try {
                    const removed = await getSyncQueue().removePendingByEntity(tenantId, target.type, target.id);
                    if (removed > 0) {
                        logger.logCategory('sync', `🧹 Removed ${removed} pending sync item(s) for ${target.type}:${target.id}`);
                    }
                } catch (error) {
                    logger.warnCategory('sync', '⚠️ Failed to prune pending sync items:', error);
                }
            };

            // Sync to API asynchronously (don't block UI)
            const syncToApi = async () => {
                logger.logCategory('sync', `🚀 syncToApi called for action: ${action.type}`, {
                    actionType: action.type,
                    isAuthenticated: isAuthenticated,
                    hasToken: !!localStorage.getItem('auth_token')
                });

                try {
                    // Check if user is authenticated before syncing
                    if (!isAuthenticated) {
                        logger.logCategory('sync', '⏭️ Skipping API sync - user not authenticated');
                        return;
                    }

                    // Verify token is valid before attempting sync
                    const token = localStorage.getItem('auth_token');
                    if (!token) {
                        logger.warnCategory('sync', '⚠️ No token found, skipping API sync');
                        return;
                    }

                    logger.logCategory('sync', `✅ Authentication check passed, proceeding with sync for action: ${action.type}`);

                    // Check token expiration using ApiClient
                    try {
                        const { apiClient } = await import('../services/api/client');
                        if (apiClient.isTokenExpired()) {
                            logger.warnCategory('sync', '⚠️ Token is expired, skipping API sync. Data saved locally.');
                            return;
                        }
                    } catch (tokenCheckError) {
                        logger.warnCategory('sync', '⚠️ Could not verify token, skipping API sync:', tokenCheckError);
                        return;
                    }

                    // Check online status - queue operation if offline
                    const connectionMonitor = getConnectionMonitor();
                    if (!connectionMonitor.isOnline()) {
                        logger.logCategory('sync', '📴 Device is offline, queuing operation for later sync');
                        await queueOperationForSync(action);
                        return;
                    }

                    await prunePendingSyncItems(state.currentUser, action);

                    const apiService = getAppStateApiService();

                    // Handle account changes
                    if (action.type === 'ADD_ACCOUNT' || action.type === 'UPDATE_ACCOUNT') {
                        const account = action.payload as Account;
                        if (!account.isPermanent) {
                            try {
                                await apiService.saveAccount(account);
                                logger.logCategory('sync', `✅ Synced account ${action.type === 'ADD_ACCOUNT' ? '' : 'update'} to API: ${account.name}`);
                            } catch (err) {
                                logger.errorCategory('sync', `❌ FAILED to sync account ${account.name} to API:`, err);
                                await queueOperationForSync(action);
                            }
                        }
                    } else if (action.type === 'DELETE_ACCOUNT') {
                        const accountId = action.payload as string;
                        const account = state.accounts.find(a => a.id === accountId);
                        if (account && !account.isPermanent) {
                            try {
                                await apiService.deleteAccount(accountId);
                                logger.logCategory('sync', '✅ Synced account deletion to API:', accountId);
                            } catch (err) {
                                logger.errorCategory('sync', `❌ FAILED to sync account deletion ${accountId} to API:`, err);
                                await queueOperationForSync(action);
                            }
                        }
                    }

                    // Handle contact changes
                    if (action.type === 'ADD_CONTACT') {
                        const contact = action.payload;
                        logger.logCategory('sync', `🔄 Starting sync for ADD_CONTACT: ${contact.name} (${contact.id})`);
                        try {
                            logger.logCategory('sync', `📤 Calling apiService.saveContact for: ${contact.name}`);
                            const savedContact = await apiService.saveContact(contact);
                            logger.logCategory('sync', `✅ Successfully synced contact to API: ${savedContact.name} (${savedContact.id})`);
                        } catch (err: any) {
                            logger.errorCategory('sync', `❌ FAILED to sync contact ${contact.name} to API:`, {
                                error: err,
                                errorMessage: err?.message || err?.error || 'Unknown error',
                                status: err?.status,
                                statusText: err?.statusText,
                                contact: {
                                    id: contact.id,
                                    name: contact.name,
                                    type: contact.type
                                },
                                fullError: JSON.stringify(err, Object.getOwnPropertyNames(err))
                            });
                            // Don't re-throw - log and continue, data is saved locally
                            // This allows user to continue working even if sync fails
                        }
                    } else if (action.type === 'UPDATE_CONTACT') {
                        const contact = action.payload;
                        logger.logCategory('sync', `🔄 Starting sync for UPDATE_CONTACT: ${contact.name} (${contact.id})`);
                        try {
                            logger.logCategory('sync', `📤 Calling apiService.saveContact for update: ${contact.name}`);
                            const savedContact = await apiService.saveContact(contact);
                            logger.logCategory('sync', `✅ Successfully synced contact update to API: ${savedContact.name} (${savedContact.id})`);
                        } catch (err: any) {
                            logger.errorCategory('sync', `❌ FAILED to sync contact update ${contact.name} to API:`, {
                                error: err,
                                errorMessage: err?.message || err?.error || 'Unknown error',
                                status: err?.status,
                                statusText: err?.statusText,
                                contact: {
                                    id: contact.id,
                                    name: contact.name,
                                    type: contact.type
                                },
                                fullError: JSON.stringify(err, Object.getOwnPropertyNames(err))
                            });
                            // Don't re-throw - log and continue
                        }
                    } else if (action.type === 'DELETE_CONTACT') {
                        const contactId = action.payload as string;
                        try {
                            await apiService.deleteContact(contactId);
                            logger.logCategory('sync', '✅ Synced contact deletion to API:', contactId);
                        } catch (err: any) {
                            console.error(`⚠️ Failed to sync contact deletion ${contactId} to API:`, {
                                error: err,
                                contactId: contactId,
                                errorMessage: err?.message || err?.error || 'Unknown error',
                                status: err?.status
                            });
                            throw err;
                        }
                    }

                    // Handle vendor changes
                    if (action.type === 'ADD_VENDOR') {
                        const vendor = action.payload;
                        logger.logCategory('sync', `🔄 Starting sync for ADD_VENDOR: ${vendor.name} (${vendor.id})`);
                        try {
                            const apiService = getAppStateApiService();
                            await apiService.saveVendor(vendor);
                            logger.logCategory('sync', `✅ Synced vendor to API: ${vendor.name} (${vendor.id})`);
                        } catch (err: any) {
                            logger.errorCategory('sync', `❌ FAILED to sync vendor ${vendor.name} to API:`, {
                                error: err,
                                errorMessage: err?.message || err?.error || 'Unknown error',
                                vendor: { id: vendor.id, name: vendor.name }
                            });
                        }
                    } else if (action.type === 'UPDATE_VENDOR') {
                        const vendor = action.payload;
                        logger.logCategory('sync', `🔄 Starting sync for UPDATE_VENDOR: ${vendor.name} (${vendor.id})`);
                        try {
                            const apiService = getAppStateApiService();
                            await apiService.saveVendor(vendor);
                            logger.logCategory('sync', `✅ Synced vendor update to API: ${vendor.name} (${vendor.id})`);
                        } catch (err: any) {
                            logger.errorCategory('sync', `❌ FAILED to sync vendor update ${vendor.name} to API:`, {
                                error: err,
                                errorMessage: err?.message || err?.error || 'Unknown error',
                                vendor: { id: vendor.id, name: vendor.name }
                            });
                        }
                    } else if (action.type === 'DELETE_VENDOR') {
                        const vendorId = action.payload as string;
                        try {
                            const apiService = getAppStateApiService();
                            await apiService.deleteVendor(vendorId);
                            logger.logCategory('sync', '✅ Synced vendor deletion to API:', vendorId);
                        } catch (err: any) {
                            logger.errorCategory('sync', `⚠️ Failed to sync vendor deletion ${vendorId} to API:`, {
                                error: err,
                                vendorId,
                                errorMessage: err?.message || err?.error || 'Unknown error'
                            });
                        }
                    }

                    // Handle transaction changes
                    if (action.type === 'ADD_TRANSACTION' || action.type === 'UPDATE_TRANSACTION' || action.type === 'RESTORE_TRANSACTION') {
                        const transaction = action.payload as Transaction;
                        try {
                            await apiService.saveTransaction(transaction);
                            logger.logCategory('sync', `✅ Synced transaction ${action.type === 'UPDATE_TRANSACTION' ? 'update' : ''} to API: ${transaction.id}`);
                        } catch (err) {
                            logger.errorCategory('sync', `❌ FAILED to sync transaction ${transaction.id} to API:`, err);
                            await queueOperationForSync(action);
                        }
                    } else if (action.type === 'DELETE_TRANSACTION') {
                        const transactionId = action.payload as string;
                        try {
                            await apiService.deleteTransaction(transactionId);
                            logger.logCategory('sync', '✅ Synced transaction deletion to API:', transactionId);
                        } catch (err) {
                            logger.errorCategory('sync', `❌ FAILED to sync transaction deletion ${transactionId} to API:`, err);
                            await queueOperationForSync(action);
                        }
                    } else if (action.type === 'BATCH_ADD_TRANSACTIONS') {
                        // Sync batch transactions
                        const transactions = action.payload as Transaction[];
                        try {
                            const syncPromises = transactions.map(tx =>
                                apiService.saveTransaction(tx).catch(async err => {
                                    logger.errorCategory('sync', `⚠️ Failed to sync transaction ${tx.id} during batch:`, err);
                                    // Queue individual failed transactions from batch
                                    await queueOperationForSync({ type: 'ADD_TRANSACTION', payload: tx } as AppAction);
                                    return null;
                                })
                            );
                            await Promise.all(syncPromises);
                            logger.logCategory('sync', `✅ Processed batch of ${transactions.length} transactions`);
                        } catch (err) {
                            logger.errorCategory('sync', '❌ FAILED to process transaction batch:', err);
                            await queueOperationForSync(action);
                        }
                    }

                    // Handle category changes
                    if (action.type === 'ADD_CATEGORY') {
                        const category = action.payload;
                        // Skip system categories (they're permanent and managed by server)
                        if (!category.isPermanent && !category.id?.startsWith('sys-cat-')) {
                            await apiService.saveCategory(category);
                            logger.logCategory('sync', '✅ Synced category to API:', category.name);
                        } else {
                            logger.logCategory('sync', '⏭️ Skipped syncing system category:', category.name);
                        }
                    } else if (action.type === 'UPDATE_CATEGORY') {
                        const category = action.payload;
                        // Skip system categories (they're permanent and read-only)
                        if (!category.isPermanent && !category.id?.startsWith('sys-cat-')) {
                            await apiService.saveCategory(category);
                            logger.logCategory('sync', '✅ Synced category update to API:', category.name);
                        } else {
                            logger.logCategory('sync', '⏭️ Skipped syncing system category update:', category.name);
                        }
                    } else if (action.type === 'DELETE_CATEGORY') {
                        const categoryId = action.payload as string;
                        // Check if it's a system category before deleting
                        const category = state.categories.find(c => c.id === categoryId);
                        if (category && !category.isPermanent && !categoryId.startsWith('sys-cat-')) {
                            await apiService.deleteCategory(categoryId);
                            logger.logCategory('sync', '✅ Synced category deletion to API:', categoryId);
                        } else {
                            logger.logCategory('sync', '⏭️ Skipped deleting system category:', categoryId);
                        }
                    }

                    // Handle project, building, property, unit changes
                    if (action.type === 'ADD_PROJECT' || action.type === 'UPDATE_PROJECT') {
                        const project = action.payload;
                        try {
                            await apiService.saveProject(project);
                            logger.logCategory('sync', `✅ Synced project ${action.type === 'UPDATE_PROJECT' ? 'update' : ''} to API: ${project.name}`);
                        } catch (err) {
                            logger.errorCategory('sync', `❌ FAILED to sync project ${project.name} to API:`, err);
                            await queueOperationForSync(action);
                        }
                    } else if (action.type === 'DELETE_PROJECT') {
                        const projectId = action.payload as string;
                        try {
                            await apiService.deleteProject(projectId);
                            logger.logCategory('sync', '✅ Synced project deletion to API:', projectId);
                        } catch (err) {
                            logger.errorCategory('sync', `❌ FAILED to sync project deletion ${projectId} to API:`, err);
                            await queueOperationForSync(action);
                        }
                    } else if (action.type === 'ADD_BUILDING' || action.type === 'UPDATE_BUILDING') {
                        const building = action.payload;
                        try {
                            await apiService.saveBuilding(building);
                            logger.logCategory('sync', `✅ Synced building ${action.type === 'UPDATE_BUILDING' ? 'update' : ''} to API: ${building.name}`);
                        } catch (err) {
                            logger.errorCategory('sync', `❌ FAILED to sync building ${building.name} to API:`, err);
                            await queueOperationForSync(action);
                        }
                    } else if (action.type === 'DELETE_BUILDING') {
                        const buildingId = action.payload as string;
                        try {
                            await apiService.deleteBuilding(buildingId);
                            logger.logCategory('sync', '✅ Synced building deletion to API:', buildingId);
                        } catch (err) {
                            logger.errorCategory('sync', `❌ FAILED to sync building deletion ${buildingId} to API:`, err);
                            await queueOperationForSync(action);
                        }
                    } else if (action.type === 'ADD_PROPERTY' || action.type === 'UPDATE_PROPERTY') {
                        const property = action.payload;
                        try {
                            await apiService.saveProperty(property);
                            logger.logCategory('sync', `✅ Synced property ${action.type === 'UPDATE_PROPERTY' ? 'update' : ''} to API: ${property.name}`);
                        } catch (err) {
                            logger.errorCategory('sync', `❌ FAILED to sync property ${property.name} to API:`, err);
                            await queueOperationForSync(action);
                        }
                    } else if (action.type === 'DELETE_PROPERTY') {
                        const propertyId = action.payload as string;
                        try {
                            await apiService.deleteProperty(propertyId);
                            logger.logCategory('sync', '✅ Synced property deletion to API:', propertyId);
                        } catch (err) {
                            logger.errorCategory('sync', `❌ FAILED to sync property deletion ${propertyId} to API:`, err);
                            await queueOperationForSync(action);
                        }
                    } else if (action.type === 'ADD_UNIT' || action.type === 'UPDATE_UNIT') {
                        const unit = action.payload;
                        try {
                            await apiService.saveUnit(unit);
                            logger.logCategory('sync', `✅ Synced unit ${action.type === 'UPDATE_UNIT' ? 'update' : ''} to API: ${unit.name}`);
                        } catch (err) {
                            logger.errorCategory('sync', `❌ FAILED to sync unit ${unit.name} to API:`, err);
                            await queueOperationForSync(action);
                        }
                    } else if (action.type === 'DELETE_UNIT') {
                        const unitId = action.payload as string;
                        try {
                            await apiService.deleteUnit(unitId);
                            logger.logCategory('sync', '✅ Synced unit deletion to API:', unitId);
                        } catch (err) {
                            logger.errorCategory('sync', `❌ FAILED to sync unit deletion ${unitId} to API:`, err);
                            await queueOperationForSync(action);
                        }
                    }

                    // Handle installment plan changes
                    if (action.type === 'ADD_INSTALLMENT_PLAN') {
                        const plan = action.payload;
                        await apiService.saveInstallmentPlan(plan);
                        logger.logCategory('sync', '✅ Synced installment plan to API:', plan.id);
                    } else if (action.type === 'UPDATE_INSTALLMENT_PLAN') {
                        const plan = action.payload;
                        await apiService.saveInstallmentPlan(plan);
                        logger.logCategory('sync', '✅ Synced installment plan update to API:', plan.id);
                    } else if (action.type === 'DELETE_INSTALLMENT_PLAN') {
                        const planId = action.payload as string;
                        await apiService.deleteInstallmentPlan(planId);
                        logger.logCategory('sync', '✅ Synced installment plan deletion to API:', planId);
                    }

                    // Handle plan amenity changes
                    if (action.type === 'ADD_PLAN_AMENITY') {
                        const amenity = action.payload;
                        await apiService.savePlanAmenity(amenity);
                        logger.logCategory('sync', '✅ Synced plan amenity to API:', amenity.name);
                    } else if (action.type === 'UPDATE_PLAN_AMENITY') {
                        const amenity = action.payload;
                        await apiService.savePlanAmenity(amenity);
                        logger.logCategory('sync', '✅ Synced plan amenity update to API:', amenity.name);
                    } else if (action.type === 'DELETE_PLAN_AMENITY') {
                        const amenityId = action.payload as string;
                        await apiService.deletePlanAmenity(amenityId);
                        logger.logCategory('sync', '✅ Synced plan amenity deletion to API:', amenityId);
                    }

                    // Handle inventory item changes (Settings → Inventory → New Item)
                    if (action.type === 'ADD_INVENTORY_ITEM') {
                        const item = action.payload as any;
                        logger.logCategory('sync', `🔄 Starting sync for ADD_INVENTORY_ITEM: ${item.name} (${item.id})`);
                        try {
                            await apiService.saveInventoryItem(item);
                            logger.logCategory('sync', `✅ Synced inventory item to API: ${item.name} (${item.id})`);
                        } catch (err: any) {
                            logger.errorCategory('sync', `❌ FAILED to sync inventory item ${item.name} to API:`, {
                                error: err,
                                errorMessage: err?.message || err?.error || 'Unknown error',
                                status: err?.status,
                                item: { id: item.id, name: item.name }
                            });
                        }
                    } else if (action.type === 'UPDATE_INVENTORY_ITEM') {
                        const item = action.payload as any;
                        logger.logCategory('sync', `🔄 Starting sync for UPDATE_INVENTORY_ITEM: ${item.name} (${item.id})`);
                        try {
                            await apiService.saveInventoryItem(item);
                            logger.logCategory('sync', `✅ Synced inventory item update to API: ${item.name} (${item.id})`);
                        } catch (err: any) {
                            logger.errorCategory('sync', `❌ FAILED to sync inventory item update ${item.name} to API:`, {
                                error: err,
                                errorMessage: err?.message || err?.error || 'Unknown error',
                                status: err?.status,
                                item: { id: item.id, name: item.name }
                            });
                        }
                    } else if (action.type === 'DELETE_INVENTORY_ITEM') {
                        const itemId = action.payload as string;
                        try {
                            await apiService.deleteInventoryItem(itemId);
                            logger.logCategory('sync', '✅ Synced inventory item deletion to API:', itemId);
                        } catch (err: any) {
                            logger.errorCategory('sync', `⚠️ Failed to sync inventory item deletion ${itemId} to API:`, {
                                error: err,
                                itemId,
                                errorMessage: err?.message || err?.error || 'Unknown error'
                            });
                        }
                    }

                    // Handle invoice changes
                    if (action.type === 'ADD_INVOICE' || action.type === 'UPDATE_INVOICE') {
                        const invoice = action.payload;
                        try {
                            await apiService.saveInvoice(invoice);
                            logger.logCategory('sync', `✅ Synced invoice ${action.type === 'UPDATE_INVOICE' ? 'update' : ''} to API: ${invoice.invoiceNumber}`);
                        } catch (err) {
                            logger.errorCategory('sync', `❌ FAILED to sync invoice ${invoice.invoiceNumber} to API:`, err);
                            await queueOperationForSync(action);
                        }
                    } else if (action.type === 'DELETE_INVOICE') {
                        const invoiceId = action.payload as string;
                        try {
                            await apiService.deleteInvoice(invoiceId);
                            logger.logCategory('sync', '✅ Synced invoice deletion to API:', invoiceId);
                        } catch (err) {
                            logger.errorCategory('sync', `❌ FAILED to sync invoice deletion ${invoiceId} to API:`, err);
                            await queueOperationForSync(action);
                        }
                    }

                    // Handle bill changes
                    if (action.type === 'ADD_BILL' || action.type === 'UPDATE_BILL') {
                        const bill = action.payload;
                        logger.logCategory('sync', `🔄 Starting sync for ${action.type}: ${bill.billNumber} (${bill.id})`);
                        try {
                            await apiService.saveBill(bill);
                            logger.logCategory('sync', `✅ Synced bill ${action.type === 'UPDATE_BILL' ? 'update' : ''} to API: ${bill.billNumber}`);
                        } catch (err: any) {
                            logger.errorCategory('sync', `❌ FAILED to sync bill ${bill.billNumber} to API:`, err);
                            // Queue for later sync
                            await queueOperationForSync(action);
                        }
                    } else if (action.type === 'DELETE_BILL') {
                        const billId = action.payload as string;
                        try {
                            await apiService.deleteBill(billId);
                            logger.logCategory('sync', '✅ Synced bill deletion to API:', billId);
                        } catch (err: any) {
                            logger.errorCategory('sync', `❌ FAILED to sync bill deletion ${billId} to API:`, err);
                            await queueOperationForSync(action);
                        }
                    }

                    // Handle recurring invoice template changes
                    if (action.type === 'ADD_RECURRING_TEMPLATE' || action.type === 'UPDATE_RECURRING_TEMPLATE') {
                        const template = action.payload;
                        try {
                            await apiService.saveRecurringTemplate(template);
                            logger.logCategory('sync', `✅ Synced recurring template ${action.type === 'UPDATE_RECURRING_TEMPLATE' ? 'update' : ''} to API: ${template.id}`);
                        } catch (err: any) {
                            logger.errorCategory('sync', `❌ FAILED to sync recurring template ${template.id} to API:`, err);
                            await queueOperationForSync(action);
                        }
                    } else if (action.type === 'DELETE_RECURRING_TEMPLATE') {
                        const templateId = action.payload as string;
                        try {
                            await apiService.deleteRecurringTemplate(templateId);
                            logger.logCategory('sync', '✅ Synced recurring template deletion to API:', templateId);
                        } catch (err: any) {
                            logger.errorCategory('sync', `❌ FAILED to sync recurring template deletion ${templateId} to API:`, err);
                            await queueOperationForSync(action);
                        }
                    }

                    // Handle budget changes
                    if (action.type === 'ADD_BUDGET') {
                        const budget = action.payload;
                        await apiService.saveBudget(budget);
                        logger.logCategory('sync', '✅ Synced budget to API:', budget.id);
                    } else if (action.type === 'UPDATE_BUDGET') {
                        const budget = action.payload;
                        await apiService.saveBudget(budget);
                        logger.logCategory('sync', '✅ Synced budget update to API:', budget.id);
                    } else if (action.type === 'DELETE_BUDGET') {
                        const budgetId = action.payload as string;
                        await apiService.deleteBudget(budgetId);
                        logger.logCategory('sync', '✅ Synced budget deletion to API:', budgetId);
                    }

                    // Handle rental agreement changes
                    if (action.type === 'ADD_RENTAL_AGREEMENT') {
                        const agreement = action.payload;
                        await apiService.saveRentalAgreement(agreement);
                        logger.logCategory('sync', '✅ Synced rental agreement to API:', agreement.agreementNumber);
                    } else if (action.type === 'UPDATE_RENTAL_AGREEMENT') {
                        const agreement = action.payload;
                        await apiService.saveRentalAgreement(agreement);
                        logger.logCategory('sync', '✅ Synced rental agreement update to API:', agreement.agreementNumber);
                    } else if (action.type === 'DELETE_RENTAL_AGREEMENT') {
                        const agreementId = action.payload as string;
                        await apiService.deleteRentalAgreement(agreementId);
                        logger.logCategory('sync', '✅ Synced rental agreement deletion to API:', agreementId);
                    }

                    // Handle project agreement changes
                    if (action.type === 'ADD_PROJECT_AGREEMENT' || action.type === 'UPDATE_PROJECT_AGREEMENT' || action.type === 'CANCEL_PROJECT_AGREEMENT') {
                        let agreement: any;
                        if (action.type === 'CANCEL_PROJECT_AGREEMENT') {
                            const { agreementId } = action.payload as any;
                            agreement = newState.projectAgreements.find(pa => pa.id === agreementId);
                        } else {
                            agreement = action.payload;
                        }

                        if (agreement) {
                            try {
                                await apiService.saveProjectAgreement(agreement);
                                logger.logCategory('sync', `✅ Synced project agreement ${action.type} to API: ${agreement.agreementNumber}`);
                            } catch (err) {
                                logger.errorCategory('sync', `❌ FAILED to sync project agreement ${agreement.agreementNumber || 'unknown'} to API:`, err);
                                await queueOperationForSync(action);
                            }
                        }
                    } else if (action.type === 'DELETE_PROJECT_AGREEMENT') {
                        const agreementId = action.payload as string;
                        try {
                            await apiService.deleteProjectAgreement(agreementId);
                            logger.logCategory('sync', '✅ Synced project agreement deletion to API:', agreementId);
                        } catch (err) {
                            logger.errorCategory('sync', `❌ FAILED to sync project agreement deletion ${agreementId} to API:`, err);
                            await queueOperationForSync(action);
                        }
                    }

                    // Handle sales return changes
                    if (action.type === 'ADD_SALES_RETURN' || action.type === 'UPDATE_SALES_RETURN' || action.type === 'MARK_RETURN_REFUNDED') {
                        let salesReturn: any;
                        if (action.type === 'MARK_RETURN_REFUNDED') {
                            const { returnId } = action.payload as any;
                            salesReturn = newState.salesReturns.find(sr => sr.id === returnId);
                        } else {
                            salesReturn = action.payload;
                        }

                        if (salesReturn) {
                            try {
                                await apiService.saveSalesReturn(salesReturn);
                                logger.logCategory('sync', `✅ Synced sales return ${action.type} to API: ${salesReturn.returnNumber}`);
                            } catch (err) {
                                logger.errorCategory('sync', `❌ FAILED to sync sales return ${salesReturn.returnNumber || 'unknown'} to API:`, err);
                                await queueOperationForSync(action);
                            }
                        }
                    } else if (action.type === 'DELETE_SALES_RETURN') {
                        const salesReturnId = action.payload as string;
                        try {
                            await apiService.deleteSalesReturn(salesReturnId);
                            logger.logCategory('sync', '✅ Synced sales return deletion to API:', salesReturnId);
                        } catch (err) {
                            logger.errorCategory('sync', `❌ FAILED to sync sales return deletion ${salesReturnId} to API:`, err);
                            await queueOperationForSync(action);
                        }
                    }

                    // Handle contract changes
                    if (action.type === 'ADD_CONTRACT') {
                        const contract = action.payload;
                        await apiService.saveContract(contract);
                        logger.logCategory('sync', '✅ Synced contract to API:', contract.contractNumber);
                    } else if (action.type === 'UPDATE_CONTRACT') {
                        const contract = action.payload;
                        await apiService.saveContract(contract);
                        logger.logCategory('sync', '✅ Synced contract update to API:', contract.contractNumber);
                    } else if (action.type === 'DELETE_CONTRACT') {
                        const contractId = action.payload as string;
                        await apiService.deleteContract(contractId);
                        logger.logCategory('sync', '✅ Synced contract deletion to API:', contractId);
                    }

                    // Handle PM cycle allocation changes
                    if (action.type === 'ADD_PM_CYCLE_ALLOCATION') {
                        const allocation = action.payload as any;
                        await apiService.savePMCycleAllocation(allocation);
                        logger.logCategory('sync', '✅ Synced PM cycle allocation to API:', allocation.cycleId);
                    } else if (action.type === 'UPDATE_PM_CYCLE_ALLOCATION') {
                        const allocation = action.payload as any;
                        await apiService.savePMCycleAllocation(allocation);
                        logger.logCategory('sync', '✅ Synced PM cycle allocation update to API:', allocation.cycleId);
                    } else if (action.type === 'DELETE_PM_CYCLE_ALLOCATION') {
                        const allocationId = action.payload as string;
                        await apiService.deletePMCycleAllocation(allocationId);
                        logger.logCategory('sync', '✅ Synced PM cycle allocation deletion to API:', allocationId);
                    }

                    // Handle settings changes (both general and communication settings)
                    const { settingsSyncService } = await import('../services/settingsSyncService');
                    if (action.type === 'UPDATE_PRINT_SETTINGS') {
                        await settingsSyncService.saveSetting('printSettings', action.payload);
                        logger.logCategory('sync', '✅ Synced print settings to cloud');
                    } else if (action.type === 'UPDATE_WHATSAPP_TEMPLATES') {
                        await settingsSyncService.saveSetting('whatsAppTemplates', action.payload);
                        logger.logCategory('sync', '✅ Synced WhatsApp templates to cloud');
                    } else if (action.type === 'TOGGLE_SYSTEM_TRANSACTIONS') {
                        await settingsSyncService.saveSetting('showSystemTransactions', action.payload);
                        logger.logCategory('sync', '✅ Synced showSystemTransactions to cloud');
                    } else if (action.type === 'TOGGLE_COLOR_CODING') {
                        await settingsSyncService.saveSetting('enableColorCoding', action.payload);
                        logger.logCategory('sync', '✅ Synced enableColorCoding to cloud');
                    } else if (action.type === 'TOGGLE_BEEP_ON_SAVE') {
                        await settingsSyncService.saveSetting('enableBeepOnSave', action.payload);
                        logger.logCategory('sync', '✅ Synced enableBeepOnSave to cloud');
                    } else if (action.type === 'TOGGLE_DATE_PRESERVATION') {
                        await settingsSyncService.saveSetting('enableDatePreservation', action.payload);
                        logger.logCategory('sync', '✅ Synced enableDatePreservation to cloud');
                    } else if (action.type === 'UPDATE_DEFAULT_PROJECT') {
                        await settingsSyncService.saveSetting('defaultProjectId', action.payload);
                        logger.logCategory('sync', '✅ Synced defaultProjectId to cloud');
                    } else if (action.type === 'UPDATE_DASHBOARD_CONFIG') {
                        await settingsSyncService.saveSetting('dashboardConfig', action.payload);
                        logger.logCategory('sync', '✅ Synced dashboardConfig to cloud');
                    } else if (action.type === 'UPDATE_AGREEMENT_SETTINGS') {
                        await settingsSyncService.saveSetting('agreementSettings', action.payload);
                        logger.logCategory('sync', '✅ Synced agreementSettings to cloud');
                    } else if (action.type === 'UPDATE_PROJECT_AGREEMENT_SETTINGS') {
                        await settingsSyncService.saveSetting('projectAgreementSettings', action.payload);
                        logger.logCategory('sync', '✅ Synced projectAgreementSettings to cloud');
                    } else if (action.type === 'UPDATE_RENTAL_INVOICE_SETTINGS') {
                        await settingsSyncService.saveSetting('rentalInvoiceSettings', action.payload);
                        logger.logCategory('sync', '✅ Synced rentalInvoiceSettings to cloud');
                    } else if (action.type === 'UPDATE_PROJECT_INVOICE_SETTINGS') {
                        await settingsSyncService.saveSetting('projectInvoiceSettings', action.payload);
                        logger.logCategory('sync', '✅ Synced projectInvoiceSettings to cloud');
                    }
                } catch (error: any) {
                    // Log error but don't block UI - state is already updated locally
                    logger.errorCategory('sync', '❌ CRITICAL: Failed to sync to API in syncToApi:', {
                        actionType: action.type,
                        error: error,
                        errorMessage: error?.message || error?.error || 'Unknown error',
                        status: error?.status,
                        statusText: error?.statusText,
                        stack: error?.stack,
                        fullError: JSON.stringify(error, Object.getOwnPropertyNames(error)),
                        payload: action.payload ? {
                            ...(typeof action.payload === 'object' && action.payload !== null
                                ? { id: (action.payload as any).id, name: (action.payload as any).name }
                                : action.payload)
                        } : undefined
                    });

                    // Check if it's a network error (status 0)
                    if (error?.status === 0 || error?.error === 'NetworkError') {
                        logger.warnCategory('sync', '📴 Network error detected, queuing operation for later sync');
                        await queueOperationForSync(action);
                        return;
                    }

                    // Show user-friendly notification for expired token
                    if (error?.status === 401) {
                        // Only show notification once per session to avoid spam
                        const hasShownTokenWarning = sessionStorage.getItem('token_expired_warning_shown');
                        if (!hasShownTokenWarning) {
                            sessionStorage.setItem('token_expired_warning_shown', 'true');
                            // Dispatch custom event to show notification
                            if (typeof window !== 'undefined') {
                                window.dispatchEvent(new CustomEvent('show-sync-warning', {
                                    detail: {
                                        message: 'Your session has expired. Data is saved locally. Please re-login to sync to the cloud.',
                                        type: 'info'
                                    }
                                }));
                            }
                        }
                    }

                    // Notify when transaction sync fails (e.g. 400 validation / account not in cloud)
                    const isTransactionAction = action.type === 'ADD_TRANSACTION' || action.type === 'BATCH_ADD_TRANSACTIONS' || action.type === 'UPDATE_TRANSACTION';
                    if (error?.status === 400 && isTransactionAction && typeof window !== 'undefined') {
                        const msg = error?.message || error?.error || 'Payment could not sync to cloud.';
                        window.dispatchEvent(new CustomEvent('show-sync-warning', {
                            detail: {
                                message: `${msg} Please ensure the payment account exists in cloud and try again.`,
                                type: 'warning'
                            }
                        }));
                    }
                }
            };

            const user = state.currentUser;

            // Helper function to queue operations for offline sync
            const queueOperationForSync = async (action: AppAction) => {
                try {
                    const syncQueue = getSyncQueue();
                    const tenantId = user?.tenant?.id;
                    const userId = user?.id;

                    if (!tenantId || !userId) {
                        logger.warnCategory('sync', '⚠️ Cannot queue operation: missing tenant or user ID');
                        return;
                    }

                    await prunePendingSyncItems(user, action);

                    // BATCH_ADD_TRANSACTIONS: enqueue each transaction separately so all are synced when back online
                    if (action.type === 'BATCH_ADD_TRANSACTIONS') {
                        const transactions = action.payload as Transaction[];
                        for (const tx of transactions) {
                            await syncQueue.enqueue(
                                tenantId,
                                userId,
                                'transaction',
                                'create',
                                tx
                            );
                        }
                        logger.logCategory('sync', `✅ Queued ${transactions.length} transaction(s) for sync when online`);
                        return;
                    }

                    // Map action type to sync operation type and extract data
                    const mapping = mapActionToSyncOperation(action);
                    if (!mapping) {
                        logger.warnCategory('sync', `⚠️ Unknown action type for queue: ${action.type}`);
                        return;
                    }

                    await syncQueue.enqueue(
                        tenantId,
                        userId,
                        mapping.type,
                        mapping.action,
                        mapping.data
                    );

                    logger.logCategory('sync', `✅ Queued ${mapping.action} ${mapping.type} for sync when online`);
                } catch (error) {
                    console.error('Failed to queue operation:', error);
                }
            };

            // Map AppAction to SyncOperation
            const mapActionToSyncOperation = (action: AppAction): { type: SyncOperationType, action: 'create' | 'update' | 'delete', data: any } | null => {
                switch (action.type) {
                    case 'ADD_TRANSACTION':
                        return { type: 'transaction', action: 'create', data: action.payload };
                    case 'UPDATE_TRANSACTION':
                        return { type: 'transaction', action: 'update', data: action.payload };
                    case 'DELETE_TRANSACTION':
                        return { type: 'transaction', action: 'delete', data: { id: action.payload } };
                    case 'BATCH_ADD_TRANSACTIONS':
                        return { type: 'transaction', action: 'create', data: (action.payload as Transaction[])[0] }; // Queue first one
                    case 'RESTORE_TRANSACTION':
                        return { type: 'transaction', action: 'update', data: action.payload };
                    case 'ADD_CONTACT':
                        return { type: 'contact', action: 'create', data: action.payload };
                    case 'UPDATE_CONTACT':
                        return { type: 'contact', action: 'update', data: action.payload };
                    case 'DELETE_CONTACT':
                        return { type: 'contact', action: 'delete', data: { id: action.payload } };
                    case 'ADD_VENDOR':
                        return { type: 'vendor', action: 'create', data: action.payload };
                    case 'UPDATE_VENDOR':
                        return { type: 'vendor', action: 'update', data: action.payload };
                    case 'DELETE_VENDOR':
                        return { type: 'vendor', action: 'delete', data: { id: action.payload } };
                    case 'ADD_INVOICE':
                        return { type: 'invoice', action: 'create', data: action.payload };
                    case 'UPDATE_INVOICE':
                        return { type: 'invoice', action: 'update', data: action.payload };
                    case 'DELETE_INVOICE':
                        return { type: 'invoice', action: 'delete', data: { id: action.payload } };
                    case 'ADD_BILL':
                        return { type: 'bill', action: 'create', data: action.payload };
                    case 'UPDATE_BILL':
                        return { type: 'bill', action: 'update', data: action.payload };
                    case 'DELETE_BILL':
                        return { type: 'bill', action: 'delete', data: { id: action.payload } };
                    case 'ADD_RECURRING_TEMPLATE':
                        return { type: 'recurring_invoice_template', action: 'create', data: action.payload };
                    case 'UPDATE_RECURRING_TEMPLATE':
                        return { type: 'recurring_invoice_template', action: 'update', data: action.payload };
                    case 'DELETE_RECURRING_TEMPLATE':
                        return { type: 'recurring_invoice_template', action: 'delete', data: { id: action.payload } };
                    case 'ADD_ACCOUNT':
                        return { type: 'account', action: 'create', data: action.payload };
                    case 'UPDATE_ACCOUNT':
                        return { type: 'account', action: 'update', data: action.payload };
                    case 'DELETE_ACCOUNT':
                        return { type: 'account', action: 'delete', data: { id: action.payload } };
                    case 'ADD_CATEGORY':
                        return { type: 'category', action: 'create', data: action.payload };
                    case 'UPDATE_CATEGORY':
                        return { type: 'category', action: 'update', data: action.payload };
                    case 'DELETE_CATEGORY':
                        return { type: 'category', action: 'delete', data: { id: action.payload } };
                    case 'ADD_PROJECT':
                        return { type: 'project', action: 'create', data: action.payload };
                    case 'UPDATE_PROJECT':
                        return { type: 'project', action: 'update', data: action.payload };
                    case 'DELETE_PROJECT':
                        return { type: 'project', action: 'delete', data: { id: action.payload } };
                    case 'ADD_BUILDING':
                        return { type: 'building', action: 'create', data: action.payload };
                    case 'UPDATE_BUILDING':
                        return { type: 'building', action: 'update', data: action.payload };
                    case 'DELETE_BUILDING':
                        return { type: 'building', action: 'delete', data: { id: action.payload } };
                    case 'ADD_PROPERTY':
                        return { type: 'property', action: 'create', data: action.payload };
                    case 'UPDATE_PROPERTY':
                        return { type: 'property', action: 'update', data: action.payload };
                    case 'DELETE_PROPERTY':
                        return { type: 'property', action: 'delete', data: { id: action.payload } };
                    case 'ADD_UNIT':
                        return { type: 'unit', action: 'create', data: action.payload };
                    case 'UPDATE_UNIT':
                        return { type: 'unit', action: 'update', data: action.payload };
                    case 'DELETE_UNIT':
                        return { type: 'unit', action: 'delete', data: { id: action.payload } };
                    case 'ADD_BUDGET':
                        return { type: 'budget', action: 'create', data: action.payload };
                    case 'UPDATE_BUDGET':
                        return { type: 'budget', action: 'update', data: action.payload };
                    case 'DELETE_BUDGET':
                        return { type: 'budget', action: 'delete', data: { id: action.payload } };
                    case 'ADD_PLAN_AMENITY':
                        return { type: 'plan_amenity', action: 'create', data: action.payload };
                    case 'UPDATE_PLAN_AMENITY':
                        return { type: 'plan_amenity', action: 'update', data: action.payload };
                    case 'DELETE_PLAN_AMENITY':
                        return { type: 'plan_amenity', action: 'delete', data: { id: action.payload } };
                    case 'ADD_INVENTORY_ITEM':
                        return { type: 'inventory_item', action: 'create', data: action.payload };
                    case 'UPDATE_INVENTORY_ITEM':
                        return { type: 'inventory_item', action: 'update', data: action.payload };
                    case 'DELETE_INVENTORY_ITEM':
                        return { type: 'inventory_item', action: 'delete', data: { id: action.payload } };
                    case 'ADD_WAREHOUSE':
                        return { type: 'warehouse', action: 'create', data: action.payload };
                    case 'UPDATE_WAREHOUSE':
                        return { type: 'warehouse', action: 'update', data: action.payload };
                    case 'DELETE_WAREHOUSE':
                        return { type: 'warehouse', action: 'delete', data: { id: action.payload } };
                    case 'ADD_RENTAL_AGREEMENT':
                        return { type: 'rental_agreement', action: 'create', data: action.payload };
                    case 'UPDATE_RENTAL_AGREEMENT':
                        return { type: 'rental_agreement', action: 'update', data: action.payload };
                    case 'DELETE_RENTAL_AGREEMENT':
                        return { type: 'rental_agreement', action: 'delete', data: { id: action.payload } };
                    case 'ADD_PROJECT_AGREEMENT':
                        return { type: 'project_agreement', action: 'create', data: action.payload };
                    case 'UPDATE_PROJECT_AGREEMENT':
                        return { type: 'project_agreement', action: 'update', data: action.payload };
                    case 'DELETE_PROJECT_AGREEMENT':
                    case 'CANCEL_PROJECT_AGREEMENT':
                        return { type: 'project_agreement', action: 'update', data: action.payload };
                    case 'ADD_CONTRACT':
                        return { type: 'contract', action: 'create', data: action.payload };
                    case 'UPDATE_CONTRACT':
                        return { type: 'contract', action: 'update', data: action.payload };
                    case 'DELETE_CONTRACT':
                        return { type: 'contract', action: 'delete', data: { id: action.payload } };
                    case 'ADD_SALES_RETURN':
                        return { type: 'sales_return', action: 'create', data: action.payload };
                    case 'UPDATE_SALES_RETURN':
                    case 'MARK_RETURN_REFUNDED':
                        return { type: 'sales_return', action: 'update', data: action.payload };
                    case 'DELETE_SALES_RETURN':
                        return { type: 'sales_return', action: 'delete', data: { id: action.payload } };
                    case 'UPDATE_PRINT_SETTINGS':
                        return { type: 'setting', action: 'update', data: { key: 'printSettings', value: action.payload } };
                    case 'UPDATE_WHATSAPP_TEMPLATES':
                        return { type: 'setting', action: 'update', data: { key: 'whatsAppTemplates', value: action.payload } };
                    case 'UPDATE_DASHBOARD_CONFIG':
                        return { type: 'setting', action: 'update', data: { key: 'dashboardConfig', value: action.payload } };
                    case 'UPDATE_AGREEMENT_SETTINGS':
                        return { type: 'setting', action: 'update', data: { key: 'agreementSettings', value: action.payload } };
                    case 'UPDATE_PROJECT_AGREEMENT_SETTINGS':
                        return { type: 'setting', action: 'update', data: { key: 'projectAgreementSettings', value: action.payload } };
                    case 'UPDATE_RENTAL_INVOICE_SETTINGS':
                        return { type: 'setting', action: 'update', data: { key: 'rentalInvoiceSettings', value: action.payload } };
                    case 'UPDATE_PROJECT_INVOICE_SETTINGS':
                        return { type: 'setting', action: 'update', data: { key: 'projectInvoiceSettings', value: action.payload } };
                    case 'UPDATE_PM_COST_PERCENTAGE':
                        return { type: 'setting', action: 'update', data: { key: 'pmCostPercentage', value: action.payload } };
                    case 'TOGGLE_SYSTEM_TRANSACTIONS':
                        return { type: 'setting', action: 'update', data: { key: 'showSystemTransactions', value: action.payload } };
                    case 'TOGGLE_COLOR_CODING':
                        return { type: 'setting', action: 'update', data: { key: 'enableColorCoding', value: action.payload } };
                    case 'TOGGLE_BEEP_ON_SAVE':
                        return { type: 'setting', action: 'update', data: { key: 'enableBeepOnSave', value: action.payload } };
                    case 'TOGGLE_DATE_PRESERVATION':
                        return { type: 'setting', action: 'update', data: { key: 'enableDatePreservation', value: action.payload } };
                    case 'UPDATE_DEFAULT_PROJECT':
                        return { type: 'setting', action: 'update', data: { key: 'defaultProjectId', value: action.payload } };
                    default:
                        return null;
                }
            };

            // Defer API sync to avoid blocking UI
            if ('requestIdleCallback' in window) {
                requestIdleCallback(syncToApi, { timeout: 2000 });
            } else {
                setTimeout(syncToApi, 0);
            }
        }

        // Sync Broadcast - Skip for navigation-only actions (performance optimization)
        if (!(action as any)._isRemote) {
            const NAVIGATION_ACTIONS = ['SET_PAGE', 'SET_INITIAL_TABS', 'CLEAR_INITIAL_TABS',
                'SET_INITIAL_TRANSACTION_TYPE', 'CLEAR_INITIAL_TRANSACTION_TYPE',
                'SET_INITIAL_TRANSACTION_FILTER', 'SET_INITIAL_IMPORT_TYPE',
                'CLEAR_INITIAL_IMPORT_TYPE', 'SET_EDITING_ENTITY', 'CLEAR_EDITING_ENTITY'];

            // Real-time sync is now handled via Socket.IO in the backend
            // No peer-to-peer sync needed
        }

        return newState;
    }, [isAuthenticated]);

    // Use a ref to track if we've initialized the reducer with database state
    const reducerInitializedRef = useRef(false);

    // Initialize reducer with initialState first, then sync with storedState when ready
    // This avoids initialization issues with storedState
    const [state, dispatch] = useReducer(reducerWithPersistence, initialState);

    useEffect(() => {
        dispatchRef.current = dispatch;
        return () => { dispatchRef.current = null; };
    }, [dispatch]);

    // Sync reducer state with loaded database state (critical for first load)
    // Initialize with storedState when it's ready (after initialization)
    useEffect(() => {
        // Wait for initialization to complete and storedState to be ready
        if (!isInitializing && storedStateRef.current) {
            // Use ref to access storedState to avoid dependency issues
            const currentStoredState = storedStateRef.current;

            // Check if storedState has more data than current state (database loaded)
            const storedHasMoreData = currentStoredState.contacts.length > state.contacts.length ||
                currentStoredState.transactions.length > state.transactions.length ||
                currentStoredState.invoices.length > state.invoices.length ||
                currentStoredState.accounts.length > state.accounts.length ||
                (currentStoredState.projectAgreements?.length ?? 0) > (state.projectAgreements?.length ?? 0) ||
                (currentStoredState.installmentPlans?.length ?? 0) > (state.installmentPlans?.length ?? 0);

            // Check if storedState has any user data (not just system defaults)
            const storedHasUserData = currentStoredState.contacts.length > 0 ||
                currentStoredState.transactions.length > 0 ||
                currentStoredState.invoices.length > 0 ||
                currentStoredState.bills.length > 0 ||
                (currentStoredState.projectAgreements?.length ?? 0) > 0 ||
                (currentStoredState.installmentPlans?.length ?? 0) > 0;

            const currentHasUserData = state.contacts.length > 0 ||
                state.transactions.length > 0 ||
                state.invoices.length > 0 ||
                state.bills.length > 0;

            // Sync if database has more data or has user data when current doesn't
            // Only sync once during initialization to avoid infinite loops
            if ((storedHasMoreData || (storedHasUserData && !currentHasUserData)) && !reducerInitializedRef.current) {
                dispatch({ type: 'SET_STATE', payload: currentStoredState, _isRemote: true } as any);
                reducerInitializedRef.current = true;
            } else if (storedHasUserData && currentHasUserData) {
                // Mark as initialized if both have data (already synced)
                reducerInitializedRef.current = true;
            }
        }
        // Only depend on isInitializing to avoid accessing storedState before it's ready
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isInitializing, state, dispatch]);

    /**
     * Cloud contacts refresh (one-entity wiring test)
     * When authenticated, reload contacts from API and merge into state + local DB.
     * This makes different users on the same tenant see the same contacts.
     */
    // Track latest state to avoid stale captures in async effects
    const stateRef = useRef(state);
    useEffect(() => {
        stateRef.current = state;
    }, [state]);

    const refreshFromApi = useCallback(async (onCriticalLoaded?: () => void) => {
        if (!isAuthenticated) return;
        const apiService = getAppStateApiService();

        const mergeById = <T extends { id: string }>(current: T[], api: T[]): T[] => {
            if (!api || api.length === 0) return current;
            const merged = new Map<string, T>();
            current.forEach(item => merged.set(item.id, item));
            api.forEach(item => merged.set(item.id, item));
            return Array.from(merged.values());
        };

        const applyApiState = (apiState: Partial<AppState>): AppState | null => {
            const updates: Partial<AppState> = {};
            const currentState = stateRef.current;
            if (apiState.contacts) updates.contacts = mergeById(currentState.contacts, apiState.contacts);
            if (apiState.transactions) updates.transactions = mergeById(currentState.transactions, apiState.transactions);
            if (apiState.bills) updates.bills = mergeById(currentState.bills, apiState.bills);
            if (apiState.invoices) updates.invoices = mergeById(currentState.invoices, apiState.invoices);
            if (apiState.budgets) updates.budgets = mergeById(currentState.budgets, apiState.budgets);
            if (apiState.contracts) updates.contracts = mergeById(currentState.contracts, apiState.contracts);
            if (apiState.rentalAgreements) updates.rentalAgreements = mergeById(currentState.rentalAgreements, apiState.rentalAgreements);
            if (apiState.projectAgreements) updates.projectAgreements = mergeById(currentState.projectAgreements, apiState.projectAgreements);
            if (apiState.salesReturns) updates.salesReturns = mergeById(currentState.salesReturns, apiState.salesReturns);
            if (apiState.installmentPlans) updates.installmentPlans = mergeById(currentState.installmentPlans, apiState.installmentPlans);
            if (apiState.planAmenities) updates.planAmenities = mergeById(currentState.planAmenities || [], apiState.planAmenities);
            if (apiState.categories) {
                const mergedApiLocal = mergeById(currentState.categories, apiState.categories);
                const systemCategoryIds = new Set(SYSTEM_CATEGORIES.map(c => c.id));
                const userCategories = mergedApiLocal.filter(c => !systemCategoryIds.has(c.id));
                const existingSystemCategories = mergedApiLocal.filter(c => systemCategoryIds.has(c.id));
                const allSystemCategories = SYSTEM_CATEGORIES.map(sysCat => {
                    const existing = existingSystemCategories.find(c => c.id === sysCat.id);
                    return existing || sysCat;
                });
                updates.categories = [...allSystemCategories, ...userCategories];
            }
            if (apiState.accounts) updates.accounts = mergeById(currentState.accounts, apiState.accounts);
            if (apiState.projects) updates.projects = mergeById(currentState.projects, apiState.projects);
            if (apiState.buildings) updates.buildings = mergeById(currentState.buildings, apiState.buildings);
            if (apiState.properties) updates.properties = mergeById(currentState.properties, apiState.properties);
            if (apiState.units) updates.units = mergeById(currentState.units, apiState.units);
            if (apiState.vendors) updates.vendors = mergeById(currentState.vendors || [], apiState.vendors);
            if (apiState.recurringInvoiceTemplates) updates.recurringInvoiceTemplates = mergeById(currentState.recurringInvoiceTemplates || [], apiState.recurringInvoiceTemplates);
            if (Object.keys(updates).length === 0) return null;
            const mergedState = { ...stateRef.current, ...updates };
            dispatch({ type: 'SET_STATE', payload: mergedState, _isRemote: true } as any);
            setStoredState(prev => ({ ...prev, ...updates }));
            return mergedState as AppState;
        };

        const persistLoadedStateToDb = async (mergedState: AppState | null) => {
            if (!mergedState || !saveNow) return;
            try {
                const dbService = getDatabaseService();
                if (dbService.isReady()) {
                    await saveNow(mergedState, { disableSyncQueueing: true });
                    logger.logCategory('sync', '✅ Saved cloud data to local database');
                }
            } catch (saveErr) {
                console.warn('[CloudSync] Failed to save loaded data to local DB:', saveErr);
            }
        };

        try {
            // STEP 1: Load critical entities FIRST (accounts, contacts, categories, projects, buildings, properties, units)
            // This allows the UI to become interactive in <10 seconds even with large datasets
            setInitMessage('Loading critical data...');
            try {
                const critical = await apiService.loadStateBulk('accounts,contacts,categories,projects,buildings,properties,units,vendors');
                if (critical && Object.keys(critical).length > 0) {
                    const mergedCritical = applyApiState(critical);
                    if (mergedCritical) persistLoadedStateToDb(mergedCritical);
                    onCriticalLoaded?.(); // UI becomes interactive here

                    // STEP 2: Load remaining data in background (chunked, non-blocking)
                    setInitMessage('Loading additional data...');
                    apiService.loadStateBulkChunked((loaded, total) => {
                        setLoadProgress({ loaded, total });
                        setInitMessage(`Loading data: ${loaded}/${total} records`);
                        if (total > 0) {
                            setInitProgress(Math.round((loaded / total) * 100));
                        }
                    }, 200) // 200 records per chunk
                        .then(full => {
                            const mergedFull = applyApiState(full);
                            if (mergedFull) persistLoadedStateToDb(mergedFull);
                            setLoadProgress(null);
                            setInitMessage('Data loaded');
                            setInitProgress(100);
                            logger.logCategory('sync', '✅ Background data load complete');
                        })
                        .catch(err => {
                            console.error('⚠️ Background chunked load failed:', err);
                            setLoadProgress(null);
                            // Fallback to regular bulk load if chunked fails
                            logger.logCategory('sync', '⚠️ Chunked load failed, falling back to bulk');
                            apiService.loadStateBulk()
                                .then(full => {
                                    const merged = applyApiState(full);
                                    if (merged) persistLoadedStateToDb(merged);
                                })
                                .catch(bulkErr => console.error('⚠️ Bulk fallback also failed:', bulkErr));
                        });
                    return;
                }
            } catch (criticalErr: any) {
                console.warn('⚠️ Critical load failed, falling back to full load:', criticalErr);
            }

            // STEP 3: Fallback to old behavior if critical endpoint fails
            let apiState: Partial<AppState>;
            try {
                apiState = await apiService.loadStateBulk();
            } catch (bulkErr: any) {
                if (bulkErr?.status === 404 || bulkErr?.message?.includes('404')) {
                    apiState = await apiService.loadState();
                } else {
                    throw bulkErr;
                }
            }
            const mergedFallback = applyApiState(apiState);
            if (mergedFallback) persistLoadedStateToDb(mergedFallback);
            onCriticalLoaded?.();
        } catch (err) {
            console.error('⚠️ Failed to refresh data from API:', err);
            onCriticalLoaded?.();
        }
    }, [dispatch, isAuthenticated, setStoredState, setInitMessage, setInitProgress, setLoadProgress, saveNow]);

    // Store refreshFromApi in a ref so WebSocket handlers always use the latest version
    const refreshFromApiRef = useRef(refreshFromApi);
    useEffect(() => {
        refreshFromApiRef.current = refreshFromApi;
    }, [refreshFromApi]);

    // Run refreshFromApi only after user logs in (not on initial load with existing session — init background sync handles that)
    useEffect(() => {
        const handleLoginSuccess = () => {
            logger.logCategory('sync', '📡 Login success: loading data from cloud...');
            // Brief delay so localStorage/auth state and API client are fully updated before first request
            setTimeout(() => {
                refreshFromApiRef.current(undefined);
            }, 100);
        };
        window.addEventListener('auth:login-success', handleLoginSuccess);
        return () => window.removeEventListener('auth:login-success', handleLoginSuccess);
    }, []);

    // Reload AppContext from local DB when bidirectional sync completes (sync writes to DB but does not update React state)
    useEffect(() => {
        const handleBidirDownstreamComplete = async () => {
            try {
                const dbService = getDatabaseService();
                if (!dbService.isReady()) return;
                const appStateRepo = await getAppStateRepository();
                const loadedState = await appStateRepo.loadState();
                if (loadedState && (loadedState.transactions?.length > 0 || loadedState.contacts?.length > 0 || loadedState.invoices?.length > 0 || loadedState.accounts?.length > 0)) {
                    dispatch({ type: 'SET_STATE', payload: loadedState, _isRemote: true } as any);
                    setStoredState(loadedState as AppState);
                    logger.logCategory('sync', '✅ Reloaded AppContext from DB after bidirectional sync', {
                        transactions: loadedState.transactions?.length ?? 0,
                        contacts: loadedState.contacts?.length ?? 0,
                    });
                }
            } catch (err) {
                logger.warnCategory('sync', '⚠️ Failed to reload state after bidir sync:', err);
            }
        };
        window.addEventListener('sync:bidir-downstream-complete', handleBidirDownstreamComplete as EventListener);
        return () => window.removeEventListener('sync:bidir-downstream-complete', handleBidirDownstreamComplete as EventListener);
    }, [dispatch, setStoredState]);

    // Listen for cloud settings loaded after login
    useEffect(() => {
        const handleCloudSettingsLoaded = async (event: CustomEvent) => {
            const cloudSettings = event.detail;
            if (!cloudSettings || typeof cloudSettings !== 'object') return;


            // Apply settings to state
            if (cloudSettings.printSettings) {
                dispatch({ type: 'UPDATE_PRINT_SETTINGS', payload: cloudSettings.printSettings });
            }
            if (cloudSettings.whatsAppTemplates) {
                dispatch({ type: 'UPDATE_WHATSAPP_TEMPLATES', payload: cloudSettings.whatsAppTemplates });
            }
            if (cloudSettings.showSystemTransactions !== undefined) {
                dispatch({ type: 'TOGGLE_SYSTEM_TRANSACTIONS', payload: cloudSettings.showSystemTransactions });
            }
            if (cloudSettings.enableColorCoding !== undefined) {
                dispatch({ type: 'TOGGLE_COLOR_CODING', payload: cloudSettings.enableColorCoding });
            }
            if (cloudSettings.enableBeepOnSave !== undefined) {
                dispatch({ type: 'TOGGLE_BEEP_ON_SAVE', payload: cloudSettings.enableBeepOnSave });
            }
            if (cloudSettings.enableDatePreservation !== undefined) {
                dispatch({ type: 'TOGGLE_DATE_PRESERVATION', payload: cloudSettings.enableDatePreservation });
            }
            if (cloudSettings.defaultProjectId !== undefined) {
                dispatch({ type: 'UPDATE_DEFAULT_PROJECT', payload: cloudSettings.defaultProjectId });
            }
            if (cloudSettings.dashboardConfig) {
                dispatch({ type: 'UPDATE_DASHBOARD_CONFIG', payload: cloudSettings.dashboardConfig });
            }
            if (cloudSettings.agreementSettings) {
                dispatch({ type: 'UPDATE_AGREEMENT_SETTINGS', payload: cloudSettings.agreementSettings });
            }
            if (cloudSettings.projectAgreementSettings) {
                dispatch({ type: 'UPDATE_PROJECT_AGREEMENT_SETTINGS', payload: cloudSettings.projectAgreementSettings });
            }
            if (cloudSettings.rentalInvoiceSettings) {
                dispatch({ type: 'UPDATE_RENTAL_INVOICE_SETTINGS', payload: cloudSettings.rentalInvoiceSettings });
            }
            if (cloudSettings.projectInvoiceSettings) {
                dispatch({ type: 'UPDATE_PROJECT_INVOICE_SETTINGS', payload: cloudSettings.projectInvoiceSettings });
            }

        };

        window.addEventListener('load-cloud-settings', handleCloudSettingsLoaded as EventListener);
        return () => {
            window.removeEventListener('load-cloud-settings', handleCloudSettingsLoaded as EventListener);
        };
    }, [dispatch]);

    // Real-time sync via WebSocket events
    useEffect(() => {
        let cleanup: (() => void) | undefined;

        const setupWebSocket = async () => {
            if (!isAuthenticated) return;
            try {
                const { apiClient } = await import('../services/api/client');
                const token = apiClient.getToken();
                const tenantId = apiClient.getTenantId();
                if (!token || !tenantId) return;
                if (apiClient.isTokenExpired()) {
                    console.warn('⚠️ Token expired, skipping WebSocket connection');
                    return;
                }

                // Check if real-time sync should be enabled
                // Sync is only enabled if there are 2+ active users in the organization
                let shouldEnableSync = false;
                try {
                    const syncStatus = await apiClient.get<{ shouldEnableSync: boolean; userCount: number }>('/tenants/should-enable-sync');
                    shouldEnableSync = syncStatus.shouldEnableSync;
                    if (!shouldEnableSync) {
                        return;
                    }
                } catch (syncCheckError) {
                    // If check fails, log warning but don't block - allow connection to proceed
                    // This ensures sync still works even if the endpoint is temporarily unavailable
                    console.warn('⚠️ Could not determine if sync should be enabled, proceeding with connection:', syncCheckError);
                    shouldEnableSync = true;
                }

                if (!shouldEnableSync) return;

                const { getWebSocketClient } = await import('../services/websocketClient');
                const ws = getWebSocketClient();
                ws.connect(token, tenantId);

                // Throttle refresh to avoid bursts
                let pending = false;
                const scheduleRefresh = (eventData?: any) => {
                    // Ignore events from the current user - they already have the data locally
                    // This prevents the refresh from overwriting optimistic updates
                    const currentUser = stateRef.current.currentUser;
                    if (eventData?.userId && currentUser?.id) {
                        if (eventData.userId === currentUser.id) {
                            return;
                        }
                    }

                    if (pending) return;
                    pending = true;
                    setTimeout(() => {
                        pending = false;
                        // Use ref to get latest refreshFromApi without adding it as dependency
                        refreshFromApiRef.current();
                    }, 300);
                };

                // Helper: normalize bill shape from server event payload
                const normalizeBillFromEvent = (payloadBill: any) => {
                    if (!payloadBill) return null;
                    return {
                        id: payloadBill.id,
                        billNumber: payloadBill.bill_number ?? payloadBill.billNumber,
                        contactId: payloadBill.contact_id ?? payloadBill.contactId,
                        amount: typeof payloadBill.amount === 'number' ? payloadBill.amount : parseFloat(String(payloadBill.amount ?? '0')),
                        paidAmount: typeof payloadBill.paid_amount === 'number'
                            ? payloadBill.paid_amount
                            : (typeof payloadBill.paidAmount === 'number' ? payloadBill.paidAmount : parseFloat(String(payloadBill.paid_amount ?? payloadBill.paidAmount ?? '0'))),
                        status: payloadBill.status ?? 'Unpaid',
                        issueDate: payloadBill.issue_date ?? payloadBill.issueDate,
                        dueDate: payloadBill.due_date ?? payloadBill.dueDate ?? undefined,
                        description: payloadBill.description ?? undefined,
                        categoryId: payloadBill.category_id ?? payloadBill.categoryId ?? undefined,
                        projectId: payloadBill.project_id ?? payloadBill.projectId ?? undefined,
                        buildingId: payloadBill.building_id ?? payloadBill.buildingId ?? undefined,
                        propertyId: payloadBill.property_id ?? payloadBill.propertyId ?? undefined,
                        projectAgreementId: payloadBill.project_agreement_id ?? payloadBill.projectAgreementId ?? undefined,
                        contractId: payloadBill.contract_id ?? payloadBill.contractId ?? undefined,
                        staffId: payloadBill.staff_id ?? payloadBill.staffId ?? undefined,
                        documentPath: payloadBill.document_path ?? payloadBill.documentPath ?? undefined,
                        expenseCategoryItems: (() => {
                            const items = payloadBill.expense_category_items ?? payloadBill.expenseCategoryItems;
                            if (!items) return undefined;
                            if (typeof items === 'string' && items.trim().length > 0) {
                                try { return JSON.parse(items); } catch { return undefined; }
                            }
                            return Array.isArray(items) ? items : undefined;
                        })()
                    };
                };

                // Helper: normalize transaction from event payload
                const normalizeTransactionFromEvent = (t: any) => {
                    if (!t) return null;
                    return {
                        id: t.id,
                        type: t.type,
                        subtype: t.subtype ?? undefined,
                        amount: typeof t.amount === 'number' ? t.amount : parseFloat(String(t.amount ?? '0')),
                        date: t.date,
                        description: t.description ?? undefined,
                        accountId: t.account_id ?? t.accountId,
                        fromAccountId: t.from_account_id ?? t.fromAccountId ?? undefined,
                        toAccountId: t.to_account_id ?? t.toAccountId ?? undefined,
                        categoryId: t.category_id ?? t.categoryId ?? undefined,
                        contactId: t.contact_id ?? t.contactId ?? undefined,
                        projectId: t.project_id ?? t.projectId ?? undefined,
                        buildingId: t.building_id ?? t.buildingId ?? undefined,
                        propertyId: t.property_id ?? t.propertyId ?? undefined,
                        unitId: t.unit_id ?? t.unitId ?? undefined,
                        invoiceId: t.invoice_id ?? t.invoiceId ?? undefined,
                        billId: t.bill_id ?? t.billId ?? undefined,
                        contractId: t.contract_id ?? t.contractId ?? undefined,
                        agreementId: t.agreement_id ?? t.agreementId ?? undefined,
                        batchId: t.batch_id ?? t.batchId ?? undefined,
                        isSystem: t.is_system === true || t.is_system === 1 || t.isSystem === true || false,
                        userId: t.user_id ?? t.userId ?? undefined,
                        children: t.children ?? undefined
                    };
                };

                // Helper: normalize invoice from event payload
                const normalizeInvoiceFromEvent = (inv: any) => {
                    if (!inv) return null;
                    return {
                        id: inv.id,
                        invoiceNumber: inv.invoice_number ?? inv.invoiceNumber ?? '',
                        contactId: inv.contact_id ?? inv.contactId ?? '',
                        amount: typeof inv.amount === 'number' ? inv.amount : parseFloat(String(inv.amount ?? '0')),
                        paidAmount: typeof inv.paid_amount === 'number'
                            ? inv.paid_amount
                            : (typeof inv.paidAmount === 'number' ? inv.paidAmount : parseFloat(String(inv.paid_amount ?? inv.paidAmount ?? '0'))),
                        status: inv.status ?? 'Unpaid',
                        issueDate: inv.issue_date ?? inv.issueDate ?? '',
                        dueDate: inv.due_date ?? inv.dueDate ?? '',
                        invoiceType: inv.invoice_type ?? inv.invoiceType ?? 'Sales',
                        description: inv.description ?? undefined,
                        projectId: inv.project_id ?? inv.projectId ?? undefined,
                        buildingId: inv.building_id ?? inv.buildingId ?? undefined,
                        propertyId: inv.property_id ?? inv.propertyId ?? undefined,
                        unitId: inv.unit_id ?? inv.unitId ?? undefined,
                        categoryId: inv.category_id ?? inv.categoryId ?? undefined,
                        agreementId: inv.agreement_id ?? inv.agreementId ?? undefined,
                        securityDepositCharge: inv.security_deposit_charge ?? inv.securityDepositCharge ?? undefined,
                        serviceCharges: inv.service_charges ?? inv.serviceCharges ?? undefined,
                        rentalMonth: inv.rental_month ?? inv.rentalMonth ?? undefined,
                    };
                };

                // Helper: normalize rental agreement from event payload
                const normalizeRentalAgreementFromEvent = (ra: any) => {
                    if (!ra) return null;
                    return {
                        id: ra.id,
                        agreementNumber: ra.agreement_number ?? ra.agreementNumber ?? '',
                        contactId: ra.contact_id ?? ra.contactId ?? '',
                        propertyId: ra.property_id ?? ra.propertyId ?? '',
                        startDate: ra.start_date ?? ra.startDate ?? '',
                        endDate: ra.end_date ?? ra.endDate ?? '',
                        monthlyRent: typeof ra.monthly_rent === 'number' ? ra.monthly_rent : (typeof ra.monthlyRent === 'number' ? ra.monthlyRent : parseFloat(String(ra.monthly_rent ?? ra.monthlyRent ?? '0'))),
                        rentDueDate: ra.rent_due_date ?? ra.rentDueDate ?? undefined,
                        status: ra.status ?? 'Active',
                        description: ra.description ?? undefined,
                        securityDeposit: ra.security_deposit ?? ra.securityDeposit ?? undefined,
                        brokerId: ra.broker_id ?? ra.brokerId ?? undefined,
                        brokerFee: ra.broker_fee ?? ra.brokerFee ?? undefined,
                        ownerId: ra.owner_id ?? ra.ownerId ?? undefined,
                    };
                };

                // Helper: normalize recurring invoice template from event payload
                const normalizeRecurringTemplateFromEvent = (t: any) => {
                    if (!t) return null;
                    return {
                        id: t.id,
                        contactId: t.contact_id ?? t.contactId ?? '',
                        propertyId: t.property_id ?? t.propertyId ?? '',
                        buildingId: t.building_id ?? t.buildingId ?? '',
                        amount: typeof t.amount === 'number' ? t.amount : parseFloat(String(t.amount ?? '0')),
                        descriptionTemplate: t.description_template ?? t.descriptionTemplate ?? '',
                        dayOfMonth: typeof t.day_of_month === 'number' ? t.day_of_month : parseInt(String(t.day_of_month ?? t.dayOfMonth ?? '1')),
                        nextDueDate: t.next_due_date ?? t.nextDueDate ?? '',
                        active: t.active === true || t.active === 1 || t.active === 'true',
                        agreementId: t.agreement_id ?? t.agreementId ?? undefined,
                        invoiceType: t.invoice_type ?? t.invoiceType ?? 'Rental',
                        frequency: t.frequency ?? 'Monthly',
                        autoGenerate: t.auto_generate === true || t.auto_generate === 1 || t.autoGenerate === true,
                        maxOccurrences: t.max_occurrences ?? t.maxOccurrences ?? undefined,
                        generatedCount: typeof t.generated_count === 'number' ? t.generated_count : (typeof t.generatedCount === 'number' ? t.generatedCount : parseInt(String(t.generated_count ?? t.generatedCount ?? '0'))),
                        lastGeneratedDate: t.last_generated_date ?? t.lastGeneratedDate ?? undefined,
                    };
                };

                const events = [
                    'transaction:created', 'transaction:updated', 'transaction:deleted',
                    'bill:created', 'bill:updated', 'bill:deleted',
                    'invoice:created', 'invoice:updated', 'invoice:deleted',
                    'contact:created', 'contact:updated', 'contact:deleted',
                    'vendor:created', 'vendor:updated', 'vendor:deleted',
                    'project:created', 'project:updated', 'project:deleted',
                    'account:created', 'account:updated', 'account:deleted',
                    'category:created', 'category:updated', 'category:deleted',
                    'budget:created', 'budget:updated', 'budget:deleted',
                    'rental_agreement:created', 'rental_agreement:updated', 'rental_agreement:deleted',
                    'project_agreement:created', 'project_agreement:updated', 'project_agreement:deleted',
                    'sales_return:created', 'sales_return:updated', 'sales_return:deleted',
                    'contract:created', 'contract:updated', 'contract:deleted',
                    'building:created', 'building:updated', 'building:deleted',
                    'property:created', 'property:updated', 'property:deleted',
                    'unit:created', 'unit:updated', 'unit:deleted',
                    'loan_advance_record:created', 'loan_advance_record:updated', 'loan_advance_record:deleted',
                    'installment_plan:created', 'installment_plan:updated', 'installment_plan:deleted',
                    'plan_amenity:created', 'plan_amenity:updated', 'plan_amenity:deleted',
                    'recurring_invoice_template:created', 'recurring_invoice_template:updated', 'recurring_invoice_template:deleted'
                ];

                // Events that have specific handlers below → we dispatch directly, no full refresh.
                // Only schedule a full refresh for event types we don't handle specifically (avoids re-sync on every WS event / navigation).
                const eventsWithSpecificHandlers = new Set([
                    'bill:created', 'bill:updated', 'bill:deleted',
                    'transaction:created', 'transaction:updated', 'transaction:deleted',
                    'invoice:created', 'invoice:updated', 'invoice:deleted',
                    'rental_agreement:created', 'rental_agreement:updated', 'rental_agreement:deleted',
                    'recurring_invoice_template:created', 'recurring_invoice_template:updated', 'recurring_invoice_template:deleted',
                    'contact:created', 'contact:updated', 'contact:deleted',
                    'vendor:created', 'vendor:updated', 'vendor:deleted'
                ]);
                const fallbackEvents = events.filter(evt => !eventsWithSpecificHandlers.has(evt));
                const unsubFallback = fallbackEvents.map(evt => ws.on(evt, (data: any) => scheduleRefresh(data)));

                // Direct, immediate handlers to reflect payments across users without waiting for refresh
                const currentUserId = stateRef.current.currentUser?.id;
                const unsubSpecific: Array<() => void> = [];

                // Bill events
                unsubSpecific.push(ws.on('bill:updated', (data: any) => {
                    if (data?.userId && currentUserId && data.userId === currentUserId) return;
                    const payloadBill = data?.bill ?? data;
                    const normalized = normalizeBillFromEvent(payloadBill);
                    if (!normalized) return;
                    const existing = stateRef.current.bills.find(b => b.id === normalized.id);
                    const merged = existing ? { ...existing, ...normalized } : normalized;

                    // Mark as remote to prevent sync loop
                    dispatch({
                        type: existing ? 'UPDATE_BILL' : 'ADD_BILL',
                        payload: merged,
                        _isRemote: true
                    } as any);

                    // Update related PM cycle allocation when bill payment status changes
                    if (existing && (existing.paidAmount !== merged.paidAmount || existing.status !== merged.status)) {
                        const relatedAllocation = stateRef.current.pmCycleAllocations?.find(
                            (a: any) => a.billId === merged.id
                        );
                        if (relatedAllocation) {
                            const updatedAllocation = {
                                ...relatedAllocation,
                                paidAmount: merged.paidAmount || 0,
                                status: merged.status === 'Paid' ? 'paid' :
                                    merged.status === 'Partially Paid' ? 'partially_paid' : 'unpaid'
                            };
                            dispatch({
                                type: 'UPDATE_PM_CYCLE_ALLOCATION',
                                payload: updatedAllocation,
                                _isRemote: true
                            } as any);
                        }
                    }
                }));
                unsubSpecific.push(ws.on('bill:created', (data: any) => {
                    if (data?.userId && currentUserId && data.userId === currentUserId) return;
                    const payloadBill = data?.bill ?? data;
                    const normalized = normalizeBillFromEvent(payloadBill);
                    if (!normalized) return;
                    const exists = stateRef.current.bills.some(b => b.id === normalized.id);
                    if (!exists) {
                        dispatch({
                            type: 'ADD_BILL',
                            payload: normalized,
                            _isRemote: true
                        } as any);
                    }
                }));
                unsubSpecific.push(ws.on('bill:deleted', (data: any) => {
                    if (data?.userId && currentUserId && data.userId === currentUserId) return;
                    const id = data?.billId ?? data?.id;
                    if (!id) return;
                    dispatch({
                        type: 'DELETE_BILL',
                        payload: id,
                        _isRemote: true
                    } as any);
                }));

                // Transaction events (so payments appear immediately)
                unsubSpecific.push(ws.on('transaction:created', (data: any) => {
                    if (data?.userId && currentUserId && data.userId === currentUserId) return;
                    const payloadTx = data?.transaction ?? data;
                    const normalizedTx = normalizeTransactionFromEvent(payloadTx);
                    if (!normalizedTx) return;
                    const exists = stateRef.current.transactions.some(t => t.id === normalizedTx.id);
                    if (!exists) {
                        dispatch({
                            type: 'ADD_TRANSACTION',
                            payload: normalizedTx,
                            _isRemote: true
                        } as any);
                    }
                }));
                unsubSpecific.push(ws.on('transaction:updated', (data: any) => {
                    if (data?.userId && currentUserId && data.userId === currentUserId) return;
                    const payloadTx = data?.transaction ?? data;
                    const normalizedTx = normalizeTransactionFromEvent(payloadTx);
                    if (!normalizedTx) return;
                    dispatch({
                        type: 'UPDATE_TRANSACTION',
                        payload: normalizedTx,
                        _isRemote: true
                    } as any);
                }));
                unsubSpecific.push(ws.on('transaction:deleted', (data: any) => {
                    if (data?.userId && currentUserId && data.userId === currentUserId) return;
                    const id = data?.transactionId ?? data?.id;
                    if (!id) return;
                    dispatch({
                        type: 'DELETE_TRANSACTION',
                        payload: id,
                        _isRemote: true
                    } as any);
                }));

                // Invoice events (so invoice status updates appear immediately)
                unsubSpecific.push(ws.on('invoice:created', (data: any) => {
                    if (data?.userId && currentUserId && data.userId === currentUserId) return;
                    const payloadInv = data?.invoice ?? data;
                    const normalized = normalizeInvoiceFromEvent(payloadInv);
                    if (!normalized) return;
                    const exists = stateRef.current.invoices.some(i => i.id === normalized.id);
                    if (!exists) {
                        dispatch({
                            type: 'ADD_INVOICE',
                            payload: normalized,
                            _isRemote: true
                        } as any);
                    }
                }));
                unsubSpecific.push(ws.on('invoice:updated', (data: any) => {
                    if (data?.userId && currentUserId && data.userId === currentUserId) return;
                    const payloadInv = data?.invoice ?? data;
                    const normalized = normalizeInvoiceFromEvent(payloadInv);
                    if (!normalized) return;
                    const existing = stateRef.current.invoices.find(i => i.id === normalized.id);
                    const merged = existing ? { ...existing, ...normalized } : normalized;
                    dispatch({
                        type: existing ? 'UPDATE_INVOICE' : 'ADD_INVOICE',
                        payload: merged,
                        _isRemote: true
                    } as any);
                }));
                unsubSpecific.push(ws.on('invoice:deleted', (data: any) => {
                    if (data?.userId && currentUserId && data.userId === currentUserId) return;
                    const id = data?.invoiceId ?? data?.id;
                    if (!id) return;
                    dispatch({
                        type: 'DELETE_INVOICE',
                        payload: id,
                        _isRemote: true
                    } as any);
                }));

                // Rental Agreement events (so agreements appear immediately)
                unsubSpecific.push(ws.on('rental_agreement:created', (data: any) => {
                    if (data?.userId && currentUserId && data.userId === currentUserId) return;
                    const payloadAgreement = data?.agreement ?? data?.rentalAgreement ?? data?.rental_agreement ?? data;
                    const normalized = normalizeRentalAgreementFromEvent(payloadAgreement);
                    if (!normalized) return;
                    const exists = stateRef.current.rentalAgreements.some(r => r.id === normalized.id);
                    if (!exists) {
                        dispatch({
                            type: 'ADD_RENTAL_AGREEMENT',
                            payload: normalized,
                            _isRemote: true
                        } as any);
                    }
                }));
                unsubSpecific.push(ws.on('rental_agreement:updated', (data: any) => {
                    if (data?.userId && currentUserId && data.userId === currentUserId) return;
                    const payloadAgreement = data?.agreement ?? data?.rentalAgreement ?? data?.rental_agreement ?? data;
                    const normalized = normalizeRentalAgreementFromEvent(payloadAgreement);
                    if (!normalized) return;
                    const existing = stateRef.current.rentalAgreements.find(r => r.id === normalized.id);
                    const merged = existing ? { ...existing, ...normalized } : normalized;
                    dispatch({
                        type: existing ? 'UPDATE_RENTAL_AGREEMENT' : 'ADD_RENTAL_AGREEMENT',
                        payload: merged,
                        _isRemote: true
                    } as any);
                }));
                unsubSpecific.push(ws.on('rental_agreement:deleted', (data: any) => {
                    if (data?.userId && currentUserId && data.userId === currentUserId) return;
                    const id = data?.agreementId ?? data?.id;
                    if (!id) return;
                    dispatch({
                        type: 'DELETE_RENTAL_AGREEMENT',
                        payload: id,
                        _isRemote: true
                    } as any);
                }));

                // Recurring Invoice Template events (so schedules sync immediately across devices)
                unsubSpecific.push(ws.on('recurring_invoice_template:created', (data: any) => {
                    if (data?.userId && currentUserId && data.userId === currentUserId) return;
                    const payloadTemplate = data?.template ?? data;
                    const normalized = normalizeRecurringTemplateFromEvent(payloadTemplate);
                    if (!normalized) return;
                    const exists = stateRef.current.recurringInvoiceTemplates.some(t => t.id === normalized.id);
                    if (!exists) {
                        dispatch({
                            type: 'ADD_RECURRING_TEMPLATE',
                            payload: normalized,
                            _isRemote: true
                        } as any);
                    }
                }));
                unsubSpecific.push(ws.on('recurring_invoice_template:updated', (data: any) => {
                    if (data?.userId && currentUserId && data.userId === currentUserId) return;
                    const payloadTemplate = data?.template ?? data;
                    const normalized = normalizeRecurringTemplateFromEvent(payloadTemplate);
                    if (!normalized) return;
                    const existing = stateRef.current.recurringInvoiceTemplates.find(t => t.id === normalized.id);
                    const merged = existing ? { ...existing, ...normalized } : normalized;
                    dispatch({
                        type: existing ? 'UPDATE_RECURRING_TEMPLATE' : 'ADD_RECURRING_TEMPLATE',
                        payload: merged,
                        _isRemote: true
                    } as any);
                }));
                unsubSpecific.push(ws.on('recurring_invoice_template:deleted', (data: any) => {
                    if (data?.userId && currentUserId && data.userId === currentUserId) return;
                    const id = data?.templateId ?? data?.id;
                    if (!id) return;
                    dispatch({
                        type: 'DELETE_RECURRING_TEMPLATE',
                        payload: id,
                        _isRemote: true
                    } as any);
                }));

                // Contact events - immediate updates for real-time sync
                unsubSpecific.push(ws.on('contact:created', (data: any) => {
                    if (data?.userId && currentUserId && data.userId === currentUserId) return;
                    const payloadContact = data?.contact ?? data;
                    if (!payloadContact || !payloadContact.id) return;

                    // Check if contact already exists (prevent duplicates)
                    const exists = stateRef.current.contacts.some(c => c.id === payloadContact.id);
                    if (exists) return;

                    // Normalize contact data (snake_case -> camelCase)
                    const normalized = {
                        id: payloadContact.id,
                        name: payloadContact.name,
                        type: payloadContact.type,
                        contactNo: payloadContact.contact_no ?? payloadContact.contactNo ?? undefined,
                        companyName: payloadContact.company_name ?? payloadContact.companyName ?? undefined,
                        address: payloadContact.address ?? undefined,
                        description: payloadContact.description ?? undefined,
                        userId: payloadContact.user_id ?? payloadContact.userId ?? undefined,
                        createdAt: payloadContact.created_at ?? payloadContact.createdAt ?? new Date().toISOString(),
                        updatedAt: payloadContact.updated_at ?? payloadContact.updatedAt ?? new Date().toISOString()
                    };

                    dispatch({
                        type: 'ADD_CONTACT',
                        payload: normalized,
                        _isRemote: true
                    } as any);
                }));

                unsubSpecific.push(ws.on('contact:updated', (data: any) => {
                    if (data?.userId && currentUserId && data.userId === currentUserId) return;
                    const payloadContact = data?.contact ?? data;
                    if (!payloadContact || !payloadContact.id) return;

                    const existing = stateRef.current.contacts.find(c => c.id === payloadContact.id);

                    // Normalize and merge with existing data (snake_case -> camelCase)
                    const normalized = {
                        id: payloadContact.id,
                        name: payloadContact.name,
                        type: payloadContact.type,
                        contactNo: payloadContact.contact_no ?? payloadContact.contactNo ?? undefined,
                        companyName: payloadContact.company_name ?? payloadContact.companyName ?? undefined,
                        address: payloadContact.address ?? undefined,
                        description: payloadContact.description ?? undefined,
                        userId: payloadContact.user_id ?? payloadContact.userId ?? undefined,
                        createdAt: payloadContact.created_at ?? payloadContact.createdAt ?? existing?.createdAt ?? new Date().toISOString(),
                        updatedAt: payloadContact.updated_at ?? payloadContact.updatedAt ?? new Date().toISOString()
                    };

                    const merged = existing ? { ...existing, ...normalized } : normalized;

                    dispatch({
                        type: existing ? 'UPDATE_CONTACT' : 'ADD_CONTACT',
                        payload: merged,
                        _isRemote: true
                    } as any);
                }));

                unsubSpecific.push(ws.on('contact:deleted', (data: any) => {
                    if (data?.userId && currentUserId && data.userId === currentUserId) return;
                    const id = data?.contactId ?? data?.id;
                    if (!id) return;

                    dispatch({
                        type: 'DELETE_CONTACT',
                        payload: id,
                        _isRemote: true
                    } as any);
                }));

                // Vendor events - immediate updates for real-time sync
                unsubSpecific.push(ws.on('vendor:created', (data: any) => {
                    if (data?.userId && currentUserId && data.userId === currentUserId) return;
                    const payloadVendor = data?.vendor ?? data;
                    if (!payloadVendor || !payloadVendor.id) return;

                    // Check if vendor already exists (prevent duplicates)
                    const exists = stateRef.current.vendors.some(v => v.id === payloadVendor.id);
                    if (exists) return;

                    // Normalize vendor data (snake_case -> camelCase)
                    const normalized = {
                        id: payloadVendor.id,
                        name: payloadVendor.name,
                        description: payloadVendor.description ?? undefined,
                        contactNo: payloadVendor.contact_no ?? payloadVendor.contactNo ?? undefined,
                        companyName: payloadVendor.company_name ?? payloadVendor.companyName ?? undefined,
                        address: payloadVendor.address ?? undefined,
                        userId: payloadVendor.user_id ?? payloadVendor.userId ?? undefined,
                        createdAt: payloadVendor.created_at ?? payloadVendor.createdAt ?? new Date().toISOString(),
                        updatedAt: payloadVendor.updated_at ?? payloadVendor.updatedAt ?? new Date().toISOString()
                    };

                    dispatch({
                        type: 'ADD_VENDOR',
                        payload: normalized,
                        _isRemote: true
                    } as any);
                }));

                unsubSpecific.push(ws.on('vendor:updated', (data: any) => {
                    if (data?.userId && currentUserId && data.userId === currentUserId) return;
                    const payloadVendor = data?.vendor ?? data;
                    if (!payloadVendor || !payloadVendor.id) return;

                    const existing = stateRef.current.vendors.find(v => v.id === payloadVendor.id);

                    // Normalize and merge with existing data
                    const normalized = {
                        id: payloadVendor.id,
                        name: payloadVendor.name,
                        description: payloadVendor.description ?? undefined,
                        contactNo: payloadVendor.contact_no ?? payloadVendor.contactNo ?? undefined,
                        companyName: payloadVendor.company_name ?? payloadVendor.companyName ?? undefined,
                        address: payloadVendor.address ?? undefined,
                        userId: payloadVendor.user_id ?? payloadVendor.userId ?? undefined,
                        createdAt: payloadVendor.created_at ?? payloadVendor.createdAt ?? existing?.createdAt ?? new Date().toISOString(),
                        updatedAt: payloadVendor.updated_at ?? payloadVendor.updatedAt ?? new Date().toISOString()
                    };

                    const merged = existing ? { ...existing, ...normalized } : normalized;

                    dispatch({
                        type: existing ? 'UPDATE_VENDOR' : 'ADD_VENDOR',
                        payload: merged,
                        _isRemote: true
                    } as any);
                }));

                unsubSpecific.push(ws.on('vendor:deleted', (data: any) => {
                    if (data?.userId && currentUserId && data.userId === currentUserId) return;
                    const id = data?.vendorId ?? data?.id;
                    if (!id) return;

                    dispatch({
                        type: 'DELETE_VENDOR',
                        payload: id,
                        _isRemote: true
                    } as any);
                }));


                cleanup = () => {
                    unsubFallback.forEach(unsub => unsub());
                    unsubSpecific.forEach(unsub => unsub());
                    ws.disconnect();
                };
            } catch (err) {
                console.error('⚠️ Failed to set up real-time sync:', err);
            }
        };

        setupWebSocket();

        return () => {
            if (cleanup) cleanup();
        };
    }, [isAuthenticated]); // Only depend on isAuthenticated, not refreshFromApi

    // 3. Persist State Changes (with error handling) - OPTIMIZED: Skip navigation-only changes
    // Use refs to track previous values for fast comparison (no JSON.stringify blocking)
    const prevContactsLengthRef = useRef(state.contacts.length);
    const prevTransactionsLengthRef = useRef(state.transactions.length);
    const prevInvoicesLengthRef = useRef(state.invoices.length);
    const prevBillsLengthRef = useRef(state.bills.length);
    const prevAccountsLengthRef = useRef(state.accounts.length);
    const prevProjectsLengthRef = useRef(state.projects.length);
    const prevBuildingsLengthRef = useRef(state.buildings.length);
    const prevPropertiesLengthRef = useRef(state.properties.length);
    const prevUnitsLengthRef = useRef(state.units.length);
    const prevCategoriesLengthRef = useRef(state.categories.length);
    const prevCurrentUserRef = useRef(state.currentUser);
    const prevCurrentPageRef = useRef(state.currentPage);

    useEffect(() => {
        if (!isInitializing) {
            // Fast check: Skip if only navigation changed (most common case)
            if (prevCurrentPageRef.current !== state.currentPage) {
                prevCurrentPageRef.current = state.currentPage;
                // Navigation change - skip save (performance optimization)
                return;
            }

            // Fast length checks (no expensive operations)
            const dataChanged =
                prevContactsLengthRef.current !== state.contacts.length ||
                prevTransactionsLengthRef.current !== state.transactions.length ||
                prevInvoicesLengthRef.current !== state.invoices.length ||
                prevBillsLengthRef.current !== state.bills.length ||
                prevAccountsLengthRef.current !== state.accounts.length ||
                prevProjectsLengthRef.current !== state.projects.length ||
                prevBuildingsLengthRef.current !== state.buildings.length ||
                prevPropertiesLengthRef.current !== state.properties.length ||
                prevUnitsLengthRef.current !== state.units.length ||
                prevCategoriesLengthRef.current !== state.categories.length ||
                prevCurrentUserRef.current !== state.currentUser;

            // Only persist if data changed
            if (dataChanged) {
                // Update refs
                prevContactsLengthRef.current = state.contacts.length;
                prevTransactionsLengthRef.current = state.transactions.length;
                prevInvoicesLengthRef.current = state.invoices.length;
                prevBillsLengthRef.current = state.bills.length;
                prevAccountsLengthRef.current = state.accounts.length;
                prevProjectsLengthRef.current = state.projects.length;
                prevBuildingsLengthRef.current = state.buildings.length;
                prevPropertiesLengthRef.current = state.properties.length;
                prevUnitsLengthRef.current = state.units.length;
                prevCategoriesLengthRef.current = state.categories.length;
                prevCurrentUserRef.current = state.currentUser;

                // Defer save to avoid blocking (use requestIdleCallback or setTimeout)
                if ('requestIdleCallback' in window) {
                    requestIdleCallback(() => {
                        try {
                            setStoredState(state);
                        } catch (error) {
                            console.error('Failed to persist state:', error);
                        }
                    });
                } else {
                    setTimeout(() => {
                        try {
                            setStoredState(state);
                        } catch (error) {
                            console.error('Failed to persist state:', error);
                        }
                    }, 0);
                }
            }
        }
    }, [state, setStoredState, isInitializing]);

    // 4. Force immediate save for critical operations (LOGIN, LOGOUT, ADD_CONTACT, etc.)
    const previousContactsLengthRef = useRef(state.contacts.length);
    const previousTransactionsLengthRef = useRef(state.transactions.length);
    const previousBillsLengthRef = useRef(state.bills.length);

    useEffect(() => {
        if (!isInitializing) {
            // Check if contacts, transactions, bills, or inventory items were added (critical data changes)
            const contactsChanged = state.contacts.length !== previousContactsLengthRef.current;
            const transactionsChanged = state.transactions.length !== previousTransactionsLengthRef.current;
            const billsChanged = state.bills.length !== previousBillsLengthRef.current;

            if (contactsChanged || transactionsChanged || billsChanged) {
                previousContactsLengthRef.current = state.contacts.length;
                previousTransactionsLengthRef.current = state.transactions.length;
                previousBillsLengthRef.current = state.bills.length;

                if (!useFallback && saveNow) {
                    const doSave = async () => {
                        try {
                            await saveNow(state, { disableSyncQueueing: true });
                        } catch (error) {
                            console.error('❌ Failed to save state after data change:', error);
                            const { getErrorLogger } = await import('../services/errorLogger');
                            getErrorLogger().logError(error instanceof Error ? error : new Error(String(error)), {
                                errorType: 'immediate_save_failed',
                                componentStack: 'AppContext immediate save',
                                stateSnapshot: {
                                    contacts: state.contacts.length,
                                    transactions: state.transactions.length,
                                    bills: state.bills.length
                                }
                            });
                        }
                    };
                    if (transactionsChanged) {
                        doSave();
                    } else {
                        const saveTimer = setTimeout(doSave, 200);
                        return () => clearTimeout(saveTimer);
                    }
                }
            }
        }
    }, [state.contacts.length, state.transactions.length, state.bills.length, state.invoices.length, isInitializing, state, useFallback, saveNow]);

    // 🔧 FIX: Sync authenticated user from AuthContext to AppContext state
    useEffect(() => {
        if (auth.user && auth.isAuthenticated) {
            // User is authenticated - sync to state if not already synced
            if (!state.currentUser || state.currentUser.id !== auth.user.id) {
                dispatch({
                    type: 'LOGIN',
                    payload: {
                        id: auth.user.id,
                        username: auth.user.username,
                        name: auth.user.name,
                        role: auth.user.role as UserRole
                    }
                });
            }
        } else if (!auth.isAuthenticated && state.currentUser) {
            // User logged out - clear from state
            dispatch({ type: 'LOGOUT' });
        }
    }, [auth.user, auth.isAuthenticated, state.currentUser]);

    useEffect(() => {
        if (!isInitializing && state.currentUser && !useFallback && saveNow) {
            const saveTimer = setTimeout(async () => {
                try {
                    await saveNow(state, { disableSyncQueueing: true });
                } catch (error) {
                    console.error('Failed to save state after login:', error);
                    // Check if it's a missing table error
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    if (errorMsg.includes('no such table')) {
                        console.error('❌ CRITICAL: Missing database table!', errorMsg);

                        // Show user-friendly error
                        const errorDiv = document.createElement('div');
                        errorDiv.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#dc2626;color:white;padding:16px 24px;border-radius:8px;z-index:9999;max-width:600px;box-shadow:0 4px 6px rgba(0,0,0,0.1);';
                        errorDiv.innerHTML = `
                            <strong>⚠️ Database Error Detected</strong><br/>
                            <small>Missing table: ${errorMsg.match(/no such table: (\w+)/)?.[1]}</small><br/>
                            <button id="fixDbButton" 
                                style="margin-top:8px;background:white;color:#dc2626;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;font-weight:bold;">
                                Click to Fix Now
                            </button>
                            <button onclick="this.parentElement.remove()" 
                                style="margin-top:8px;margin-left:8px;background:transparent;color:white;border:1px solid white;padding:8px 16px;border-radius:4px;cursor:pointer;">
                                Dismiss
                            </button>
                        `;
                        document.body.appendChild(errorDiv);

                        // Add proper async handler for Fix button
                        const fixButton = document.getElementById('fixDbButton');
                        if (fixButton) {
                            fixButton.onclick = async () => {
                                fixButton.textContent = 'Fixing...';
                                fixButton.style.opacity = '0.5';
                                fixButton.style.cursor = 'wait';

                                try {
                                    const { clearAllDatabaseStorage } = await import('../services/database/databaseService');
                                    await clearAllDatabaseStorage();

                                    setTimeout(() => location.reload(), 500);
                                } catch (error) {
                                    console.error('Error during fix:', error);
                                    fixButton.textContent = 'Error - Try again';
                                    fixButton.style.opacity = '1';
                                    fixButton.style.cursor = 'pointer';
                                }
                            };
                        }

                        setTimeout(() => errorDiv.remove(), 30000); // Auto-remove after 30s
                    }
                }
            }, 100); // Small delay to ensure state is updated

            return () => clearTimeout(saveTimer);
        }
    }, [state.currentUser, isInitializing, state, useFallback, saveNow]);

    // Listen for logout event to save state before logout
    useEffect(() => {
        const handleSaveStateBeforeLogout = async (event: CustomEvent) => {
            try {
                logger.logCategory('database', '💾 Saving state before logout...');
                if (!useFallback && saveNow) {
                    await saveNow(state);
                    logger.logCategory('database', '✅ State saved successfully before logout');
                } else if (!useFallback) {
                    const dbService = getDatabaseService();
                    if (dbService.isReady()) {
                        const appStateRepo = await getAppStateRepository();
                        await appStateRepo.saveState(state, true);
                        logger.logCategory('database', '✅ State saved successfully before logout');
                    } else {
                        logger.warnCategory('database', '⚠️ Database not ready, skipping save before logout');
                    }
                }
                window.dispatchEvent(new CustomEvent('state-saved-for-logout'));
            } catch (error) {
                logger.errorCategory('database', '❌ Failed to save state before logout:', error);
                window.dispatchEvent(new CustomEvent('state-saved-for-logout'));
            }
        };

        if (typeof window !== 'undefined') {
            window.addEventListener('save-state-before-logout', handleSaveStateBeforeLogout as EventListener);
            return () => {
                window.removeEventListener('save-state-before-logout', handleSaveStateBeforeLogout as EventListener);
            };
        }
    }, [state, useFallback, saveNow]);

    // Listen for incremental sync updates
    useEffect(() => {
        const handleChunkApplied = (event: CustomEvent) => {
            const { entities } = event.detail;
            if (entities && Object.keys(entities).length > 0) {
                dispatch({ type: 'BATCH_UPSERT_ENTITIES', payload: entities });
            }
        };

        if (typeof window !== 'undefined') {
            window.addEventListener('sync:chunk-applied', handleChunkApplied as EventListener);
            return () => {
                window.removeEventListener('sync:chunk-applied', handleChunkApplied as EventListener);
            };
        }
    }, [dispatch]);

    // Auto-sync: on session restore, load from API when state is empty (init may have run before auth completed)
    const sessionRestoreRefreshDoneRef = useRef(false);
    useEffect(() => {
        // When authenticated and init done, if state has no records, load from API (session restore case)
        if (isAuthenticated && !isInitializing && !sessionRestoreRefreshDoneRef.current) {
            const hasData = (state.contacts?.length ?? 0) > 0 || (state.transactions?.length ?? 0) > 0 ||
                (state.invoices?.length ?? 0) > 0 || (state.accounts?.length ?? 0) > 0;
            if (!hasData) {
                sessionRestoreRefreshDoneRef.current = true;
                refreshFromApiRef.current(undefined);
            }
        }
        if (!isAuthenticated) {
            sessionRestoreRefreshDoneRef.current = false;
        }

        // Update previous auth state
        prevAuthRef.current = isAuthenticated;
    }, [isAuthenticated, isInitializing, state.contacts?.length, state.transactions?.length, state.invoices?.length, state.accounts?.length]);

    // PERFORMANCE: Removed duplicate "reload data from API" effect that was dead code.
    // The condition `!prevAuthRef.current` could never be true here because the preceding
    // useEffect (auto-sync) already sets `prevAuthRef.current = isAuthenticated` before
    // this effect runs (React runs effects in declaration order).
    // The actual API load is handled by the refreshFromApi effect at line ~2738.

    // Clear local database when tenant changes (to prevent data leakage between tenants)
    useEffect(() => {
        const currentTenantId = auth.tenant?.id || null;
        const prevTenantId = prevTenantIdRef.current;

        // Detect tenant change: tenant exists, is different from previous, and we're authenticated
        if (isAuthenticated && currentTenantId && prevTenantId !== null && prevTenantId !== currentTenantId && !isInitializing) {
            logger.logCategory('sync', `🔄 Tenant changed (${prevTenantId} -> ${currentTenantId}), clearing local database...`);

            const clearLocalDatabase = async () => {
                try {
                    const dbService = getDatabaseService();
                    if (dbService.isReady()) {
                        // Clear all local data
                        dbService.clearAllData();
                        logger.logCategory('database', '✅ Cleared local database for tenant change');

                        // Reset state to initial state (keeping system defaults)
                        setStoredState(prev => ({
                            ...initialState,
                            // Preserve settings that should persist across tenants
                            printSettings: prev.printSettings,
                            whatsAppTemplates: prev.whatsAppTemplates,
                            invoiceHtmlTemplate: prev.invoiceHtmlTemplate,
                            dashboardConfig: prev.dashboardConfig,
                            agreementSettings: prev.agreementSettings,
                            projectAgreementSettings: prev.projectAgreementSettings,
                            rentalInvoiceSettings: prev.rentalInvoiceSettings,
                            projectInvoiceSettings: prev.projectInvoiceSettings,
                            showSystemTransactions: prev.showSystemTransactions,
                            enableColorCoding: prev.enableColorCoding,
                            enableBeepOnSave: prev.enableBeepOnSave,
                            enableDatePreservation: prev.enableDatePreservation,
                            pmCostPercentage: prev.pmCostPercentage,
                        }));

                        // Reload data from API for the new tenant
                        try {
                            logger.logCategory('sync', '🔄 Reloading data from API for new tenant...');
                            const apiService = getAppStateApiService();
                            const apiState = await apiService.loadState();

                            const prev = storedStateRef.current;
                            const fullState: AppState = {
                                ...prev,
                                accounts: apiState.accounts || [],
                                contacts: apiState.contacts || [],
                                transactions: apiState.transactions || [],
                                categories: apiState.categories || [],
                                projects: apiState.projects || [],
                                buildings: apiState.buildings || [],
                                properties: apiState.properties || [],
                                units: apiState.units || [],
                                invoices: apiState.invoices || [],
                                bills: apiState.bills || [],
                                budgets: apiState.budgets || [],
                                rentalAgreements: apiState.rentalAgreements || [],
                                projectAgreements: apiState.projectAgreements || [],
                                contracts: apiState.contracts || [],
                                vendors: (apiState.vendors || []).map((v: any) => ({
                                    ...v,
                                    isActive: v.isActive ?? v.is_active ?? true
                                })),
                                installmentPlans: apiState.installmentPlans || [],
                                planAmenities: apiState.planAmenities || [],
                                recurringInvoiceTemplates: apiState.recurringInvoiceTemplates || [],
                                salesReturns: apiState.salesReturns || [],
                                quotations: apiState.quotations || [],
                                documents: apiState.documents || [],
                                pmCycleAllocations: apiState.pmCycleAllocations || [],
                            };

                            setStoredState(fullState);
                            if (saveNow) {
                                try {
                                    await saveNow(fullState, { disableSyncQueueing: true });
                                } catch (err) {
                                    logger.errorCategory('database', '⚠️ Failed to save API data to local database:', err);
                                }
                            }

                            logger.logCategory('sync', '✅ Reloaded and saved data from API for new tenant:', {
                                contacts: apiState.contacts?.length || 0,
                                vendors: apiState.vendors?.length || 0,
                                projects: apiState.projects?.length || 0,
                                transactions: apiState.transactions?.length || 0,
                            });
                        } catch (error) {
                            logger.errorCategory('sync', '⚠️ Failed to reload data from API after tenant change:', error);
                        }
                    }
                } catch (error) {
                    logger.errorCategory('database', '⚠️ Failed to clear local database for tenant change:', error);
                }
            };

            // Small delay to ensure auth is fully updated
            setTimeout(clearLocalDatabase, 500);
        }

        // Update previous tenant ID
        prevTenantIdRef.current = currentTenantId;
    }, [auth.tenant?.id, isAuthenticated, isInitializing, setStoredState, saveNow]);

    // PERFORMANCE: Memoize the context value to prevent cascading re-renders.
    // Without this, every render of AppProvider creates a new { state, dispatch } object,
    // causing ALL 155+ context consumers to re-render even when nothing changed.
    // IMPORTANT: This useMemo MUST be called before any conditional returns below,
    // because React hooks must be called in the same order on every render.
    const contextValue = useMemo(() => ({ state, dispatch, isInitialDataLoading }), [state, dispatch, isInitialDataLoading]);

    // Show loading/initialization state
    if (isInitializing) {
        return (
            <InitializationScreen
                initMessage={initMessage}
                initProgress={initProgress}
                useFallback={useFallback}
            />
        );
    }

    return (
        <AppContext.Provider value={contextValue}>
            {children}
        </AppContext.Provider>
    );
};

export const useAppContext = () => {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error('useAppContext must be used within an AppProvider');
    }
    return context;
};