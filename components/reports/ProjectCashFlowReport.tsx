
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { TransactionType, AccountType, LoanSubtype } from '../../types';
import Card from '../ui/Card';
import { CURRENCY } from '../../constants';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import ReportToolbar, { ReportDateRange } from './ReportToolbar';
import ComboBox from '../ui/ComboBox';
import { formatDate } from '../../utils/dateUtils';
import { usePrint } from '../../hooks/usePrint';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';

interface CashFlowItem {
    label: string;
    amount: number;
    level?: number;
}

interface CashFlowSection {
    title: string;
    items: CashFlowItem[];
    total: number;
}

interface CashFlowData {
    operating: CashFlowSection;
    investing: CashFlowSection;
    financing: CashFlowSection;
    netCashFlow: number;
    openingBalance: number;
    closingBalance: number;
}

const ProjectCashFlowReport: React.FC = () => {
    const { state } = useAppContext();
    const { handlePrint } = usePrint();
    
    const [dateRange, setDateRange] = useState<ReportDateRange>('thisMonth');
    const [startDate, setStartDate] = useState(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    });
    
    const [selectedProjectId, setSelectedProjectId] = useState<string>(state.defaultProjectId || 'all');

    const projectItems = useMemo(() => [{ id: 'all', name: 'All Projects' }, ...state.projects], [state.projects]);

    const handleRangeChange = (type: ReportDateRange) => {
        setDateRange(type);
        const now = new Date();
        
        if (type === 'all') {
            setStartDate('2000-01-01');
            setEndDate(now.toISOString().split('T')[0]);
        } else if (type === 'thisMonth') {
            const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
            const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            setStartDate(firstDay.toISOString().split('T')[0]);
            setEndDate(lastDay.toISOString().split('T')[0]);
        } else if (type === 'lastMonth') {
            const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
            setStartDate(firstDay.toISOString().split('T')[0]);
            setEndDate(lastDay.toISOString().split('T')[0]);
        }
    };

    const handleDateChange = (start: string, end: string) => {
        setStartDate(start);
        setEndDate(end);
        if (dateRange !== 'custom') {
            setDateRange('custom');
        }
    };

    const reportData = useMemo<CashFlowData>(() => {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        // Get bank accounts (cash accounts)
        const bankAccounts = state.accounts.filter(acc => 
            acc.type === AccountType.BANK || acc.type === AccountType.CASH
        );

        // Filter transactions in date range
        const transactionsInRange = state.transactions.filter(tx => {
            const txDate = new Date(tx.date);
            return txDate >= start && txDate <= end;
        });

        // Calculate opening balance for the selected project
        // For project-specific cash flow, we calculate opening balance as the sum of all
        // transactions for this project before the period start
        let openingBalance = 0;
        
        if (selectedProjectId !== 'all') {
            // Calculate opening balance from all transactions for this project before the period
            const allTransactions = state.transactions.filter(tx => {
                const txDate = new Date(tx.date);
                if (txDate >= start) return false; // Only transactions before period
                
                let projectId = tx.projectId;
                // Resolve projectId from linked entities
                if (!projectId && tx.invoiceId) {
                    const inv = state.invoices.find(i => i.id === tx.invoiceId);
                    if (inv) projectId = inv.projectId;
                }
                if (!projectId && tx.billId) {
                    const bill = state.bills.find(b => b.id === tx.billId);
                    if (bill) projectId = bill.projectId;
                }
                
                return projectId === selectedProjectId;
            });
            
            bankAccounts.forEach(acc => {
                let projectBalance = 0;
                allTransactions.forEach(tx => {
                    const account = state.accounts.find(a => a.id === tx.accountId);
                    if (account && (account.type === AccountType.BANK || account.type === AccountType.CASH)) {
                        if (tx.accountId === acc.id) {
                            if (tx.type === TransactionType.INCOME) {
                                projectBalance += tx.amount;
                            } else if (tx.type === TransactionType.EXPENSE) {
                                projectBalance -= tx.amount;
                            }
                        }
                    }
                    if (tx.type === TransactionType.TRANSFER) {
                        const fromAccount = tx.fromAccountId ? state.accounts.find(a => a.id === tx.fromAccountId) : null;
                        const toAccount = tx.toAccountId ? state.accounts.find(a => a.id === tx.toAccountId) : null;
                        if (fromAccount && (fromAccount.type === AccountType.BANK || fromAccount.type === AccountType.CASH)) {
                            if (tx.fromAccountId === acc.id) projectBalance -= tx.amount;
                        }
                        if (toAccount && (toAccount.type === AccountType.BANK || toAccount.type === AccountType.CASH)) {
                            if (tx.toAccountId === acc.id) projectBalance += tx.amount;
                        }
                    }
                    if (tx.type === TransactionType.LOAN) {
                        const loanAccount = tx.accountId ? state.accounts.find(a => a.id === tx.accountId) : null;
                        if (loanAccount && (loanAccount.type === AccountType.BANK || loanAccount.type === AccountType.CASH) && tx.accountId === acc.id) {
                            if (tx.subtype === LoanSubtype.RECEIVE || tx.subtype === LoanSubtype.COLLECT) {
                                projectBalance += tx.amount;
                            } else {
                                projectBalance -= tx.amount;
                            }
                        }
                    }
                });
                openingBalance += projectBalance;
            });
        } else {
            // For "All Projects", use the actual account balances minus period changes
            bankAccounts.forEach(acc => {
                let periodChange = 0;
                transactionsInRange.forEach(tx => {
                    if (tx.type === TransactionType.INCOME && tx.accountId === acc.id) {
                        periodChange += tx.amount;
                    } else if (tx.type === TransactionType.EXPENSE && tx.accountId === acc.id) {
                        periodChange -= tx.amount;
                    } else if (tx.type === TransactionType.TRANSFER) {
                        if (tx.fromAccountId === acc.id) periodChange -= tx.amount;
                        if (tx.toAccountId === acc.id) periodChange += tx.amount;
                    } else if (tx.type === TransactionType.LOAN && tx.accountId === acc.id) {
                        if (tx.subtype === LoanSubtype.RECEIVE || tx.subtype === LoanSubtype.COLLECT) {
                            periodChange += tx.amount;
                        } else {
                            periodChange -= tx.amount;
                        }
                    }
                });
                openingBalance += (acc.balance || 0) - periodChange;
            });
        }

        // Get equity account IDs
        const equityAccountIds = new Set(
            state.accounts.filter(acc => acc.type === AccountType.EQUITY).map(acc => acc.id)
        );

        // Get asset account IDs
        const assetAccountIds = new Set(
            state.accounts.filter(acc => acc.type === AccountType.ASSET).map(acc => acc.id)
        );

        // OPERATING ACTIVITIES
        const operatingItems: CashFlowItem[] = [];
        let operatingInflows = 0;
        let operatingOutflows = 0;

        // Cash Inflows from Operations (Income transactions)
        transactionsInRange.forEach(tx => {
            let projectId = tx.projectId;
            
            // Resolve projectId from linked entities
            if (!projectId && tx.invoiceId) {
                const inv = state.invoices.find(i => i.id === tx.invoiceId);
                if (inv) projectId = inv.projectId;
            }
            if (!projectId && tx.billId) {
                const bill = state.bills.find(b => b.id === tx.billId);
                if (bill) projectId = bill.projectId;
            }

            // Filter by selected project
            if (selectedProjectId !== 'all' && projectId !== selectedProjectId) return;
            if (!projectId && selectedProjectId !== 'all') return;

            // Skip equity and loan transactions (handled in financing)
            if (tx.type === TransactionType.TRANSFER) {
                const fromEquity = tx.fromAccountId && equityAccountIds.has(tx.fromAccountId);
                const toEquity = tx.toAccountId && equityAccountIds.has(tx.toAccountId);
                if (fromEquity || toEquity) return; // Skip equity transfers
            }
            if (tx.type === TransactionType.LOAN) return; // Skip loans

            const account = state.accounts.find(a => a.id === tx.accountId);
            if (!account) return;
            
            // Only count transactions affecting bank/cash accounts
            if (account.type !== AccountType.BANK && account.type !== AccountType.CASH) return;

            if (tx.type === TransactionType.INCOME) {
                operatingInflows += tx.amount;
            } else if (tx.type === TransactionType.EXPENSE) {
                operatingOutflows += tx.amount;
            }
        });

        operatingItems.push({ label: 'Cash Received from Customers', amount: operatingInflows, level: 1 });
        operatingItems.push({ label: 'Cash Paid to Suppliers and Employees', amount: -operatingOutflows, level: 1 });
        
        // Add adjustments (simplified - in a full implementation, you'd calculate changes in receivables/payables)
        // For now, we'll show net operating cash flow
        const netOperatingCash = operatingInflows - operatingOutflows;
        operatingItems.push({ label: 'Net Cash from Operating Activities', amount: netOperatingCash, level: 0 });

        // INVESTING ACTIVITIES
        const investingItems: CashFlowItem[] = [];
        let investingInflows = 0;
        let investingOutflows = 0;
        let equityContributed = 0;
        let equityWithdrawn = 0;

        transactionsInRange.forEach(tx => {
            let projectId = tx.projectId;
            
            if (!projectId && tx.invoiceId) {
                const inv = state.invoices.find(i => i.id === tx.invoiceId);
                if (inv) projectId = inv.projectId;
            }
            if (!projectId && tx.billId) {
                const bill = state.bills.find(b => b.id === tx.billId);
                if (bill) projectId = bill.projectId;
            }

            // Filter by selected project
            if (selectedProjectId !== 'all' && projectId !== selectedProjectId) return;
            if (!projectId && selectedProjectId !== 'all') return;

            // Transactions involving asset accounts
            const fromAccount = tx.fromAccountId ? state.accounts.find(a => a.id === tx.fromAccountId) : null;
            const toAccount = tx.toAccountId ? state.accounts.find(a => a.id === tx.toAccountId) : null;
            const account = tx.accountId ? state.accounts.find(a => a.id === tx.accountId) : null;

            if (tx.type === TransactionType.INCOME && account && assetAccountIds.has(account.id)) {
                // Income from asset sale
                investingInflows += tx.amount;
            } else if (tx.type === TransactionType.EXPENSE && account && assetAccountIds.has(account.id)) {
                // Expense on assets (purchase)
                investingOutflows += tx.amount;
            } else if (tx.type === TransactionType.TRANSFER) {
                // Transfers involving asset accounts
                if (fromAccount && assetAccountIds.has(fromAccount.id)) {
                    const toAcc = toAccount || account;
                    if (toAcc && (toAcc.type === AccountType.BANK || toAcc.type === AccountType.CASH)) {
                        investingInflows += tx.amount; // Asset sold, cash received
                    }
                } else if (toAccount && assetAccountIds.has(toAccount.id)) {
                    const fromAcc = fromAccount || account;
                    if (fromAcc && (fromAcc.type === AccountType.BANK || fromAcc.type === AccountType.CASH)) {
                        investingOutflows += tx.amount; // Asset purchased, cash paid
                    }
                }
                
                // Equity transactions (Investment Activities)
                const fromEquity = fromAccount && equityAccountIds.has(fromAccount.id);
                const toEquity = toAccount && equityAccountIds.has(toAccount.id);
                
                if (fromEquity && !toEquity) {
                    // Equity -> Bank/Cash: Owner/Investor contribution (cash inflow)
                    const targetAccount = toAccount || account;
                    if (targetAccount && (targetAccount.type === AccountType.BANK || targetAccount.type === AccountType.CASH)) {
                        equityContributed += tx.amount;
                        investingInflows += tx.amount;
                    }
                } else if (toEquity && !fromEquity) {
                    // Bank/Cash -> Equity: Owner/Investor withdrawal (cash outflow)
                    const sourceAccount = fromAccount || account;
                    if (sourceAccount && (sourceAccount.type === AccountType.BANK || sourceAccount.type === AccountType.CASH)) {
                        equityWithdrawn += tx.amount;
                        investingOutflows += tx.amount;
                    }
                }
            }
        });

        if (equityContributed > 0) {
            investingItems.push({ label: 'Owner/Investor Contributions', amount: equityContributed, level: 1 });
        }
        if (equityWithdrawn > 0) {
            investingItems.push({ label: 'Owner/Investor Withdrawals', amount: -equityWithdrawn, level: 1 });
        }
        if (investingInflows - equityContributed > 0) {
            investingItems.push({ label: 'Proceeds from Sale of Assets', amount: investingInflows - equityContributed, level: 1 });
        }
        if (investingOutflows - equityWithdrawn > 0) {
            investingItems.push({ label: 'Purchase of Fixed Assets', amount: -(investingOutflows - equityWithdrawn), level: 1 });
        }
        
        const netInvestingCash = investingInflows - investingOutflows;
        investingItems.push({ label: 'Net Cash from Investing Activities', amount: netInvestingCash, level: 0 });

        // FINANCING ACTIVITIES
        const financingItems: CashFlowItem[] = [];
        let financingInflows = 0;
        let financingOutflows = 0;
        let loanReceived = 0;
        let loanPaid = 0;

        transactionsInRange.forEach(tx => {
            let projectId = tx.projectId;
            
            if (!projectId && tx.invoiceId) {
                const inv = state.invoices.find(i => i.id === tx.invoiceId);
                if (inv) projectId = inv.projectId;
            }
            if (!projectId && tx.billId) {
                const bill = state.bills.find(b => b.id === tx.billId);
                if (bill) projectId = bill.projectId;
            }

            // Filter by selected project
            if (selectedProjectId !== 'all' && projectId !== selectedProjectId) return;
            if (!projectId && selectedProjectId !== 'all') return;

            const account = tx.accountId ? state.accounts.find(a => a.id === tx.accountId) : null;
            if (!account) return;
            
            // Only count transactions affecting bank/cash accounts for cash flow
            if (account.type !== AccountType.BANK && account.type !== AccountType.CASH) return;

            // Loan transactions only (equity transactions moved to Investing Activities)
            if (tx.type === TransactionType.LOAN) {
                if (tx.subtype === LoanSubtype.RECEIVE || tx.subtype === LoanSubtype.COLLECT) {
                    loanReceived += tx.amount;
                    financingInflows += tx.amount;
                } else if (tx.subtype === LoanSubtype.GIVE || tx.subtype === LoanSubtype.REPAY) {
                    loanPaid += tx.amount;
                    financingOutflows += tx.amount;
                }
            }
        });

        if (loanReceived > 0) {
            financingItems.push({ label: 'Loans Received', amount: loanReceived, level: 1 });
        }
        if (loanPaid > 0) {
            financingItems.push({ label: 'Loan Repayments', amount: -loanPaid, level: 1 });
        }
        
        const netFinancingCash = financingInflows - financingOutflows;
        if (netFinancingCash !== 0 || financingItems.length === 0) {
            financingItems.push({ label: 'Net Cash from Financing Activities', amount: netFinancingCash, level: 0 });
        }

        // Calculate net cash flow
        const netCashFlow = netOperatingCash + netInvestingCash + netFinancingCash;

        // Calculate closing balance for the selected project
        let closingBalance = 0;
        
        if (selectedProjectId !== 'all') {
            // Calculate closing balance from all transactions for this project up to period end
            const allTransactionsUpToEnd = state.transactions.filter(tx => {
                const txDate = new Date(tx.date);
                if (txDate > end) return false; // Only transactions up to period end
                
                let projectId = tx.projectId;
                // Resolve projectId from linked entities
                if (!projectId && tx.invoiceId) {
                    const inv = state.invoices.find(i => i.id === tx.invoiceId);
                    if (inv) projectId = inv.projectId;
                }
                if (!projectId && tx.billId) {
                    const bill = state.bills.find(b => b.id === tx.billId);
                    if (bill) projectId = bill.projectId;
                }
                
                return projectId === selectedProjectId;
            });
            
            bankAccounts.forEach(acc => {
                let projectBalance = 0;
                allTransactionsUpToEnd.forEach(tx => {
                    const account = state.accounts.find(a => a.id === tx.accountId);
                    if (account && (account.type === AccountType.BANK || account.type === AccountType.CASH)) {
                        if (tx.accountId === acc.id) {
                            if (tx.type === TransactionType.INCOME) {
                                projectBalance += tx.amount;
                            } else if (tx.type === TransactionType.EXPENSE) {
                                projectBalance -= tx.amount;
                            }
                        }
                    }
                    if (tx.type === TransactionType.TRANSFER) {
                        const fromAccount = tx.fromAccountId ? state.accounts.find(a => a.id === tx.fromAccountId) : null;
                        const toAccount = tx.toAccountId ? state.accounts.find(a => a.id === tx.toAccountId) : null;
                        if (fromAccount && (fromAccount.type === AccountType.BANK || fromAccount.type === AccountType.CASH)) {
                            if (tx.fromAccountId === acc.id) projectBalance -= tx.amount;
                        }
                        if (toAccount && (toAccount.type === AccountType.BANK || toAccount.type === AccountType.CASH)) {
                            if (tx.toAccountId === acc.id) projectBalance += tx.amount;
                        }
                    }
                    if (tx.type === TransactionType.LOAN) {
                        const loanAccount = tx.accountId ? state.accounts.find(a => a.id === tx.accountId) : null;
                        if (loanAccount && (loanAccount.type === AccountType.BANK || loanAccount.type === AccountType.CASH) && tx.accountId === acc.id) {
                            if (tx.subtype === LoanSubtype.RECEIVE || tx.subtype === LoanSubtype.COLLECT) {
                                projectBalance += tx.amount;
                            } else {
                                projectBalance -= tx.amount;
                            }
                        }
                    }
                });
                closingBalance += projectBalance;
            });
        } else {
            // For "All Projects", use the actual account balances
            bankAccounts.forEach(acc => {
                closingBalance += (acc.balance || 0);
            });
        }

        return {
            operating: {
                title: 'Operating Activities',
                items: operatingItems,
                total: netOperatingCash
            },
            investing: {
                title: 'Investing Activities',
                items: investingItems,
                total: netInvestingCash
            },
            financing: {
                title: 'Financing Activities',
                items: financingItems,
                total: netFinancingCash
            },
            netCashFlow,
            openingBalance,
            closingBalance
        };
    }, [state.transactions, state.accounts, state.invoices, state.bills, startDate, endDate, selectedProjectId]);

    const handleExport = () => {
        const exportData: any[] = [];
        
        // Operating Activities
        exportData.push({ 'Category': 'OPERATING ACTIVITIES', 'Amount': '' });
        reportData.operating.items.forEach(item => {
            exportData.push({ 'Category': item.label, 'Amount': item.amount });
        });
        exportData.push({ 'Category': 'Net Cash from Operating Activities', 'Amount': reportData.operating.total });
        exportData.push({ 'Category': '', 'Amount': '' });
        
        // Investing Activities
        exportData.push({ 'Category': 'INVESTING ACTIVITIES', 'Amount': '' });
        reportData.investing.items.forEach(item => {
            exportData.push({ 'Category': item.label, 'Amount': item.amount });
        });
        exportData.push({ 'Category': 'Net Cash from Investing Activities', 'Amount': reportData.investing.total });
        exportData.push({ 'Category': '', 'Amount': '' });
        
        // Financing Activities
        exportData.push({ 'Category': 'FINANCING ACTIVITIES', 'Amount': '' });
        reportData.financing.items.forEach(item => {
            exportData.push({ 'Category': item.label, 'Amount': item.amount });
        });
        exportData.push({ 'Category': 'Net Cash from Financing Activities', 'Amount': reportData.financing.total });
        exportData.push({ 'Category': '', 'Amount': '' });
        
        // Summary
        exportData.push({ 'Category': 'Net Increase/(Decrease) in Cash', 'Amount': reportData.netCashFlow });
        exportData.push({ 'Category': 'Opening Cash Balance', 'Amount': reportData.openingBalance });
        exportData.push({ 'Category': 'Closing Cash Balance', 'Amount': reportData.closingBalance });
        
        exportJsonToExcel(exportData, 'cash-flow-report.xlsx', 'Cash Flow Statement');
    };


    const renderSection = (section: CashFlowSection) => (
        <div className="mb-8">
            <h4 className={`text-lg font-bold uppercase tracking-wide pb-2 mb-4 border-b-2 ${
                section.title === 'Operating Activities' ? 'text-emerald-700 border-emerald-100' :
                section.title === 'Investing Activities' ? 'text-blue-700 border-blue-100' :
                'text-indigo-700 border-indigo-100'
            }`}>{section.title}</h4>
            <table className="w-full text-sm">
                <tbody>
                    {section.items.map((item, index) => (
                        <tr key={index} className={item.level === 0 ? 'border-t border-slate-200' : ''}>
                            <td className={`py-2 px-2 ${item.level === 0 ? 'font-bold text-slate-900' : 'text-slate-700 pl-6'}`}>
                                {item.label}
                            </td>
                            <td className={`py-2 px-2 text-right font-medium tabular-nums ${
                                item.level === 0 ? 'font-bold text-slate-900' : 'text-slate-700'
                            }`}>
                                {CURRENCY} {item.amount.toLocaleString()}
                            </td>
                        </tr>
                    ))}
                    <tr className="bg-slate-50 font-bold">
                        <td className="py-3 px-2 text-slate-800 uppercase text-xs tracking-wider">Net Cash from {section.title}</td>
                        <td className={`py-3 px-2 text-right text-sm tabular-nums ${
                            section.title === 'Operating Activities' ? 'text-emerald-700' :
                            section.title === 'Investing Activities' ? 'text-blue-700' :
                            'text-indigo-700'
                        }`}>
                            {CURRENCY} {section.total.toLocaleString()}
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    );

    return (
        <>
            <style>{STANDARD_PRINT_STYLES}</style>
            <div className="flex flex-col h-full space-y-4">
                <div className="flex-shrink-0">
                    <ReportToolbar
                        startDate={startDate}
                        endDate={endDate}
                        onDateChange={handleDateChange}
                        onExport={handleExport}
                        onPrint={handlePrint}
                        hideGroup={true}
                        showDateFilterPills={true}
                        activeDateRange={dateRange}
                        onRangeChange={handleRangeChange}
                    >
                        <ComboBox 
                            label="Filter by Project" 
                            items={projectItems} 
                            selectedId={selectedProjectId} 
                            onSelect={(item) => setSelectedProjectId(item?.id || 'all')} 
                            allowAddNew={false} 
                        />
                    </ReportToolbar>
                </div>
                
                <div className="flex-grow overflow-y-auto printable-area min-h-0" id="printable-area">
                    <Card className="min-h-full">
                        <ReportHeader />
                        <div className="text-center mb-8">
                            <h3 className="text-2xl font-bold text-slate-800 uppercase tracking-wide">Cash Flow Statement</h3>
                            <p className="text-sm text-slate-500 font-medium mt-1">
                                {selectedProjectId === 'all' ? 'All Projects' : state.projects.find(p => p.id === selectedProjectId)?.name}
                            </p>
                            <p className="text-xs text-slate-400">
                                For the period from {formatDate(startDate)} to {formatDate(endDate)}
                            </p>
                        </div>

                        <div className="max-w-4xl mx-auto bg-white p-4 md:p-8 rounded-xl border border-slate-200 shadow-sm">
                            {renderSection(reportData.operating)}
                            {renderSection(reportData.investing)}
                            {renderSection(reportData.financing)}
                            
                            {/* Summary */}
                            <div className="mt-8 space-y-3 border-t-2 border-slate-400 pt-6">
                                <div className="flex justify-between items-center py-2">
                                    <span className="text-sm font-bold text-slate-900 uppercase tracking-wide">Net Increase/(Decrease) in Cash</span>
                                    <span className="text-sm font-bold text-slate-900 tabular-nums">
                                        {CURRENCY} {reportData.netCashFlow.toLocaleString()}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center py-2">
                                    <span className="text-sm text-slate-700">Opening Cash Balance</span>
                                    <span className="text-sm font-medium text-slate-700 tabular-nums">
                                        {CURRENCY} {reportData.openingBalance.toLocaleString()}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center py-3 border-t-2 border-slate-300 pt-3">
                                    <span className="text-base font-bold text-slate-900 uppercase tracking-wide">Closing Cash Balance</span>
                                    <span className="text-base font-bold text-slate-900 tabular-nums">
                                        {CURRENCY} {reportData.closingBalance.toLocaleString()}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <ReportFooter />
                    </Card>
                </div>
            </div>
        </>
    );
};

export default ProjectCashFlowReport;

