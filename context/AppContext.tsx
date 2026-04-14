
import React, { createContext, useContext, useReducer, useEffect, useCallback, useState, useRef, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { AppState, AppAction, Transaction, TransactionType, Account, Category, AccountType, LoanSubtype, InvoiceStatus, TransactionLogEntry, Page, Contract, ContractStatus, User, UserRole, ProjectAgreementStatus, Bill, SalesReturn, SalesReturnStatus, SalesReturnReason, Contact, Vendor, Invoice, RecurringInvoiceTemplate, ProjectReceivedAsset, Budget, PMCycleAllocation, Project, InstallmentPlan, PlanAmenity, Unit } from '../types';
import useDatabaseState from '../hooks/useDatabaseState';
import { useDatabaseStateFallback } from '../hooks/useDatabaseStateFallback';
import { runAllMigrations, needsMigration } from '../services/database/migration';
import { getDatabaseService } from '../services/database/databaseService';
import { getPersistableStateFingerprint } from '../services/database/persistableStateFingerprint';
import { useAuth } from './AuthContext';
import { useCompanyOptional } from './CompanyContext';
import { logger } from '../services/logger';
import { MANDATORY_SYSTEM_ACCOUNTS } from '../services/database/mandatorySystemAccounts';
import { MANDATORY_SYSTEM_CATEGORIES } from '../services/database/mandatorySystemCategories';
import { findSalesReturnCategory } from '../constants/salesReturnSystemCategories';
import { resolveSystemCategoryId } from '../services/systemEntityIds';
import packageJson from '../package.json';
import { isLocalOnlyMode } from '../config/apiUrl';
import { reconcileRentalAgreementsList } from '../services/rentalAgreementReconcile';
import { resolveExpenseCategoryForBillPayment } from '../utils/rentalBillPayments';
import { connectRealtimeSocket, disconnectRealtimeSocket } from '../core/socket';
import { toLocalDateString } from '../utils/dateUtils';
import InitializationScreen from '../components/InitializationScreen';
import { syncQueueStub as getSyncQueue } from '../services/sync/localOnlyStubs';
// --- Module-level state store for selective subscriptions via useSyncExternalStore ---
// Components using useStateSelector() only re-render when their selected slice changes,
// unlike useAppContext() which re-renders ALL 155+ consumers on every state change.
let _appState: AppState | null = null;
let _appDispatch: React.Dispatch<AppAction> | null = null;
const _stateListeners = new Set<() => void>();
export function _getAppState(): AppState { return _appState!; }
export function _getAppDispatch(): React.Dispatch<AppAction> { return _appDispatch!; }
export function _subscribeAppState(listener: () => void): () => void {
    _stateListeners.add(listener);
    return () => { _stateListeners.delete(listener); };
}
function _notifyStateListeners() {
    _stateListeners.forEach(l => l());
}

/**
 * Serialize PostgreSQL API writes for the same transaction id. Concurrent POST /transactions
 * with the same stale client `version` causes 409 CONFLICT even for a single user; the first
 * upsert succeeds and bumps `version`, the second fails and triggers a spurious "another user" modal.
 */
const transactionApiSaveQueues = new Map<string, Promise<void>>();

function enqueueTransactionApiSave(txId: string, task: () => Promise<void>): Promise<void> {
    const previous = transactionApiSaveQueues.get(txId) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(() => task());
    transactionApiSaveQueues.set(txId, next);
    return next;
}

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

const SYSTEM_ACCOUNTS: Account[] = MANDATORY_SYSTEM_ACCOUNTS;

const DEFAULT_ADMIN: User = {
    id: 'sys-admin',
    username: 'admin',
    name: 'Administrator',
    role: 'Admin',
    password: '' // Empty string signifies no password set
};

const SYSTEM_CATEGORIES: Category[] = MANDATORY_SYSTEM_CATEGORIES;

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
    projectReceivedAssets: [],
    contracts: [],
    budgets: [],
    personalCategories: [],
    personalTransactions: [],
    cashFlowCategoryMappings: [],
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
    accountConsistency: { actualByAccountId: {} },
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
    const amount = typeof tx.amount === 'number' ? tx.amount : parseFloat(String(tx.amount)) || 0;
    let newState = { ...state };

    // 1. Account Balances
    newState.accounts = newState.accounts.map(acc => {
        let change = 0;
        if (tx.type === TransactionType.INCOME && acc.id === tx.accountId) change = amount;
        else if (tx.type === TransactionType.EXPENSE && acc.id === tx.accountId) change = -amount;
        else if (tx.type === TransactionType.TRANSFER) {
            if (acc.id === tx.fromAccountId) change = -amount;
            if (acc.id === tx.toAccountId) change = amount;
        }
        else if (tx.type === TransactionType.LOAN && acc.id === tx.accountId) {
            if (tx.subtype === LoanSubtype.RECEIVE || tx.subtype === LoanSubtype.COLLECT) change = amount;
            else change = -amount;
        }

        if (change !== 0) return { ...acc, balance: (typeof acc.balance === 'number' ? acc.balance : parseFloat(String(acc.balance)) || 0) + (change * factor) };
        return acc;
    });

    // 2. Invoice Status
    if (tx.invoiceId) {
        newState.invoices = newState.invoices.map(inv => {
            if (inv.id === tx.invoiceId) {
                const newPaid = Math.max(0, (inv.paidAmount || 0) + (amount * factor));
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
                const newPaid = Math.max(0, (b.paidAmount || 0) + (amount * factor));
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

/** Same invoice math as applyTransactionEffect (for PostgreSQL sync when LAN has no SQLite). */
function applyTxToInvoiceCopy(inv: Invoice, tx: Transaction, isAdd: boolean): Invoice {
    const factor = isAdd ? 1 : -1;
    const amount = typeof tx.amount === 'number' ? tx.amount : parseFloat(String(tx.amount)) || 0;
    const newPaid = Math.max(0, (inv.paidAmount || 0) + (amount * factor));
    let newStatus = inv.status;
    if (newPaid >= inv.amount - 0.1) newStatus = InvoiceStatus.PAID;
    else if (newPaid > 0.1) newStatus = InvoiceStatus.PARTIALLY_PAID;
    else newStatus = InvoiceStatus.UNPAID;
    return { ...inv, paidAmount: newPaid, status: newStatus };
}

/** Same bill math as applyTransactionEffect. */
function applyTxToBillCopy(b: Bill, tx: Transaction, isAdd: boolean): Bill {
    const factor = isAdd ? 1 : -1;
    const amount = typeof tx.amount === 'number' ? tx.amount : parseFloat(String(tx.amount)) || 0;
    const newPaid = Math.max(0, (b.paidAmount || 0) + (amount * factor));
    let newStatus = b.status;
    const threshold = 0.01;
    if (newPaid >= b.amount - threshold) newStatus = InvoiceStatus.PAID;
    else if (newPaid > threshold) newStatus = InvoiceStatus.PARTIALLY_PAID;
    else newStatus = InvoiceStatus.UNPAID;
    return { ...b, paidAmount: newPaid, status: newStatus };
}

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

/** When category_id is missing on a bill payment, inherit from the bill (same rules as pay modal). */
function enrichExpenseBillPaymentCategory(tx: Transaction, state: AppState): Transaction {
    if (tx.type !== TransactionType.EXPENSE || !tx.billId) return tx;
    if (tx.categoryId != null && String(tx.categoryId).trim() !== '') return tx;
    const bill = state.bills.find(b => b.id === tx.billId);
    if (!bill) return tx;
    const cid = resolveExpenseCategoryForBillPayment(bill, state.categories, state.rentalAgreements);
    if (!cid) return tx;
    return { ...tx, categoryId: cid };
}

const reducer = (state: AppState, action: AppAction): AppState => {
    // Real-time sync is now handled via Socket.IO in the backend with tenant isolation
    // but some actions like DELETE need to run logic. However, for SYNC_REQUEST (SET_STATE), we just replace state.
    // For single actions broadcasted, we apply them normally.

    switch (action.type) {
        case 'SET_STATE': {
            const payload = action.payload as Partial<AppState>;
            let changed = false;
            const next = { ...state };
            for (const key of Object.keys(payload)) {
                const k = key as keyof AppState;
                if (payload[k] !== state[k]) {
                    (next as any)[k] = payload[k];
                    changed = true;
                }
            }
            return changed ? next : state;
        }
        case 'BATCH_UPSERT_ENTITIES': {
            const entities = action.payload;
            let anyChanged = false;
            const patches: Record<string, any[]> = {};

            const snakeToCamelKey: Record<string, string> = {
                rental_agreements: 'rentalAgreements',
                personal_categories: 'personalCategories',
                personal_transactions: 'personalTransactions',
                project_agreements: 'projectAgreements',
                plan_amenities: 'planAmenities',
                installment_plans: 'installmentPlans',
                recurring_invoice_templates: 'recurringInvoiceTemplates',
                pm_cycle_allocations: 'pmCycleAllocations',
                sales_returns: 'salesReturns',
                project_received_assets: 'projectReceivedAssets',
                inventory_items: 'inventoryItems',
            };

            for (const [rawKey, items] of Object.entries(entities)) {
                if (!Array.isArray(items) || items.length === 0) continue;

                const entityKey = snakeToCamelKey[rawKey] || rawKey;
                const currentArray = (state as any)[entityKey];
                if (!Array.isArray(currentArray)) continue;

                const itemMap = new Map(currentArray.map((item: any) => [item.id, item]));
                let sliceChanged = false;

                items.forEach((item: any) => {
                    const isSoftDeleted = item.deletedAt || item.deleted_at;
                    if (isSoftDeleted) {
                        if (itemMap.has(item.id)) {
                            itemMap.delete(item.id);
                            sliceChanged = true;
                        }
                        return;
                    }
                    const existing = itemMap.get(item.id);
                    const merged = existing ? { ...existing, ...item } : item;
                    if (merged !== existing) {
                        itemMap.set(item.id, merged);
                        sliceChanged = true;
                    }
                });

                if (sliceChanged) {
                    patches[entityKey] = Array.from(itemMap.values());
                    anyChanged = true;
                }
            }

            if (anyChanged && patches.rentalAgreements?.length) {
                patches.rentalAgreements = reconcileRentalAgreementsList(patches.rentalAgreements);
            }

            return anyChanged ? { ...state, ...patches } : state;
        }
        case 'BATCH_WS_SYNC': {
            const { upserts, deletes } = action.payload as {
                upserts: Record<string, any[]>;
                deletes: Record<string, string[]>;
            };
            let newState = state;
            let anyChanged = false;

            if (upserts) {
                const patches: Record<string, any[]> = {};
                for (const [entityKey, items] of Object.entries(upserts)) {
                    if (!Array.isArray(items) || items.length === 0) continue;
                    const currentArray = (newState as any)[entityKey];
                    if (!Array.isArray(currentArray)) continue;
                    const itemMap = new Map(currentArray.map((item: any) => [item.id, item]));
                    let sliceChanged = false;
                    items.forEach((item: any) => {
                        const existing = itemMap.get(item.id);
                        const merged = existing ? { ...existing, ...item } : item;
                        if (merged !== existing) {
                            itemMap.set(item.id, merged);
                            sliceChanged = true;
                        }
                    });
                    if (sliceChanged) {
                        patches[entityKey] = Array.from(itemMap.values());
                        anyChanged = true;
                    }
                }
                if (anyChanged) newState = { ...newState, ...patches };
            }

            if (anyChanged && newState.rentalAgreements?.length) {
                newState = {
                    ...newState,
                    rentalAgreements: reconcileRentalAgreementsList(newState.rentalAgreements),
                };
            }

            if (deletes) {
                const deletePatches: Record<string, any[]> = {};
                for (const [entityKey, ids] of Object.entries(deletes)) {
                    if (!Array.isArray(ids) || ids.length === 0) continue;
                    const currentArray = (newState as any)[entityKey];
                    if (!Array.isArray(currentArray)) continue;
                    const idSet = new Set(ids);
                    const filtered = currentArray.filter((item: any) => !idSet.has(item.id));
                    if (filtered.length !== currentArray.length) {
                        deletePatches[entityKey] = filtered;
                        anyChanged = true;
                    }
                }
                if (Object.keys(deletePatches).length > 0) {
                    newState = { ...newState, ...deletePatches };
                }
            }

            return anyChanged ? newState : state;
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
            const tx = enrichExpenseBillPaymentCategory(action.payload as Transaction, state);

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
            const updatedTx = enrichExpenseBillPaymentCategory(action.payload as Transaction, state);
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
            let finalState = applyTransactionEffect(newStateWithoutTx, tx, false);
            if (tx.contractId) Object.assign(finalState, updateContractStatus(finalState, tx.contractId));
            // In-kind / bulk asset payments link transactions to project_received_assets; removing the last tx must drop the asset row.
            const aid = tx.projectAssetId;
            if (aid && !finalState.transactions.some(t => t.projectAssetId === aid)) {
                finalState = {
                    ...finalState,
                    projectReceivedAssets: (finalState.projectReceivedAssets || []).filter(a => a.id !== aid),
                };
            }
            const logEntry = createLogEntry('DELETE', 'Transaction', tx.id, `Deleted ${tx.type}: ${tx.description}`, state.currentUser, tx);
            finalState.transactionLog = [logEntry, ...(state.transactionLog || [])];
            return finalState;
        }

        case 'BATCH_DELETE_TRANSACTIONS': {
            const { transactionIds, projectAssetIdToDelete } = action.payload;
            const uniqueIds = [...new Set(transactionIds)].filter(Boolean);
            if (uniqueIds.length === 0 && !projectAssetIdToDelete) return state;

            let nextState = state;
            let deletedCount = 0;
            for (const txId of uniqueIds) {
                const tx = nextState.transactions.find(t => t.id === txId);
                if (!tx) continue;
                deletedCount++;
                const newStateWithoutTx = { ...nextState, transactions: nextState.transactions.filter(t => t.id !== txId) };
                let finalState = applyTransactionEffect(newStateWithoutTx, tx, false);
                if (tx.contractId) Object.assign(finalState, updateContractStatus(finalState, tx.contractId));
                const logEntry = createLogEntry('DELETE', 'Transaction', tx.id, `Deleted ${tx.type}: ${tx.description}`, state.currentUser, tx);
                finalState.transactionLog = [logEntry, ...(finalState.transactionLog || [])];
                nextState = finalState;
            }

            if (projectAssetIdToDelete) {
                nextState = {
                    ...nextState,
                    projectReceivedAssets: (nextState.projectReceivedAssets || []).filter(a => a.id !== projectAssetIdToDelete),
                };
            }

            if (deletedCount === 0 && nextState === state) return state;

            if (deletedCount > 0) {
                const summaryLog = createLogEntry(
                    'DELETE',
                    'Transaction',
                    'BATCH',
                    `Batch deleted ${deletedCount} transaction(s)`,
                    state.currentUser
                );
                nextState.transactionLog = [summaryLog, ...(nextState.transactionLog || [])];
            }
            return nextState;
        }

        case 'BATCH_ADD_TRANSACTIONS': {
            const txs = (action.payload as Transaction[]).map(tx => enrichExpenseBillPaymentCategory(tx, state));
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
            const txToRestore = enrichExpenseBillPaymentCategory(action.payload as Transaction, state);
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
        case 'UPDATE_UNIT': {
            const p = action.payload as Unit;
            return {
                ...state,
                units: state.units.map((u) => {
                    if (u.id !== p.id) return u;
                    const merged = { ...u, ...p };
                    const nm = merged.name != null ? String(merged.name).trim() : '';
                    if (nm) merged.unitNumber = nm;
                    return merged;
                }),
            };
        }
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
        case 'UPDATE_INVOICE': {
            const inv = { ...action.payload };
            const paid = inv.paidAmount || 0;
            const amt = inv.amount || 0;
            if (paid >= amt - 0.1) inv.status = InvoiceStatus.PAID;
            else if (paid > 0.1) inv.status = InvoiceStatus.PARTIALLY_PAID;
            else if (inv.status !== InvoiceStatus.DRAFT) inv.status = InvoiceStatus.UNPAID;
            return { ...state, invoices: state.invoices.map(i => i.id === inv.id ? inv : i) };
        }
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

            // Keep pm_cycle_allocations in sync with PM fee bills (payment, amount, status)
            const relatedAllocation = state.pmCycleAllocations?.find((a) => a.billId === updatedBill.id);
            const paymentChanged =
                originalBill.paidAmount !== updatedBill.paidAmount || originalBill.status !== updatedBill.status;
            const pmBillAmountChanged =
                !!relatedAllocation && originalBill.amount !== updatedBill.amount;
            if (relatedAllocation && (paymentChanged || pmBillAmountChanged)) {
                let updatedAllocation = { ...relatedAllocation };
                if (paymentChanged) {
                    updatedAllocation.paidAmount = updatedBill.paidAmount || 0;
                    updatedAllocation.status =
                        updatedBill.status === InvoiceStatus.PAID
                            ? 'paid'
                            : updatedBill.status === InvoiceStatus.PARTIALLY_PAID
                              ? 'partially_paid'
                              : 'unpaid';
                }
                if (pmBillAmountChanged) {
                    updatedAllocation.amount = updatedBill.amount;
                    const fr = relatedAllocation.feeRate || 0;
                    if (fr > 0.0001) {
                        updatedAllocation.expenseTotal = updatedBill.amount / (fr / 100);
                    }
                }
                newState.pmCycleAllocations = newState.pmCycleAllocations!.map((a) =>
                    a.id === updatedAllocation.id ? updatedAllocation : a
                );
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
        case 'DELETE_BILL': {
            const billId = action.payload as string;
            return {
                ...state,
                bills: state.bills.filter((b) => b.id !== billId),
                pmCycleAllocations: (state.pmCycleAllocations || []).filter((a) => a.billId !== billId),
            };
        }

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
        case 'ADD_RENTAL_AGREEMENT': {
            const next = [...state.rentalAgreements, action.payload];
            return { ...state, rentalAgreements: reconcileRentalAgreementsList(next) };
        }
        case 'UPDATE_RENTAL_AGREEMENT': {
            const mapped = state.rentalAgreements.map(r => (r.id === action.payload.id ? action.payload : r));
            return { ...state, rentalAgreements: reconcileRentalAgreementsList(mapped) };
        }
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

                // Sales Return Penalty (system) → legacy Penalty Income
                let penaltyCategoryId =
                    findSalesReturnCategory(state.categories, 'PENALTY')?.id
                    ?? resolveSystemCategoryId(state.categories, 'sys-cat-penalty-inc')
                    ?? state.categories.find(c => c.name === 'Penalty Income')?.id;
                if (!penaltyCategoryId) {
                    console.warn('Sales Return / Penalty Income category not found');
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
                    date: toLocalDateString(new Date()),
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
                    date: toLocalDateString(new Date()),
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

        case 'ADD_PROJECT_RECEIVED_ASSET': {
            const existing = state.projectReceivedAssets?.find((a) => a.id === action.payload.id);
            if (existing) {
                return {
                    ...state,
                    projectReceivedAssets: (state.projectReceivedAssets || []).map((a) =>
                        a.id === action.payload.id ? action.payload : a
                    ),
                };
            }
            return { ...state, projectReceivedAssets: [...(state.projectReceivedAssets || []), action.payload] };
        }
        case 'UPDATE_PROJECT_RECEIVED_ASSET':
            return {
                ...state,
                projectReceivedAssets: (state.projectReceivedAssets || []).map((a) =>
                    a.id === action.payload.id ? action.payload : a
                ),
            };
        case 'DELETE_PROJECT_RECEIVED_ASSET':
            return {
                ...state,
                projectReceivedAssets: (state.projectReceivedAssets || []).filter((a) => a.id !== action.payload),
            };

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
        case 'UPDATE_ACCOUNT_CONSISTENCY':
            return { ...state, accountConsistency: action.payload };
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
        case 'SET_WHATSAPP_MODE':
            return { ...state, whatsAppMode: action.payload };

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
                // Preserve settings: recurringInvoiceTemplates, accounts (balances + bank opening reset), contacts, categories, projects, buildings, properties, units
                accounts: state.accounts.map(acc => {
                    const bankLike = acc.type === AccountType.BANK || acc.type === AccountType.CASH;
                    return { ...acc, balance: 0, ...(bankLike ? { openingBalance: 0 } : {}) };
                }),
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

/**
 * Full GET / loadState() replaces invoice arrays. After POST, a refresh can run before the new row appears in list —
 * merge keeps optimistic local rows whose id is not yet in the server payload. Rows present on both sides use server copy.
 */
/** After tenant settings actions, merge into prev so we can flush full tenant payload to PostgreSQL (LAN/API). */
function mergeTenantSettingsFromAction(prev: AppState, action: AppAction): AppState | null {
    switch (action.type) {
        case 'TOGGLE_SYSTEM_TRANSACTIONS':
            return { ...prev, showSystemTransactions: action.payload };
        case 'TOGGLE_COLOR_CODING':
            return { ...prev, enableColorCoding: action.payload };
        case 'TOGGLE_BEEP_ON_SAVE':
            return { ...prev, enableBeepOnSave: action.payload };
        case 'TOGGLE_DATE_PRESERVATION':
            return { ...prev, enableDatePreservation: action.payload };
        case 'UPDATE_DEFAULT_PROJECT':
            return { ...prev, defaultProjectId: action.payload };
        case 'SET_WHATSAPP_MODE':
            return { ...prev, whatsAppMode: action.payload };
        case 'UPDATE_DASHBOARD_CONFIG':
            return { ...prev, dashboardConfig: action.payload };
        case 'UPDATE_ACCOUNT_CONSISTENCY':
            return { ...prev, accountConsistency: action.payload };
        case 'UPDATE_AGREEMENT_SETTINGS':
            return { ...prev, agreementSettings: action.payload };
        case 'UPDATE_PROJECT_AGREEMENT_SETTINGS':
            return { ...prev, projectAgreementSettings: action.payload };
        case 'UPDATE_RENTAL_INVOICE_SETTINGS':
            return { ...prev, rentalInvoiceSettings: action.payload };
        case 'UPDATE_PROJECT_INVOICE_SETTINGS':
            return { ...prev, projectInvoiceSettings: action.payload };
        case 'UPDATE_PRINT_SETTINGS':
            return { ...prev, printSettings: action.payload };
        case 'UPDATE_WHATSAPP_TEMPLATES':
            return { ...prev, whatsAppTemplates: action.payload };
        case 'UPDATE_PM_COST_PERCENTAGE':
            return { ...prev, pmCostPercentage: action.payload };
        case 'UPDATE_INVOICE_TEMPLATE':
            return { ...prev, invoiceHtmlTemplate: action.payload };
        default:
            return null;
    }
}

function mergeInvoicesWithServerBaseline(base: Invoice[], server: Invoice[]): Invoice[] {
    const serverIds = new Set(server.map((i) => i.id).filter(Boolean));
    const out = [...server];
    for (const inv of base) {
        if (!inv.id || serverIds.has(inv.id)) continue;
        // Rows missing from the server list were soft-deleted (listInvoices omits deleted_at)
        // or never existed server-side. Do not resurrect synced invoices that were deleted.
        const hadServerVersion = typeof inv.version === 'number' && inv.version >= 1;
        if (hadServerVersion) continue;
        // Keep optimistic / not-yet-persisted creates (no server version yet)
        out.push(inv);
    }
    return out;
}

function mergeProjectReceivedAssetsWithServerBaseline(base: ProjectReceivedAsset[], server: ProjectReceivedAsset[]): ProjectReceivedAsset[] {
    const serverIds = new Set(server.map((a) => a.id).filter(Boolean));
    const out = [...server];
    for (const a of base) {
        if (a.id && !serverIds.has(a.id)) {
            out.push(a);
        }
    }
    return out;
}

function mergeSalesReturnsWithServerBaseline(base: SalesReturn[], server: SalesReturn[]): SalesReturn[] {
    const serverIds = new Set(server.map((sr) => sr.id).filter(Boolean));
    const out = [...server];
    for (const sr of base) {
        if (sr.id && !serverIds.has(sr.id)) {
            out.push(sr);
        }
    }
    return out;
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // Get auth status - must be called unconditionally at top level
    // AuthProvider wraps AppProvider in index.tsx, so this should work
    const auth = useAuth();
    const companyOpt = useCompanyOptional();
    /** Local-only: pass active company id so useDatabaseState loads SQLite and enables saveNow (otherwise payments are never persisted). */
    const companyDbReloadTrigger = isLocalOnlyMode() ? (companyOpt?.activeCompany?.id ?? undefined) : undefined;

    // Track previous auth state to detect when user re-authenticates
    const prevAuthRef = React.useRef<boolean>(false);
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
    /** LAN/API mode: initial loadState() failed — do not hydrate from SQLite or continue as if data were synced. */
    const [apiStateLoadFailed, setApiStateLoadFailed] = useState(false);
    const [loadProgress, setLoadProgress] = useState<{ loaded: number; total: number } | null>(null);

    // 1. Initialize State with Database (with fallback to localStorage)
    // Hooks must be called unconditionally - always call both hooks
    // Then use the appropriate one based on useFallback state
    // Add error boundary logging before hooks

    const [dbState, setDbState, dbStateHelpers] = useDatabaseState<AppState>('finance_app_state_v4', initialState, companyDbReloadTrigger);
    const [fallbackState, setFallbackState] = useDatabaseStateFallback<AppState>('finance_app_state_v4', initialState);


    // Initialize storedState safely - use initialState as fallback if hooks aren't ready
    const storedState = (useFallback ? fallbackState : dbState) || initialState;
    const setStoredState = useFallback ? setFallbackState : setDbState;
    // Single saver contract: persist only via hook’s saveNow (see doc/DB_STATE_LOADER_SAVER_CONTRACT.md)
    const saveNow = dbStateHelpers?.saveNow;
    const markDbLoadCompleteRef = useRef(dbStateHelpers?.markDbLoadComplete);
    markDbLoadCompleteRef.current = dbStateHelpers?.markDbLoadComplete;

    // Use a ref to track storedState to avoid initialization issues in dependency arrays
    // Initialize ref with initialState to ensure it's always defined
    const storedStateRef = useRef<AppState>(initialState);
    // Ref for dispatch so init effect (declared before useReducer) can update reducer when background sync completes
    const dispatchRef = useRef<React.Dispatch<AppAction> | null>(null);
    /** Set after refreshFromApi is defined; used from dispatch for post-conflict merge (declared early for closure). */
    const refreshFromApiRef = useRef<(() => Promise<void>) | null>(null);
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

        // Also clear from local SQLite if needed (LAN/API does not persist auth user in SQLite)
        if (isLocalOnlyMode() && (isAppRelaunched || versionChanged)) {
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
                            markDbLoadCompleteRef.current?.();
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

                    // Check if user is authenticated (cloud / LAN API vs local SQLite)
                    if (isAuthenticated) {
                        // LAN / API: load state from server (PostgreSQL-backed API)
                        if (!isLocalOnlyMode()) {
                            try {
                                setInitMessage('Loading application data from server...');
                                setInitProgress(60);
                                const { getAppStateApiService, pickTenantSettingsPartial } = await import('../services/api/appStateApi');
                                const partial = await getAppStateApiService().loadState();
                                if (isMounted) {
                                    const mergedInit = { ...initialState, ...partial, ...pickTenantSettingsPartial(partial) } as AppState;
                                    setStoredState(mergedInit);
                                    if (typeof sessionStorage !== 'undefined') {
                                        sessionStorage.setItem('pbooks_api_last_sync_at', new Date().toISOString());
                                    }
                                    markDbLoadCompleteRef.current?.();
                                    logger.logCategory('sync', '✅ Application state loaded from API');
                                }
                            } catch (apiErr) {
                                logger.warnCategory(
                                    'sync',
                                    'API load failed — not using local database (no offline fallback to SQLite in API mode):',
                                    apiErr
                                );
                                const msg =
                                    apiErr instanceof Error
                                        ? apiErr.message
                                        : typeof apiErr === 'string'
                                          ? apiErr
                                          : 'Could not reach the server or load your data.';
                                if (!isMounted) return;
                                if (timeoutId) clearTimeout(timeoutId);
                                if (forceTimeoutId) clearTimeout(forceTimeoutId);
                                setInitError(msg);
                                setInitMessage('Could not load data from the server.');
                                setInitProgress(100);
                                setApiStateLoadFailed(true);
                                setIsInitializing(false);
                                return;
                            }
                            if (!isMounted) return;
                            if (timeoutId) clearTimeout(timeoutId);
                            if (forceTimeoutId) clearTimeout(forceTimeoutId);
                            setInitProgress(100);
                            setInitMessage('Ready!');
                            setTimeout(() => {
                                if (isMounted) setIsInitializing(false);
                            }, 300);
                        } else {
                        // Authenticated + local-only: offline-first SQLite
                        try {
                            const { apiClient } = await import('../services/api/client');
                            const currentTenantId = apiClient.getTenantId();

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
                                    markDbLoadCompleteRef.current?.();
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
                                markDbLoadCompleteRef.current?.();
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

        // Sync Broadcast - Skip for navigation-only actions (performance optimization)
        if (!(action as any)._isRemote) {
            const NAVIGATION_ACTIONS = ['SET_PAGE', 'SET_INITIAL_TABS', 'CLEAR_INITIAL_TABS',
                'SET_INITIAL_TRANSACTION_TYPE', 'CLEAR_INITIAL_TRANSACTION_TYPE',
                'SET_INITIAL_TRANSACTION_FILTER', 'SET_INITIAL_IMPORT_TYPE',
                'CLEAR_INITIAL_IMPORT_TYPE', 'SET_EDITING_ENTITY', 'CLEAR_EDITING_ENTITY'];

            // Local-only: persistence runs via useDatabaseState / save hooks; no cloud broadcast.
        }

        return newState;
    }, []);

    // Use a ref to track if we've initialized the reducer with database state
    const reducerInitializedRef = useRef(false);

    // Initialize reducer with initialState first, then sync with storedState when ready
    // This avoids initialization issues with storedState
    const [state, baseDispatch] = useReducer(reducerWithPersistence, initialState);
    const latestStateRef = useRef(state);
    latestStateRef.current = state;

    /**
     * LAN/API mode: SQLite is not used; persist mutations to PostgreSQL via REST.
     * Transactions must be POSTed here — RentalPaymentModal and most flows only dispatch ADD_TRANSACTION.
     * Also sync invoice/bill paid amounts after payment transactions (applyTransactionEffect is local-only).
     * Skip when action came from server merge ( _isRemote ) to avoid feedback loops.
     */
    const dispatch = useCallback(
        (action: AppAction) => {
            // LAN/API: allow REST sync when AuthContext says logged in OR a JWT is present (header uses token; context can lag).
            const hasAuthToken =
                typeof window !== 'undefined' && !!localStorage.getItem('auth_token');
            if (isLocalOnlyMode() || (!isAuthenticated && !hasAuthToken)) {
                baseDispatch(action);
                return;
            }
            if ((action as { _isRemote?: boolean })._isRemote) {
                baseDispatch(action);
                return;
            }

            const a = action as { type: string; payload?: unknown };
            const prev = latestStateRef.current;

            if (a.type === 'ADD_TRANSACTION') {
                const tx = a.payload as Transaction;
                const invoiceToSave =
                    tx.invoiceId && tx.id
                        ? (() => {
                              const inv = prev.invoices.find(i => i.id === tx.invoiceId);
                              return inv ? applyTxToInvoiceCopy(inv, tx, true) : undefined;
                          })()
                        : undefined;
                const billToSave =
                    tx.billId && tx.id
                        ? (() => {
                              const b = prev.bills.find(x => x.id === tx.billId);
                              return b ? applyTxToBillCopy(b, tx, true) : undefined;
                          })()
                        : undefined;
                baseDispatch(action);
                if (!tx?.id) return;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    const api = getAppStateApiService();
                    api.saveTransaction(tx)
                        .then(async (saved) => {
                            const v = typeof saved?.version === 'number' ? saved.version : undefined;
                            if (typeof v === 'number') {
                                dispatch({
                                    type: 'UPDATE_TRANSACTION',
                                    payload: { ...tx, version: v },
                                    _isRemote: true,
                                } as AppAction);
                            }
                            // Server recalculates invoice/bill paid_amount + version in the same txn; do not POST stale rows (409 + spurious modal).
                            if (invoiceToSave && tx.invoiceId) {
                                const savedInv = await api.fetchInvoice(tx.invoiceId);
                                if (savedInv?.id) {
                                    dispatch({
                                        type: 'UPDATE_INVOICE',
                                        payload: savedInv,
                                        _isRemote: true,
                                    } as AppAction);
                                }
                            }
                            if (billToSave && tx.billId) {
                                const savedBill = await api.fetchBill(tx.billId);
                                if (savedBill?.id) {
                                    dispatch({
                                        type: 'UPDATE_BILL',
                                        payload: savedBill,
                                        _isRemote: true,
                                    } as AppAction);
                                }
                            }
                        })
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to persist transaction (or linked invoice/bill) to API:', err);
                        });
                });
                return;
            }

            if (a.type === 'BATCH_ADD_TRANSACTIONS') {
                const txs = a.payload as Transaction[];
                const invoiceIds = [...new Set(txs.map(t => t.invoiceId).filter(Boolean) as string[])];
                const billIds = [...new Set(txs.map(t => t.billId).filter(Boolean) as string[])];
                const invoicesAfter = new Map<string, Invoice>();
                for (const id of invoiceIds) {
                    let inv = prev.invoices.find(i => i.id === id);
                    if (!inv) continue;
                    for (const tx of txs) {
                        if (tx.invoiceId === id) inv = applyTxToInvoiceCopy(inv, tx, true);
                    }
                    invoicesAfter.set(id, inv);
                }
                const billsAfter = new Map<string, Bill>();
                for (const id of billIds) {
                    let b = prev.bills.find(x => x.id === id);
                    if (!b) continue;
                    for (const tx of txs) {
                        if (tx.billId === id) b = applyTxToBillCopy(b, tx, true);
                    }
                    billsAfter.set(id, b);
                }
                baseDispatch(action);
                if (!txs?.length) return;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    const api = getAppStateApiService();
                    const accountIds = new Set<string>();
                    txs.forEach((tx) => {
                        if (tx.fromAccountId) accountIds.add(tx.fromAccountId);
                        if (tx.toAccountId) accountIds.add(tx.toAccountId);
                        if (tx.accountId) accountIds.add(tx.accountId);
                    });
                    const accountsToUpsert = [...accountIds]
                        .map((id) => prev.accounts.find((acc) => acc.id === id))
                        .filter((acc): acc is Account => !!acc);
                    const syncAccountsFirst = () =>
                        accountsToUpsert.length === 0
                            ? Promise.resolve<Account[]>([])
                            : Promise.all(
                                  accountsToUpsert.map((acc) =>
                                      // Omit client version: a previous batch (e.g. profit distribution) may have
                                      // already POSTed these accounts and bumped server version while the client
                                      // still holds the old version — stale version causes 409 CONFLICT.
                                      api.saveAccount({ ...acc, version: undefined })
                                  )
                              );
                    syncAccountsFirst()
                        .then((savedAccounts) => {
                            for (const saved of savedAccounts) {
                                if (saved?.id) {
                                    dispatch({
                                        type: 'UPDATE_ACCOUNT',
                                        payload: saved,
                                        _isRemote: true,
                                    } as AppAction);
                                }
                            }
                            return Promise.all(txs.map((tx) => api.saveTransaction(tx)));
                        })
                        .then(async (savedList) => {
                            for (let i = 0; i < txs.length; i++) {
                                const s = savedList[i];
                                const origTx = txs[i];
                                if (s && typeof s.version === 'number' && origTx?.id) {
                                    dispatch({
                                        type: 'UPDATE_TRANSACTION',
                                        payload: { ...origTx, version: s.version },
                                        _isRemote: true,
                                    } as AppAction);
                                }
                            }
                            for (const id of invoicesAfter.keys()) {
                                const savedInv = await api.fetchInvoice(id);
                                if (savedInv?.id) {
                                    dispatch({
                                        type: 'UPDATE_INVOICE',
                                        payload: savedInv,
                                        _isRemote: true,
                                    } as AppAction);
                                }
                            }
                            for (const id of billsAfter.keys()) {
                                const savedBill = await api.fetchBill(id);
                                if (savedBill?.id) {
                                    dispatch({
                                        type: 'UPDATE_BILL',
                                        payload: savedBill,
                                        _isRemote: true,
                                    } as AppAction);
                                }
                            }
                        })
                        .catch((err: unknown) => {
                            logger.warnCategory('sync', '⚠️ Failed to persist batch transactions to API:', err);
                            const e = err as { status?: number; code?: string };
                            if (e?.status === 409 || e?.code === 'LOCK_HELD' || e?.code === 'CONFLICT') {
                                void refreshFromApiRef.current?.();
                            }
                        });
                });
                return;
            }

            if (a.type === 'BATCH_DELETE_TRANSACTIONS') {
                const payload = a.payload as { transactionIds: string[]; projectAssetIdToDelete?: string };
                const uniqueIds = [...new Set(payload.transactionIds)].filter(Boolean);
                const txsToDelete = uniqueIds
                    .map(id => prev.transactions.find(t => t.id === id))
                    .filter((t): t is Transaction => !!t);
                const projectAssetIdToDelete = payload.projectAssetIdToDelete;
                const projectAssetVersionForApi = projectAssetIdToDelete
                    ? prev.projectReceivedAssets?.find((x) => x.id === projectAssetIdToDelete)?.version
                    : undefined;
                baseDispatch(action);
                if (uniqueIds.length === 0) return;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    const api = getAppStateApiService();
                    void (async () => {
                        try {
                            await Promise.all(uniqueIds.map(id => api.deleteTransaction(id)));
                            const invoiceIds = [...new Set(txsToDelete.map(t => t.invoiceId).filter(Boolean) as string[])];
                            const billIds = [...new Set(txsToDelete.map(t => t.billId).filter(Boolean) as string[])];
                            for (const iid of invoiceIds) {
                                const savedInv = await api.fetchInvoice(iid);
                                if (savedInv?.id) {
                                    dispatch({
                                        type: 'UPDATE_INVOICE',
                                        payload: savedInv,
                                        _isRemote: true,
                                    } as AppAction);
                                }
                            }
                            for (const bid of billIds) {
                                const savedBill = await api.fetchBill(bid);
                                if (savedBill?.id) {
                                    dispatch({
                                        type: 'UPDATE_BILL',
                                        payload: savedBill,
                                        _isRemote: true,
                                    } as AppAction);
                                }
                            }
                            if (projectAssetIdToDelete) {
                                await api.deleteProjectReceivedAsset(projectAssetIdToDelete, projectAssetVersionForApi);
                            }
                        } catch (err) {
                            logger.warnCategory('sync', '⚠️ Failed to persist batch transaction deletes to API:', err);
                        }
                    })();
                });
                return;
            }

            if (a.type === 'SET_LAST_SERVICE_CHARGE_RUN') {
                const lastRun = a.payload as string;
                baseDispatch(action);
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    const merged = { ...prev, lastServiceChargeRun: lastRun } as AppState;
                    void getAppStateApiService().flushTenantSettingsNow(merged);
                });
                return;
            }

            if (a.type === 'UPDATE_TRANSACTION') {
                const updatedTx = a.payload as Transaction;
                flushSync(() => {
                    baseDispatch(action);
                });
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    const api = getAppStateApiService();
                    void enqueueTransactionApiSave(updatedTx.id, async () => {
                        const latest = latestStateRef.current.transactions.find(t => t.id === updatedTx.id);
                        if (!latest) return;
                        try {
                            const saved = await api.saveTransaction(latest);
                            const mergedVersion =
                                typeof saved.version === 'number' ? saved.version : latest.version;
                            dispatch({
                                type: 'UPDATE_TRANSACTION',
                                payload: { ...latest, version: mergedVersion },
                                _isRemote: true,
                            } as AppAction);

                            if (latest.invoiceId) {
                                const savedInv = await api.fetchInvoice(latest.invoiceId);
                                if (savedInv?.id) {
                                    dispatch({
                                        type: 'UPDATE_INVOICE',
                                        payload: savedInv,
                                        _isRemote: true,
                                    } as AppAction);
                                }
                            }
                            if (latest.billId) {
                                const savedBill = await api.fetchBill(latest.billId);
                                if (savedBill?.id) {
                                    dispatch({
                                        type: 'UPDATE_BILL',
                                        payload: savedBill,
                                        _isRemote: true,
                                    } as AppAction);
                                }
                            }
                            // Keep linked construction contract status in sync on server (reducer updates local state)
                            const st = latestStateRef.current;
                            const cTx = st.transactions.find(t => t.id === latest.id) ?? latest;
                            if (cTx.contractId) {
                                const cid = cTx.contractId;
                                const totalPaid = st.transactions
                                    .filter(t => t.contractId === cid)
                                    .reduce((sum, t) => {
                                        const amt =
                                            t.id === cTx.id ? cTx.amount : t.amount;
                                        const n = typeof amt === 'number' ? amt : parseFloat(String(amt)) || 0;
                                        return sum + n;
                                    }, 0);
                                const c = st.contracts.find(x => x.id === cid);
                                if (c && c.status !== ContractStatus.TERMINATED) {
                                    const isFullyPaid = totalPaid >= c.totalAmount - 1.0;
                                    let newStatus = c.status;
                                    if (isFullyPaid && c.status === ContractStatus.ACTIVE) {
                                        newStatus = ContractStatus.COMPLETED;
                                    } else if (!isFullyPaid && c.status === ContractStatus.COMPLETED) {
                                        newStatus = ContractStatus.ACTIVE;
                                    }
                                    if (newStatus !== c.status) {
                                        await api.saveContract({
                                            ...c,
                                            status: newStatus,
                                            version: c.version,
                                        });
                                    }
                                }
                            }
                        } catch (err) {
                            logger.warnCategory('sync', '⚠️ Failed to persist transaction update to API:', err);
                        }
                    });
                });
                return;
            }

            if (a.type === 'DELETE_TRANSACTION' && typeof a.payload === 'string') {
                const id = a.payload;
                const tx = prev.transactions.find(t => t.id === id);
                const assetIdToRemoveOnApi =
                    tx?.projectAssetId &&
                    prev.transactions.filter(t => t.projectAssetId === tx.projectAssetId).length === 1
                        ? tx.projectAssetId
                        : undefined;
                const assetVersionForApi = assetIdToRemoveOnApi
                    ? prev.projectReceivedAssets?.find((x) => x.id === assetIdToRemoveOnApi)?.version
                    : undefined;
                baseDispatch(action);
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    const api = getAppStateApiService();
                    void (async () => {
                        try {
                            await api.deleteTransaction(id);
                            if (tx?.invoiceId) {
                                const savedInv = await api.fetchInvoice(tx.invoiceId);
                                if (savedInv?.id) {
                                    dispatch({
                                        type: 'UPDATE_INVOICE',
                                        payload: savedInv,
                                        _isRemote: true,
                                    } as AppAction);
                                }
                            }
                            if (tx?.billId) {
                                const savedBill = await api.fetchBill(tx.billId);
                                if (savedBill?.id) {
                                    dispatch({
                                        type: 'UPDATE_BILL',
                                        payload: savedBill,
                                        _isRemote: true,
                                    } as AppAction);
                                }
                            }
                            if (assetIdToRemoveOnApi) {
                                await api.deleteProjectReceivedAsset(assetIdToRemoveOnApi, assetVersionForApi);
                            }
                        } catch (err) {
                            logger.warnCategory('sync', '⚠️ Failed to delete transaction on API:', err);
                        }
                    })();
                });
                return;
            }

            if (a.type === 'DELETE_INVOICE' && typeof a.payload === 'string') {
                const id = a.payload;
                const version = prev.invoices.find((i) => i.id === id)?.version;
                baseDispatch(action);
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .deleteInvoice(id, version)
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to delete invoice on API:', err);
                        });
                });
                return;
            }

            if (a.type === 'DELETE_PROJECT_RECEIVED_ASSET' && typeof a.payload === 'string') {
                const id = a.payload;
                const version = prev.projectReceivedAssets?.find((x) => x.id === id)?.version;
                baseDispatch(action);
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .deleteProjectReceivedAsset(id, version)
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to delete project received asset on API:', err);
                        });
                });
                return;
            }

            if (a.type === 'DELETE_SALES_RETURN' && typeof a.payload === 'string') {
                const id = a.payload;
                const version = prev.salesReturns?.find((x) => x.id === id)?.version;
                baseDispatch(action);
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .deleteSalesReturn(id, version)
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to delete sales return on API:', err);
                        });
                });
                return;
            }

            if (a.type === 'PROCESS_SALES_RETURN') {
                const { returnId } = a.payload as { returnId: string };
                const returnRecord = prev.salesReturns?.find(sr => sr.id === returnId);
                baseDispatch(action);
                if (!returnRecord) return;
                const updated: SalesReturn = {
                    ...returnRecord,
                    status: SalesReturnStatus.PROCESSED,
                    processedDate: new Date().toISOString(),
                };
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .saveSalesReturn(updated)
                        .then((saved) => {
                            if (saved && typeof saved.version === 'number') {
                                dispatch({
                                    type: 'UPDATE_SALES_RETURN',
                                    payload: { ...updated, ...saved },
                                    _isRemote: true,
                                } as AppAction);
                            }
                        })
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to persist processed sales return to API:', err);
                        });
                });
                return;
            }

            if (a.type === 'MARK_RETURN_REFUNDED') {
                const { returnId, refundDate } = a.payload as { returnId: string; refundDate: string };
                const returnRecord = prev.salesReturns?.find(sr => sr.id === returnId);
                baseDispatch(action);
                if (!returnRecord) return;
                const updated: SalesReturn = {
                    ...returnRecord,
                    status: SalesReturnStatus.REFUNDED,
                    refundedDate: refundDate,
                };
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .saveSalesReturn(updated)
                        .then((saved) => {
                            if (saved && typeof saved.version === 'number') {
                                dispatch({
                                    type: 'UPDATE_SALES_RETURN',
                                    payload: { ...updated, ...saved },
                                    _isRemote: true,
                                } as AppAction);
                            }
                        })
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to persist refunded sales return to API:', err);
                        });
                });
                return;
            }

            if (a.type === 'ADD_ACCOUNT') {
                const acc = a.payload as Account;
                baseDispatch(action);
                if (!acc?.id) return;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .saveAccount(acc)
                        .then((saved) => {
                            if (saved?.id) {
                                dispatch({
                                    type: 'UPDATE_ACCOUNT',
                                    payload: { ...acc, ...saved } as Account,
                                    _isRemote: true,
                                } as AppAction);
                            }
                        })
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to persist account to API:', err);
                        });
                });
                return;
            }

            if (a.type === 'UPDATE_ACCOUNT') {
                const acc = a.payload as Account;
                baseDispatch(action);
                if (!acc?.id) return;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .saveAccount(acc)
                        .then((saved) => {
                            if (saved?.id) {
                                dispatch({
                                    type: 'UPDATE_ACCOUNT',
                                    payload: { ...acc, ...saved } as Account,
                                    _isRemote: true,
                                } as AppAction);
                            }
                        })
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to persist account update to API:', err);
                        });
                });
                return;
            }

            if (a.type === 'DELETE_ACCOUNT' && typeof a.payload === 'string') {
                const id = a.payload;
                baseDispatch(action);
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .deleteAccount(id)
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to delete account on API:', err);
                        });
                });
                return;
            }

            baseDispatch(action);

            if (a.type === 'ADD_INVOICE' || a.type === 'UPDATE_INVOICE') {
                const inv = a.payload as Invoice;
                if (!inv?.id) return;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .saveInvoice(inv)
                        .then((saved) => {
                            if (saved && typeof saved.version === 'number') {
                                dispatch({
                                    type: 'UPDATE_INVOICE',
                                    payload: { ...inv, ...saved },
                                    _isRemote: true,
                                } as AppAction);
                            }
                        })
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to persist invoice to API:', err);
                        });
                });
            } else if (a.type === 'ADD_BILL' || a.type === 'UPDATE_BILL') {
                const bill = a.payload as Bill;
                if (!bill?.id) return;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .saveBill(bill)
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to persist bill to API:', err);
                        });
                });
            } else if (a.type === 'ADD_PM_CYCLE_ALLOCATION' || a.type === 'UPDATE_PM_CYCLE_ALLOCATION') {
                const alloc = a.payload as PMCycleAllocation;
                if (!alloc?.id) return;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    const api = getAppStateApiService();
                    const run = async () => {
                        if (alloc.billId) {
                            const b = latestStateRef.current.bills.find((x) => x.id === alloc.billId);
                            if (b) {
                                try {
                                    await api.saveBill(b);
                                } catch (be) {
                                    logger.warnCategory('sync', '⚠️ PM allocation: could not persist linked bill before allocation:', be);
                                }
                            }
                        }
                        return api.savePMCycleAllocation(alloc);
                    };
                    run()
                        .then((saved) => {
                            if (saved && typeof saved.version === 'number') {
                                dispatch({
                                    type: 'UPDATE_PM_CYCLE_ALLOCATION',
                                    payload: { ...alloc, ...saved },
                                    _isRemote: true,
                                } as AppAction);
                            }
                        })
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to persist PM cycle allocation to API:', err);
                        });
                });
            } else if (a.type === 'DELETE_PM_CYCLE_ALLOCATION' && typeof a.payload === 'string') {
                const id = a.payload;
                const version = prev.pmCycleAllocations?.find((x) => x.id === id)?.version;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .deletePMCycleAllocation(id, version)
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to delete PM cycle allocation on API:', err);
                        });
                });
            } else if (a.type === 'DELETE_BILL' && typeof a.payload === 'string') {
                const id = a.payload;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .deleteBill(id)
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to delete bill on API:', err);
                        });
                });
            } else if (a.type === 'ADD_CATEGORY' || a.type === 'UPDATE_CATEGORY') {
                const cat = a.payload as Category;
                if (!cat?.id) return;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .saveCategory(cat)
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to persist category to API:', err);
                        });
                });
            } else if (a.type === 'DELETE_CATEGORY' && typeof a.payload === 'string') {
                const id = a.payload;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .deleteCategory(id)
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to delete category on API:', err);
                        });
                });
            } else if (a.type === 'ADD_RECURRING_TEMPLATE' || a.type === 'UPDATE_RECURRING_TEMPLATE') {
                const tpl = a.payload as RecurringInvoiceTemplate;
                if (!tpl?.id) return;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .saveRecurringTemplate(tpl)
                        .then((saved) => {
                            if (saved && typeof saved.version === 'number') {
                                dispatch({
                                    type: 'UPDATE_RECURRING_TEMPLATE',
                                    payload: { ...tpl, version: saved.version },
                                    _isRemote: true,
                                } as AppAction);
                            }
                        })
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to persist recurring template to API:', err);
                        });
                });
            } else if (a.type === 'DELETE_RECURRING_TEMPLATE' && typeof a.payload === 'string') {
                const id = a.payload;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .deleteRecurringTemplate(id)
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to delete recurring template on API:', err);
                        });
                });
            } else if (a.type === 'ADD_PROJECT_RECEIVED_ASSET' || a.type === 'UPDATE_PROJECT_RECEIVED_ASSET') {
                const asset = a.payload as ProjectReceivedAsset;
                if (!asset?.id) return;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .saveProjectReceivedAsset(asset)
                        .then((saved) => {
                            if (saved && typeof saved.version === 'number') {
                                dispatch({
                                    type: 'UPDATE_PROJECT_RECEIVED_ASSET',
                                    payload: { ...asset, ...saved },
                                    _isRemote: true,
                                } as AppAction);
                            }
                        })
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to persist project received asset to API:', err);
                        });
                });
            } else if (a.type === 'ADD_SALES_RETURN' || a.type === 'UPDATE_SALES_RETURN') {
                const sr = a.payload as SalesReturn;
                if (!sr?.id) return;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .saveSalesReturn(sr)
                        .then((saved) => {
                            if (saved && typeof saved.version === 'number') {
                                dispatch({
                                    type: 'UPDATE_SALES_RETURN',
                                    payload: { ...sr, ...saved },
                                    _isRemote: true,
                                } as AppAction);
                            }
                        })
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to persist sales return to API:', err);
                        });
                });
            } else if (a.type === 'ADD_CONTRACT' || a.type === 'UPDATE_CONTRACT') {
                const c = a.payload as Contract;
                if (!c?.id) return;
                const version = c.version ?? prev.contracts?.find((x) => x.id === c.id)?.version;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .saveContract({ ...c, version })
                        .then((saved) => {
                            if (saved && typeof saved.version === 'number') {
                                dispatch({
                                    type: 'UPDATE_CONTRACT',
                                    payload: { ...c, ...saved },
                                    _isRemote: true,
                                } as AppAction);
                            }
                        })
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to persist contract to API:', err);
                        });
                });
            } else if (a.type === 'DELETE_CONTRACT' && typeof a.payload === 'string') {
                const id = a.payload;
                const version = prev.contracts?.find((x) => x.id === id)?.version;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .deleteContract(id, version)
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to delete contract on API:', err);
                        });
                });
            } else if (a.type === 'ADD_BUDGET' || a.type === 'UPDATE_BUDGET') {
                const b = a.payload as Budget;
                if (!b?.id) return;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .saveBudget(b)
                        .then((saved) => {
                            if (saved?.id) {
                                dispatch({
                                    type: 'UPDATE_BUDGET',
                                    payload: { ...b, ...saved },
                                    _isRemote: true,
                                } as AppAction);
                            }
                        })
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to persist budget to API:', err);
                        });
                });
            } else if (a.type === 'DELETE_BUDGET' && typeof a.payload === 'string') {
                const id = a.payload;
                const version = prev.budgets?.find((x) => x.id === id)?.version;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .deleteBudget(id, version)
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to delete budget on API:', err);
                        });
                });
            } else if (a.type === 'ADD_INSTALLMENT_PLAN' || a.type === 'UPDATE_INSTALLMENT_PLAN') {
                const plan = a.payload as InstallmentPlan;
                if (!plan?.id) return;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .saveInstallmentPlan(plan)
                        .then((saved) => {
                            if (saved && typeof saved.version === 'number') {
                                dispatch({
                                    type: 'UPDATE_INSTALLMENT_PLAN',
                                    payload: { ...plan, ...saved },
                                    _isRemote: true,
                                } as AppAction);
                            }
                        })
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to persist installment plan to API:', err);
                        });
                });
            } else if (a.type === 'DELETE_INSTALLMENT_PLAN' && typeof a.payload === 'string') {
                const id = a.payload;
                const version = prev.installmentPlans?.find((x) => x.id === id)?.version;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .deleteInstallmentPlan(id, version)
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to delete installment plan on API:', err);
                        });
                });
            } else if (a.type === 'ADD_PLAN_AMENITY' || a.type === 'UPDATE_PLAN_AMENITY') {
                const amenity = a.payload as PlanAmenity;
                if (!amenity?.id) return;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .savePlanAmenity(amenity)
                        .then((saved) => {
                            if (saved && typeof saved.version === 'number') {
                                dispatch({
                                    type: 'UPDATE_PLAN_AMENITY',
                                    payload: { ...amenity, ...saved },
                                    _isRemote: true,
                                } as AppAction);
                            }
                        })
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to persist plan amenity to API:', err);
                        });
                });
            } else if (a.type === 'DELETE_PLAN_AMENITY' && typeof a.payload === 'string') {
                const id = a.payload;
                const version = prev.planAmenities?.find((x) => x.id === id)?.version;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .deletePlanAmenity(id, version)
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to delete plan amenity on API:', err);
                        });
                });
            } else if (a.type === 'ADD_PROJECT') {
                const proj = a.payload as Project;
                if (!proj?.id) return;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .saveProject(proj)
                        .then((saved) => {
                            if (saved && typeof saved.version === 'number') {
                                dispatch({
                                    type: 'UPDATE_PROJECT',
                                    payload: { ...proj, ...saved },
                                    _isRemote: true,
                                } as AppAction);
                            }
                        })
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to persist project to API:', err);
                        });
                });
            } else if (a.type === 'UPDATE_PROJECT') {
                const proj = a.payload as Project;
                if (!proj?.id) return;
                const version = proj.version ?? prev.projects?.find((x) => x.id === proj.id)?.version;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .updateProject(proj.id, { ...proj, version })
                        .then((saved) => {
                            if (saved && typeof saved.version === 'number') {
                                dispatch({
                                    type: 'UPDATE_PROJECT',
                                    payload: { ...proj, ...saved },
                                    _isRemote: true,
                                } as AppAction);
                            }
                        })
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to persist project update to API:', err);
                        });
                });
            } else if (a.type === 'DELETE_PROJECT' && typeof a.payload === 'string') {
                const id = a.payload;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .deleteProject(id)
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to delete project on API:', err);
                        });
                });
            } else if (a.type === 'ADD_UNIT' || a.type === 'UPDATE_UNIT') {
                const unit = a.payload as Unit;
                if (!unit?.id) return;
                const version = unit.version ?? prev.units?.find((x) => x.id === unit.id)?.version;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    const api = getAppStateApiService();
                    const save =
                        a.type === 'ADD_UNIT'
                            ? api.saveUnit(unit)
                            : api.updateUnit(unit.id, { ...unit, version });
                    save
                        .then((saved) => {
                            if (saved?.id) {
                                dispatch({
                                    type: 'UPDATE_UNIT',
                                    payload: { ...unit, ...saved },
                                    _isRemote: true,
                                } as AppAction);
                            }
                        })
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to persist unit to API:', err);
                        });
                });
            } else {
                const mergedForFlush = mergeTenantSettingsFromAction(prev, action as AppAction);
                if (mergedForFlush) {
                    void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                        getAppStateApiService()
                            .flushTenantSettingsNow(mergedForFlush)
                            .catch((err) => {
                                logger.warnCategory('sync', '⚠️ Failed to persist tenant settings to API:', err);
                            });
                    });
                }
            }
        },
        [baseDispatch, isAuthenticated]
    );

    useEffect(() => {
        dispatchRef.current = dispatch;
        return () => {
            dispatchRef.current = null;
        };
    }, [dispatch]);

    // Sync reducer state with loaded database state (critical for first load)
    // Initialize with storedState when it's ready (after initialization)
    useEffect(() => {
        // Wait for initialization to complete and storedState to be ready
        if (!isInitializing && !apiStateLoadFailed && storedStateRef.current) {
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
        // Only depend on isInitializing/apiStateLoadFailed to avoid running on every state change.
        // The ref guard (reducerInitializedRef) ensures this dispatches at most once; state
        // comparisons read from storedStateRef and the current state snapshot inside the effect.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isInitializing, apiStateLoadFailed, dispatch]);

    // Track latest state to avoid stale captures in async effects
    const stateRef = useRef(state);
    useEffect(() => {
        stateRef.current = state;
    }, [state]);

    /**
     * Merge latest server state into React + persisted state (LAN / PostgreSQL API).
     * Required so User B sees projects/units created by User A without reloading the app.
     */
    const refreshFromApi = useCallback(async (_onCriticalLoaded?: () => void) => {
        if (!isAuthenticated || isLocalOnlyMode()) return;
        try {
            const { getAppStateApiService, pickTenantSettingsPartial, getServerTimeIso } = await import('../services/api/appStateApi');
            const base = stateRef.current;
            const lastSync = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('pbooks_api_last_sync_at') : null;

            // Incremental sync returns deltas (vendors, contacts, rental_agreements, project_agreements, invoices, bills, accounts, transactions, categories, app settings).
            // It does not re-fetch projects, buildings, properties, etc. Using it when the baseline is
            // still empty would leave PostgreSQL-backed data missing after a fresh login or when sessionStorage still
            // has pbooks_api_last_sync_at from an earlier tab session.
            const baselineHasCoreData =
                (base.accounts?.length ?? 0) > 0 ||
                (base.categories?.length ?? 0) > 0 ||
                (base.projects?.length ?? 0) > 0 ||
                (base.contacts?.length ?? 0) > 0 ||
                (base.buildings?.length ?? 0) > 0 ||
                (base.invoices?.length ?? 0) > 0 ||
                (base.bills?.length ?? 0) > 0 ||
                (base.transactions?.length ?? 0) > 0;

            let merged: AppState;
            let nextSyncCursor: string;

            if (lastSync && baselineHasCoreData) {
                try {
                    const { merged: inc, serverCursor } = await getAppStateApiService().loadStateViaIncrementalSync(lastSync, base);
                    merged = { ...base, ...inc, ...pickTenantSettingsPartial(inc) } as AppState;
                    nextSyncCursor = serverCursor;
                } catch {
                    const partial = await getAppStateApiService().loadState();
                    const partialSettings = pickTenantSettingsPartial(partial);
                    merged = {
                        ...base,
                        ...partial,
                        invoices: mergeInvoicesWithServerBaseline(base.invoices || [], partial.invoices || []),
                        projectReceivedAssets: mergeProjectReceivedAssetsWithServerBaseline(
                            base.projectReceivedAssets || [],
                            partial.projectReceivedAssets || []
                        ),
                        salesReturns: mergeSalesReturnsWithServerBaseline(
                            base.salesReturns || [],
                            partial.salesReturns || []
                        ),
                        contracts: partial.contracts ?? base.contracts,
                        ...partialSettings,
                    } as AppState;
                    nextSyncCursor = await getServerTimeIso();
                }
            } else {
                const partial = await getAppStateApiService().loadState();
                const partialSettings = pickTenantSettingsPartial(partial);
                merged = {
                    ...base,
                    ...partial,
                    invoices: mergeInvoicesWithServerBaseline(base.invoices || [], partial.invoices || []),
                    projectReceivedAssets: mergeProjectReceivedAssetsWithServerBaseline(
                        base.projectReceivedAssets || [],
                        partial.projectReceivedAssets || []
                    ),
                    salesReturns: mergeSalesReturnsWithServerBaseline(
                        base.salesReturns || [],
                        partial.salesReturns || []
                    ),
                    contracts: partial.contracts ?? base.contracts,
                    ...partialSettings,
                } as AppState;
                nextSyncCursor = await getServerTimeIso();
            }

            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.setItem('pbooks_api_last_sync_at', nextSyncCursor);
            }

            dispatch({ type: 'SET_STATE', payload: merged, _isRemote: true } as any);
            setStoredState(prev => ({ ...prev, ...merged } as AppState));

            if (currentTenantId) {
                try {
                    const { storageService } = await import('../components/payroll/services/storageService');
                    storageService.init(currentTenantId);
                    void storageService.syncPayrollListsFromApi(currentTenantId);
                } catch (pe) {
                    logger.warnCategory('sync', 'payroll list sync failed', pe);
                }
            }

            logger.logCategory('sync', '✅ refreshFromApi: merged server state', {
                projects: merged.projects?.length ?? 0,
                units: merged.units?.length ?? 0,
                vendors: merged.vendors?.length ?? 0,
                contacts: merged.contacts?.length ?? 0,
                rentalAgreements: merged.rentalAgreements?.length ?? 0,
                projectAgreements: merged.projectAgreements?.length ?? 0,
                projectReceivedAssets: merged.projectReceivedAssets?.length ?? 0,
                salesReturns: merged.salesReturns?.length ?? 0,
                contracts: merged.contracts?.length ?? 0,
                invoices: merged.invoices?.length ?? 0,
                bills: merged.bills?.length ?? 0,
                accounts: merged.accounts?.length ?? 0,
                categories: merged.categories?.length ?? 0,
                transactions: merged.transactions?.length ?? 0,
                personalCategories: merged.personalCategories?.length ?? 0,
                personalTransactions: merged.personalTransactions?.length ?? 0,
                pmCycleAllocations: merged.pmCycleAllocations?.length ?? 0,
                incremental: !!(lastSync && baselineHasCoreData),
            });
            _onCriticalLoaded?.();
        } catch (e) {
            logger.warnCategory('sync', '⚠️ refreshFromApi failed:', e);
        }
    }, [isAuthenticated, dispatch, setStoredState, currentTenantId]);

    useEffect(() => {
        refreshFromApiRef.current = refreshFromApi;
    }, [refreshFromApi]);

    /** After auth hydrates, if init ran before isAuthenticated was true, SQLite had no API-backed projects — merge once. */
    const didPostAuthApiMergeRef = useRef(false);
    useEffect(() => {
        if (!isAuthenticated) {
            didPostAuthApiMergeRef.current = false;
            return;
        }
        if (isInitializing || isLocalOnlyMode() || apiStateLoadFailed) return;
        if (didPostAuthApiMergeRef.current) return;
        didPostAuthApiMergeRef.current = true;
        void refreshFromApi();
    }, [isAuthenticated, isInitializing, apiStateLoadFailed, refreshFromApi]);

    /** Socket.IO: merge server state when another user mutates data (tenant-scoped rooms on API). */
    useEffect(() => {
        if (!isAuthenticated || isLocalOnlyMode() || apiStateLoadFailed) {
            disconnectRealtimeSocket();
            return;
        }
        const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
        if (!token) {
            disconnectRealtimeSocket();
            return;
        }

        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        let lastRefreshAt = 0;
        const DEBOUNCE_MS = 2000;
        const COOLDOWN_MS = 3000;

        const scheduleRefresh = () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            const sinceLastRefresh = Date.now() - lastRefreshAt;
            if (sinceLastRefresh < COOLDOWN_MS) {
                debounceTimer = setTimeout(() => {
                    debounceTimer = null;
                    lastRefreshAt = Date.now();
                    void refreshFromApiRef.current?.();
                }, COOLDOWN_MS - sinceLastRefresh);
                return;
            }
            debounceTimer = setTimeout(() => {
                debounceTimer = null;
                lastRefreshAt = Date.now();
                void refreshFromApiRef.current?.();
            }, DEBOUNCE_MS);
        };

        const handleEntity = (payload: { sourceUserId?: string }) => {
            if (payload?.sourceUserId && auth.user?.id && payload.sourceUserId === auth.user.id) {
                return;
            }
            scheduleRefresh();
        };

        const s = connectRealtimeSocket(token);
        s.on('entity_created', handleEntity);
        s.on('entity_updated', handleEntity);
        s.on('entity_deleted', handleEntity);

        return () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            disconnectRealtimeSocket();
        };
    }, [isAuthenticated, auth.user?.id, currentTenantId, apiStateLoadFailed]);

    /** When user returns to the tab, refresh from API so multi-user changes (e.g. new projects) appear. */
    useEffect(() => {
        if (!isAuthenticated || isLocalOnlyMode() || apiStateLoadFailed) return;
        let debounce: ReturnType<typeof setTimeout> | null = null;
        const onVisibility = () => {
            if (document.visibilityState !== 'visible') return;
            if (debounce) clearTimeout(debounce);
            debounce = setTimeout(() => {
                debounce = null;
                void refreshFromApiRef.current?.();
            }, 1200);
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            document.removeEventListener('visibilitychange', onVisibility);
            if (debounce) clearTimeout(debounce);
        };
    }, [isAuthenticated, apiStateLoadFailed]);


    // Reload AppContext from local DB when bidirectional sync completes (sync writes to DB but does not update React state)
    useEffect(() => {
        const handleBidirDownstreamComplete = async () => {
            try {
                const dbService = getDatabaseService();
                if (!dbService.isReady()) return;
                const appStateRepo = await getAppStateRepository();
                let loadedState = await appStateRepo.loadState();
                // Projects/units/vendors/contacts/rental/invoices/accounts and tenant app settings are not fully loaded from SQLite in API mode; merge from server so we never wipe them here.
                if (!isLocalOnlyMode() && isAuthenticated) {
                    try {
                        const { getAppStateApiService, pickTenantSettingsPartial } = await import('../services/api/appStateApi');
                        const partial = await getAppStateApiService().loadState();
                        loadedState = {
                            ...loadedState,
                            projects: partial.projects ?? loadedState.projects,
                            units: partial.units ?? loadedState.units,
                            vendors: partial.vendors ?? loadedState.vendors,
                            contacts: partial.contacts ?? loadedState.contacts,
                            rentalAgreements: partial.rentalAgreements ?? loadedState.rentalAgreements,
                            projectAgreements: partial.projectAgreements ?? loadedState.projectAgreements,
                            projectReceivedAssets: partial.projectReceivedAssets ?? loadedState.projectReceivedAssets,
                            salesReturns: partial.salesReturns ?? loadedState.salesReturns,
                            invoices: partial.invoices ?? loadedState.invoices,
                            accounts: partial.accounts ?? loadedState.accounts,
                            categories: partial.categories ?? loadedState.categories,
                            bills: partial.bills ?? loadedState.bills,
                            transactions: partial.transactions ?? loadedState.transactions,
                            recurringInvoiceTemplates:
                                partial.recurringInvoiceTemplates ?? loadedState.recurringInvoiceTemplates,
                            pmCycleAllocations: partial.pmCycleAllocations ?? loadedState.pmCycleAllocations,
                            contracts: partial.contracts ?? loadedState.contracts,
                            budgets: partial.budgets ?? loadedState.budgets,
                            personalCategories: partial.personalCategories ?? loadedState.personalCategories,
                            personalTransactions: partial.personalTransactions ?? loadedState.personalTransactions,
                            ...pickTenantSettingsPartial(partial),
                        };
                    } catch (apiErr) {
                        logger.warnCategory('sync', '⚠️ Bidir reload: could not merge projects/units/vendors/contacts/app settings from API:', apiErr);
                    }
                }
                if (
                    loadedState &&
                    (loadedState.transactions?.length > 0 ||
                        loadedState.contacts?.length > 0 ||
                        loadedState.invoices?.length > 0 ||
                        loadedState.accounts?.length > 0 ||
                        (loadedState.rentalAgreements?.length ?? 0) > 0)
                ) {
                    dispatch({ type: 'SET_STATE', payload: loadedState, _isRemote: true } as any);
                    setStoredState(loadedState as AppState);
                    markDbLoadCompleteRef.current?.();
                    logger.logCategory('sync', '✅ Reloaded AppContext from DB after bidirectional sync', {
                        transactions: loadedState.transactions?.length ?? 0,
                        contacts: loadedState.contacts?.length ?? 0,
                        projects: loadedState.projects?.length ?? 0,
                        vendors: loadedState.vendors?.length ?? 0,
                    });
                }
            } catch (err) {
                logger.warnCategory('sync', '⚠️ Failed to reload state after bidir sync:', err);
            }
        };
        window.addEventListener('sync:bidir-downstream-complete', handleBidirDownstreamComplete as EventListener);
        return () => window.removeEventListener('sync:bidir-downstream-complete', handleBidirDownstreamComplete as EventListener);
    }, [dispatch, setStoredState, isAuthenticated, isLocalOnlyMode]);

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
            if (cloudSettings.accountConsistency) {
                dispatch({ type: 'UPDATE_ACCOUNT_CONSISTENCY', payload: cloudSettings.accountConsistency });
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


    // 3. Unified SQLite persistence: any change to persisted data (add/update/delete) triggers saveNow.
    // Uses a full-data fingerprint (excluding navigation/UI-only fields) so in-place edits are detected,
    // not only array length changes. Serializes saves via a promise chain so rapid edits flush in order.
    const persistBaselineFingerprintRef = useRef<string | null>(null);
    const persistQueueRef = useRef(Promise.resolve());

    useEffect(() => {
        if (isInitializing || useFallback || !saveNow) return;

        const fp = getPersistableStateFingerprint(state);
        if (persistBaselineFingerprintRef.current === null) {
            persistBaselineFingerprintRef.current = fp;
            return;
        }
        if (fp === persistBaselineFingerprintRef.current) return;

        persistQueueRef.current = persistQueueRef.current
            .then(async () => {
                try {
                    await saveNow(stateRef.current);
                    persistBaselineFingerprintRef.current = getPersistableStateFingerprint(stateRef.current);
                } catch (error) {
                    console.error('❌ Failed to persist state to SQLite:', error);
                    try {
                        const { getErrorLogger } = await import('../services/errorLogger');
                        getErrorLogger().logError(error instanceof Error ? error : new Error(String(error)), {
                            errorType: 'auto_persist_failed',
                            componentStack: 'AppContext unified persist',
                        });
                    } catch {
                        /* ignore */
                    }
                }
            })
            .catch(() => {});
    }, [state, isInitializing, useFallback, saveNow]);

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
                    await saveNow(state);
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

    // Listen for logout event to save state before logout / update install (must dispatch detail.success for UpdateContext.installUpdate)
    useEffect(() => {
        const handleSaveStateBeforeLogout = async (_event: CustomEvent) => {
            let success = false;
            const snapshot = stateRef.current;
            try {
                logger.logCategory('database', '💾 Saving state before logout...');
                if (useFallback) {
                    // No native SQLite path; nothing to flush here
                    success = true;
                } else if (saveNow) {
                    await saveNow(snapshot, { disableSyncQueueing: true });
                    logger.logCategory('database', '✅ State saved successfully before logout');
                    success = true;
                } else {
                    const dbService = getDatabaseService();
                    if (dbService.isReady()) {
                        const appStateRepo = await getAppStateRepository();
                        await appStateRepo.saveState(snapshot, true);
                        logger.logCategory('database', '✅ State saved successfully before logout');
                        success = true;
                    } else {
                        logger.warnCategory('database', '⚠️ Database not ready, skipping save before logout');
                        success = false;
                    }
                }
            } catch (error) {
                logger.errorCategory('database', '❌ Failed to save state before logout:', error);
                success = false;
            }
            window.dispatchEvent(new CustomEvent('state-saved-for-logout', { detail: { success } }));
        };

        if (typeof window !== 'undefined') {
            window.addEventListener('save-state-before-logout', handleSaveStateBeforeLogout as EventListener);
            return () => {
                window.removeEventListener('save-state-before-logout', handleSaveStateBeforeLogout as EventListener);
            };
        }
    }, [useFallback, saveNow]);

    // Listen for incremental sync updates — accumulate chunks and dispatch once via requestIdleCallback
    useEffect(() => {
        let pendingEntities: Record<string, any[]> = {};
        let flushScheduled = false;

        const flushPending = () => {
            flushScheduled = false;
            if (Object.keys(pendingEntities).length === 0) return;
            dispatch({ type: 'BATCH_UPSERT_ENTITIES', payload: pendingEntities });
            pendingEntities = {};
        };

        const scheduleFlush = () => {
            if (flushScheduled) return;
            flushScheduled = true;
            if (typeof requestIdleCallback === 'function') {
                requestIdleCallback(flushPending, { timeout: 300 });
            } else {
                setTimeout(flushPending, 150);
            }
        };

        const handleChunkApplied = (event: CustomEvent) => {
            const { entities } = event.detail;
            if (!entities) return;
            for (const [key, items] of Object.entries(entities)) {
                if (!Array.isArray(items) || items.length === 0) continue;
                if (!pendingEntities[key]) pendingEntities[key] = [];
                pendingEntities[key].push(...items);
            }
            scheduleFlush();
        };

        if (typeof window !== 'undefined') {
            window.addEventListener('sync:chunk-applied', handleChunkApplied as EventListener);
            return () => {
                window.removeEventListener('sync:chunk-applied', handleChunkApplied as EventListener);
                if (Object.keys(pendingEntities).length > 0) flushPending();
            };
        }
    }, [dispatch]);

    // Auto-sync: on session restore, load from API when state is empty (init may have run before auth completed)
    const sessionRestoreRefreshDoneRef = useRef(false);
    useEffect(() => {
        // When authenticated and init done, if state has no core records OR no projects (API-only master data), refresh from API
        if (
            isAuthenticated &&
            !isInitializing &&
            !isLocalOnlyMode() &&
            !apiStateLoadFailed &&
            !sessionRestoreRefreshDoneRef.current
        ) {
            const hasData = (state.contacts?.length ?? 0) > 0 || (state.transactions?.length ?? 0) > 0 ||
                (state.invoices?.length ?? 0) > 0 || (state.accounts?.length ?? 0) > 0;
            const missingProjects = (state.projects?.length ?? 0) === 0;
            sessionRestoreRefreshDoneRef.current = true;
            if (!hasData || missingProjects) {
                refreshFromApiRef.current(undefined);
            }
        }
        if (!isAuthenticated) {
            sessionRestoreRefreshDoneRef.current = false;
        }

        // Update previous auth state
        prevAuthRef.current = isAuthenticated;
    }, [
        isAuthenticated,
        isInitializing,
        apiStateLoadFailed,
        state.contacts?.length,
        state.transactions?.length,
        state.invoices?.length,
        state.accounts?.length,
        state.projects?.length,
    ]);

    // PERFORMANCE: Removed duplicate "reload data from API" effect that was dead code.
    // The condition `!prevAuthRef.current` could never be true here because the preceding
    // useEffect (auto-sync) already sets `prevAuthRef.current = isAuthenticated` before
    // this effect runs (React runs effects in declaration order).
    // The actual API load is handled by the refreshFromApi effect at line ~2738.

    // Keep module-level store in sync for useSyncExternalStore-based selective hooks.
    // State is set synchronously during render to avoid stale snapshots.
    // Dispatch is stable (from useReducer) so only needs to be set once.
    _appState = state;
    _appDispatch = dispatch;
    useEffect(() => {
        _notifyStateListeners();
    });

    // PERFORMANCE: Memoize the context value to prevent cascading re-renders.
    // Without this, every render of AppProvider creates a new { state, dispatch } object,
    // causing ALL 155+ context consumers to re-render even when nothing changed.
    // IMPORTANT: This useMemo MUST be called before any conditional returns below,
    // because React hooks must be called in the same order on every render.
    const contextValue = useMemo(() => ({ state, dispatch, isInitialDataLoading }), [state, dispatch, isInitialDataLoading]);

    // Always mount AppContext.Provider so any descendant (e.g. KPIProvider) never renders outside the
    // context — conditional returns that omit the Provider caused "useAppContext must be used within an AppProvider".
    return (
        <AppContext.Provider value={contextValue}>
            {isInitializing || apiStateLoadFailed ? (
                <InitializationScreen
                    initMessage={initMessage}
                    initProgress={initProgress}
                    useFallback={useFallback}
                    errorMessage={apiStateLoadFailed ? initError : null}
                    onRetry={apiStateLoadFailed ? () => window.location.reload() : undefined}
                />
            ) : (
                children
            )}
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
