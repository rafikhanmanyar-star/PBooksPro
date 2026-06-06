import type {
  AppState,
  Transaction,
  Invoice,
  Bill,
  User,
  TransactionLogEntry,
} from '../../types';
import {
  ContractStatus,
  InvoiceStatus,
  TransactionType,
  LoanSubtype,
} from '../../types';
import { findSalesReturnCategory } from '../../constants/salesReturnSystemCategories';
import { resolveSystemCategoryId } from '../../services/systemEntityIds';
import { resolveExpenseCategoryForBillPayment } from '../../utils/rentalBillPayments';
import {
  adjustOrRemoveRentAggregateExpenseAfterIncomeRemoved,
  findSecuritySettlementCascadeDeletePartners,
  syncBillPaymentIncomeFromPairedExpense,
  syncPairedBillExpenseFromSecurityIncome,
  syncPairedExpenseToRentFromSecurityIncome,
  syncRentFromSecurityIncomeToPairedExpense,
} from '../../utils/rentalSecurityDepositSettlement';
import { resolveOwnerForPropertyOnDate } from '../../services/propertyOwnershipService';
import { toLocalDateString } from '../../utils/dateUtils';

// Helper to auto-update contract status based on payments
export const updateContractStatus = (state: AppState, contractId: string | undefined): AppState => {
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

export const applyTransactionEffect = (state: AppState, tx: Transaction, isAdd: boolean): AppState => {
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
export function applyTxToInvoiceCopy(inv: Invoice, tx: Transaction, isAdd: boolean): Invoice {
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
export function applyTxToBillCopy(b: Bill, tx: Transaction, isAdd: boolean): Bill {
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

/** Identity of transaction fields that must stay aligned between client and API after reducer pairing logic. */
export function txnFinancialSignature(t: Transaction): string {
    return JSON.stringify({
        amount: t.amount,
        date: (t.date || '').slice(0, 10),
        description: t.description || '',
        categoryId: t.categoryId || '',
        invoiceId: t.invoiceId || '',
        billId: t.billId || '',
        accountId: t.accountId || '',
        contactId: t.contactId || '',
        ownerId: t.ownerId || '',
    });
}

// Helper for log creation
export const createLogEntry = (action: TransactionLogEntry['action'], entityType: TransactionLogEntry['entityType'], entityId: string, description: string, user: User | null, data?: any): TransactionLogEntry => ({
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

/**
 * Stamp ownerId on a transaction when it has a propertyId but no ownerId set.
 * Uses agreement.ownerId when linked via invoice; else current property.ownerId.
 * NEVER overwrites an existing ownerId.
 */
export function stampTransactionOwnerId(tx: Transaction, state: AppState): Transaction {
    if (tx.ownerId) return tx;
    if (!tx.propertyId) return tx;

    if (tx.invoiceId) {
        const inv = state.invoices.find(i => i.id === tx.invoiceId);
        if (inv?.agreementId) {
            const agr = state.rentalAgreements.find(a => a.id === inv.agreementId);
            if (agr?.ownerId) return { ...tx, ownerId: agr.ownerId };
        }
        if (inv?.issueDate) {
            const invDate = inv.issueDate.slice(0, 10);
            const resolved = resolveOwnerForPropertyOnDate(state, tx.propertyId, invDate);
            if (resolved) return { ...tx, ownerId: resolved };
        }
    }

    const d = (tx.date || '').slice(0, 10);
    if (!d) return tx;
    const resolved = resolveOwnerForPropertyOnDate(state, tx.propertyId, d);
    if (!resolved) return tx;
    return { ...tx, ownerId: resolved };
}

/** When category_id is missing on a bill payment, inherit from the bill (same rules as pay modal). */
export function enrichExpenseBillPaymentCategory(tx: Transaction, state: AppState): Transaction {
    if (tx.type !== TransactionType.EXPENSE || !tx.billId) return tx;
    if (tx.categoryId != null && String(tx.categoryId).trim() !== '') return tx;
    const bill = state.bills.find(b => b.id === tx.billId);
    if (!bill) return tx;
    const cid = resolveExpenseCategoryForBillPayment(bill, state.categories, state.rentalAgreements);
    if (!cid) return tx;
    return { ...tx, categoryId: cid };
}
