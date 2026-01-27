
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { TransactionType } from '../../types';
import Select from '../ui/Select';
import { CURRENCY } from '../../constants';
import Card from '../ui/Card';
import Button from '../ui/Button';

type SortKey = 'categoryName' | 'budgeted' | 'totalSpent' | 'variance' | 'percentUsed';

const ProjectBudgetReport: React.FC = () => {
    const { state } = useAppContext();
    const [selectedProjectId, setSelectedProjectId] = useState<string>(state.defaultProjectId || '');
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'budgeted', direction: 'desc' });
    
    // Get selected project
    const selectedProject = useMemo(() => {
        return state.projects.find(p => p.id === selectedProjectId);
    }, [state.projects, selectedProjectId]);
    
    // Get expense categories
    const expenseCategories = useMemo(() => {
        return state.categories.filter(c => c.type === TransactionType.EXPENSE);
    }, [state.categories]);
    
    // Get budgets for selected project
    const projectBudgets = useMemo(() => {
        if (!selectedProjectId) return [];
        return state.budgets.filter(b => b.projectId === selectedProjectId);
    }, [state.budgets, selectedProjectId]);
    
    // Get all transactions for the project (ALL TIME - no date filtering)
    const projectTransactions = useMemo(() => {
        if (!selectedProjectId) return [];
        
        const filtered = state.transactions.filter(tx => {
            if (tx.type !== TransactionType.EXPENSE) return false;
            
            // Resolve projectId from linked entities (same logic as working reports)
            let projectId = tx.projectId;
            let categoryId = tx.categoryId;
            let hasExpenseCategoryItems = false;
            
            // Resolve from linked Bill if missing
            if (tx.billId) {
                const bill = state.bills.find(b => b.id === tx.billId);
                if (bill) {
                    if (!projectId) projectId = bill.projectId;
                    if (!categoryId) categoryId = bill.categoryId;
                    // Check if bill has expenseCategoryItems (these transactions should be included even without categoryId)
                    if (bill.expenseCategoryItems && bill.expenseCategoryItems.length > 0) {
                        hasExpenseCategoryItems = true;
                    }
                }
            }
            
            // Resolve from linked Invoice if missing
            if (tx.invoiceId) {
                const inv = state.invoices.find(i => i.id === tx.invoiceId);
                if (inv) {
                    if (!projectId) projectId = inv.projectId;
                    if (!categoryId) categoryId = inv.categoryId;
                }
            }
            
            // Include transaction if it matches the project AND either has a categoryId OR is linked to a bill with expenseCategoryItems
            return projectId === selectedProjectId && (!!categoryId || hasExpenseCategoryItems);
        });
        
        console.log(`📊 Budget Report: Found ${filtered.length} expense transactions for project ${selectedProjectId}`);
        if (filtered.length > 0) {
            const dates = filtered.map(tx => tx.date).sort();
            console.log(`   Date range: ${dates[0]} to ${dates[dates.length - 1]}`);
            console.log(`   Total amount: ${filtered.reduce((sum, tx) => sum + Number(tx.amount), 0).toLocaleString()}`);
        }
        
        return filtered;
    }, [state.transactions, state.bills, state.invoices, selectedProjectId]);
    
    // Calculate monthly spending data
    const monthlyData = useMemo(() => {
        if (!selectedProjectId) return [];
        
        // Group transactions by month
        const monthlySpending = new Map<string, Map<string, number>>();
        
        projectTransactions.forEach(tx => {
            const month = tx.date.slice(0, 7); // YYYY-MM
            if (!monthlySpending.has(month)) {
                monthlySpending.set(month, new Map());
            }
            const categoryMap = monthlySpending.get(month)!;
            const current = categoryMap.get(tx.categoryId!) || 0;
            categoryMap.set(tx.categoryId!, current + Number(tx.amount));
        });
        
        // Sort months
        const sortedMonths = Array.from(monthlySpending.keys()).sort();
        
        return sortedMonths.map(month => {
            const categorySpending = monthlySpending.get(month)!;
            const monthTotal = Array.from(categorySpending.values()).reduce((sum, val) => sum + val, 0);
            
            return {
                month,
                categorySpending,
                total: monthTotal,
            };
        });
    }, [projectTransactions, selectedProjectId]);
    
    // Calculate category-wise data
    const categoryData = useMemo(() => {
        const data: Array<{
            categoryId: string;
            categoryName: string;
            budgeted: number;
            totalSpent: number;
            variance: number;
            variancePercent: number;
            monthlySpending: Map<string, number>;
            status: 'under' | 'over' | 'ontrack';
            percentUsed: number;
        }> = [];
        
        // Get all categories that have either a budget or spending
        const allCategoryIds = new Set<string>();
        projectBudgets.forEach(b => allCategoryIds.add(b.categoryId));
        projectTransactions.forEach(tx => {
            if (tx.categoryId) allCategoryIds.add(tx.categoryId);
            // Also collect categories from linked bills with expenseCategoryItems
            if (tx.billId) {
                const bill = state.bills.find(b => b.id === tx.billId);
                if (bill && bill.expenseCategoryItems) {
                    bill.expenseCategoryItems.forEach(item => {
                        if (item.categoryId) allCategoryIds.add(item.categoryId);
                    });
                }
            }
        });
        
        allCategoryIds.forEach(categoryId => {
            const category = expenseCategories.find(c => c.id === categoryId);
            if (!category) return;
            
            const budget = projectBudgets.find(b => b.categoryId === categoryId);
            const budgeted = budget?.amount || 0;
            
            // Calculate total spent and monthly breakdown
            const monthlySpending = new Map<string, number>();
            let totalSpent = 0;
            
            projectTransactions.forEach(tx => {
                // Resolve categoryId from linked entities
                let txCategoryId = tx.categoryId;
                
                // Always check bill first if billId exists (bills with expenseCategoryItems should be processed differently)
                if (tx.billId) {
                    const bill = state.bills.find(b => b.id === tx.billId);
                    if (bill) {
                        // Handle expenseCategoryItems: if bill has multiple categories, distribute transaction amount proportionally
                        if (bill.expenseCategoryItems && bill.expenseCategoryItems.length > 0) {
                            const totalBillAmount = bill.expenseCategoryItems.reduce((sum, item) => sum + (item.netValue || 0), 0);
                            if (totalBillAmount > 0) {
                                // Check if this category is in the bill's expenseCategoryItems
                                const matchingItem = bill.expenseCategoryItems.find(item => item.categoryId === categoryId);
                                if (matchingItem) {
                                    const proportion = (matchingItem.netValue || 0) / totalBillAmount;
                                    const allocatedAmount = tx.amount * proportion;
                                    const month = tx.date.slice(0, 7);
                                    const current = monthlySpending.get(month) || 0;
                                    monthlySpending.set(month, current + allocatedAmount);
                                    totalSpent += allocatedAmount;
                                }
                            }
                            return; // Skip single category processing for this transaction
                        } else if (!txCategoryId) {
                            // Only use bill.categoryId if transaction doesn't have categoryId
                            txCategoryId = bill.categoryId;
                        }
                    }
                }
                
                if (!txCategoryId && tx.invoiceId) {
                    const inv = state.invoices.find(i => i.id === tx.invoiceId);
                    if (inv) txCategoryId = inv.categoryId;
                }
                
                if (txCategoryId === categoryId) {
                    const month = tx.date.slice(0, 7);
                    const current = monthlySpending.get(month) || 0;
                    monthlySpending.set(month, current + Number(tx.amount));
                    totalSpent += Number(tx.amount);
                }
            });
            
            const variance = budgeted - totalSpent;
            const variancePercent = budgeted > 0 ? (variance / budgeted) * 100 : 0;
            const percentUsed = budgeted > 0 ? (totalSpent / budgeted) * 100 : 0;
            
            let status: 'under' | 'over' | 'ontrack' = 'ontrack';
            if (budgeted > 0) {
                if (totalSpent > budgeted) status = 'over';
                else if (totalSpent < budgeted * 0.9) status = 'under';
            }
            
            data.push({
                categoryId,
                categoryName: category.name,
                budgeted,
                totalSpent,
                variance,
                variancePercent,
                monthlySpending,
                status,
                percentUsed,
            });
        });
        
        // Apply sorting
        const sorted = [...data].sort((a, b) => {
            let aVal: number | string;
            let bVal: number | string;
            
            switch (sortConfig.key) {
                case 'categoryName':
                    aVal = a.categoryName.toLowerCase();
                    bVal = b.categoryName.toLowerCase();
                    break;
                case 'budgeted':
                    aVal = a.budgeted;
                    bVal = b.budgeted;
                    break;
                case 'totalSpent':
                    aVal = a.totalSpent;
                    bVal = b.totalSpent;
                    break;
                case 'variance':
                    aVal = a.variance;
                    bVal = b.variance;
                    break;
                case 'percentUsed':
                    aVal = a.percentUsed;
                    bVal = b.percentUsed;
                    break;
                default:
                    aVal = a.budgeted;
                    bVal = b.budgeted;
            }
            
            if (typeof aVal === 'string' && typeof bVal === 'string') {
                return sortConfig.direction === 'asc' 
                    ? aVal.localeCompare(bVal)
                    : bVal.localeCompare(aVal);
            } else {
                return sortConfig.direction === 'asc'
                    ? (aVal as number) - (bVal as number)
                    : (bVal as number) - (aVal as number);
            }
        });
        
        return sorted;
    }, [projectBudgets, projectTransactions, expenseCategories, state.bills, state.invoices, sortConfig]);
    
    // Calculate totals
    const totals = useMemo(() => {
        const totalBudgeted = categoryData.reduce((sum, item) => sum + item.budgeted, 0);
        const totalSpent = categoryData.reduce((sum, item) => sum + item.totalSpent, 0);
        const totalVariance = totalBudgeted - totalSpent;
        const totalVariancePercent = totalBudgeted > 0 ? (totalVariance / totalBudgeted) * 100 : 0;
        
        return { totalBudgeted, totalSpent, totalVariance, totalVariancePercent };
    }, [categoryData]);
    
    // Get all unique months from the data
    const allMonths = useMemo(() => {
        return monthlyData.map(m => m.month).sort();
    }, [monthlyData]);
    
    const handlePrint = () => {
        window.print();
    };
    
    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };
    
    const SortIcon = ({ column }: { column: SortKey }) => (
        <span className="ml-1 text-[10px] text-slate-400">
            {sortConfig.key === column ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
    );
    
    if (!selectedProjectId) {
        return (
            <Card>
                <div className="text-center py-12">
                    <p className="text-slate-500 mb-4">Please select a project to view the budget report</p>
                    <Select
                        value={selectedProjectId}
                        onChange={(e) => setSelectedProjectId(e.target.value)}
                        className="max-w-md mx-auto"
                    >
                        <option value="">Select Project...</option>
                        {state.projects.map(project => (
                            <option key={project.id} value={project.id}>
                                {project.name}
                            </option>
                        ))}
                    </Select>
                </div>
            </Card>
        );
    }
    
    return (
        <div className="space-y-2">
            {/* Header with title and controls */}
            <div className="no-print flex flex-col sm:flex-row justify-between items-center gap-3 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                <div className="flex-1">
                    <h1 className="text-xl font-bold text-slate-800">Budget vs Actual Spending Report</h1>
                    <div className="mt-0.5 text-xs text-slate-600">
                        <span className="font-medium">{selectedProject?.name}</span>
                        <span className="text-slate-400 ml-2">• All Time</span>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="w-48">
                        <Select
                            value={selectedProjectId}
                            onChange={(e) => setSelectedProjectId(e.target.value)}
                        >
                            <option value="">Select Project...</option>
                            {state.projects.map(project => (
                                <option key={project.id} value={project.id}>
                                    {project.name}
                                </option>
                            ))}
                        </Select>
                    </div>
                    <Button onClick={handlePrint} variant="outline" size="sm">
                        Print Report
                    </Button>
                </div>
            </div>
            
            {/* Report Content */}
            <Card>
                {/* Print-only title */}
                <div className="hidden print:block text-center border-b border-slate-200 pb-2 mb-2">
                    <h1 className="text-lg font-bold text-slate-800">Budget vs Actual Spending Report</h1>
                    <div className="mt-1 text-xs text-slate-600">
                        <span className="font-medium">{selectedProject?.name}</span>
                        <span className="text-slate-400 ml-2">• All Time</span>
                    </div>
                </div>
                
                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
                    <div className="bg-blue-50 p-2 rounded border border-blue-100">
                        <p className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">Total Budgeted</p>
                        <p className="text-base font-bold text-blue-900 mt-0.5">{CURRENCY} {totals.totalBudgeted.toLocaleString()}</p>
                    </div>
                    
                    <div className="bg-purple-50 p-2 rounded border border-purple-100">
                        <p className="text-[10px] text-purple-600 font-bold uppercase tracking-wider">Total Spent</p>
                        <p className="text-base font-bold text-purple-900 mt-0.5">{CURRENCY} {totals.totalSpent.toLocaleString()}</p>
                        {projectTransactions.length > 0 && (
                            <p className="text-[10px] text-purple-600 mt-0.5">
                                {projectTransactions.length} txns
                            </p>
                        )}
                    </div>
                    
                    <div className={`p-2 rounded border ${totals.totalVariance >= 0 ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                        <p className={`text-[10px] font-bold uppercase tracking-wider ${totals.totalVariance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            Remaining
                        </p>
                        <p className={`text-base font-bold mt-0.5 ${totals.totalVariance >= 0 ? 'text-green-900' : 'text-red-900'}`}>
                            {CURRENCY} {Math.abs(totals.totalVariance).toLocaleString()}
                        </p>
                    </div>
                    
                    <div className={`p-2 rounded border ${totals.totalVariance >= 0 ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                        <p className={`text-[10px] font-bold uppercase tracking-wider ${totals.totalVariance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            Budget Used
                        </p>
                        <p className={`text-base font-bold mt-0.5 ${totals.totalVariance >= 0 ? 'text-green-900' : 'text-red-900'}`}>
                            {totals.totalBudgeted > 0 ? ((totals.totalSpent / totals.totalBudgeted) * 100).toFixed(1) : '0'}%
                        </p>
                    </div>
                </div>
                
                {/* Data Summary */}
                {projectTransactions.length > 0 && (
                    <div className="bg-slate-50 px-2 py-0.5 rounded mb-1.5 text-xs">
                        <p className="text-slate-700">
                            <strong>Includes:</strong> {projectTransactions.length} transactions • {allMonths.length} months • {categoryData.length} categor{categoryData.length !== 1 ? 'ies' : 'y'}
                        </p>
                    </div>
                )}
                
                {/* Monthly Spending Table */}
                {categoryData.length > 0 ? (
                    <div className="relative border border-slate-200 rounded-lg overflow-hidden">
                        <style>{`
                            .budget-report-scroll::-webkit-scrollbar {
                                height: 14px;
                                width: 14px;
                            }
                            .budget-report-scroll::-webkit-scrollbar-track {
                                background: #f1f5f9;
                                border-radius: 7px;
                            }
                            .budget-report-scroll::-webkit-scrollbar-thumb {
                                background: #94a3b8;
                                border-radius: 7px;
                                border: 2px solid #f1f5f9;
                            }
                            .budget-report-scroll::-webkit-scrollbar-thumb:hover {
                                background: #64748b;
                            }
                            .budget-report-scroll::-webkit-scrollbar-corner {
                                background: #f1f5f9;
                            }
                        `}</style>
                        <div 
                            className="budget-report-scroll overflow-x-auto overflow-y-auto max-h-[calc(100vh-420px)] pb-4"
                            style={{ 
                                scrollbarWidth: 'thin',
                                scrollbarColor: '#94a3b8 #f1f5f9'
                            }}
                        >
                            <table className="text-sm" style={{ width: 'max-content', minWidth: '100%' }}>
                                <thead className="sticky top-0 z-20">
                                    <tr className="bg-slate-50 border-b border-slate-200">
                                        <th onClick={() => handleSort('categoryName')} className="text-left py-1.5 px-2 text-xs font-bold text-slate-700 sticky left-0 bg-slate-50 z-30 border-r border-slate-200 shadow-sm min-w-[150px] cursor-pointer hover:bg-slate-100 select-none">Category <SortIcon column="categoryName"/></th>
                                        <th onClick={() => handleSort('budgeted')} className="text-right py-1.5 px-2 text-xs font-bold text-slate-700 bg-slate-50 min-w-[90px] cursor-pointer hover:bg-slate-100 select-none">Budget <SortIcon column="budgeted"/></th>
                                        <th onClick={() => handleSort('totalSpent')} className="text-right py-1.5 px-2 text-xs font-bold text-slate-700 bg-slate-50 min-w-[90px] cursor-pointer hover:bg-slate-100 select-none">Spent <SortIcon column="totalSpent"/></th>
                                        <th onClick={() => handleSort('variance')} className="text-right py-1.5 px-2 text-xs font-bold text-slate-700 bg-slate-50 min-w-[90px] cursor-pointer hover:bg-slate-100 select-none">Remaining <SortIcon column="variance"/></th>
                                        <th onClick={() => handleSort('percentUsed')} className="text-right py-1.5 px-2 text-xs font-bold text-slate-700 bg-slate-50 min-w-[70px] cursor-pointer hover:bg-slate-100 select-none">% Used <SortIcon column="percentUsed"/></th>
                                        {allMonths.map(month => (
                                            <th key={month} className="text-right py-1.5 px-2 text-xs font-bold text-slate-700 whitespace-nowrap bg-slate-50 min-w-[80px]">
                                                {new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
                                                <br />
                                                <span className="text-[10px] font-normal text-slate-500">Amt (%)</span>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                {categoryData.map((item, index) => {
                                    return (
                                        <tr key={item.categoryId} className={`border-b border-slate-100 hover:bg-slate-50 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-100'}`}>
                                            <td className="py-1.5 px-2 sticky left-0 z-10 border-r border-slate-200 shadow-sm bg-inherit min-w-[150px]">
                                                <p className="text-xs font-semibold text-slate-800">{item.categoryName}</p>
                                                {item.budgeted > 0 && (
                                                    <div className="mt-0.5 w-full bg-slate-200 rounded-full h-1 max-w-xs">
                                                        <div
                                                            className={`h-1 rounded-full transition-all ${
                                                                item.status === 'over' ? 'bg-red-500' : 
                                                                item.status === 'under' ? 'bg-yellow-500' : 
                                                                'bg-green-500'
                                                            }`}
                                                            style={{ width: `${Math.min((item.totalSpent / item.budgeted) * 100, 100)}%` }}
                                                        ></div>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="text-right py-1.5 px-2 text-xs font-medium text-slate-700 min-w-[90px]">
                                                {CURRENCY} {item.budgeted.toLocaleString()}
                                            </td>
                                            <td className="text-right py-1.5 px-2 text-xs font-medium text-slate-700 min-w-[90px]">
                                                {CURRENCY} {item.totalSpent.toLocaleString()}
                                            </td>
                                            <td className={`text-right py-1.5 px-2 text-xs font-bold min-w-[90px] ${item.variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {CURRENCY} {Math.abs(item.variance).toLocaleString()}
                                            </td>
                                            <td className={`text-right py-1.5 px-2 text-xs font-bold min-w-[70px] ${item.totalSpent > item.budgeted ? 'text-red-600' : 'text-slate-700'}`}>
                                                {item.budgeted > 0 ? ((item.totalSpent / item.budgeted) * 100).toFixed(1) : '0'}%
                                            </td>
                                            {allMonths.map(month => {
                                                const monthSpent = item.monthlySpending.get(month) || 0;
                                                const percentOfBudget = item.budgeted > 0 ? (monthSpent / item.budgeted) * 100 : 0;
                                                
                                                return (
                                                    <td key={month} className="text-right py-1.5 px-2 whitespace-nowrap min-w-[80px]">
                                                        {monthSpent > 0 ? (
                                                            <>
                                                                <span className="text-xs font-medium text-slate-700">{CURRENCY} {monthSpent.toLocaleString()}</span>
                                                                <br />
                                                                <span className={`text-[10px] font-semibold ${percentOfBudget > 20 ? 'text-rose-600' : 'text-slate-500'}`}>
                                                                    ({percentOfBudget.toFixed(1)}%)
                                                                </span>
                                                            </>
                                                        ) : (
                                                            <span className="text-xs text-slate-400">-</span>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                                
                                {/* Totals Row */}
                                <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold">
                                    <td className="py-1.5 px-2 text-xs text-slate-900 sticky left-0 bg-slate-100 z-10 border-r border-slate-200 shadow-sm min-w-[150px]">TOTAL</td>
                                    <td className="text-right py-1.5 px-2 text-xs text-slate-900 min-w-[90px]">
                                        {CURRENCY} {totals.totalBudgeted.toLocaleString()}
                                    </td>
                                    <td className="text-right py-1.5 px-2 text-xs text-slate-900 min-w-[90px]">
                                        {CURRENCY} {totals.totalSpent.toLocaleString()}
                                    </td>
                                    <td className={`text-right py-1.5 px-2 text-xs min-w-[90px] ${totals.totalVariance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {CURRENCY} {Math.abs(totals.totalVariance).toLocaleString()}
                                    </td>
                                    <td className={`text-right py-1.5 px-2 text-xs min-w-[70px] ${totals.totalSpent > totals.totalBudgeted ? 'text-red-600' : 'text-slate-900'}`}>
                                        {totals.totalBudgeted > 0 ? ((totals.totalSpent / totals.totalBudgeted) * 100).toFixed(1) : '0'}%
                                    </td>
                                    {allMonths.map(month => {
                                        const monthData = monthlyData.find(m => m.month === month);
                                        const monthTotal = monthData?.total || 0;
                                        const percentOfBudget = totals.totalBudgeted > 0 ? (monthTotal / totals.totalBudgeted) * 100 : 0;
                                        
                                        return (
                                            <td key={month} className="text-right py-1.5 px-2 whitespace-nowrap min-w-[80px]">
                                                {monthTotal > 0 ? (
                                                    <>
                                                        <span className="text-xs text-slate-900">{CURRENCY} {monthTotal.toLocaleString()}</span>
                                                        <br />
                                                        <span className="text-[10px] font-semibold text-slate-700">
                                                            ({percentOfBudget.toFixed(1)}%)
                                                        </span>
                                                    </>
                                                ) : (
                                                    <span className="text-xs text-slate-400">-</span>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            </tbody>
                        </table>
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-8">
                        <p className="text-slate-500">No budget data available for this project.</p>
                        <p className="text-sm text-slate-400 mt-2">Set budgets in the Configuration → Budget Management section.</p>
                    </div>
                )}
            </Card>
        </div>
    );
};

export default ProjectBudgetReport;
