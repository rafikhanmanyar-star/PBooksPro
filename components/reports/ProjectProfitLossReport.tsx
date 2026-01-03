
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { TransactionType } from '../../types';
import Card from '../ui/Card';
import { CURRENCY } from '../../constants';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import ReportToolbar, { ReportDateRange } from './ReportToolbar';
import ComboBox from '../ui/ComboBox';
import { formatDate } from '../../utils/dateUtils';
import ProjectTransactionModal from '../dashboard/ProjectTransactionModal';

interface ReportRow {
    id: string;
    categoryName: string;
    amount: number;
    percentage: number;
    level: number;
    type: 'group' | 'item';
}

interface PLData {
    incomeRows: ReportRow[];
    totalIncome: number;
    expenseRows: ReportRow[];
    totalExpense: number;
    netProfit: number;
}

const ProjectProfitLossReport: React.FC = () => {
    const { state } = useAppContext();
    
    // Default to 'This Month' or 'Till Today' as preferred
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
    
    // Drilldown State
    const [drilldownData, setDrilldownData] = useState<{
        isOpen: boolean;
        categoryId?: string;
        categoryName: string;
        type: TransactionType;
    } | null>(null);

    const projectItems = useMemo(() => [{ id: 'all', name: 'All Projects' }, ...state.projects], [state.projects]);

    const handleRangeChange = (type: ReportDateRange) => {
        setDateRange(type);
        const now = new Date();
        
        if (type === 'all') { // Treat 'all' as 'Till Today' for P&L often, or actual all time
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

    const reportData = useMemo<PLData>(() => {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        // Categories to exclude (Equity transactions aren't P&L)
        const excludedCats = new Set(state.categories.filter(c => c.name === 'Owner Equity' || c.name === 'Owner Withdrawn').map(c => c.id));
        
        // Categories to exclude (Rental categories should not be in Project P&L)
        const rentalCats = new Set(state.categories.filter(c => c.isRental).map(c => c.id));

        // 1. Aggregate Amounts by Category ID
        const categoryAmounts: Record<string, number> = {};
        let totalIncome = 0;
        let totalExpense = 0;

        // Track which bills have been processed to avoid double-counting
        const processedBills = new Set<string>();

        // 1. Process Bills directly (Accrual Basis - show expense when bill is created)
        state.bills.forEach(bill => {
            // Filter by project
            if (!bill.projectId) return;
            if (selectedProjectId !== 'all' && bill.projectId !== selectedProjectId) return;

            // Check date range using bill issue date
            const billDate = new Date(bill.issueDate);
            if (billDate < start || billDate > end) return;

            // Skip if bill has no expense categories
            if (!bill.expenseCategoryItems || bill.expenseCategoryItems.length === 0) {
                // Fallback to old categoryId if no expenseCategoryItems
                if (!bill.categoryId) return;
                const categoryId = bill.categoryId;
                if (excludedCats.has(categoryId) || rentalCats.has(categoryId)) return;
                
                const category = state.categories.find(c => c.id === categoryId);
                if (category && category.type === TransactionType.EXPENSE) {
                    categoryAmounts[categoryId] = (categoryAmounts[categoryId] || 0) + bill.amount;
                    totalExpense += bill.amount;
                }
                processedBills.add(bill.id);
                return;
            }

            // Process expenseCategoryItems - distribute full bill amount across categories
            const totalBillAmount = bill.expenseCategoryItems.reduce((sum, item) => sum + (item.netValue || 0), 0);
            if (totalBillAmount > 0) {
                bill.expenseCategoryItems.forEach(item => {
                    if (!item.categoryId) return;
                    const itemCategoryId = item.categoryId;
                    
                    // Exclude equity and rental categories
                    if (excludedCats.has(itemCategoryId) || rentalCats.has(itemCategoryId)) return;
                    
                    // Use the netValue from the expense category item (proportional amount)
                    const allocatedAmount = item.netValue || 0;
                    
                    const category = state.categories.find(c => c.id === itemCategoryId);
                    if (category && category.type === TransactionType.INCOME) {
                        // Expense category marked as income type (shouldn't happen, but handle it)
                        categoryAmounts[itemCategoryId] = (categoryAmounts[itemCategoryId] || 0) - allocatedAmount;
                        totalIncome -= allocatedAmount;
                    } else {
                        // Regular expense
                        categoryAmounts[itemCategoryId] = (categoryAmounts[itemCategoryId] || 0) + allocatedAmount;
                        totalExpense += allocatedAmount;
                    }
                });
                processedBills.add(bill.id);
            }
        });

        // 2. Process Transactions (for income and non-bill expenses)
        state.transactions.forEach(tx => {
            // Skip transactions that are payments for bills we've already processed
            if (tx.billId && processedBills.has(tx.billId)) {
                // This is a payment for a bill we already processed - skip to avoid double counting
                return;
            }

            let projectId = tx.projectId;
            let categoryId = tx.categoryId;

            // Resolve details from linked Invoice if fields missing
            if (tx.invoiceId) {
                const inv = state.invoices.find(i => i.id === tx.invoiceId);
                if (inv) {
                    if (!projectId) projectId = inv.projectId;
                    if (!categoryId) categoryId = inv.categoryId;
                }
            }
            
            // Resolve details from linked Bill if fields missing (for bills without expenseCategoryItems)
            if (tx.billId && !processedBills.has(tx.billId)) {
                const bill = state.bills.find(b => b.id === tx.billId);
                if (bill) {
                    if (!projectId) projectId = bill.projectId;
                    // Only use bill category if bill doesn't have expenseCategoryItems
                    if (!bill.expenseCategoryItems && !categoryId) {
                        categoryId = bill.categoryId;
                    }
                }
            }

            // Strictly exclude any transaction that is not linked to a project
            if (!projectId) return;
            
            if (selectedProjectId !== 'all' && projectId !== selectedProjectId) return;
            
            // Exclude Equity and Rental categories
            if (categoryId && (excludedCats.has(categoryId) || rentalCats.has(categoryId))) return;
            
            // Exclude transactions using Internal Clearing account (these are internal adjustments, not real P&L items)
            const clearingAccount = state.accounts.find(a => a.name === 'Internal Clearing');
            if (clearingAccount && tx.accountId === clearingAccount.id) {
                // Skip Internal Clearing transactions - they're internal adjustments
                return;
            }
            
            const date = new Date(tx.date);
            if (date < start || date > end) return;

            const catId = categoryId || 'uncategorized';
            
            if (tx.type === TransactionType.INCOME) {
                categoryAmounts[catId] = (categoryAmounts[catId] || 0) + tx.amount;
                totalIncome += tx.amount;
            } else if (tx.type === TransactionType.EXPENSE) {
                // For expenses, check if it's reducing income (expense with income category)
                // This should reduce income, not add to expenses
                const category = categoryId ? state.categories.find(c => c.id === categoryId) : null;
                if (category && category.type === TransactionType.INCOME) {
                    // This is an expense that reduces income (like refund reduction)
                    // Subtract from income instead of adding to expenses
                    categoryAmounts[catId] = (categoryAmounts[catId] || 0) - tx.amount;
                    totalIncome -= tx.amount;
                } else {
                    // Regular expense - add to expenses
                    categoryAmounts[catId] = (categoryAmounts[catId] || 0) + tx.amount;
                    totalExpense += tx.amount;
                }
            }
        });

        // Helper to build hierarchical rows
        const buildHierarchy = (type: TransactionType): ReportRow[] => {
            // Filter out rental categories from the hierarchy display
            const relevantCategories = state.categories.filter(c => c.type === type && !c.isRental);
            const rows: ReportRow[] = [];
            
            // Recursive function to get total amount for a category and its children
            const getCategoryTotal = (catId: string): number => {
                let total = categoryAmounts[catId] || 0;
                const children = relevantCategories.filter(c => c.parentCategoryId === catId);
                children.forEach(child => {
                    total += getCategoryTotal(child.id);
                });
                return total;
            };

            const processCategory = (cat: any, level: number) => {
                const amount = getCategoryTotal(cat.id);
                if (amount === 0) return; // Skip empty categories

                const totalForType = type === TransactionType.INCOME ? totalIncome : totalExpense;
                
                rows.push({
                    id: cat.id,
                    categoryName: cat.name,
                    amount: amount,
                    percentage: totalForType > 0 ? (amount / totalForType) * 100 : 0,
                    level: level,
                    type: relevantCategories.some(c => c.parentCategoryId === cat.id) ? 'group' : 'item'
                });

                // Process children
                const children = relevantCategories
                    .filter(c => c.parentCategoryId === cat.id)
                    .sort((a, b) => a.name.localeCompare(b.name));
                
                children.forEach(child => processCategory(child, level + 1));
            };

            // Process root categories
            const rootCategories = relevantCategories
                .filter(c => !c.parentCategoryId)
                .sort((a, b) => a.name.localeCompare(b.name));

            rootCategories.forEach(cat => processCategory(cat, 0));
            
            // Handle uncategorized if any
            if (categoryAmounts['uncategorized'] > 0) {
                const amount = categoryAmounts['uncategorized'];
                const totalForType = type === TransactionType.INCOME ? totalIncome : totalExpense;
                 rows.push({
                    id: 'uncategorized',
                    categoryName: 'Uncategorized',
                    amount: amount,
                    percentage: totalForType > 0 ? (amount / totalForType) * 100 : 0,
                    level: 0,
                    type: 'item'
                });
            }
            
            return rows;
        };

        const incomeRows = buildHierarchy(TransactionType.INCOME);
        const expenseRows = buildHierarchy(TransactionType.EXPENSE);

        return {
            incomeRows,
            totalIncome,
            expenseRows,
            totalExpense,
            netProfit: totalIncome - totalExpense
        };

    }, [state, startDate, endDate, selectedProjectId]);

    const handleExport = () => {
        const formatRows = (rows: ReportRow[]) => rows.map(r => ({
            Category: '  '.repeat(r.level) + r.categoryName,
            Amount: r.amount,
            '%': `${r.percentage.toFixed(1)}%`
        }));
        
        const data = [
            { Category: 'INCOME', Amount: '', '%': '' },
            ...formatRows(reportData.incomeRows),
            { Category: 'TOTAL INCOME', Amount: reportData.totalIncome, '%': '' },
            {},
            { Category: 'EXPENSES', Amount: '', '%': '' },
            ...formatRows(reportData.expenseRows),
            { Category: 'TOTAL EXPENSES', Amount: reportData.totalExpense, '%': '' },
            {},
            { Category: 'NET PROFIT', Amount: reportData.netProfit, '%': '' }
        ];
        
        exportJsonToExcel(data, 'profit-loss-report.xlsx', 'P&L');
    };
    
    const handleDrilldown = (categoryId: string | undefined, categoryName: string, type: TransactionType) => {
        setDrilldownData({
            isOpen: true,
            categoryId,
            categoryName,
            type
        });
    };

    const renderTableSection = (title: string, rows: ReportRow[], total: number, colorClass: string, type: TransactionType) => (
        <div className="mb-8">
            <h4 className={`text-lg font-bold ${colorClass} border-b-2 border-slate-100 pb-2 mb-4 uppercase tracking-wide`}>{title}</h4>
            <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 uppercase font-semibold">
                    <tr>
                        <th className="py-2 px-2 text-left">Category</th>
                        <th className="py-2 px-2 text-right">Amount</th>
                        <th className="py-2 px-2 text-right w-20">%</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr 
                            key={row.id} 
                            className="border-b border-slate-50 hover:bg-slate-100/80 transition-colors cursor-pointer"
                            onClick={() => handleDrilldown(row.id, row.categoryName, type)}
                            title="Click to view details"
                        >
                            <td className="py-2 px-2 text-slate-700">
                                <div style={{ paddingLeft: `${row.level * 1.5}rem` }} className="flex items-center">
                                    {row.level > 0 && <span className="text-slate-300 mr-2">└</span>}
                                    <span className={row.type === 'group' ? 'font-semibold text-slate-800' : ''}>{row.categoryName}</span>
                                </div>
                            </td>
                            <td className="py-2 px-2 text-right font-medium text-slate-700 tabular-nums">
                                {CURRENCY} {row.amount.toLocaleString()}
                            </td>
                            <td className="py-2 px-2 text-right text-slate-400 text-xs tabular-nums">
                                {row.percentage.toFixed(1)}%
                            </td>
                        </tr>
                    ))}
                    {rows.length === 0 && (
                        <tr><td colSpan={3} className="text-center py-4 text-slate-400 italic">No records found</td></tr>
                    )}
                    <tr 
                        className="bg-slate-50 font-bold cursor-pointer hover:bg-slate-100 transition-colors"
                        onClick={() => handleDrilldown(undefined, `Total ${title}`, type)}
                        title="Click to view all"
                    >
                        <td className="py-3 px-2 text-slate-800 uppercase text-xs tracking-wider">Total {title}</td>
                        <td className={`py-3 px-2 text-right ${colorClass} text-sm tabular-nums`}>{CURRENCY} {(total || 0).toLocaleString()}</td>
                        <td></td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
    
    const projectLabel = selectedProjectId === 'all' ? 'All Projects' : state.projects.find(p => p.id === selectedProjectId)?.name;

    return (
        <div className="flex flex-col h-full space-y-4">
            <div className="flex-shrink-0">
                <ReportToolbar
                    startDate={startDate}
                    endDate={endDate}
                    onDateChange={handleDateChange}
                    onExport={handleExport}
                    onPrint={() => window.print()}
                    hideGroup={true}
                    showDateFilterPills={true}
                    activeDateRange={dateRange}
                    onRangeChange={handleRangeChange}
                    hideSearch={true}
                >
                    <div className="w-40 sm:w-48 flex-shrink-0">
                        <ComboBox 
                            items={projectItems} 
                            selectedId={selectedProjectId} 
                            onSelect={(item) => setSelectedProjectId(item?.id || 'all')} 
                            allowAddNew={false}
                            placeholder="Select Project"
                        />
                    </div>
                </ReportToolbar>
            </div>
            <div className="flex-grow overflow-y-auto printable-area min-h-0">
                <Card className="min-h-full">
                    <ReportHeader />
                    <h3 className="text-2xl font-bold text-center mb-2 text-slate-800">Profit & Loss Statement</h3>
                    <p className="text-center text-slate-500 mb-8 text-sm">
                        {projectLabel} <br/>
                        {formatDate(startDate)} - {formatDate(endDate)}
                    </p>
                    
                    <div className="max-w-4xl mx-auto bg-white p-4 md:p-8 rounded-xl border border-slate-200 shadow-sm">
                        {renderTableSection('Income', reportData.incomeRows, reportData.totalIncome, 'text-emerald-700', TransactionType.INCOME)}
                        {renderTableSection('Expenses', reportData.expenseRows, reportData.totalExpense, 'text-rose-700', TransactionType.EXPENSE)}

                        {/* NET PROFIT */}
                        <div className="bg-slate-800 text-white p-6 rounded-lg text-center mt-8 shadow-lg">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Net Profit / (Loss)</p>
                            <p className={`text-3xl font-bold tabular-nums ${reportData.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {CURRENCY} {(reportData.netProfit || 0).toLocaleString()}
                            </p>
                        </div>
                    </div>
                    
                    <ReportFooter />
                </Card>
            </div>

            {/* Drilldown Modal */}
            <ProjectTransactionModal
                isOpen={!!drilldownData?.isOpen}
                onClose={() => setDrilldownData(null)}
                data={drilldownData ? {
                    projectId: selectedProjectId,
                    projectName: projectLabel || 'All Projects',
                    categoryId: drilldownData.categoryId, // undefined means "All" for that type
                    categoryName: drilldownData.categoryName,
                    type: drilldownData.type === TransactionType.INCOME ? 'Income' : 'Expense',
                    startDate: startDate,
                    endDate: endDate
                } : null}
            />
        </div>
    );
};

export default ProjectProfitLossReport;
