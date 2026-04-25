
import React, { useMemo, useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import { TransactionType, AccountType, ContactType, LoanSubtype } from '../../types';
import Card from '../ui/Card';
import { CURRENCY, ICONS } from '../../constants';
import { formatRoundedNumber } from '../../utils/numberUtils';

interface FundReportRow {
    id: string;
    name: string;
    type: 'Project' | 'Building' | 'Loan' | 'Personal';
    income: number;
    expense: number;
    investment: number;
    equityOut: number;
    loanNetBalance: number;
    loanGiven?: number;
    loanTaken?: number;
    netBalance: number;
}

type SortKey = 'name' | 'income' | 'expense' | 'investment' | 'equityOut' | 'loanNetBalance' | 'netBalance';

const ProjectBuildingFundsReport: React.FC = () => {
    const { state } = useAppContext();
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'netBalance', direction: 'desc' });

    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    // Helper function to round numbers to nearest whole number
    const roundNumber = (num: number): number => {
        return Math.round(num);
    };

    // Helper function to get dynamic font size based on number length
    const getFontSize = (num: number): string => {
        const rounded = roundNumber(num);
        const numStr = formatRoundedNumber(Math.abs(rounded));
        const length = numStr.length;
        
        // Adjust font size based on number of digits
        if (length <= 6) return 'text-lg';      // Up to 999,999
        if (length <= 9) return 'text-base';    // Up to 999,999,999
        if (length <= 12) return 'text-sm';     // Up to 999,999,999,999
        return 'text-xs';                       // Very large numbers
    };

    const reportData = useMemo<FundReportRow[]>(() => {
        const rows: FundReportRow[] = [];

        const equityCategoryNames = ['Owner Equity', 'Share Capital', 'Investment', 'Capital Injection'];
        const withdrawalCategoryNames = ['Owner Withdrawn', 'Drawings', 'Dividends', 'Profit Share', 'Owner Payout', 'Owner Security Payout', 'Security Deposit Refund'];
        const withdrawalCategoryNamesForEquityOut = ['Owner Withdrawn', 'Drawings', 'Dividends', 'Owner Payout', 'Owner Security Payout', 'Security Deposit Refund'];

        const categoryMap = new Map(state.categories.map(c => [c.id, c]));
        const billMap = new Map(state.bills.map(b => [b.id, b]));
        const invoiceMap = new Map(state.invoices.map(i => [i.id, i]));
        const accountMap = new Map(state.accounts.map(a => [a.id, a]));
        const propertyMap = new Map(state.properties.map(p => [p.id, p]));

        const isEquityIncome = (catId?: string) => {
            if (!catId) return false;
            const c = categoryMap.get(catId);
            return c && equityCategoryNames.includes(c.name);
        };
        
        const isEquityExpense = (catId?: string) => {
            if (!catId) return false;
            const c = categoryMap.get(catId);
            return c && withdrawalCategoryNames.includes(c.name);
        };
        const isEquityExpenseForEquityOut = (catId?: string) => {
            if (!catId) return false;
            const c = categoryMap.get(catId);
            return c && withdrawalCategoryNamesForEquityOut.includes(c.name);
        };
        const isProfitDistributionExpense = (tx: { type: string; description?: string }) =>
            tx.type === TransactionType.EXPENSE && (tx.description?.toLowerCase().includes('profit distribution') ?? false);

        const equityAccountIds = new Set(state.accounts.filter(a => a.type === AccountType.EQUITY).map(a => a.id));

        // Pre-index: resolve each transaction's projectId and buildingId once
        const txProjectIds = new Map<string, string | undefined>();
        const txBuildingIds = new Map<string, string | undefined>();
        for (const tx of state.transactions) {
            let pid = tx.projectId;
            if (!pid && tx.billId) { pid = billMap.get(tx.billId)?.projectId; }
            if (!pid && tx.invoiceId) { pid = invoiceMap.get(tx.invoiceId)?.projectId; }
            txProjectIds.set(tx.id, pid);

            let bid = tx.buildingId;
            if (!bid && tx.propertyId) { bid = propertyMap.get(tx.propertyId)?.buildingId; }
            txBuildingIds.set(tx.id, bid);
        }

        // 1. Process Projects
        state.projects.forEach(project => {
            let income = 0;
            let expense = 0;
            let investment = 0;
            let equityOut = 0;
            let loanNetBalance = 0;

            state.transactions.forEach(tx => {
                if (txProjectIds.get(tx.id) !== project.id) return;

                if (tx.type === TransactionType.INCOME) {
                    if (isEquityIncome(tx.categoryId)) {
                        investment += tx.amount;
                    } else {
                        income += tx.amount;
                    }
                } else if (tx.type === TransactionType.EXPENSE) {
                    if (isEquityExpenseForEquityOut(tx.categoryId)) {
                        equityOut += tx.amount;
                    } else if (!isProfitDistributionExpense(tx)) {
                        expense += tx.amount;
                    }
                } else if (tx.type === TransactionType.TRANSFER) {
                    const isFromEquity = tx.fromAccountId && equityAccountIds.has(tx.fromAccountId);
                    const isToEquity = tx.toAccountId && equityAccountIds.has(tx.toAccountId);
                    const isMoveIn = tx.description?.toLowerCase().includes('equity move in');
                    const desc = tx.description?.toLowerCase() ?? '';
                    const isExplicitEquityMoveOut = desc.includes('equity move out');
                    const isCapitalPayout = desc.includes('capital payout');
                    const fromAccount = accountMap.get(tx.fromAccountId || '');
                    const isFromClearing = fromAccount?.name === 'Internal Clearing';
                    const isPMFeeTransfer = desc.includes('pm fee') || desc.includes('pm fee equity');
                    if (isExplicitEquityMoveOut || isCapitalPayout) {
                        equityOut += tx.amount;
                    }
                    if (isFromEquity || isMoveIn) {
                        investment += tx.amount;
                    } else if (isToEquity && isFromClearing && isPMFeeTransfer) {
                        investment += tx.amount;
                    }
                } else if (tx.type === TransactionType.LOAN) {
                    if (tx.subtype === LoanSubtype.RECEIVE || tx.subtype === LoanSubtype.COLLECT) {
                        loanNetBalance += tx.amount;
                    } else if (tx.subtype === LoanSubtype.GIVE || tx.subtype === LoanSubtype.REPAY) {
                        loanNetBalance -= tx.amount;
                    }
                }
            });

            rows.push({
                id: project.id,
                name: project.name,
                type: 'Project',
                income: roundNumber(income),
                expense: roundNumber(expense),
                investment: roundNumber(investment),
                equityOut: roundNumber(equityOut),
                loanNetBalance: roundNumber(loanNetBalance),
                netBalance: roundNumber((income - expense) + (investment - equityOut) + loanNetBalance)
            });
        });

        // 2. Process Buildings
        state.buildings.forEach(building => {
            let income = 0;
            let expense = 0;
            let loanNetBalance = 0;

            state.transactions.forEach(tx => {
                const txBuildingId = txBuildingIds.get(tx.id);

                if (txBuildingId !== building.id) return;

                if (tx.type === TransactionType.INCOME) {
                    income += tx.amount;
                } else if (tx.type === TransactionType.EXPENSE) {
                    expense += tx.amount;
                } else if (tx.type === TransactionType.LOAN) {
                    // Calculate loan net balance
                    // RECEIVE and COLLECT increase available funds (positive)
                    // GIVE and REPAY decrease available funds (negative)
                    if (tx.subtype === LoanSubtype.RECEIVE || tx.subtype === LoanSubtype.COLLECT) {
                        loanNetBalance += tx.amount;
                    } else if (tx.subtype === LoanSubtype.GIVE || tx.subtype === LoanSubtype.REPAY) {
                        loanNetBalance -= tx.amount;
                    }
                }
                // Transfers typically don't apply to building operating funds in this model, ignoring for now.
            });

            rows.push({
                id: building.id,
                name: building.name,
                type: 'Building',
                income: roundNumber(income),
                expense: roundNumber(expense),
                investment: 0,
                equityOut: 0, // Simplified for buildings as per specs focus on projects
                loanNetBalance: roundNumber(loanNetBalance),
                netBalance: roundNumber((income - expense) + loanNetBalance)
            });
        });

        // 3. Process General Loans (loans not associated with projects/buildings) - Aggregate into single summary
        let totalLoanGiven = 0;
        let totalLoanTaken = 0;
        
        state.transactions
            .filter(tx => 
                tx.type === TransactionType.LOAN && 
                !tx.projectId && 
                !tx.buildingId
            )
            .forEach(tx => {
                // Calculate loan given (money going out)
                if (tx.subtype === LoanSubtype.GIVE || tx.subtype === LoanSubtype.REPAY) {
                    totalLoanGiven += tx.amount;
                }
                // Calculate loan taken (money coming in)
                else if (tx.subtype === LoanSubtype.RECEIVE || tx.subtype === LoanSubtype.COLLECT) {
                    totalLoanTaken += tx.amount;
                }
            });
        
        // Add single loan summary row if there are any loan transactions
        const loanNetBalance = totalLoanTaken - totalLoanGiven;
        if (Math.abs(totalLoanGiven) > 0.01 || Math.abs(totalLoanTaken) > 0.01) {
            rows.push({
                id: 'loan-summary',
                name: 'Loan Summary',
                type: 'Loan',
                income: 0,
                expense: 0,
                investment: 0,
                equityOut: 0,
                loanNetBalance: roundNumber(loanNetBalance),
                loanGiven: roundNumber(totalLoanGiven),
                loanTaken: roundNumber(totalLoanTaken),
                netBalance: roundNumber(loanNetBalance)
            });
        }

        // Filter out empty projects/buildings/loans (no financial data)
        // Use a small epsilon to handle floating point precision issues
        const EPSILON = 0.01;
        const filteredRows = rows.filter(row => {
            // A row is considered to have data if any financial metric is non-zero
            return Math.abs(row.income) > EPSILON || 
                   Math.abs(row.expense) > EPSILON || 
                   Math.abs(row.investment) > EPSILON || 
                   Math.abs(row.equityOut) > EPSILON || 
                   Math.abs(row.loanNetBalance) > EPSILON;
        });

        // Sorting (projects / buildings / loans only; personal row appended after)
        const sortedCore = filteredRows.sort((a, b) => {
            const valA = a[sortConfig.key];
            const valB = b[sortConfig.key];
            
            if (typeof valA === 'string' && typeof valB === 'string') {
                return sortConfig.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
            }
            if (typeof valA === 'number' && typeof valB === 'number') {
                return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
            }
            return 0;
        });

        // Personal amounts: expenses are stored negative in DB (cashbook); show as positive expense and net = income - expense (same as Personal Transactions tab summary).
        let personalIncome = 0;
        let personalExpense = 0;
        for (const p of state.personalTransactions || []) {
            if (p.deletedAt) continue;
            if (p.type === 'Income') personalIncome += Math.abs(Number(p.amount) || 0);
            else if (p.type === 'Expense') personalExpense += Math.abs(Number(p.amount) || 0);
        }
        personalIncome = roundNumber(personalIncome);
        personalExpense = roundNumber(personalExpense);

        if (Math.abs(personalIncome) > EPSILON || Math.abs(personalExpense) > EPSILON) {
            sortedCore.push({
                id: 'personal-summary',
                name: 'Personal transactions',
                type: 'Personal',
                income: personalIncome,
                expense: personalExpense,
                investment: 0,
                equityOut: 0,
                loanNetBalance: 0,
                netBalance: roundNumber(personalIncome - personalExpense),
            });
        }

        return sortedCore;

    }, [state.projects, state.buildings, state.transactions, state.categories, state.accounts, state.properties, state.bills, state.invoices, state.personalTransactions, sortConfig]);

    const SortIcon = ({ column }: { column: SortKey }) => (
        <span className={`ml-1 text-[10px] ${sortConfig.key === column ? 'text-primary' : 'text-app-muted'}`}>
            {sortConfig.key === column ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
    );

    // Calculate summary totals (already rounded from reportData; exclude personal row — it has its own cards)
    const summary = useMemo(() => {
        return reportData
            .filter((row) => row.type !== 'Personal')
            .reduce((acc, row) => ({
            totalIncome: acc.totalIncome + row.income,
            totalExpense: acc.totalExpense + row.expense,
            totalInvestment: acc.totalInvestment + row.investment,
            totalEquityOut: acc.totalEquityOut + row.equityOut,
            totalLoanNetBalance: acc.totalLoanNetBalance + row.loanNetBalance,
            totalLoanGiven: acc.totalLoanGiven + (row.loanGiven || 0),
            totalLoanTaken: acc.totalLoanTaken + (row.loanTaken || 0),
            totalNetBalance: acc.totalNetBalance + row.netBalance,
            totalProjects: acc.totalProjects + (row.type === 'Project' ? 1 : 0),
            totalBuildings: acc.totalBuildings + (row.type === 'Building' ? 1 : 0),
            totalLoans: acc.totalLoans + (row.type === 'Loan' ? 1 : 0),
        }), {
            totalIncome: 0,
            totalExpense: 0,
            totalInvestment: 0,
            totalEquityOut: 0,
            totalLoanNetBalance: 0,
            totalLoanGiven: 0,
            totalLoanTaken: 0,
            totalNetBalance: 0,
            totalProjects: 0,
            totalBuildings: 0,
            totalLoans: 0,
        });
    }, [reportData]);

    const personalRow = reportData.find((r) => r.type === 'Personal');
    const personalIncomeTotal = personalRow?.income ?? 0;
    const personalExpenseTotal = personalRow?.expense ?? 0;

    return (
        <Card className="overflow-hidden">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-app-text">Funds Availability Report</h3>
            </div>
            
            {/* Summary Section */}
            <div className="mb-6 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-9 gap-3">
                <div className="bg-app-toolbar rounded-lg p-3 border border-app-border">
                    <div className="text-xs text-app-muted font-medium mb-1">Total Projects</div>
                    <div className="text-lg font-bold text-app-text">{summary.totalProjects}</div>
                </div>
                <div className="bg-app-toolbar rounded-lg p-3 border border-app-border">
                    <div className="text-xs text-app-muted font-medium mb-1">Total Buildings</div>
                    <div className="text-lg font-bold text-app-text">{summary.totalBuildings}</div>
                </div>
                <div className="bg-app-toolbar rounded-lg p-3 border border-app-border">
                    <div className="text-xs text-app-muted font-medium mb-1">Total Loans</div>
                    <div className="text-lg font-bold text-app-text">{summary.totalLoans}</div>
                </div>
                <div className="rounded-lg p-3 border border-app-border bg-[color:var(--badge-paid-bg)]">
                    <div className="text-xs text-ds-success font-medium mb-1">Total Income</div>
                    <div className={`${getFontSize(summary.totalIncome)} font-bold text-ds-success tabular-nums`}>{CURRENCY} {formatRoundedNumber(summary.totalIncome)}</div>
                </div>
                <div className="rounded-lg p-3 border border-app-border bg-[color:var(--badge-unpaid-bg)]">
                    <div className="text-xs text-ds-danger font-medium mb-1">Total Expense</div>
                    <div className={`${getFontSize(summary.totalExpense)} font-bold text-ds-danger tabular-nums`}>{CURRENCY} {formatRoundedNumber(summary.totalExpense)}</div>
                </div>
                <div className="rounded-lg p-3 border border-primary/30 bg-app-toolbar">
                    <div className="text-xs text-primary font-medium mb-1">Total Investment</div>
                    <div className={`${getFontSize(summary.totalInvestment)} font-bold text-primary tabular-nums`}>{CURRENCY} {formatRoundedNumber(summary.totalInvestment)}</div>
                </div>
                <div className="rounded-lg p-3 border border-app-border bg-[color:var(--badge-partial-bg)]">
                    <div className="text-xs text-ds-warning font-medium mb-1">Equity Moved Out</div>
                    <div className={`${getFontSize(summary.totalEquityOut)} font-bold text-ds-warning tabular-nums`}>{CURRENCY} {formatRoundedNumber(summary.totalEquityOut)}</div>
                </div>
                <div className={`rounded-lg p-3 border border-app-border ${summary.totalLoanNetBalance >= 0 ? 'bg-app-surface-2' : 'bg-app-toolbar'}`}>
                    <div className="text-xs font-medium mb-1 text-purple-600">Loan Net Balance</div>
                    <div className={`${getFontSize(summary.totalLoanNetBalance)} font-bold tabular-nums text-purple-600`}>
                        {CURRENCY} {formatRoundedNumber(summary.totalLoanNetBalance)}
                    </div>
                </div>
                <div className={`rounded-lg p-3 border ${summary.totalNetBalance >= 0 ? 'border-app-border bg-app-toolbar' : 'border-ds-danger/40 bg-[color:var(--badge-unpaid-bg)]'}`}>
                    <div className={`text-xs font-medium mb-1 ${summary.totalNetBalance >= 0 ? 'text-app-muted' : 'text-ds-danger'}`}>Net Balance</div>
                    <div className={`${getFontSize(summary.totalNetBalance)} font-bold tabular-nums ${summary.totalNetBalance >= 0 ? 'text-app-text' : 'text-ds-danger'}`}>
                        {CURRENCY} {formatRoundedNumber(summary.totalNetBalance)}
                    </div>
                </div>
            </div>

            <div className="mb-6">
                <h4 className="text-sm font-semibold text-app-muted mb-2">Personal transactions</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
                    <div className="rounded-lg p-3 border border-app-border bg-[color:var(--badge-paid-bg)]">
                        <div className="text-xs text-ds-success font-medium mb-1">Personal total income</div>
                        <div className={`${getFontSize(personalIncomeTotal)} font-bold text-ds-success tabular-nums`}>
                            {CURRENCY} {formatRoundedNumber(personalIncomeTotal)}
                        </div>
                    </div>
                    <div className="rounded-lg p-3 border border-app-border bg-[color:var(--badge-unpaid-bg)]">
                        <div className="text-xs text-ds-danger font-medium mb-1">Personal total expense</div>
                        <div className={`${getFontSize(personalExpenseTotal)} font-bold text-ds-danger tabular-nums`}>
                            {CURRENCY} {formatRoundedNumber(personalExpenseTotal)}
                        </div>
                    </div>
                </div>
            </div>
            
            <div className="overflow-x-auto rounded-xl border border-app-border">
                <table className="min-w-full divide-y divide-app-border text-sm">
                    <thead className="bg-app-table-header">
                        <tr>
                            <th onClick={() => handleSort('name')} className="px-4 py-3 text-left font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar select-none whitespace-nowrap transition-colors duration-ds">Project / Building / Loan <SortIcon column="name"/></th>
                            <th onClick={() => handleSort('income')} className="px-4 py-3 text-right font-semibold text-ds-success cursor-pointer hover:bg-app-toolbar select-none whitespace-nowrap transition-colors duration-ds">Income <SortIcon column="income"/></th>
                            <th onClick={() => handleSort('expense')} className="px-4 py-3 text-right font-semibold text-ds-danger cursor-pointer hover:bg-app-toolbar select-none whitespace-nowrap transition-colors duration-ds">Expense <SortIcon column="expense"/></th>
                            <th onClick={() => handleSort('investment')} className="px-4 py-3 text-right font-semibold text-primary cursor-pointer hover:bg-app-toolbar select-none whitespace-nowrap transition-colors duration-ds">Total Investment <SortIcon column="investment"/></th>
                            <th onClick={() => handleSort('equityOut')} className="px-4 py-3 text-right font-semibold text-ds-warning cursor-pointer hover:bg-app-toolbar select-none whitespace-nowrap transition-colors duration-ds">Equity Moved Out <SortIcon column="equityOut"/></th>
                            {reportData.some(row => row.type === 'Loan') && (
                                <>
                                    <th className="px-4 py-3 text-right font-semibold text-purple-600 whitespace-nowrap">Loan Given</th>
                                    <th className="px-4 py-3 text-right font-semibold text-purple-600 whitespace-nowrap">Loan Taken</th>
                                </>
                            )}
                            <th onClick={() => handleSort('netBalance')} className="px-4 py-3 text-right font-bold text-app-text cursor-pointer hover:bg-app-toolbar select-none whitespace-nowrap bg-app-toolbar transition-colors duration-ds">Net Balance <SortIcon column="netBalance"/></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-app-border bg-app-card">
                        {reportData.map(row => (
                            <tr key={row.id} className="hover:bg-app-toolbar/80 transition-colors duration-ds">
                                <td className="px-4 py-3 font-medium text-app-text border-b border-app-border">
                                    {row.name}
                                    <span className={`ml-2 text-[10px] uppercase font-normal border border-app-border px-1 rounded ${
                                        row.type === 'Project' ? 'text-app-muted' : 
                                        row.type === 'Building' ? 'text-ds-success' : 
                                        row.type === 'Personal' ? 'text-teal-600' :
                                        'text-purple-600'
                                    }`}>{row.type === 'Personal' ? 'PERSONAL' : row.type}</span>
                                </td>
                                <td className="px-4 py-3 text-right text-ds-success tabular-nums border-b border-app-border">{CURRENCY} {formatRoundedNumber(row.income)}</td>
                                <td className="px-4 py-3 text-right text-ds-danger tabular-nums border-b border-app-border">{CURRENCY} {formatRoundedNumber(row.expense)}</td>
                                <td className="px-4 py-3 text-right text-primary tabular-nums border-b border-app-border">{CURRENCY} {formatRoundedNumber(row.investment)}</td>
                                <td className="px-4 py-3 text-right text-ds-warning tabular-nums border-b border-app-border">{CURRENCY} {formatRoundedNumber(row.equityOut)}</td>
                                {reportData.some(r => r.type === 'Loan') && (
                                    <>
                                        <td className="px-4 py-3 text-right text-purple-600 tabular-nums border-b border-app-border">
                                            {row.type === 'Loan' && row.loanGiven !== undefined ? (
                                                <>{CURRENCY} {formatRoundedNumber(row.loanGiven)}</>
                                            ) : (
                                                <span className="text-app-muted">-</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right text-purple-600 tabular-nums border-b border-app-border">
                                            {row.type === 'Loan' && row.loanTaken !== undefined ? (
                                                <>{CURRENCY} {formatRoundedNumber(row.loanTaken)}</>
                                            ) : (
                                                <span className="text-app-muted">-</span>
                                            )}
                                        </td>
                                    </>
                                )}
                                <td className={`px-4 py-3 text-right font-bold tabular-nums border-b border-app-border ${row.netBalance >= 0 ? 'text-app-text bg-app-toolbar/50' : 'text-ds-danger bg-[color:var(--badge-unpaid-bg)]'}`}>
                                    {CURRENCY} {formatRoundedNumber(row.netBalance)}
                                </td>
                            </tr>
                        ))}
                        {reportData.length === 0 && (
                            <tr>
                                <td colSpan={reportData.some(row => row.type === 'Loan') ? 8 : 6} className="px-4 py-8 text-center text-app-muted">No projects or buildings found.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </Card>
    );
};

export default ProjectBuildingFundsReport;
