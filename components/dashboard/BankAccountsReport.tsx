
import React, { useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { TransactionType, AccountType, LoanSubtype } from '../../types';
import Card from '../ui/Card';
import { CURRENCY } from '../../constants';
import { formatRoundedNumber } from '../../utils/numberUtils';

interface BankAccountProjectBalance {
    accountId: string;
    accountName: string;
    projectBalances: Record<string, number>; // projectId -> balance
    totalBalance: number;
}

const UNASSIGNED_PROJECT_ID = '__unassigned__';

const BankAccountsReport: React.FC = () => {
    const { state } = useAppContext();

    // Get all bank accounts
    const bankAccounts = useMemo(() => {
        return state.accounts.filter(acc => acc.type === AccountType.BANK);
    }, [state.accounts]);

    // Calculate balance per bank account per project (including Unassigned for tx without projectId)
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
            const resolveProjectId = (): string => {
                let projectId = tx.projectId;
                if (!projectId && tx.billId) {
                    const bill = state.bills.find(b => b.id === tx.billId);
                    if (bill) projectId = bill.projectId;
                }
                if (!projectId && tx.invoiceId) {
                    const invoice = state.invoices.find(i => i.id === tx.invoiceId);
                    if (invoice) projectId = invoice.projectId;
                }
                return projectId ?? UNASSIGNED_PROJECT_ID;
            };

            const projectId = resolveProjectId();

            if (tx.type === TransactionType.INCOME && tx.accountId) {
                const account = balances[tx.accountId];
                if (account) {
                    const amount = tx.amount;
                    account.projectBalances[projectId] = (account.projectBalances[projectId] || 0) + amount;
                    account.totalBalance += amount;
                }
            } else if (tx.type === TransactionType.EXPENSE && tx.accountId) {
                const account = balances[tx.accountId];
                if (account) {
                    const amount = tx.amount;
                    account.projectBalances[projectId] = (account.projectBalances[projectId] || 0) - amount;
                    account.totalBalance -= amount;
                }
            } else if (tx.type === TransactionType.TRANSFER) {
                if (tx.fromAccountId && balances[tx.fromAccountId]) {
                    const amount = tx.amount;
                    balances[tx.fromAccountId].projectBalances[projectId] =
                        (balances[tx.fromAccountId].projectBalances[projectId] || 0) - amount;
                    balances[tx.fromAccountId].totalBalance -= amount;
                }
                if (tx.toAccountId && balances[tx.toAccountId]) {
                    const amount = tx.amount;
                    balances[tx.toAccountId].projectBalances[projectId] =
                        (balances[tx.toAccountId].projectBalances[projectId] || 0) + amount;
                    balances[tx.toAccountId].totalBalance += amount;
                }
            } else if (tx.type === TransactionType.LOAN && tx.accountId) {
                const account = balances[tx.accountId];
                if (account) {
                    const amount = tx.amount;
                    if (tx.subtype === LoanSubtype.RECEIVE || tx.subtype === LoanSubtype.COLLECT) {
                        account.projectBalances[projectId] = (account.projectBalances[projectId] || 0) + amount;
                        account.totalBalance += amount;
                    } else if (tx.subtype === LoanSubtype.GIVE || tx.subtype === LoanSubtype.REPAY) {
                        account.projectBalances[projectId] = (account.projectBalances[projectId] || 0) - amount;
                        account.totalBalance -= amount;
                    }
                }
            }
        });

        // Include all bank accounts that have any balance (total or per-project)
        return Object.values(balances).filter(account => {
            if (Math.abs(account.totalBalance) > 0.01) return true;
            return Object.values(account.projectBalances).some(b => Math.abs(b) > 0.01);
        });
    }, [state.transactions, state.bills, state.invoices, state.projects, bankAccounts]);

    // Projects to show as columns: real projects + Unassigned only if there is at least one unassigned balance
    const projectsWithTransactions = useMemo(() => {
        const projectIds = new Set<string>();
        let hasUnassigned = false;

        accountProjectBalances.forEach(account => {
            Object.keys(account.projectBalances).forEach(pid => {
                const balance = account.projectBalances[pid] || 0;
                if (Math.abs(balance) > 0.01) {
                    if (pid === UNASSIGNED_PROJECT_ID) hasUnassigned = true;
                    else projectIds.add(pid);
                }
            });
        });

        const list = state.projects.filter(p => projectIds.has(p.id));
        if (hasUnassigned) {
            list.push({ id: UNASSIGNED_PROJECT_ID, name: 'Unassigned' });
        }
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
                <h3 className="text-lg font-bold text-slate-800">Bank Accounts Report</h3>
            </div>
            
            {/* Net Balance Summary */}
            <div className="mb-6">
                <div className={`rounded-lg p-4 border ${netBalance >= 0 ? 'bg-slate-100 border-slate-300' : 'bg-rose-100 border-rose-300'}`}>
                    <div className={`text-sm font-medium mb-1 ${netBalance >= 0 ? 'text-slate-600' : 'text-rose-600'}`}>Net Balance</div>
                    <div className={`${getFontSize(netBalance)} font-bold tabular-nums ${netBalance >= 0 ? 'text-slate-800' : 'text-rose-700'}`}>
                        {CURRENCY} {formatRoundedNumber(netBalance)}
                    </div>
                </div>
            </div>
            
            {/* Table */}
            {bankAccounts.length === 0 ? (
                <div className="py-8 text-center text-slate-500 bg-slate-50 rounded-lg">
                    No bank accounts. Add bank accounts in Settings to see balances here.
                </div>
            ) : projectsWithTransactions.length === 0 || accountProjectBalances.length === 0 ? (
                <div className="py-8 text-center text-slate-500 bg-slate-50 rounded-lg">
                    {accountProjectBalances.length === 0
                        ? 'No transactions found for bank accounts.'
                        : 'No projects with transactions found.'}
                </div>
            ) : (
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50">
                        <tr>
                            <th className="px-4 py-3 text-left font-semibold text-slate-600 sticky left-0 bg-slate-50 z-10 border-r border-slate-200">
                                Bank Account
                            </th>
                            {projectsWithTransactions.map(project => (
                                <th key={project.id} className="px-4 py-3 text-right font-semibold text-slate-600 whitespace-nowrap min-w-[120px]">
                                    {project.name}
                                </th>
                            ))}
                            <th className="px-4 py-3 text-right font-bold text-slate-700 bg-slate-100 border-l-2 border-slate-300 whitespace-nowrap">
                                Total
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                        {accountProjectBalances.map(accountData => (
                            <tr key={accountData.accountId} className="hover:bg-slate-50 transition-colors">
                                <td className="px-4 py-3 font-medium text-slate-800 sticky left-0 bg-white z-10 border-r border-slate-200">
                                    {accountData.accountName}
                                </td>
                                {projectsWithTransactions.map(project => {
                                    const balance = accountData.projectBalances[project.id] || 0;
                                    return (
                                        <td key={project.id} className={`px-4 py-3 text-right tabular-nums ${balance >= 0 ? 'text-slate-800' : 'text-rose-600'}`}>
                                            {CURRENCY} {formatRoundedNumber(balance)}
                                        </td>
                                    );
                                })}
                                <td className={`px-4 py-3 text-right font-bold tabular-nums bg-slate-50 border-l-2 border-slate-300 ${accountData.totalBalance >= 0 ? 'text-slate-800' : 'text-rose-600'}`}>
                                    {CURRENCY} {formatRoundedNumber(accountData.totalBalance)}
                                </td>
                            </tr>
                        ))}
                        {/* Totals Row */}
                        {accountProjectBalances.length > 0 && (
                            <tr className="bg-slate-100 font-semibold">
                                <td className="px-4 py-3 font-bold text-slate-800 sticky left-0 bg-slate-100 z-10 border-r border-slate-300 border-t-2 border-slate-300">
                                    Total
                                </td>
                                {projectsWithTransactions.map(project => {
                                    const total = projectTotals[project.id] || 0;
                                    return (
                                        <td key={project.id} className={`px-4 py-3 text-right font-bold tabular-nums border-t-2 border-slate-300 ${total >= 0 ? 'text-slate-800' : 'text-rose-600'}`}>
                                            {CURRENCY} {formatRoundedNumber(total)}
                                        </td>
                                    );
                                })}
                                <td className={`px-4 py-3 text-right font-bold tabular-nums bg-slate-200 border-t-2 border-l-2 border-slate-400 ${netBalance >= 0 ? 'text-slate-800' : 'text-rose-700'}`}>
                                    {CURRENCY} {formatRoundedNumber(netBalance)}
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

