
import React, { useMemo, useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import { TransactionType, AccountType, ContactType, LoanSubtype } from '../../types';
import Card from '../ui/Card';
import { CURRENCY, ICONS } from '../../constants';

interface FundReportRow {
    id: string;
    name: string;
    type: 'Project' | 'Building' | 'Loan';
    income: number;
    expense: number;
    investment: number;
    equityOut: number;
    loanNetBalance: number;
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

    // Helper function to format rounded number with locale string
    const formatRoundedNumber = (num: number): string => {
        return roundNumber(num).toLocaleString();
    };

    // Helper function to get dynamic font size based on number length
    const getFontSize = (num: number): string => {
        const rounded = roundNumber(num);
        const numStr = Math.abs(rounded).toLocaleString();
        const length = numStr.length;
        
        // Adjust font size based on number of digits
        if (length <= 6) return 'text-lg';      // Up to 999,999
        if (length <= 9) return 'text-base';    // Up to 999,999,999
        if (length <= 12) return 'text-sm';     // Up to 999,999,999,999
        return 'text-xs';                       // Very large numbers
    };

    const reportData = useMemo<FundReportRow[]>(() => {
        const rows: FundReportRow[] = [];
        
        // IMPORTANT: This report processes ALL transactions from the database (from day one)
        // No date filtering is applied - all historical data is included in calculations
        
        // Helper to check for Equity/Capital categories
        const equityCategoryNames = ['Owner Equity', 'Share Capital', 'Investment', 'Capital Injection'];
        const withdrawalCategoryNames = ['Owner Withdrawn', 'Drawings', 'Dividends', 'Profit Share', 'Owner Payout', 'Owner Security Payout', 'Security Deposit Refund'];
        
        const isEquityIncome = (catId?: string) => {
            if (!catId) return false;
            const c = state.categories.find(cat => cat.id === catId);
            return c && equityCategoryNames.includes(c.name);
        };
        
        const isEquityExpense = (catId?: string) => {
            if (!catId) return false;
            const c = state.categories.find(cat => cat.id === catId);
            return c && withdrawalCategoryNames.includes(c.name);
        };

        const equityAccountIds = new Set(state.accounts.filter(a => a.type === AccountType.EQUITY).map(a => a.id));

        // 1. Process Projects
        state.projects.forEach(project => {
            let income = 0;
            let expense = 0;
            let investment = 0;
            let equityOut = 0;
            let loanNetBalance = 0;

            state.transactions.forEach(tx => {
                // Resolve projectId from transaction, bill, or invoice
                let txProjectId = tx.projectId;
                
                // If projectId is not directly set, try to resolve from linked bill
                if (!txProjectId && tx.billId) {
                    const bill = state.bills.find(b => b.id === tx.billId);
                    if (bill) txProjectId = bill.projectId;
                }
                
                // If still not set, try to resolve from linked invoice
                if (!txProjectId && tx.invoiceId) {
                    const invoice = state.invoices.find(i => i.id === tx.invoiceId);
                    if (invoice) txProjectId = invoice.projectId;
                }
                
                // Only process transactions that belong to this project
                if (txProjectId !== project.id) return;

                if (tx.type === TransactionType.INCOME) {
                    if (isEquityIncome(tx.categoryId)) {
                        investment += tx.amount;
                    } else {
                        income += tx.amount;
                    }
                } else if (tx.type === TransactionType.EXPENSE) {
                    if (isEquityExpense(tx.categoryId)) {
                        equityOut += tx.amount;
                    } else {
                        expense += tx.amount;
                    }
                } else if (tx.type === TransactionType.TRANSFER) {
                    const isFromEquity = tx.fromAccountId && equityAccountIds.has(tx.fromAccountId);
                    const isToEquity = tx.toAccountId && equityAccountIds.has(tx.toAccountId);
                    const isMoveIn = tx.description?.toLowerCase().includes('equity move in');
                    const isMoveOut = tx.description?.toLowerCase().includes('equity move out');
                    
                    // Logic for Project Investment vs Equity Out
                    if (isFromEquity || isMoveIn) {
                         investment += tx.amount;
                    } else if (isToEquity || isMoveOut) {
                         equityOut += tx.amount;
                    }
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
            
            // For buildings, Total Investment is 0 as per requirements. 
            // Equity Out matches payouts/withdrawals logic for consistency in Net Balance.

            state.transactions.forEach(tx => {
                let txBuildingId = tx.buildingId;
                if (!txBuildingId && tx.propertyId) {
                    const prop = state.properties.find(p => p.id === tx.propertyId);
                    if (prop) txBuildingId = prop.buildingId;
                }

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

        // 3. Process General Loans (loans not associated with projects/buildings)
        const generalLoanSummary: Record<string, { contactId: string; contactName: string; loanNetBalance: number }> = {};
        
        state.transactions
            .filter(tx => 
                tx.type === TransactionType.LOAN && 
                !tx.projectId && 
                !tx.buildingId &&
                tx.contactId
            )
            .forEach(tx => {
                const contactId = tx.contactId!;
                if (!generalLoanSummary[contactId]) {
                    const contact = state.contacts.find(c => c.id === contactId);
                    generalLoanSummary[contactId] = {
                        contactId,
                        contactName: contact?.name || 'Unknown',
                        loanNetBalance: 0
                    };
                }
                
                // Calculate loan net balance
                // RECEIVE and COLLECT increase available funds (positive)
                // GIVE and REPAY decrease available funds (negative)
                if (tx.subtype === LoanSubtype.RECEIVE || tx.subtype === LoanSubtype.COLLECT) {
                    generalLoanSummary[contactId].loanNetBalance += tx.amount;
                } else if (tx.subtype === LoanSubtype.GIVE || tx.subtype === LoanSubtype.REPAY) {
                    generalLoanSummary[contactId].loanNetBalance -= tx.amount;
                }
            });
        
        const generalLoanSummaries = Object.values(generalLoanSummary).filter(s => Math.abs(s.loanNetBalance) > 0.01);

        // Add general loans to rows
        generalLoanSummaries.forEach(loanSummary => {
            rows.push({
                id: `loan-${loanSummary.contactId}`,
                name: loanSummary.contactName,
                type: 'Loan',
                income: 0,
                expense: 0,
                investment: 0,
                equityOut: 0,
                loanNetBalance: roundNumber(loanSummary.loanNetBalance),
                netBalance: roundNumber(loanSummary.loanNetBalance)
            });
        });

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

        // Sorting
        return filteredRows.sort((a, b) => {
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

    }, [state.projects, state.buildings, state.transactions, state.categories, state.accounts, state.properties, state.contacts, sortConfig]);

    const SortIcon = ({ column }: { column: SortKey }) => (
        <span className="ml-1 text-[10px] text-slate-400">
            {sortConfig.key === column ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
    );

    // Calculate summary totals (already rounded from reportData)
    const summary = useMemo(() => {
        return reportData.reduce((acc, row) => ({
            totalIncome: acc.totalIncome + row.income,
            totalExpense: acc.totalExpense + row.expense,
            totalInvestment: acc.totalInvestment + row.investment,
            totalEquityOut: acc.totalEquityOut + row.equityOut,
            totalLoanNetBalance: acc.totalLoanNetBalance + row.loanNetBalance,
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
            totalNetBalance: 0,
            totalProjects: 0,
            totalBuildings: 0,
            totalLoans: 0,
        });
    }, [reportData]);

    return (
        <Card className="overflow-hidden">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-slate-800">Funds Availability Report</h3>
            </div>
            
            {/* Summary Section */}
            <div className="mb-6 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-9 gap-3">
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                    <div className="text-xs text-slate-500 font-medium mb-1">Total Projects</div>
                    <div className="text-lg font-bold text-slate-800">{summary.totalProjects}</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                    <div className="text-xs text-slate-500 font-medium mb-1">Total Buildings</div>
                    <div className="text-lg font-bold text-slate-800">{summary.totalBuildings}</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                    <div className="text-xs text-slate-500 font-medium mb-1">Total Loans</div>
                    <div className="text-lg font-bold text-slate-800">{summary.totalLoans}</div>
                </div>
                <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200">
                    <div className="text-xs text-emerald-600 font-medium mb-1">Total Income</div>
                    <div className={`${getFontSize(summary.totalIncome)} font-bold text-emerald-700 tabular-nums`}>{CURRENCY} {formatRoundedNumber(summary.totalIncome)}</div>
                </div>
                <div className="bg-rose-50 rounded-lg p-3 border border-rose-200">
                    <div className="text-xs text-rose-600 font-medium mb-1">Total Expense</div>
                    <div className={`${getFontSize(summary.totalExpense)} font-bold text-rose-700 tabular-nums`}>{CURRENCY} {formatRoundedNumber(summary.totalExpense)}</div>
                </div>
                <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                    <div className="text-xs text-blue-600 font-medium mb-1">Total Investment</div>
                    <div className={`${getFontSize(summary.totalInvestment)} font-bold text-blue-700 tabular-nums`}>{CURRENCY} {formatRoundedNumber(summary.totalInvestment)}</div>
                </div>
                <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                    <div className="text-xs text-amber-600 font-medium mb-1">Equity Moved Out</div>
                    <div className={`${getFontSize(summary.totalEquityOut)} font-bold text-amber-700 tabular-nums`}>{CURRENCY} {formatRoundedNumber(summary.totalEquityOut)}</div>
                </div>
                <div className={`rounded-lg p-3 border ${summary.totalLoanNetBalance >= 0 ? 'bg-purple-50 border-purple-200' : 'bg-purple-100 border-purple-300'}`}>
                    <div className={`text-xs font-medium mb-1 ${summary.totalLoanNetBalance >= 0 ? 'text-purple-600' : 'text-purple-700'}`}>Loan Net Balance</div>
                    <div className={`${getFontSize(summary.totalLoanNetBalance)} font-bold tabular-nums ${summary.totalLoanNetBalance >= 0 ? 'text-purple-700' : 'text-purple-800'}`}>
                        {CURRENCY} {formatRoundedNumber(summary.totalLoanNetBalance)}
                    </div>
                </div>
                <div className={`rounded-lg p-3 border ${summary.totalNetBalance >= 0 ? 'bg-slate-100 border-slate-300' : 'bg-rose-100 border-rose-300'}`}>
                    <div className={`text-xs font-medium mb-1 ${summary.totalNetBalance >= 0 ? 'text-slate-600' : 'text-rose-600'}`}>Net Balance</div>
                    <div className={`${getFontSize(summary.totalNetBalance)} font-bold tabular-nums ${summary.totalNetBalance >= 0 ? 'text-slate-800' : 'text-rose-700'}`}>
                        {CURRENCY} {formatRoundedNumber(summary.totalNetBalance)}
                    </div>
                </div>
            </div>
            
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50">
                        <tr>
                            <th onClick={() => handleSort('name')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Project / Building / Loan <SortIcon column="name"/></th>
                            <th onClick={() => handleSort('income')} className="px-4 py-3 text-right font-semibold text-emerald-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Income <SortIcon column="income"/></th>
                            <th onClick={() => handleSort('expense')} className="px-4 py-3 text-right font-semibold text-rose-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Expense <SortIcon column="expense"/></th>
                            <th onClick={() => handleSort('investment')} className="px-4 py-3 text-right font-semibold text-blue-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Total Investment <SortIcon column="investment"/></th>
                            <th onClick={() => handleSort('equityOut')} className="px-4 py-3 text-right font-semibold text-amber-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Equity Moved Out <SortIcon column="equityOut"/></th>
                            <th onClick={() => handleSort('loanNetBalance')} className="px-4 py-3 text-right font-semibold text-purple-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Loan Net Balance <SortIcon column="loanNetBalance"/></th>
                            <th onClick={() => handleSort('netBalance')} className="px-4 py-3 text-right font-bold text-slate-700 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap bg-slate-100">Net Balance <SortIcon column="netBalance"/></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                        {reportData.map(row => (
                            <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-4 py-3 font-medium text-slate-800">
                                    {row.name}
                                    <span className={`ml-2 text-[10px] uppercase font-normal border px-1 rounded ${
                                        row.type === 'Project' ? 'text-slate-400' : 
                                        row.type === 'Building' ? 'text-emerald-400' : 
                                        'text-purple-400'
                                    }`}>{row.type}</span>
                                </td>
                                <td className="px-4 py-3 text-right text-emerald-600 tabular-nums">{CURRENCY} {formatRoundedNumber(row.income)}</td>
                                <td className="px-4 py-3 text-right text-rose-600 tabular-nums">{CURRENCY} {formatRoundedNumber(row.expense)}</td>
                                <td className="px-4 py-3 text-right text-blue-600 tabular-nums">{CURRENCY} {formatRoundedNumber(row.investment)}</td>
                                <td className="px-4 py-3 text-right text-amber-600 tabular-nums">{CURRENCY} {formatRoundedNumber(row.equityOut)}</td>
                                <td className={`px-4 py-3 text-right tabular-nums ${row.loanNetBalance >= 0 ? 'text-purple-600' : 'text-purple-700'}`}>
                                    {CURRENCY} {formatRoundedNumber(row.loanNetBalance)}
                                </td>
                                <td className={`px-4 py-3 text-right font-bold tabular-nums ${row.netBalance >= 0 ? 'text-slate-800 bg-slate-50' : 'text-rose-600 bg-rose-50'}`}>
                                    {CURRENCY} {formatRoundedNumber(row.netBalance)}
                                </td>
                            </tr>
                        ))}
                        {reportData.length === 0 && (
                            <tr>
                                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">No projects or buildings found.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </Card>
    );
};

export default ProjectBuildingFundsReport;
