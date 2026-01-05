
import React, { createContext, useContext, useReducer, useEffect, useCallback, useState, useRef } from 'react';
import { AppState, AppAction, Transaction, TransactionType, Account, Category, AccountType, LoanSubtype, InvoiceStatus, TransactionLogEntry, Page, ContractStatus, User, UserRole, Staff, Payslip, PayslipStatus, SalaryComponent, SalaryComponentType, LifeCycleEvent, ProjectAgreementStatus, Bill, SalesReturn, SalesReturnStatus, SalesReturnReason } from '../types';
import useDatabaseState from '../hooks/useDatabaseState';
import { useDatabaseStateFallback } from '../hooks/useDatabaseStateFallback';
// import { syncService } from '../services/SyncService';
import { runAllMigrations, needsMigration } from '../services/database/migration';
import { getDatabaseService } from '../services/database/databaseService';
import { useAuth } from './AuthContext';
import { getAppStateApiService } from '../services/api/appStateApi';
import { logger } from '../services/logger';
import packageJson from '../package.json';

// Lazy import AppStateRepository to avoid initialization issues during module load
// It will be imported when actually needed
let AppStateRepositoryClass: any = null;

function getAppStateRepository() {
    if (!AppStateRepositoryClass) {
        try {
            AppStateRepositoryClass = require('../services/database/repositories/appStateRepository').AppStateRepository;
        } catch (error) {
            console.error('❌ Failed to load AppStateRepository:', error);
            throw new Error(`Failed to load AppStateRepository: ${error instanceof Error ? error.message : String(error)}`);
        }
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
        vendorGreeting: 'Hello {contactName},'
    },
    invoiceHtmlTemplate: DEFAULT_INVOICE_TEMPLATE,
    dashboardConfig: { visibleKpis: [] },
    agreementSettings: { prefix: 'AGR-', nextNumber: 1, padding: 4 },
    projectAgreementSettings: { prefix: 'P-AGR-', nextNumber: 1, padding: 4 },
    rentalInvoiceSettings: { prefix: 'INV-', nextNumber: 1, padding: 5 },
    projectInvoiceSettings: { prefix: 'P-INV-', nextNumber: 1, padding: 5 },
    showSystemTransactions: false,
    enableColorCoding: true,
    enableBeepOnSave: false,
    enableDatePreservation: false,
    lastPreservedDate: undefined,
    pmCostPercentage: 0,
    defaultProjectId: undefined,
    documentStoragePath: undefined,
    errorLog: [],
    transactionLog: [],
    currentPage: 'dashboard',
    editingEntity: null,
    initialTransactionType: null,
    initialTransactionFilter: null,
    initialTabs: [],
    initialImportType: null,
    salaryComponents: [
        { id: 'sys-sal-basic', name: 'Basic Salary', type: 'Earning', isTaxable: true, isSystem: true },
        { id: 'sys-sal-allow', name: 'Allowances', type: 'Earning', isTaxable: true, isSystem: true },
        { id: 'sys-sal-bonus', name: 'Bonus', type: 'Earning', isTaxable: true, isSystem: true },
        { id: 'sys-sal-adv-ded', name: 'Advance Adjustment', type: 'Deduction', isTaxable: false, isSystem: true },
        { id: 'sys-sal-tax', name: 'Tax Deduction', type: 'Deduction', isTaxable: false, isSystem: true },
        { id: 'sys-sal-pf', name: 'Provident Fund', type: 'Deduction', isTaxable: false, isSystem: true }
    ],
    // Legacy staff (for backward compatibility)
    projectStaff: [],
    rentalStaff: [],
    projectPayslips: [],
    rentalPayslips: [],
    // New Enterprise Payroll System
    employees: [],
    payrollCycles: [],
    payslips: [],
    bonusRecords: [],
    payrollAdjustments: [],
    loanAdvanceRecords: [],
    attendanceRecords: [],
    taxConfigurations: [],
    statutoryConfigurations: [],
    quotations: [],
    documents: [],
}

