import { TransactionType, LoanSubtype, AccountType } from '../../types';
import type { Transaction, Bill, Invoice, Account } from '../../types';

export interface BankAccountProjectBalanceRow {
    accountId: string;
    accountName: string;
    projectBalances: Record<string, number>;
    totalBalance: number;
}

export const UNASSIGNED_PROJECT_ID = '__unassigned__';
export const LOAN_COLUMN_ID = '__loan__';
export const BUILDINGS_COLUMN_ID = '__buildings__';
export const TRANSFER_COLUMN_ID = '__transfer__';

/** Resolve report column key: Loan -> Transfer -> Rental (tx with buildingId) -> Project -> Unassigned */
export function resolveBankReportColumnKey(
    tx: { type: string; projectId?: string; buildingId?: string; billId?: string; invoiceId?: string },
    bills: { id: string; projectId?: string; buildingId?: string }[],
    invoices: { id: string; projectId?: string; buildingId?: string }[]
): string {
    if (tx.type === TransactionType.LOAN) return LOAN_COLUMN_ID;
    if (tx.type === TransactionType.TRANSFER) return TRANSFER_COLUMN_ID;

    const bill = tx.billId ? bills.find(b => b.id === tx.billId) : undefined;
    const invoice = tx.invoiceId ? invoices.find(i => i.id === tx.invoiceId) : undefined;
    const hasBuilding = !!(tx.buildingId || bill?.buildingId || invoice?.buildingId);
    if (hasBuilding) return BUILDINGS_COLUMN_ID;

    const projectId = tx.projectId ?? bill?.projectId ?? invoice?.projectId;
    return projectId ?? UNASSIGNED_PROJECT_ID;
}

/**
 * Same logic as the Bank Accounts dashboard report: per-account totals and project columns.
 */
export function computeBankAccountProjectBalances(params: {
    accounts: Account[];
    transactions: Transaction[];
    bills: Bill[];
    invoices: Invoice[];
}): Record<string, BankAccountProjectBalanceRow> {
    const { accounts, transactions, bills, invoices } = params;

    const bankAccounts = accounts.filter(
        acc => acc.type === AccountType.BANK || acc.type === AccountType.CASH
    );

    const balances: Record<string, BankAccountProjectBalanceRow> = {};

    bankAccounts.forEach(account => {
        balances[account.id] = {
            accountId: account.id,
            accountName: account.name,
            projectBalances: {},
            totalBalance: 0
        };
    });

    transactions.forEach(tx => {
        const columnKey = resolveBankReportColumnKey(tx, bills, invoices);

        if (tx.type === TransactionType.INCOME && tx.accountId) {
            const account = balances[tx.accountId];
            if (account) {
                const amount = tx.amount;
                account.projectBalances[columnKey] = (account.projectBalances[columnKey] || 0) + amount;
                account.totalBalance += amount;
            }
        } else if (tx.type === TransactionType.EXPENSE && tx.accountId) {
            const account = balances[tx.accountId];
            if (account) {
                const amount = tx.amount;
                account.projectBalances[columnKey] = (account.projectBalances[columnKey] || 0) - amount;
                account.totalBalance -= amount;
            }
        } else if (tx.type === TransactionType.TRANSFER) {
            if (tx.fromAccountId && balances[tx.fromAccountId]) {
                const amount = tx.amount;
                balances[tx.fromAccountId].projectBalances[columnKey] =
                    (balances[tx.fromAccountId].projectBalances[columnKey] || 0) - amount;
                balances[tx.fromAccountId].totalBalance -= amount;
            }
            if (tx.toAccountId && balances[tx.toAccountId]) {
                const amount = tx.amount;
                balances[tx.toAccountId].projectBalances[columnKey] =
                    (balances[tx.toAccountId].projectBalances[columnKey] || 0) + amount;
                balances[tx.toAccountId].totalBalance += amount;
            }
        } else if (tx.type === TransactionType.LOAN && tx.accountId) {
            const account = balances[tx.accountId];
            if (account) {
                const amount = tx.amount;
                if (tx.subtype === LoanSubtype.RECEIVE || tx.subtype === LoanSubtype.COLLECT) {
                    account.projectBalances[columnKey] = (account.projectBalances[columnKey] || 0) + amount;
                    account.totalBalance += amount;
                } else if (tx.subtype === LoanSubtype.GIVE || tx.subtype === LoanSubtype.REPAY) {
                    account.projectBalances[columnKey] = (account.projectBalances[columnKey] || 0) - amount;
                    account.totalBalance -= amount;
                }
            }
        }
    });

    return balances;
}
