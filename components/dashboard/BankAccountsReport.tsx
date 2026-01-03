
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

const BankAccountsReport: React.FC = () => {
    const { state } = useAppContext();

    // Get all bank accounts
    const bankAccounts = useMemo(() => {
        return state.accounts.filter(acc => acc.type === AccountType.BANK);
    }, [state.accounts]);

    // Get all projects
    const projects = useMemo(() => {
        return state.projects;
    }, [state.projects]);

    // Calculate balance per bank account per project
    const accountProjectBalances = useMemo(() => {
        // Initialize the structure (only for bank accounts)
        const balances: Record<string, BankAccountProjectBalance> = {};
        
        bankAccounts.forEach(account => {
            balances[account.id] = {
                accountId: account.id,
                accountName: account.name,
                projectBalances: {},
                totalBalance: 0
            };
        });

        // Process all transactions to calculate balances
        state.transactions.forEach(tx => {
            // Helper function to resolve projectId from transaction
            const resolveProjectId = (): string | undefined => {
                let projectId = tx.projectId;
                
                // Try to resolve from bill
                if (!projectId && tx.billId) {
                    const bill = state.bills.find(b => b.id === tx.billId);
                    if (bill) projectId = bill.projectId;
                }
                
                // Try to resolve from invoice
                if (!projectId && tx.invoiceId) {
                    const invoice = state.invoices.find(i => i.id === tx.invoiceId);
                    if (invoice) projectId = invoice.projectId;
                }
                
                return projectId;
            };

            const projectId = resolveProjectId();

            // Process INCOME transactions
            if (tx.type === TransactionType.INCOME && tx.accountId) {
                const account = balances[tx.accountId];
                if (account && projectId) {
                    const amount = tx.amount;
                    account.projectBalances[projectId] = (account.projectBalances[projectId] || 0) + amount;
                    account.totalBalance += amount;
                }
            }
            
            // Process EXPENSE transactions
            else if (tx.type === TransactionType.EXPENSE && tx.accountId) {
                const account = balances[tx.accountId];
                if (account && projectId) {
                    const amount = tx.amount;
                    account.projectBalances[projectId] = (account.projectBalances[projectId] || 0) - amount;
                    account.totalBalance -= amount;
                }
            }
            
            // Process TRANSFER transactions
            else if (tx.type === TransactionType.TRANSFER) {
                // From account loses money
                if (tx.fromAccountId && balances[tx.fromAccountId] && projectId) {
                    const amount = tx.amount;
                    balances[tx.fromAccountId].projectBalances[projectId] = 
                        (balances[tx.fromAccountId].projectBalances[projectId] || 0) - amount;
                    balances[tx.fromAccountId].totalBalance -= amount;
                }
                
                // To account gains money
                if (tx.toAccountId && balances[tx.toAccountId] && projectId) {
                    const amount = tx.amount;
                    balances[tx.toAccountId].projectBalances[projectId] = 
                        (balances[tx.toAccountId].projectBalances[projectId] || 0) + amount;
                    balances[tx.toAccountId].totalBalance += amount;
                }
            }
            
            // Process LOAN transactions
            else if (tx.type === TransactionType.LOAN && tx.accountId) {
                const account = balances[tx.accountId];
                if (account && projectId) {
                    let amount = tx.amount;
                    // RECEIVE and COLLECT increase account balance (money received)
                    // GIVE and REPAY decrease account balance (money given)
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

        // Filter out accounts with no transactions (totalBalance is 0 and no project balances)
        const accountsWithTransactions = Object.values(balances).filter(account => {
            // Account has transactions if totalBalance is not zero OR has any non-zero project balance
            if (Math.abs(account.totalBalance) > 0.01) return true;
            return Object.values(account.projectBalances).some(balance => Math.abs(balance) > 0.01);
        });

        return accountsWithTransactions;
    }, [state.transactions, state.bills, state.invoices, bankAccounts, projects]);

    // Get projects that have transactions (appear in accountProjectBalances)
    const projectsWithTransactions = useMemo(() => {
        const projectIds = new Set<string>();
        
        accountProjectBalances.forEach(account => {
            Object.keys(account.projectBalances).forEach(projectId => {
                const balance = account.projectBalances[projectId] || 0;
                if (Math.abs(balance) > 0.01) {
                    projectIds.add(projectId);
                }
            });
        });
        
        return projects.filter(project => projectIds.has(project.id));
    }, [accountProjectBalances, projects]);

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
            {projectsWithTransactions.length === 0 || accountProjectBalances.length === 0 ? (
                <div className="py-8 text-center text-slate-500 bg-slate-50 rounded-lg">
                    {projectsWithTransactions.length === 0 && accountProjectBalances.length === 0 
                        ? 'No transactions found for bank accounts or projects.' 
                        : projectsWithTransactions.length === 0 
                        ? 'No projects with transactions found.' 
                        : 'No bank accounts with transactions found.'}
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

