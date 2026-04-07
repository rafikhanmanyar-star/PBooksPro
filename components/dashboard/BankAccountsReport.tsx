
import React, { useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { TransactionType, AccountType, LoanSubtype } from '../../types';
import Card from '../ui/Card';
import { formatRoundedNumber } from '../../utils/numberUtils';

interface BankAccountProjectBalance {
    accountId: string;
    accountName: string;
    projectBalances: Record<string, number>; // projectId -> balance
    totalBalance: number;
}

const UNASSIGNED_PROJECT_ID = '__unassigned__';
const LOAN_COLUMN_ID = '__loan__';
const BUILDINGS_COLUMN_ID = '__buildings__';
const TRANSFER_COLUMN_ID = '__transfer__';

/** Resolve report column key: Loan -> Transfer -> Rental (tx with buildingId) -> Project -> Unassigned */
function resolveColumnKey(
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

const BankAccountsReport: React.FC = () => {
    const { state } = useAppContext();

    // Get all bank and cash accounts (so transfers between Cash and Bank show both sides)
    const bankAccounts = useMemo(() => {
        return state.accounts.filter(acc =>
            acc.type === AccountType.BANK || acc.type === AccountType.CASH
        );
    }, [state.accounts]);

    // Calculate balance per bank account per column (projects, Loan, Rental, Transfer, Unassigned)
    const accountProjectBalances = useMemo(() => {
        const balances: Record<string, BankAccountProjectBalance> = {};

        bankAccounts.forEach(account => {
            balances[account.id] = {
                accountId: account.id,
                accountName: account.name,
                projectBalances: {},
                totalBalance: 0
            };
        });

        state.transactions.forEach(tx => {
            const columnKey = resolveColumnKey(tx, state.bills, state.invoices);

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

        // Include all bank accounts that have any balance (total or per-column)
        return Object.values(balances).filter(account => {
            if (Math.abs(account.totalBalance) > 0.01) return true;
            return Object.values(account.projectBalances).some(b => Math.abs(b) > 0.01);
        });
    }, [state.transactions, state.bills, state.invoices, state.projects, bankAccounts]);

    // Columns: real projects with balance, then Loan, Rental, Transfer, Unassigned (only if they have balance)
    const projectsWithTransactions = useMemo(() => {
        const projectIds = new Set<string>();
        let hasLoan = false;
        let hasBuildings = false;
        let hasTransfer = false;
        let hasUnassigned = false;

        accountProjectBalances.forEach(account => {
            Object.keys(account.projectBalances).forEach(pid => {
                const balance = account.projectBalances[pid] || 0;
                if (Math.abs(balance) > 0.01) {
                    if (pid === LOAN_COLUMN_ID) hasLoan = true;
                    else if (pid === BUILDINGS_COLUMN_ID) hasBuildings = true;
                    else if (pid === TRANSFER_COLUMN_ID) hasTransfer = true;
                    else if (pid === UNASSIGNED_PROJECT_ID) hasUnassigned = true;
                    else projectIds.add(pid);
                }
            });
        });

        const list = state.projects.filter(p => projectIds.has(p.id));
        if (hasLoan) list.push({ id: LOAN_COLUMN_ID, name: 'Loan' });
        if (hasBuildings) list.push({ id: BUILDINGS_COLUMN_ID, name: 'Rental' });
        if (hasTransfer) list.push({ id: TRANSFER_COLUMN_ID, name: 'Transfer' });
        if (hasUnassigned) list.push({ id: UNASSIGNED_PROJECT_ID, name: 'Unassigned' });
        return list;
    }, [accountProjectBalances, state.projects]);

    // Calculate project totals (column totals) - only for projects with transactions
    const projectTotals = useMemo(() => {
        const totals: Record<string, number> = {};
        
        projectsWithTransactions.forEach(project => {
            totals[project.id] = 0;
        });
        
        accountProjectBalances.forEach(accountData => {
            projectsWithTransactions.forEach(project => {
                const balance = accountData.projectBalances[project.id] || 0;
                totals[project.id] = (totals[project.id] || 0) + balance;
            });
        });
        
        return totals;
    }, [accountProjectBalances, projectsWithTransactions]);

    // Calculate net balance (grand total)
    const netBalance = useMemo(() => {
        return accountProjectBalances.reduce((sum, account) => sum + account.totalBalance, 0);
    }, [accountProjectBalances]);

    // Helper function to get font size based on number length
    const getFontSize = (num: number): string => {
        const rounded = Math.round(num);
        const numStr = formatRoundedNumber(Math.abs(rounded));
        const length = numStr.length;
        
        if (length <= 6) return 'text-base';
        if (length <= 9) return 'text-sm';
        if (length <= 12) return 'text-xs';
        return 'text-xs';
    };

    return (
        <Card className="overflow-hidden">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-app-text">Bank Accounts Report</h3>
            </div>
            
            {/* Net Balance Summary */}
            <div className="mb-6">
                <div className={`rounded-lg p-4 border ${netBalance >= 0 ? 'bg-app-toolbar border-app-border' : 'bg-[color:var(--badge-unpaid-bg)] border-ds-danger/30'}`}>
                    <div className={`text-sm font-medium mb-1 ${netBalance >= 0 ? 'text-app-muted' : 'text-ds-danger'}`}>Net Balance</div>
                    <div className={`${getFontSize(netBalance)} font-bold tabular-nums ${netBalance >= 0 ? 'text-app-text' : 'text-ds-danger'}`}>
                        {formatRoundedNumber(netBalance)}
                    </div>
                </div>
            </div>
            
            {/* Table */}
            {bankAccounts.length === 0 ? (
                <div className="py-8 text-center text-app-muted bg-app-toolbar rounded-lg border border-app-border">
                    No bank or cash accounts. Add accounts in Settings to see balances here.
                </div>
            ) : projectsWithTransactions.length === 0 || accountProjectBalances.length === 0 ? (
                <div className="py-8 text-center text-app-muted bg-app-toolbar rounded-lg border border-app-border">
                    {accountProjectBalances.length === 0
                        ? 'No transactions found for bank accounts.'
                        : 'No projects with transactions found.'}
                </div>
            ) : (
            <div className="overflow-x-auto overflow-y-visible rounded-xl border border-app-border">
                <table className="w-full table-fixed divide-y divide-app-border text-sm">
                    <thead className="bg-app-table-header">
                        <tr>
                            <th className="px-2 sm:px-3 py-3 text-left font-semibold text-app-muted sticky left-0 bg-app-table-header z-10 border-r border-app-border w-[120px] min-w-0">
                                Bank / Cash Account
                            </th>
                            {projectsWithTransactions.map(project => (
                                <th key={project.id} className="px-2 sm:px-3 py-3 text-right font-semibold text-app-muted whitespace-nowrap min-w-0 w-[100px]">
                                    {project.name}
                                </th>
                            ))}
                            <th className="px-2 sm:px-3 py-3 text-right font-bold text-app-text bg-app-toolbar border-l-2 border-app-border whitespace-nowrap min-w-0 w-[100px]">
                                Total
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-app-border bg-app-card">
                        {accountProjectBalances.map(accountData => (
                            <tr key={accountData.accountId} className="hover:bg-app-toolbar/80 transition-colors duration-ds">
                                <td className="px-2 sm:px-3 py-3 font-medium text-app-text sticky left-0 bg-app-card z-10 border-r border-app-border">
                                    {accountData.accountName}
                                </td>
                                {projectsWithTransactions.map(project => {
                                    const balance = accountData.projectBalances[project.id] || 0;
                                    return (
                                        <td key={project.id} className={`px-2 sm:px-3 py-3 text-right tabular-nums text-xs sm:text-sm ${balance >= 0 ? 'text-app-text' : 'text-ds-danger'}`}>
                                            {formatRoundedNumber(balance)}
                                        </td>
                                    );
                                })}
                                <td className={`px-2 sm:px-3 py-3 text-right font-bold tabular-nums text-xs sm:text-sm bg-app-toolbar/60 border-l-2 border-app-border ${accountData.totalBalance >= 0 ? 'text-app-text' : 'text-ds-danger'}`}>
                                    {formatRoundedNumber(accountData.totalBalance)}
                                </td>
                            </tr>
                        ))}
                        {/* Totals Row */}
                        {accountProjectBalances.length > 0 && (
                            <tr className="bg-app-toolbar font-semibold border-t-2 border-app-border">
                                <td className="px-2 sm:px-3 py-3 font-bold text-app-text sticky left-0 bg-app-toolbar z-10 border-r border-app-border">
                                    Total
                                </td>
                                {projectsWithTransactions.map(project => {
                                    const total = projectTotals[project.id] || 0;
                                    return (
                                        <td key={project.id} className={`px-2 sm:px-3 py-3 text-right font-bold tabular-nums text-xs sm:text-sm ${total >= 0 ? 'text-app-text' : 'text-ds-danger'}`}>
                                            {formatRoundedNumber(total)}
                                        </td>
                                    );
                                })}
                                <td className={`px-2 sm:px-3 py-3 text-right font-bold tabular-nums text-xs sm:text-sm bg-app-surface-2 border-l-2 border-app-border ${netBalance >= 0 ? 'text-app-text' : 'text-ds-danger'}`}>
                                    {formatRoundedNumber(netBalance)}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            )}
        </Card>
    );
};

export default BankAccountsReport;