// Create context - use any temporarily to avoid TDZ issues, then cast to proper type
// This ensures the context is created even if types aren't fully initialized yet
const AppContext = createContext<any>(undefined) as React.Context<{ state: AppState; dispatch: React.Dispatch<AppAction> } | undefined>;

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
            if (tx.subtype === LoanSubtype.RECEIVE) change = tx.amount;
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

    // 4. Payslip Status
    if (tx.payslipId && tx.type === TransactionType.EXPENSE) {
        // Find payslip in either project or rental list
        const findAndUpdate = (list: Payslip[]) => list.map(p => {
            if (p.id === tx.payslipId) {
                const newPaid = Math.max(0, (p.paidAmount || 0) + (tx.amount * factor));
                let newStatus = p.status;
                // Allow paying more than net if advance is handled, but status caps at Paid
                if (newPaid >= p.netSalary - 1) newStatus = PayslipStatus.PAID;
                else if (newPaid > 0) newStatus = PayslipStatus.PARTIALLY_PAID;
                else newStatus = PayslipStatus.APPROVED; // Revert to Approved if unpaid
                return { ...p, paidAmount: newPaid, status: newStatus };
            }
            return p;
        });
        newState.projectPayslips = findAndUpdate(newState.projectPayslips);
        newState.rentalPayslips = findAndUpdate(newState.rentalPayslips);
    }

    // 5. Staff Advance Balance (If transaction Category is Salary Advance)
    const advCat = state.categories.find(c => c.name === 'Salary Advance');
    if (advCat && tx.categoryId === advCat.id && tx.contactId && tx.type === TransactionType.EXPENSE) {
        const updateStaff = (list: Staff[]) => list.map(s => {
            if (s.id === tx.contactId) {
                return { ...s, advanceBalance: (s.advanceBalance || 0) + (tx.amount * factor) };
            }
            return s;
        });
        newState.projectStaff = updateStaff(newState.projectStaff);
        newState.rentalStaff = updateStaff(newState.rentalStaff);
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
    // If action is from remote sync, we assume conflict resolution is done by SyncService merge logic
    // but some actions like DELETE need to run logic. However, for SYNC_REQUEST (SET_STATE), we just replace state.
    // For single actions broadcasted, we apply them normally.

    switch (action.type) {
        case 'SET_STATE':
            return { ...state, ...action.payload };
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
        case 'ADD_CONTACT':
            return { ...state, contacts: [...state.contacts, action.payload] };
        case 'UPDATE_CONTACT':
            return { ...state, contacts: state.contacts.map(c => c.id === action.payload.id ? action.payload : c) };
        case 'DELETE_CONTACT':
            return { ...state, contacts: state.contacts.filter(c => c.id !== action.payload) };

        // --- ENTITY HANDLERS (Projects, Buildings, etc) ---
        case 'ADD_PROJECT':
            return { ...state, projects: [...state.projects, action.payload] };
        case 'UPDATE_PROJECT':
            return { ...state, projects: state.projects.map(p => p.id === action.payload.id ? action.payload : p) };
        case 'DELETE_PROJECT':
            return { ...state, projects: state.projects.filter(p => p.id !== action.payload) };

        case 'ADD_BUILDING':
            return { ...state, buildings: [...state.buildings, action.payload] };
        case 'UPDATE_BUILDING':
            return { ...state, buildings: state.buildings.map(b => b.id === action.payload.id ? action.payload : b) };
        case 'DELETE_BUILDING':
            return { ...state, buildings: state.buildings.filter(b => b.id !== action.payload) };

        case 'ADD_PROPERTY':
            return { ...state, properties: [...state.properties, action.payload] };
        case 'UPDATE_PROPERTY':
            return { ...state, properties: state.properties.map(p => p.id === action.payload.id ? action.payload : p) };
        case 'DELETE_PROPERTY':
            return { ...state, properties: state.properties.filter(p => p.id !== action.payload) };

        case 'ADD_UNIT':
            return { ...state, units: [...state.units, action.payload] };
        case 'UPDATE_UNIT':
            return { ...state, units: state.units.map(u => u.id === action.payload.id ? action.payload : u) };
        case 'DELETE_UNIT':
            return { ...state, units: state.units.filter(u => u.id !== action.payload) };

        case 'ADD_CATEGORY':
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
            return { ...state, invoices: [...state.invoices, action.payload] };
        case 'UPDATE_INVOICE':
            return { ...state, invoices: state.invoices.map(i => i.id === action.payload.id ? action.payload : i) };
        case 'DELETE_INVOICE':
            return { ...state, invoices: state.invoices.filter(i => i.id !== action.payload) };

        case 'ADD_BILL':
            return { ...state, bills: [...state.bills, action.payload] };
        case 'UPDATE_BILL': {
            const updatedBill = action.payload as Bill;
            const originalBill = state.bills.find(b => b.id === updatedBill.id);
            if (!originalBill) return state;

            let newState = { ...state, bills: state.bills.map(b => b.id === updatedBill.id ? updatedBill : b) };

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
            return { ...state, projectAgreements: [...state.projectAgreements, action.payload] };
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

        // --- PAYROLL & STAFF ---
        case 'ADD_SALARY_COMPONENT':
            return { ...state, salaryComponents: [...state.salaryComponents, action.payload] };
        case 'UPDATE_SALARY_COMPONENT':
            return { ...state, salaryComponents: state.salaryComponents.map(c => c.id === action.payload.id ? action.payload : c) };
        case 'DELETE_SALARY_COMPONENT':
            return { ...state, salaryComponents: state.salaryComponents.filter(c => c.id !== action.payload) };

        case 'ADD_PROJECT_STAFF':
            return { ...state, projectStaff: [...state.projectStaff, action.payload] };
        case 'UPDATE_PROJECT_STAFF':
            return { ...state, projectStaff: state.projectStaff.map(s => s.id === action.payload.id ? action.payload : s) };
        case 'DELETE_PROJECT_STAFF':
            return { ...state, projectStaff: state.projectStaff.filter(s => s.id !== action.payload) };

        case 'ADD_RENTAL_STAFF':
            return { ...state, rentalStaff: [...state.rentalStaff, action.payload] };
        case 'UPDATE_RENTAL_STAFF':
            return { ...state, rentalStaff: state.rentalStaff.map(s => s.id === action.payload.id ? action.payload : s) };
        case 'DELETE_RENTAL_STAFF':
            return { ...state, rentalStaff: state.rentalStaff.filter(s => s.id !== action.payload) };

        case 'PROMOTE_STAFF': {
            const { staffId, newDesignation, newSalary, effectiveDate, type } = action.payload;
            const updateStaff = (list: Staff[]) => list.map(s => {
                if (s.id === staffId) {
                    const event: LifeCycleEvent = { date: effectiveDate, type: type as any, description: `Promoted to ${newDesignation}`, prevSalary: s.basicSalary, newSalary, prevDesignation: s.designation, newDesignation };
                    return { ...s, designation: newDesignation, basicSalary: newSalary, history: [event, ...s.history] };
                }
                return s;
            });
            return { ...state, projectStaff: updateStaff(state.projectStaff), rentalStaff: updateStaff(state.rentalStaff) };
        }

        case 'TRANSFER_STAFF': {
            const { staffId, newProjectId, newBuildingId, effectiveDate } = action.payload;
            let staffToMove: Staff | undefined;
            let sourceListType: 'project' | 'rental' = 'project';

            // Find and Remove from old list
            let newProjectStaff = state.projectStaff.filter(s => {
                if (s.id === staffId) { staffToMove = s; sourceListType = 'project'; return false; }
                return true;
            });
            let newRentalStaff = state.rentalStaff.filter(s => {
                if (s.id === staffId) { staffToMove = s; sourceListType = 'rental'; return false; }
                return true;
            });

            if (staffToMove) {
                const event: LifeCycleEvent = { date: effectiveDate, type: 'Transfer', description: `Transferred to ${newProjectId ? 'Project' : 'Building'}` };
                const updatedStaff = { ...staffToMove, projectId: newProjectId, buildingId: newBuildingId, history: [event, ...staffToMove.history] };

                if (newProjectId) newProjectStaff.push(updatedStaff);
                else newRentalStaff.push(updatedStaff);
            }

            return { ...state, projectStaff: newProjectStaff, rentalStaff: newRentalStaff };
        }

        case 'STAFF_EXIT': {
            const { staffId, type, date, reason, gratuityAmount, benefitsAmount, paymentAccountId } = action.payload;
            const updateExit = (list: Staff[]) => list.map(s => {
                if (s.id === staffId) {
                    const event: LifeCycleEvent = { date, type: 'Exit', description: `${type}: ${reason}` };
                    // Correctly type the new status using type assertion if needed, though ternary should infer correctly
                    const newStatus: Staff['status'] = type === 'Resignation' ? 'Resigned' : 'Terminated';
                    return {
                        ...s,
                        status: newStatus,
                        exitDetails: { date, type, reason, gratuityAmount, benefitsAmount, paymentAccountId },
                        history: [event, ...s.history]
                    };
                }
                return s;
            });

            let newState = { ...state, projectStaff: updateExit(state.projectStaff), rentalStaff: updateExit(state.rentalStaff) };

            // If settlement payment is needed, create transaction
            if ((gratuityAmount > 0 || benefitsAmount > 0) && paymentAccountId) {
                const total = gratuityAmount + benefitsAmount;
                // Find Category (Assuming 'Salary' category for simplicity, or specific 'Settlement' category could be used)
                const salaryCat = state.categories.find(c => c.name.includes('Salary'))?.id;
                if (salaryCat) {
                    const tx: Transaction = {
                        id: `settlement-${staffId}-${Date.now()}`,
                        type: TransactionType.EXPENSE,
                        amount: total,
                        date,
                        description: `Final Settlement for ${state.contacts.find(c => c.id === staffId)?.name}`,
                        accountId: paymentAccountId,
                        categoryId: salaryCat,
                        contactId: staffId
                    };
                    newState.transactions = [...newState.transactions, tx];
                    newState = applyTransactionEffect(newState, tx, true);
                }
            }
            return newState;
        }

        case 'GENERATE_PAYROLL':
        case 'GENERATE_PROJECT_PAYROLL':
        case 'GENERATE_RENTAL_PAYROLL': {
            const { month, issueDate } = action.payload;
            // Handle type for GENERATE_PAYROLL action
            const genType = 'type' in action.payload ? action.payload.type : undefined;

            // Common logic for generating payslips
            const generateForStaff = (staffList: Staff[], payslipList: Payslip[], isProject: boolean) => {
                const newPayslips: Payslip[] = [];
                staffList.forEach(s => {
                    if (s.status === 'Active' && !payslipList.some(p => p.staffId === s.id && p.month === month)) {
                        // Logic to calculate allowances/deductions
                        let totalAllow = 0;
                        const allowances = s.salaryStructure.filter(comp => {
                            const def = state.salaryComponents.find(c => c.id === comp.componentId);
                            return def?.type === 'Earning';
                        }).map(comp => {
                            const def = state.salaryComponents.find(c => c.id === comp.componentId);
                            const amount = comp.calculationType === 'Fixed' ? comp.amount : (s.basicSalary * comp.amount / 100);
                            totalAllow += amount;
                            return { name: def?.name || 'Unknown', amount };
                        });

                        let totalDeduct = 0;
                        const deductions = s.salaryStructure.filter(comp => {
                            const def = state.salaryComponents.find(c => c.id === comp.componentId);
                            return def?.type === 'Deduction';
                        }).map(comp => {
                            const def = state.salaryComponents.find(c => c.id === comp.componentId);
                            const amount = comp.calculationType === 'Fixed' ? comp.amount : (s.basicSalary * comp.amount / 100);
                            totalDeduct += amount;
                            return { name: def?.name || 'Unknown', amount };
                        });

                        // Loan/Advance Deduction Logic (Simplified: Check balance)
                        if (s.advanceBalance > 0) {
                            deductions.push({ name: 'Advance Adjustment', amount: s.advanceBalance }); // Fully deduct if possible, or partial logic can be added
                            totalDeduct += s.advanceBalance;
                        }

                        newPayslips.push({
                            id: `pay-${s.id}-${month}`,
                            staffId: s.id,
                            month,
                            issueDate,
                            basicSalary: s.basicSalary,
                            allowances,
                            totalAllowances: totalAllow,
                            deductions,
                            totalDeductions: totalDeduct,
                            grossSalary: s.basicSalary + totalAllow,
                            netSalary: (s.basicSalary + totalAllow) - totalDeduct,
                            status: PayslipStatus.PENDING,
                            paidAmount: 0,
                            projectId: s.projectId,
                            buildingId: s.buildingId,
                            generatedAt: new Date().toISOString()
                        });
                    }
                });
                return [...payslipList, ...newPayslips];
            };

            const doProject = action.type === 'GENERATE_PAYROLL' ? (genType === 'All' || genType === 'Project') : action.type === 'GENERATE_PROJECT_PAYROLL';
            const doRental = action.type === 'GENERATE_PAYROLL' ? (genType === 'All' || genType === 'Rental') : action.type === 'GENERATE_RENTAL_PAYROLL';

            let newState = { ...state };
            if (doProject) newState.projectPayslips = generateForStaff(state.projectStaff, state.projectPayslips, true);
            if (doRental) newState.rentalPayslips = generateForStaff(state.rentalStaff, state.rentalPayslips, false);

            return newState;
        }

        case 'UPDATE_PAYSLIP': {
            const updated = action.payload;
            const updateList = (list: Payslip[]) => list.map(p => p.id === updated.id ? updated : p);
            return { ...state, projectPayslips: updateList(state.projectPayslips), rentalPayslips: updateList(state.rentalPayslips) };
        }

        case 'MARK_PROJECT_PAYSLIP_PAID':
        case 'MARK_RENTAL_PAYSLIP_PAID': {
            const { payslipId, accountId, paymentDate, amount, description } = action.payload;
            const isProject = action.type === 'MARK_PROJECT_PAYSLIP_PAID';
            const list = isProject ? state.projectPayslips : state.rentalPayslips;
            const payslip = list.find(p => p.id === payslipId);

            if (!payslip) return state;

            // Create Transaction
            const catName = isProject ? 'Project Staff Salary' : 'Rental Staff Salary';
            const categoryId = state.categories.find(c => c.name === catName)?.id;

            const tx: Transaction = {
                id: `pay-tx-${payslipId}-${Date.now()}`,
                type: TransactionType.EXPENSE,
                amount,
                date: paymentDate,
                description: description || `Salary Payment for ${payslip.month}`,
                accountId,
                categoryId,
                contactId: payslip.staffId,
                payslipId: payslip.id,
                projectId: isProject ? action.payload.projectId : undefined, // Only for project payslips
                buildingId: !isProject ? payslip.buildingId : undefined // Only for rental payslips
            };

            let newState = { ...state, transactions: [...state.transactions, tx] };
            newState = applyTransactionEffect(newState, tx, true);

            // Update Payslip Status (Handled in applyTransactionEffect implicitly via payslipId, but explicit here for clarity/safety if effect misses it)
            // Actually applyTransactionEffect handles it.

            return newState;
        }

        case 'DELETE_PROJECT_PAYSLIP':
            return { ...state, projectPayslips: state.projectPayslips.filter(p => p.id !== action.payload) };
        case 'DELETE_RENTAL_PAYSLIP':
            return { ...state, rentalPayslips: state.rentalPayslips.filter(p => p.id !== action.payload) };

        // --- ENTERPRISE PAYROLL ACTIONS ---
        case 'ADD_EMPLOYEE': {
            const employee = { ...action.payload, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
            const logEntry = createLogEntry('CREATE', 'Employee', employee.id, `Added employee: ${employee.employeeId}`, state.currentUser, employee);
            return {
                ...state,
                employees: [...(state.employees || []), employee],
                transactionLog: [logEntry, ...(state.transactionLog || [])]
            };
        }
        case 'UPDATE_EMPLOYEE': {
            const updated = { ...action.payload, updatedAt: new Date().toISOString() };
            const logEntry = createLogEntry('UPDATE', 'Employee', updated.id, `Updated employee: ${updated.employeeId}`, state.currentUser, updated);
            return {
                ...state,
                employees: (state.employees || []).map(e => e.id === updated.id ? updated : e),
                transactionLog: [logEntry, ...(state.transactionLog || [])]
            };
        }
        case 'DELETE_EMPLOYEE': {
            const logEntry = createLogEntry('DELETE', 'Employee', action.payload, 'Deleted employee', state.currentUser);
            return {
                ...state,
                employees: (state.employees || []).filter(e => e.id !== action.payload),
                transactionLog: [logEntry, ...(state.transactionLog || [])]
            };
        }
        case 'PROMOTE_EMPLOYEE': {
            const { employeeId, newDesignation, newSalary, effectiveDate, newGrade, newDepartment } = action.payload;
            const employee = (state.employees || []).find(e => e.id === employeeId);
            if (!employee) return state;

            const event: LifeCycleEvent = {
                id: Date.now().toString(),
                date: effectiveDate,
                type: 'Promotion',
                description: `Promoted to ${newDesignation}`,
                prevSalary: employee.basicSalary,
                newSalary,
                prevDesignation: employee.employmentDetails.designation,
                newDesignation,
                prevGrade: employee.employmentDetails.grade,
                newGrade,
                prevDepartment: employee.employmentDetails.department,
                newDepartment,
                performedBy: state.currentUser?.id
            };

            const updated = {
                ...employee,
                basicSalary: newSalary,
                employmentDetails: {
                    ...employee.employmentDetails,
                    designation: newDesignation,
                    grade: newGrade || employee.employmentDetails.grade,
                    department: newDepartment || employee.employmentDetails.department
                },
                lifecycleHistory: [event, ...employee.lifecycleHistory],
                updatedAt: new Date().toISOString()
            };

            const logEntry = createLogEntry('UPDATE', 'Employee', employeeId, `Promoted employee: ${newDesignation}`, state.currentUser);
            return {
                ...state,
                employees: (state.employees || []).map(e => e.id === employeeId ? updated : e),
                transactionLog: [logEntry, ...(state.transactionLog || [])]
            };
        }
        case 'TRANSFER_EMPLOYEE': {
            const { employeeId, projectAssignments, effectiveDate } = action.payload;
            const employee = (state.employees || []).find(e => e.id === employeeId);
            if (!employee) return state;

            const prevAssignments = employee.projectAssignments;
            const event: LifeCycleEvent = {
                id: Date.now().toString(),
                date: effectiveDate,
                type: 'Transfer',
                description: `Transferred to ${projectAssignments.map(a => a.projectId).join(', ')}`,
                prevProjectId: prevAssignments[0]?.projectId,
                newProjectId: projectAssignments[0]?.projectId,
                performedBy: state.currentUser?.id
            };

            const updated = {
                ...employee,
                projectAssignments,
                lifecycleHistory: [event, ...employee.lifecycleHistory],
                updatedAt: new Date().toISOString()
            };

            const logEntry = createLogEntry('UPDATE', 'Employee', employeeId, 'Transferred employee', state.currentUser);
            return {
                ...state,
                employees: (state.employees || []).map(e => e.id === employeeId ? updated : e),
                transactionLog: [logEntry, ...(state.transactionLog || [])]
            };
        }
        case 'TERMINATE_EMPLOYEE': {
            const { employeeId, terminationDetails } = action.payload;
            const employee = (state.employees || []).find(e => e.id === employeeId);
            if (!employee) return state;

            const event: LifeCycleEvent = {
                id: Date.now().toString(),
                date: terminationDetails.date,
                type: 'Exit',
                description: `${terminationDetails.type}: ${terminationDetails.reason}`,
                performedBy: state.currentUser?.id
            };

            const updated = {
                ...employee,
                status: terminationDetails.type === 'Resignation' ? 'Resigned' : 'Terminated',
                terminationDetails,
                lifecycleHistory: [event, ...employee.lifecycleHistory],
                updatedAt: new Date().toISOString()
            };

            const logEntry = createLogEntry('UPDATE', 'Employee', employeeId, `Terminated employee: ${terminationDetails.type}`, state.currentUser);
            return {
                ...state,
                employees: (state.employees || []).map(e => e.id === employeeId ? updated : e),
                transactionLog: [logEntry, ...(state.transactionLog || [])]
            };
        }
        case 'ADD_BONUS':
            return { ...state, bonusRecords: [...(state.bonusRecords || []), action.payload] };
        case 'UPDATE_BONUS':
            return { ...state, bonusRecords: (state.bonusRecords || []).map(b => b.id === action.payload.id ? action.payload : b) };
        case 'DELETE_BONUS':
            return { ...state, bonusRecords: (state.bonusRecords || []).filter(b => b.id !== action.payload) };
        case 'BULK_ADD_BONUSES':
            return { ...state, bonusRecords: [...(state.bonusRecords || []), ...action.payload] };
        case 'ADD_PAYROLL_ADJUSTMENT':
            return { ...state, payrollAdjustments: [...(state.payrollAdjustments || []), action.payload] };
        case 'UPDATE_PAYROLL_ADJUSTMENT':
            return { ...state, payrollAdjustments: (state.payrollAdjustments || []).map(a => a.id === action.payload.id ? action.payload : a) };
        case 'DELETE_PAYROLL_ADJUSTMENT':
            return { ...state, payrollAdjustments: (state.payrollAdjustments || []).filter(a => a.id !== action.payload) };
        case 'ADD_LOAN_ADVANCE':
            return { ...state, loanAdvanceRecords: [...(state.loanAdvanceRecords || []), action.payload] };
        case 'UPDATE_LOAN_ADVANCE':
            return { ...state, loanAdvanceRecords: (state.loanAdvanceRecords || []).map(l => l.id === action.payload.id ? action.payload : l) };
        case 'DELETE_LOAN_ADVANCE':
            return { ...state, loanAdvanceRecords: (state.loanAdvanceRecords || []).filter(l => l.id !== action.payload) };
        case 'ADD_ATTENDANCE':
            return { ...state, attendanceRecords: [...(state.attendanceRecords || []), action.payload] };
        case 'UPDATE_ATTENDANCE':
            return { ...state, attendanceRecords: (state.attendanceRecords || []).map(a => a.id === action.payload.id ? action.payload : a) };
        case 'DELETE_ATTENDANCE':
            return { ...state, attendanceRecords: (state.attendanceRecords || []).filter(a => a.id !== action.payload) };
        case 'BULK_ADD_ATTENDANCE':
            return { ...state, attendanceRecords: [...(state.attendanceRecords || []), ...action.payload] };
        case 'CREATE_PAYROLL_CYCLE':
            return { ...state, payrollCycles: [...(state.payrollCycles || []), action.payload] };
        case 'UPDATE_PAYROLL_CYCLE':
            return { ...state, payrollCycles: (state.payrollCycles || []).map(c => c.id === action.payload.id ? action.payload : c) };
        case 'LOCK_PAYROLL_CYCLE': {
            const { cycleId, lockedBy } = action.payload;
            return {
                ...state,
                payrollCycles: (state.payrollCycles || []).map(c =>
                    c.id === cycleId
                        ? { ...c, status: 'Locked' as const, lockedAt: new Date().toISOString(), lockedBy }
                        : c
                )
            };
        }
        case 'APPROVE_PAYROLL_CYCLE': {
            const { cycleId, approvedBy } = action.payload;
            return {
                ...state,
                payrollCycles: (state.payrollCycles || []).map(c =>
                    c.id === cycleId
                        ? { ...c, status: 'Approved' as const, approvedAt: new Date().toISOString(), approvedBy }
                        : c
                )
            };
        }
        case 'PROCESS_PAYROLL_CYCLE': {
            // This will use the payroll engine to generate payslips
            // For now, return state - the actual processing will be handled by the component
            return state;
        }
        case 'ADD_PAYSLIP':
            return { ...state, payslips: [...(state.payslips || []), action.payload] };
        case 'BULK_APPROVE_PAYSLIPS': {
            const { payslipIds, approvedBy } = action.payload;
            return {
                ...state,
                payslips: (state.payslips || []).map(p =>
                    payslipIds.includes(p.id)
                        ? { ...p, status: 'Approved' as const, approvedAt: new Date().toISOString(), approvedBy }
                        : p
                )
            };
        }
        case 'BULK_PAY_PAYSLIPS': {
            const { payslipIds, accountId, paymentDate } = action.payload;
            // Create transactions for each payslip payment
            const transactions = (state.payslips || [])
                .filter(p => payslipIds.includes(p.id))
                .map(payslip => ({
                    id: `pay-tx-${payslip.id}-${Date.now()}`,
                    type: TransactionType.EXPENSE as const,
                    amount: payslip.netSalary,
                    date: paymentDate,
                    description: `Salary Payment for ${payslip.month}`,
                    accountId,
                    payslipId: payslip.id,
                    contactId: payslip.employeeId
                }));

            let newState = {
                ...state,
                transactions: [...state.transactions, ...transactions],
                payslips: (state.payslips || []).map(p =>
                    payslipIds.includes(p.id)
                        ? { ...p, status: 'Paid' as const, paidAmount: p.netSalary, paymentDate, paymentAccountId: accountId }
                        : p
                )
            };

            // Apply transaction effects
            transactions.forEach(tx => {
                newState = applyTransactionEffect(newState, tx, true);
            });

            return newState;
        }
        case 'ADD_TAX_CONFIGURATION':
            return { ...state, taxConfigurations: [...(state.taxConfigurations || []), action.payload] };
        case 'UPDATE_TAX_CONFIGURATION':
            return { ...state, taxConfigurations: (state.taxConfigurations || []).map(t => t.id === action.payload.id ? action.payload : t) };
        case 'DELETE_TAX_CONFIGURATION':
            return { ...state, taxConfigurations: (state.taxConfigurations || []).filter(t => t.id !== action.payload) };
        case 'ADD_STATUTORY_CONFIGURATION':
            return { ...state, statutoryConfigurations: [...(state.statutoryConfigurations || []), action.payload] };
        case 'UPDATE_STATUTORY_CONFIGURATION':
            return { ...state, statutoryConfigurations: (state.statutoryConfigurations || []).map(s => s.id === action.payload.id ? action.payload : s) };
        case 'DELETE_STATUTORY_CONFIGURATION':
            return { ...state, statutoryConfigurations: (state.statutoryConfigurations || []).filter(s => s.id !== action.payload) };

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
        case 'UPDATE_PM_COST_PERCENTAGE':
            return { ...state, pmCostPercentage: action.payload };
        case 'UPDATE_DEFAULT_PROJECT':
            return { ...state, defaultProjectId: action.payload };
        case 'UPDATE_DOCUMENT_STORAGE_PATH':
            return { ...state, documentStoragePath: action.payload };
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
            const logEntry = createLogEntry('CLEAR_ALL', 'Transactions', undefined, 'Cleared all transactions, invoices, bills, contracts, agreements, sales returns, and payslips', state.currentUser, undefined);
            return {
                ...state,
                transactions: [],
                invoices: [],
                bills: [],
                contracts: [],
                rentalAgreements: [],
                projectAgreements: [],
                salesReturns: [],
                projectPayslips: [],
                rentalPayslips: [],
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
    const [initMessage, setInitMessage] = useState('Initializing application...');
    const [initProgress, setInitProgress] = useState(0);
    const [useFallback, setUseFallback] = useState(false);
    const [initError, setInitError] = useState<string | null>(null);

    // 1. Initialize State with Database (with fallback to localStorage)
    // Hooks must be called unconditionally - always call both hooks
    // Then use the appropriate one based on useFallback state
    // Add error boundary logging before hooks
    console.log('[AppContext] About to initialize database hooks...');
    console.log('[AppContext] initialState keys:', Object.keys(initialState));
    
    const [dbState, setDbState] = useDatabaseState<AppState>('finance_app_state_v4', initialState);
    const [fallbackState, setFallbackState] = useDatabaseStateFallback<AppState>('finance_app_state_v4', initialState);
    
    console.log('[AppContext] Database hooks initialized successfully');

    // Initialize storedState safely - use initialState as fallback if hooks aren't ready
    const storedState = (useFallback ? fallbackState : dbState) || initialState;
    const setStoredState = useFallback ? setFallbackState : setDbState;
    
    // Use a ref to track storedState to avoid initialization issues in dependency arrays
    // Initialize ref with initialState to ensure it's always defined
    const storedStateRef = useRef<AppState>(initialState);
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
                console.log(`🔄 ${reason} - logging out user`);
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
                        const appStateRepo = new AppStateRepository();
                        const currentState = await appStateRepo.loadState();
                        if (currentState.currentUser) {
                            currentState.currentUser = null;
                            await appStateRepo.saveState(currentState);
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
                console.log('🚀 Starting app initialization...');

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
                        console.log('Migration completed successfully:', result.recordCounts);
                        const recordCount = Object.values(result.recordCounts || {}).reduce((a, b) => a + b, 0);

                        // Reload state after migration
                        setInitMessage(`Loading migrated data (${recordCount} records)...`);
                        setInitProgress(95);
                        const appStateRepo = new AppStateRepository();
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
                        // Load from API (cloud mode)
                        setInitMessage('Loading data from cloud...');
                        setInitProgress(60);
                        
                        try {
                            // Get current tenant ID to detect tenant switches
                            const { apiClient } = await import('../services/api/client');
                            const currentTenantId = apiClient.getTenantId();
                            
                            // Clear local database data for previous tenant if tenant changed
                            // This prevents cross-tenant data leakage
                            try {
                                const dbService = getDatabaseService();
                                if (dbService.isReady()) {
                                    const appStateRepo = new AppStateRepository();
                                    const localState = await appStateRepo.loadState();
                                    
                                    // Check if we need to clear data (tenant switch detected)
                                    // We'll clear tenant-specific data to ensure clean state
                                    const { ContactsRepository, TransactionsRepository, AccountsRepository,
                                            CategoriesRepository, ProjectsRepository, BuildingsRepository,
                                            PropertiesRepository, UnitsRepository, InvoicesRepository,
                                            BillsRepository, BudgetsRepository, RentalAgreementsRepository,
                                            ProjectAgreementsRepository, ContractsRepository } = await import('../services/database/repositories/index');
                                    
                                    // Clear all tenant-specific data to start fresh
                                    // This ensures no cross-tenant data leakage
                                    const contactsRepo = new ContactsRepository();
                                    const transactionsRepo = new TransactionsRepository();
                                    const accountsRepo = new AccountsRepository();
                                    const categoriesRepo = new CategoriesRepository();
                                    const projectsRepo = new ProjectsRepository();
                                    const buildingsRepo = new BuildingsRepository();
                                    const propertiesRepo = new PropertiesRepository();
                                    const unitsRepo = new UnitsRepository();
                                    const invoicesRepo = new InvoicesRepository();
                                    const billsRepo = new BillsRepository();
                                    const budgetsRepo = new BudgetsRepository();
                                    const rentalAgreementsRepo = new RentalAgreementsRepository();
                                    const projectAgreementsRepo = new ProjectAgreementsRepository();
                                    const contractsRepo = new ContractsRepository();
                                    
                            // Delete ALL data (from all tenants) to ensure clean state when switching tenants
                            // Use deleteAllUnfiltered to bypass tenant filtering and clear everything
                            contactsRepo.deleteAllUnfiltered();
                            transactionsRepo.deleteAllUnfiltered();
                            accountsRepo.deleteAllUnfiltered();
                            categoriesRepo.deleteAllUnfiltered();
                            projectsRepo.deleteAllUnfiltered();
                            buildingsRepo.deleteAllUnfiltered();
                            propertiesRepo.deleteAllUnfiltered();
                            unitsRepo.deleteAllUnfiltered();
                            invoicesRepo.deleteAllUnfiltered();
                            billsRepo.deleteAllUnfiltered();
                            budgetsRepo.deleteAllUnfiltered();
                            rentalAgreementsRepo.deleteAllUnfiltered();
                            projectAgreementsRepo.deleteAllUnfiltered();
                            contractsRepo.deleteAllUnfiltered();
                                    
                                    console.log('🗑️ Cleared local database data to prevent cross-tenant leakage');
                                }
                            } catch (clearError) {
                                console.warn('⚠️ Could not clear local database data:', clearError);
                                // Continue anyway - tenant filtering in queries will handle it
                            }
                            
                            const apiService = getAppStateApiService();
                            const apiState = await apiService.loadState();
                            
                            // Replace state with fresh API data using functional update
                            // This ensures we access the current state value correctly
                            if (isMounted) {
                                setStoredState(prev => {
                                    const fullState: AppState = {
                                        ...prev,
                                        // Replace with API data to ensure synchronization across users in same tenant
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
                                    };
                                    
                                    // Save API data to local database with proper tenant_id (async, don't await)
                                    // This ensures offline access and proper tenant isolation
                                    const dbService = getDatabaseService();
                                    if (dbService.isReady()) {
                                        const appStateRepo = getAppStateRepository();
                                        appStateRepo.saveState(fullState).catch(saveError => {
                                            console.warn('⚠️ Could not save API data to local database:', saveError);
                                        });
                                    }
                                    
                                    return fullState;
                                });
                                console.log('✅ Loaded data from API:', {
                                    accounts: apiState.accounts?.length || 0,
                                    contacts: apiState.contacts?.length || 0,
                                    transactions: apiState.transactions?.length || 0,
                                    categories: apiState.categories?.length || 0,
                                    projects: apiState.projects?.length || 0,
                                    buildings: apiState.buildings?.length || 0,
                                    properties: apiState.properties?.length || 0,
                                    units: apiState.units?.length || 0,
                                    invoices: apiState.invoices?.length || 0,
                                    bills: apiState.bills?.length || 0,
                                    budgets: apiState.budgets?.length || 0,
                                    rentalAgreements: apiState.rentalAgreements?.length || 0,
                                    projectAgreements: apiState.projectAgreements?.length || 0,
                                    contracts: apiState.contracts?.length || 0,
                                });
                                setInitProgress(80);
                            }
                        } catch (apiError) {
                            console.error('⚠️ Failed to load from API:', apiError);
                            // Continue with local database as fallback
                            setInitMessage('API unavailable, using local data...');
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

                        // Wait for state to load from database
                        setInitMessage('Loading application data from database...');
                        setInitProgress(70);

                        // Wait longer for database state to load (up to 5 seconds)
                        // Note: We can't directly access storedState here as it may not be initialized
                        // Instead, we'll rely on the database loading mechanism and timeout
                        let stateLoaded = false;
                        const checkStateLoaded = () => {
                            // Check if database has been initialized and has data
                            // We'll check this by trying to load from database directly
                            try {
                                const dbService = getDatabaseService();
                                if (dbService.isReady()) {
                                    // Database is ready, assume state will be loaded
                                    return true;
                                }
                            } catch {
                                // Database not ready yet
                            }
                            return false;
                        };

                        // Poll for state to load (with timeout)
                        const maxWaitTime = 5000; // 5 seconds max
                        const pollInterval = 100; // Check every 100ms
                        const startTime = Date.now();

                        while (!stateLoaded && (Date.now() - startTime) < maxWaitTime) {
                            await new Promise(resolve => setTimeout(resolve, pollInterval));
                            if (checkStateLoaded()) {
                                stateLoaded = true;
                                logger.logCategory('database', '✅ Database state loaded');
                                break;
                            }
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
                        console.log('✅ App continuing with localStorage fallback');
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

        // Sync to API if authenticated (cloud mode)
        if (isAuthenticated && !(action as any)._isRemote) {
            const NAVIGATION_ACTIONS = ['SET_PAGE', 'SET_INITIAL_TABS', 'CLEAR_INITIAL_TABS',
                'SET_INITIAL_TRANSACTION_TYPE', 'CLEAR_INITIAL_TRANSACTION_TYPE',
                'SET_INITIAL_TRANSACTION_FILTER', 'SET_INITIAL_IMPORT_TYPE',
                'CLEAR_INITIAL_IMPORT_TYPE', 'SET_EDITING_ENTITY', 'CLEAR_EDITING_ENTITY'];

            // Skip navigation actions
            if (!NAVIGATION_ACTIONS.includes(action.type)) {
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
                        
                        const apiService = getAppStateApiService();

                        // Handle account changes
                        if (action.type === 'ADD_ACCOUNT') {
                            const account = action.payload as Account;
                            // Skip system accounts (they're permanent)
                            if (!account.isPermanent) {
                                await apiService.saveAccount(account);
                                logger.logCategory('sync', '✅ Synced account to API:', account.name);
                            }
                        } else if (action.type === 'UPDATE_ACCOUNT') {
                            const account = action.payload as Account;
                            if (!account.isPermanent) {
                                await apiService.saveAccount(account);
                                logger.logCategory('sync', '✅ Synced account update to API:', account.name);
                            }
                        } else if (action.type === 'DELETE_ACCOUNT') {
                            const accountId = action.payload as string;
                            // Check if it's a system account before deleting
                            const account = state.accounts.find(a => a.id === accountId);
                            if (account && !account.isPermanent) {
                                await apiService.deleteAccount(accountId);
                                logger.logCategory('sync', '✅ Synced account deletion to API:', accountId);
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

                        // Handle transaction changes
                        if (action.type === 'ADD_TRANSACTION') {
                            const transaction = action.payload as Transaction;
                            await apiService.saveTransaction(transaction);
                            logger.logCategory('sync', '✅ Synced transaction to API:', transaction.id);
                        } else if (action.type === 'UPDATE_TRANSACTION') {
                            const transaction = action.payload as Transaction;
                            await apiService.saveTransaction(transaction);
                            logger.logCategory('sync', '✅ Synced transaction update to API:', transaction.id);
                        } else if (action.type === 'DELETE_TRANSACTION') {
                            const transactionId = action.payload as string;
                            await apiService.deleteTransaction(transactionId);
                            logger.logCategory('sync', '✅ Synced transaction deletion to API:', transactionId);
                        } else if (action.type === 'BATCH_ADD_TRANSACTIONS') {
                            // Sync batch transactions
                            const transactions = action.payload as Transaction[];
                            const syncPromises = transactions.map(tx => 
                                apiService.saveTransaction(tx).catch(err => {
                                    logger.errorCategory('sync', `⚠️ Failed to sync transaction ${tx.id}:`, err);
                                    return null;
                                })
                            );
                            await Promise.all(syncPromises);
                            logger.logCategory('sync', `✅ Synced ${transactions.length} transactions to API (batch)`);
                        } else if (action.type === 'RESTORE_TRANSACTION') {
                            const transaction = action.payload as Transaction;
                            await apiService.saveTransaction(transaction);
                            logger.logCategory('sync', '✅ Synced restored transaction to API:', transaction.id);
                        }

                        // Handle category changes
                        if (action.type === 'ADD_CATEGORY') {
                            const category = action.payload;
                            await apiService.saveCategory(category);
                            logger.logCategory('sync', '✅ Synced category to API:', category.name);
                        } else if (action.type === 'UPDATE_CATEGORY') {
                            const category = action.payload;
                            await apiService.saveCategory(category);
                            logger.logCategory('sync', '✅ Synced category update to API:', category.name);
                        } else if (action.type === 'DELETE_CATEGORY') {
                            const categoryId = action.payload as string;
                            await apiService.deleteCategory(categoryId);
                            logger.logCategory('sync', '✅ Synced category deletion to API:', categoryId);
                        }

                        // Handle project changes
                        if (action.type === 'ADD_PROJECT') {
                            const project = action.payload;
                            await apiService.saveProject(project);
                            logger.logCategory('sync', '✅ Synced project to API:', project.name);
                        } else if (action.type === 'UPDATE_PROJECT') {
                            const project = action.payload;
                            await apiService.saveProject(project);
                            logger.logCategory('sync', '✅ Synced project update to API:', project.name);
                        } else if (action.type === 'DELETE_PROJECT') {
                            const projectId = action.payload as string;
                            await apiService.deleteProject(projectId);
                            logger.logCategory('sync', '✅ Synced project deletion to API:', projectId);
                        }

                        // Handle building changes
                        if (action.type === 'ADD_BUILDING') {
                            const building = action.payload;
                            await apiService.saveBuilding(building);
                            logger.logCategory('sync', '✅ Synced building to API:', building.name);
                        } else if (action.type === 'UPDATE_BUILDING') {
                            const building = action.payload;
                            await apiService.saveBuilding(building);
                            logger.logCategory('sync', '✅ Synced building update to API:', building.name);
                        } else if (action.type === 'DELETE_BUILDING') {
                            const buildingId = action.payload as string;
                            await apiService.deleteBuilding(buildingId);
                            logger.logCategory('sync', '✅ Synced building deletion to API:', buildingId);
                        }

                        // Handle property changes
                        if (action.type === 'ADD_PROPERTY') {
                            const property = action.payload;
                            await apiService.saveProperty(property);
                            logger.logCategory('sync', '✅ Synced property to API:', property.name);
                        } else if (action.type === 'UPDATE_PROPERTY') {
                            const property = action.payload;
                            await apiService.saveProperty(property);
                            logger.logCategory('sync', '✅ Synced property update to API:', property.name);
                        } else if (action.type === 'DELETE_PROPERTY') {
                            const propertyId = action.payload as string;
                            await apiService.deleteProperty(propertyId);
                            logger.logCategory('sync', '✅ Synced property deletion to API:', propertyId);
                        }

                        // Handle unit changes
                        if (action.type === 'ADD_UNIT') {
                            const unit = action.payload;
                            await apiService.saveUnit(unit);
                            logger.logCategory('sync', '✅ Synced unit to API:', unit.name);
                        } else if (action.type === 'UPDATE_UNIT') {
                            const unit = action.payload;
                            await apiService.saveUnit(unit);
                            logger.logCategory('sync', '✅ Synced unit update to API:', unit.name);
                        } else if (action.type === 'DELETE_UNIT') {
                            const unitId = action.payload as string;
                            await apiService.deleteUnit(unitId);
                            logger.logCategory('sync', '✅ Synced unit deletion to API:', unitId);
                        }

                        // Handle invoice changes
                        if (action.type === 'ADD_INVOICE') {
                            const invoice = action.payload;
                            await apiService.saveInvoice(invoice);
                            logger.logCategory('sync', '✅ Synced invoice to API:', invoice.invoiceNumber);
                        } else if (action.type === 'UPDATE_INVOICE') {
                            const invoice = action.payload;
                            await apiService.saveInvoice(invoice);
                            logger.logCategory('sync', '✅ Synced invoice update to API:', invoice.invoiceNumber);
                        } else if (action.type === 'DELETE_INVOICE') {
                            const invoiceId = action.payload as string;
                            await apiService.deleteInvoice(invoiceId);
                            logger.logCategory('sync', '✅ Synced invoice deletion to API:', invoiceId);
                        }

                        // Handle bill changes
                        if (action.type === 'ADD_BILL') {
                            const bill = action.payload;
                            await apiService.saveBill(bill);
                            logger.logCategory('sync', '✅ Synced bill to API:', bill.billNumber);
                        } else if (action.type === 'UPDATE_BILL') {
                            const bill = action.payload;
                            await apiService.saveBill(bill);
                            logger.logCategory('sync', '✅ Synced bill update to API:', bill.billNumber);
                        } else if (action.type === 'DELETE_BILL') {
                            const billId = action.payload as string;
                            await apiService.deleteBill(billId);
                            logger.logCategory('sync', '✅ Synced bill deletion to API:', billId);
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
                        if (action.type === 'ADD_PROJECT_AGREEMENT') {
                            const agreement = action.payload;
                            await apiService.saveProjectAgreement(agreement);
                            logger.logCategory('sync', '✅ Synced project agreement to API:', agreement.agreementNumber);
                        } else if (action.type === 'UPDATE_PROJECT_AGREEMENT') {
                            const agreement = action.payload;
                            await apiService.saveProjectAgreement(agreement);
                            logger.logCategory('sync', '✅ Synced project agreement update to API:', agreement.agreementNumber);
                        } else if (action.type === 'DELETE_PROJECT_AGREEMENT') {
                            const agreementId = action.payload as string;
                            await apiService.deleteProjectAgreement(agreementId);
                            logger.logCategory('sync', '✅ Synced project agreement deletion to API:', agreementId);
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
                    }
                };

                // Defer API sync to avoid blocking UI
                if ('requestIdleCallback' in window) {
                    requestIdleCallback(syncToApi, { timeout: 2000 });
                } else {
                    setTimeout(syncToApi, 0);
                }
            }
        }

        // Sync Broadcast - Skip for navigation-only actions (performance optimization)
        if (!(action as any)._isRemote) {
            const NAVIGATION_ACTIONS = ['SET_PAGE', 'SET_INITIAL_TABS', 'CLEAR_INITIAL_TABS',
                'SET_INITIAL_TRANSACTION_TYPE', 'CLEAR_INITIAL_TRANSACTION_TYPE',
                'SET_INITIAL_TRANSACTION_FILTER', 'SET_INITIAL_IMPORT_TYPE',
                'CLEAR_INITIAL_IMPORT_TYPE', 'SET_EDITING_ENTITY', 'CLEAR_EDITING_ENTITY'];

            // Only broadcast non-navigation actions to avoid blocking
            if (!NAVIGATION_ACTIONS.includes(action.type)) {
                // Defer sync broadcast to avoid blocking navigation
                // TODO: Re-enable when syncService is properly configured with peerjs
                /*
                if ('requestIdleCallback' in window) {
                    requestIdleCallback(() => {
                        syncService.broadcastAction(action);
                    });
                } else {
                    setTimeout(() => {
                        syncService.broadcastAction(action);
                    }, 0);
                }
                */
            }
        }

        return newState;
    }, [isAuthenticated]);

    // Use a ref to track if we've initialized the reducer with database state
    const reducerInitializedRef = useRef(false);

    // Initialize reducer with initialState first, then sync with storedState when ready
    // This avoids initialization issues with storedState
    const [state, dispatch] = useReducer(reducerWithPersistence, initialState);



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
                currentStoredState.accounts.length > state.accounts.length;

            // Check if storedState has any user data (not just system defaults)
            const storedHasUserData = currentStoredState.contacts.length > 0 ||
                currentStoredState.transactions.length > 0 ||
                currentStoredState.invoices.length > 0 ||
                currentStoredState.bills.length > 0;

            const currentHasUserData = state.contacts.length > 0 ||
                state.transactions.length > 0 ||
                state.invoices.length > 0 ||
                state.bills.length > 0;

            // Sync if database has more data or has user data when current doesn't
            // Only sync once during initialization to avoid infinite loops
            if ((storedHasMoreData || (storedHasUserData && !currentHasUserData)) && !reducerInitializedRef.current) {
                console.log('🔄 Syncing reducer state with loaded database state:', {
                    storedContacts: currentStoredState.contacts.length,
                    currentContacts: state.contacts.length,
                    storedTransactions: currentStoredState.transactions.length,
                    currentTransactions: state.transactions.length,
                    storedInvoices: currentStoredState.invoices.length,
                    currentInvoices: state.invoices.length
                });
                dispatch({ type: 'SET_STATE', payload: currentStoredState });
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
    useEffect(() => {
        const syncContactsFromApi = async () => {
            if (!isAuthenticated) return;
            try {
                const apiService = getAppStateApiService();
                const contacts = await apiService.loadContacts();

                // Update reducer state
                dispatch({
                    type: 'SET_STATE',
                    payload: { ...state, contacts },
                    _isRemote: true
                } as any);

                // Persist to local DB (for offline/next load)
                setStoredState(prev => ({ ...prev, contacts }));
            } catch (err) {
                console.error('⚠️ Failed to refresh contacts from API:', err);
            }
        };

        syncContactsFromApi();
    }, [isAuthenticated, dispatch, setStoredState, state]);

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
            // Check if contacts, transactions, or bills were added (critical data changes)
            const contactsChanged = state.contacts.length !== previousContactsLengthRef.current;
            const transactionsChanged = state.transactions.length !== previousTransactionsLengthRef.current;
            const billsChanged = state.bills.length !== previousBillsLengthRef.current;

            if (contactsChanged || transactionsChanged || billsChanged) {
                previousContactsLengthRef.current = state.contacts.length;
                previousTransactionsLengthRef.current = state.transactions.length;
                previousBillsLengthRef.current = state.bills.length;

                // Save immediately for critical data changes (no delay for transactions)
                const saveImmediately = async () => {
                    try {
                        const dbService = getDatabaseService();
                        if (!dbService.isReady()) {
                            await dbService.initialize();
                        }

                        const appStateRepo = new AppStateRepository();
                        await appStateRepo.saveState(state);
                        console.log('✅ State saved immediately after data change:', {
                            contacts: state.contacts.length,
                            transactions: state.transactions.length,
                            bills: state.bills.length,
                            invoices: state.invoices.length
                        });
                    } catch (error) {
                        console.error('❌ Failed to save state after data change:', error);
                        // Log detailed error
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

                // For transactions, save immediately (no delay)
                if (transactionsChanged) {
                    saveImmediately();
                } else {
                    // For other changes, small delay
                    const saveTimer = setTimeout(saveImmediately, 200);
                    return () => clearTimeout(saveTimer);
                }
            }
        }
    }, [state.contacts.length, state.transactions.length, state.bills.length, isInitializing, state]);

    useEffect(() => {
        if (!isInitializing && state.currentUser) {
            // After login, ensure state is saved immediately
            const saveTimer = setTimeout(async () => {
                try {
                    const dbService = getDatabaseService();
                    if (dbService.isReady()) {
                        const appStateRepo = new AppStateRepository();
                        await appStateRepo.saveState(state);
                        console.log('✅ State saved after login');
                    }
                } catch (error) {
                    console.error('Failed to save state after login:', error);
                }
            }, 100); // Small delay to ensure state is updated

            return () => clearTimeout(saveTimer);
        }
    }, [state.currentUser, isInitializing, state]);

    // Auto-sync local data to API when user re-authenticates
    useEffect(() => {
        // Detect when user transitions from not authenticated to authenticated
        if (isAuthenticated && !prevAuthRef.current && !isInitializing) {
            const syncAllLocalData = async () => {
                try {
                    // Verify token is actually available before syncing
                    const token = localStorage.getItem('auth_token');
                    if (!token) {
                        logger.warnCategory('sync', '⚠️ No token found in localStorage, skipping auto-sync');
                        return;
                    }
                    
                    // Verify token is not expired and has valid format (client-side check)
                    try {
                        const parts = token.split('.');
                        if (parts.length !== 3) {
                            logger.warnCategory('sync', '⚠️ Invalid token format, skipping auto-sync');
                            return;
                        }
                        
                        const payload = JSON.parse(atob(parts[1]));
                        const exp = payload.exp * 1000; // Convert to milliseconds
                        const now = Date.now();
                        
                        if (now >= exp) {
                            logger.warnCategory('sync', '⚠️ Token is expired, skipping auto-sync. Expired at:', new Date(exp).toISOString());
                            return;
                        }
                        
                        // Check if token expires soon (within 1 hour) - might be close to expiration
                        const timeUntilExpiry = exp - now;
                        const oneHour = 60 * 60 * 1000;
                        if (timeUntilExpiry < oneHour) {
                            logger.warnCategory('sync', '⚠️ Token expires soon, but proceeding with sync. Expires at:', new Date(exp).toISOString());
                        }
                        
                        logger.logCategory('auth', '✅ Token validated - expires at:', new Date(exp).toISOString());
                    } catch (tokenCheckError) {
                        logger.warnCategory('sync', '⚠️ Could not verify token format, skipping auto-sync:', tokenCheckError);
                        return;
                    }
                    
                    // Verify token is actually valid by making a test API call
                    try {
                        const { apiClient } = await import('../services/api/client');
                        // Check if token is expired using ApiClient singleton
                        if (apiClient.isTokenExpired()) {
                            logger.warnCategory('sync', '⚠️ Token is expired (ApiClient check), skipping auto-sync');
                            return;
                        }
                        // Test token with a lightweight endpoint to verify it's valid on server
                        await apiClient.get('/tenants/me');
                        logger.logCategory('auth', '✅ Token verified with server, proceeding with sync');
                    } catch (testError: any) {
                        if (testError?.status === 401) {
                            logger.warnCategory('auth', '⚠️ Token validation failed with server (401), skipping auto-sync. Please re-login.');
                            return;
                        }
                        // Other errors might be network issues, proceed anyway
                        logger.warnCategory('sync', '⚠️ Token test failed but proceeding (might be network issue):', testError);
                    }
                    
                    const apiService = getAppStateApiService();
                    logger.logCategory('sync', '🔄 User re-authenticated, syncing local data to API...');
                    
                    // Sync contacts
                    let syncFailed = false;
                    for (const contact of state.contacts) {
                        if (syncFailed) break;
                        
                        try {
                            await apiService.saveContact(contact);
                            logger.logCategory('sync', '✅ Synced contact to API:', contact.name);
                        } catch (err: any) {
                            if (err?.status === 401) {
                                logger.warnCategory('sync', `⚠️ Token invalid during contact sync, stopping auto-sync`);
                                syncFailed = true;
                                break;
                            } else {
                                logger.warnCategory('sync', `⚠️ Failed to sync contact ${contact.name}:`, err);
                                // Continue with other contacts
                            }
                        }
                    }
                    
                    if (syncFailed) {
                        logger.warnCategory('sync', '⚠️ Auto-sync stopped due to authentication failure');
                        return;
                    }
                    
                    // Sync accounts (non-permanent)
                    for (const account of state.accounts) {
                        if (syncFailed) break;
                        
                        if (!account.isPermanent) {
                            try {
                                await apiService.saveAccount(account);
                                logger.logCategory('sync', '✅ Synced account to API:', account.name);
                            } catch (err: any) {
                                if (err?.status === 401) {
                                    logger.warnCategory('sync', `⚠️ Token invalid during account sync, stopping auto-sync`);
                                    syncFailed = true;
                                    break;
                                } else {
                                    logger.warnCategory('sync', `⚠️ Failed to sync account ${account.name}:`, err);
                                }
                            }
                        }
                    }
                    
                    if (!syncFailed) {
                        logger.logCategory('sync', '✅ Finished syncing local data to API');
                    }
                } catch (error) {
                    logger.errorCategory('sync', '⚠️ Error syncing local data after re-authentication:', error);
                }
            };
            
            // Delay sync to ensure token is fully set and ApiClient singleton is updated
            // Increased delay to 3 seconds to ensure everything is ready
            setTimeout(syncAllLocalData, 3000);
        }
        
        // Update previous auth state
        prevAuthRef.current = isAuthenticated;
    }, [isAuthenticated, isInitializing, state.contacts, state.accounts]);

    // Reload data from API when user becomes authenticated (to ensure synchronization)
    useEffect(() => {
        // When user becomes authenticated, reload data from API to ensure all users see same data
        if (isAuthenticated && !prevAuthRef.current && !isInitializing) {
            const reloadDataFromApi = async () => {
                try {
                    logger.logCategory('sync', '🔄 User authenticated, reloading data from API for synchronization...');
                    const apiService = getAppStateApiService();
                    const apiState = await apiService.loadState();
                    
                    // Replace state with fresh API data to ensure all users see the same data
                    setStoredState(prev => ({
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
                    }));
                    
                    logger.logCategory('sync', '✅ Reloaded data from API:', {
                        contacts: apiState.contacts?.length || 0,
                        projects: apiState.projects?.length || 0,
                        transactions: apiState.transactions?.length || 0,
                    });
                } catch (error) {
                    logger.errorCategory('sync', '⚠️ Failed to reload data from API:', error);
                }
            };
            
            // Delay reload slightly to ensure token is fully set
            setTimeout(reloadDataFromApi, 1000);
        }
    }, [isAuthenticated, isInitializing]);

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
                            
                            // Create full state with API data using functional update to access current state
                            setStoredState(prev => {
                                const fullState: AppState = {
                                    ...prev,
                                    // Replace with API data
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
                                };
                                
                                // Save API data to local database with proper tenant_id (async, don't await)
                                const appStateRepo = new AppStateRepository();
                                appStateRepo.saveState(fullState).catch(err => {
                                    logger.errorCategory('database', '⚠️ Failed to save API data to local database:', err);
                                });
                                
                                return fullState;
                            });
                            
                            logger.logCategory('sync', '✅ Reloaded and saved data from API for new tenant:', {
                                contacts: apiState.contacts?.length || 0,
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
    }, [auth.tenant?.id, isAuthenticated, isInitializing, setStoredState]);

    // Show loading/initialization state
    if (isInitializing) {
        return (
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100vh',
                flexDirection: 'column',
                gap: '1.5rem',
                background: '#ffffff',
                color: '#1f2937',
                fontFamily: 'system-ui, -apple-system, sans-serif'
            }}>
                <div style={{
                    background: '#ffffff',
                    padding: '2rem 3rem',
                    borderRadius: '1rem',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
                    border: '1px solid #e5e7eb',
                    minWidth: '400px',
                    textAlign: 'center'
                }}>
                    <div style={{
                        fontSize: '2rem',
                        fontWeight: 'bold',
                        marginBottom: '1rem',
                        color: '#16a34a'
                    }}>
                        PBooksPro
                    </div>

                    <div style={{
                        fontSize: '1rem',
                        marginBottom: '1.5rem',
                        color: '#6b7280'
                    }}>
                        {initMessage}
                    </div>

                    {/* Progress Bar */}
                    <div style={{
                        width: '100%',
                        height: '8px',
                        background: '#e5e7eb',
                        borderRadius: '4px',
                        overflow: 'hidden',
                        marginBottom: '0.5rem'
                    }}>
                        <div style={{
                            width: `${initProgress}%`,
                            height: '100%',
                            background: '#16a34a',
                            borderRadius: '4px',
                            transition: 'width 0.3s ease',
                            boxShadow: '0 0 10px rgba(22, 163, 74, 0.3)'
                        }} />
                    </div>

                    <div style={{
                        fontSize: '0.875rem',
                        color: '#6b7280'
                    }}>
                        {Math.round(initProgress)}%
                    </div>

                    {/* Spinner */}
                    {initProgress < 100 && (
                        <div style={{
                            marginTop: '1.5rem',
                            display: 'flex',
                            justifyContent: 'center'
                        }}>
                            <div style={{
                                width: '40px',
                                height: '40px',
                                border: '4px solid #e5e7eb',
                                borderTop: '4px solid #16a34a',
                                borderRadius: '50%',
                                animation: 'spin 1s linear infinite'
                            }} />
                        </div>
                    )}

                    {/* Debug info in development */}
                    {process.env.NODE_ENV === 'development' && (
                        <div style={{
                            marginTop: '1.5rem',
                            padding: '0.75rem',
                            background: '#f3f4f6',
                            borderRadius: '0.5rem',
                            fontSize: '0.75rem',
                            textAlign: 'left',
                            fontFamily: 'monospace',
                            color: '#374151',
                            border: '1px solid #e5e7eb'
                        }}>
                            <div>Mode: {useFallback ? 'localStorage (fallback)' : 'SQL Database'}</div>
                            <div>Progress: {initProgress}%</div>
                            <div>Message: {initMessage}</div>
                        </div>
                    )}
                </div>

                <style>{`
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                `}</style>
            </div>
        );
    }

    return (
        <AppContext.Provider value={{ state, dispatch }}>
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