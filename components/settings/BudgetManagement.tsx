
import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Category, TransactionType, Budget } from '../../types';
import Input from '../ui/Input';
import Select from '../ui/Select';
import { CURRENCY, ICONS } from '../../constants';

const BudgetRow: React.FC<{
    category: Category;
    budget: Budget | undefined;
    totalSpent: number;
    projectId?: string;
}> = ({ category, budget, totalSpent, projectId }) => {
    const { dispatch } = useAppContext();
    const [amount, setAmount] = useState(budget?.amount?.toString() || '');

    useEffect(() => {
        setAmount(budget?.amount?.toString() || '');
    }, [budget]);

    const handleBlur = () => {
        // Require projectId to create or update budgets
        if (!projectId) return;

        const numericAmount = parseFloat(amount) || 0;
        const id = `${category.id}-${projectId}`;

        if (budget) { // Budget exists, update it
            if (numericAmount > 0) {
                if (numericAmount !== budget.amount) {
                    dispatch({ type: 'UPDATE_BUDGET', payload: { ...budget, amount: numericAmount, projectId } });
                }
            } else {
                // If user clears the input, effectively deleting the budget
                dispatch({ type: 'DELETE_BUDGET', payload: id });
            }
        } else if (numericAmount > 0) { // No budget, create one
            const newBudget: Budget = {
                id,
                categoryId: category.id,
                amount: numericAmount,
                projectId, // Required - budgets are now project-specific
            };
            dispatch({ type: 'ADD_BUDGET', payload: newBudget });
        }
    };

    const budgetAmount = budget?.amount || 0;
    const progress = budgetAmount > 0 ? (totalSpent / budgetAmount) * 100 : 0;
    const isOverBudget = totalSpent > budgetAmount && budgetAmount > 0;
    const remaining = budgetAmount - totalSpent;

    return (
        <div className="group flex flex-col sm:grid sm:grid-cols-12 gap-3 items-center py-2 px-4 bg-white border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-all duration-200">
            {/* Category Info */}
            <div className="sm:col-span-4 w-full">
                <div className="flex items-center gap-2">
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-50 to-slate-50 border border-slate-100 flex items-center justify-center text-indigo-600 shadow-sm">
                        <span className="font-bold text-sm">{category.name.charAt(0)}</span>
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate leading-tight">{category.name}</p>
                        {category.description ? (
                            <p className="text-[10px] text-slate-500 truncate max-w-[200px] leading-tight" title={category.description}>{category.description}</p>
                        ) : (
                            <p className="text-[10px] text-slate-400 italic leading-tight">No description</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Budget Input */}
            <div className="sm:col-span-3 w-full">
                <label className="block text-[10px] font-semibold text-slate-500 mb-0.5 sm:hidden">Budget Goal</label>
                <div className="relative group/input">
                    <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-500 font-medium text-xs">
                        {CURRENCY}
                    </div>
                    <input
                        type="text"
                        inputMode="decimal"
                        className={`block w-full pl-8 pr-3 py-1.5 text-sm font-medium rounded-md border border-slate-200 bg-white focus:ring-1 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all text-right shadow-sm
                            ${!projectId ? 'cursor-not-allowed bg-slate-50 text-slate-400' : 'text-slate-800 group-hover:border-indigo-200'}`}
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        onBlur={handleBlur}
                        placeholder="0.00"
                        disabled={!projectId}
                    />
                </div>
            </div>

            {/* Progress & Stats */}
            <div className="sm:col-span-5 w-full">
                <div className="flex justify-between items-end mb-1">
                    <div className="text-[10px] flex flex-col">
                        <span className="text-slate-400 font-medium uppercase tracking-wider">Spent</span>
                        <span className="font-bold text-slate-700">{CURRENCY} {totalSpent.toLocaleString()}</span>
                    </div>
                    <div className="text-right flex flex-col">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${remaining >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {remaining >= 0 ? 'Remaining' : 'Over'}
                        </span>
                        <span className={`text-xs font-bold ${remaining >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {remaining < 0 && '- '}{CURRENCY} {Math.abs(remaining).toLocaleString()}
                        </span>
                    </div>
                </div>
                <div className="relative h-1.5 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner">
                    <div
                        className={`h-full rounded-full transition-all duration-700 ease-out ${isOverBudget ? 'bg-gradient-to-r from-rose-400 to-rose-600' : 'bg-gradient-to-r from-emerald-400 to-emerald-500'}`}
                        style={{ width: `${Math.min(progress, 100)}%` }}
                    />
                </div>
            </div>
        </div>
    );
};

type SortField = 'category' | 'budget' | 'spent' | 'remaining' | 'progress';
type SortDirection = 'asc' | 'desc';

const BudgetManagement: React.FC = () => {
    const { state } = useAppContext();
    const [selectedProjectId, setSelectedProjectId] = useState<string>(state.defaultProjectId || '');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [sortField, setSortField] = useState<SortField>('category');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    const expenseCategories = useMemo(() => state.categories.filter(c => c.type === TransactionType.EXPENSE), [state.categories]);

    const totalSpending = useMemo(() => {
        const spendingMap = new Map<string, number>();

        // If no project is selected, return empty map
        if (!selectedProjectId) {
            return spendingMap;
        }

        console.log(`💰 Budget Planner: Calculating spending for project "${selectedProjectId}"`);

        state.transactions.forEach(tx => {
            if (tx.type !== TransactionType.EXPENSE) return;

            // Resolve projectId from linked entities (same logic as working reports)
            let projectId = tx.projectId;
            let categoryId = tx.categoryId;

            // Resolve from linked Bill if missing
            if (tx.billId) {
                const bill = state.bills.find(b => b.id === tx.billId);
                if (bill) {
                    if (!projectId) projectId = bill.projectId;
                    if (!categoryId) categoryId = bill.categoryId;
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

            // Filter by project - must match selected project
            if (projectId !== selectedProjectId) return;
            if (!categoryId) return;

            const currentSpent = spendingMap.get(categoryId) || 0;
            spendingMap.set(categoryId, currentSpent + Number(tx.amount));
        });

        console.log(`   ✅ Found spending in ${spendingMap.size} categories`);
        console.log(`   Total spent: ${CURRENCY} ${Array.from(spendingMap.values()).reduce((a, b) => a + b, 0).toLocaleString()}`);

        return spendingMap;
    }, [state.transactions, state.bills, state.invoices, selectedProjectId]);

    // Get budgets for selected project
    const projectBudgets = useMemo(() => {
        // If no project is selected, return empty array
        if (!selectedProjectId) {
            return [];
        }

        const filtered = state.budgets.filter(b => b.projectId === selectedProjectId);

        console.log(`📋 Budgets for project "${selectedProjectId}": ${filtered.length}`);
        if (filtered.length > 0) {
            filtered.forEach(b => {
                const category = state.categories.find(c => c.id === b.categoryId);
                console.log(`   - ${category?.name || 'Unknown'}: ${b.amount}`);
            });
        }

        return filtered;
    }, [state.budgets, selectedProjectId, state.categories]);

    // Filter and sort categories
    const filteredAndSortedCategories = useMemo(() => {
        // Filter by search query
        let filtered = expenseCategories.filter(category =>
            category.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (category.description && category.description.toLowerCase().includes(searchQuery.toLowerCase()))
        );

        // Sort based on selected field and direction
        filtered = [...filtered].sort((a, b) => {
            const budgetA = selectedProjectId
                ? state.budgets.find(budget =>
                    budget.categoryId === a.id && budget.projectId === selectedProjectId
                )
                : undefined;
            const budgetB = selectedProjectId
                ? state.budgets.find(budget =>
                    budget.categoryId === b.id && budget.projectId === selectedProjectId
                )
                : undefined;

            const spentA = totalSpending.get(a.id) || 0;
            const spentB = totalSpending.get(b.id) || 0;
            const budgetAmountA = budgetA?.amount || 0;
            const budgetAmountB = budgetB?.amount || 0;
            const remainingA = budgetAmountA - spentA;
            const remainingB = budgetAmountB - spentB;
            const progressA = budgetAmountA > 0 ? (spentA / budgetAmountA) * 100 : 0;
            const progressB = budgetAmountB > 0 ? (spentB / budgetAmountB) * 100 : 0;

            let comparison = 0;
            switch (sortField) {
                case 'category':
                    comparison = a.name.localeCompare(b.name);
                    break;
                case 'budget':
                    comparison = budgetAmountA - budgetAmountB;
                    break;
                case 'spent':
                    comparison = spentA - spentB;
                    break;
                case 'remaining':
                    comparison = remainingA - remainingB;
                    break;
                case 'progress':
                    comparison = progressA - progressB;
                    break;
            }

            return sortDirection === 'asc' ? comparison : -comparison;
        });

        return filtered;
    }, [expenseCategories, searchQuery, sortField, sortDirection, state.budgets, selectedProjectId, totalSpending]);

    const totalBudgeted = projectBudgets.reduce((sum: number, b) => sum + (Number(b.amount) || 0), 0);
    const totalSpent = Array.from(totalSpending.values()).reduce((a: number, b: number) => a + (Number(b) || 0), 0);
    const totalRemaining = Number(totalBudgeted) - Number(totalSpent);
    const overallProgress = Number(totalBudgeted) > 0 ? (Number(totalSpent) / Number(totalBudgeted)) * 100 : 0;

    const SortIcon: React.FC<{ field: SortField }> = ({ field }) => {
        if (sortField !== field) {
            return <span className="text-slate-300 group-hover:text-slate-400 transition-colors w-4 h-4">{ICONS.arrowUpDown}</span>;
        }
        return sortDirection === 'asc' ?
            <span className="text-indigo-500 w-4 h-4">{ICONS.arrowUp}</span> :
            <span className="text-indigo-500 w-4 h-4">{ICONS.arrowDown}</span>;
    };

    return (
        <div className="space-y-6 h-full flex flex-col bg-slate-50/50 p-6">
            {/* Header & Controls */}
            <div className="flex flex-col gap-6 flex-shrink-0">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 leading-tight">Project Budget Planner</h1>
                        <p className="text-slate-500 mt-1">Configure and monitor budgets for your projects</p>
                    </div>

                    <div className="w-full md:w-80 relative">
                        <Select
                            value={selectedProjectId}
                            onChange={(e) => setSelectedProjectId(e.target.value)}
                            className="w-full !py-2.5 !pl-4 !pr-10 !text-base !rounded-xl !border-slate-300 shadow-sm focus:!ring-indigo-500/20 focus:!border-indigo-500"
                        >
                            <option value="">Select a Project to Configure</option>
                            {state.projects.map(project => (
                                <option key={project.id} value={project.id}>
                                    {project.name}
                                </option>
                            ))}
                        </Select>
                        {!selectedProjectId && (
                            <div className="absolute top-full left-0 mt-1">
                                <span className="text-xs text-rose-500 font-medium animate-pulse flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                    Please select a project first
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {selectedProjectId ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity text-indigo-600">
                                <div className="transform scale-150">{ICONS.creditCard}</div>
                            </div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Budget</p>
                            <p className="text-2xl font-bold text-slate-900">{CURRENCY} {totalBudgeted.toLocaleString()}</p>
                            <div className="mt-4 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                <div className="h-full bg-indigo-500 w-full opacity-20"></div>
                            </div>
                        </div>

                        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity text-rose-600">
                                <div className="transform scale-150 rotate-12">{ICONS.trendingUp}</div>
                            </div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Spent</p>
                            <div className="flex items-end gap-2">
                                <p className={`text-2xl font-bold ${totalSpent > totalBudgeted ? 'text-rose-600' : 'text-slate-900'}`}>{CURRENCY} {totalSpent.toLocaleString()}</p>
                                <span className="text-xs font-semibold text-slate-400 mb-1.5">
                                    ({Math.min(overallProgress, 100).toFixed(1)}%)
                                </span>
                            </div>
                            <div className="mt-4 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                <div
                                    className={`h-full transition-all duration-700 ${overallProgress > 100 ? 'bg-rose-500' : 'bg-indigo-500'}`}
                                    style={{ width: `${Math.min(overallProgress, 100)}%` }}
                                ></div>
                            </div>
                        </div>

                        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity text-emerald-600">
                                <div className="transform scale-150">{ICONS.checkCircle}</div>
                            </div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Remaining</p>
                            <p className={`text-2xl font-bold ${totalRemaining >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {CURRENCY} {Math.abs(totalRemaining).toLocaleString()}
                            </p>
                            <div className="mt-4 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                <div
                                    className={`h-full transition-all duration-700 ${totalRemaining >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}
                                    style={{ width: '100%' }}
                                ></div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-6 text-center">
                        <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center text-indigo-500 mx-auto mb-3">
                            {ICONS.folder}
                        </div>
                        <h3 className="text-indigo-900 font-bold">No Project Selected</h3>
                        <p className="text-indigo-600/80 text-sm mt-1">Select a project from the dropdown above to view and configure its budget.</p>
                    </div>
                )}
            </div>

            {/* Main Content */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex-grow overflow-hidden flex flex-col">
                {/* Toolbar */}
                <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4 bg-white">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <span>Budget Categories</span>
                        <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-xs font-medium">{filteredAndSortedCategories.length}</span>
                    </h3>
                    <div className="relative w-full sm:w-64">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                            {ICONS.search}
                        </div>
                        <input
                            type="text"
                            placeholder="Search categories..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="block w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-xl bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                            >
                                {ICONS.x}
                            </button>
                        )}
                    </div>
                </div>

                {/* List Header */}
                <div className="hidden sm:grid grid-cols-12 gap-4 px-6 py-3 border-b border-slate-200 bg-slate-50/80 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <div className="col-span-4 cursor-pointer group flex items-center gap-1" onClick={() => handleSort('category')}>
                        Category <SortIcon field="category" />
                    </div>
                    <div className="col-span-3 cursor-pointer group flex items-center gap-1" onClick={() => handleSort('budget')}>
                        Budget Goal <SortIcon field="budget" />
                    </div>
                    <div className="col-span-5 cursor-pointer group flex items-center gap-1" onClick={() => handleSort('progress')}>
                        Progress & Status <SortIcon field="progress" />
                    </div>
                </div>

                {/* List Content */}
                <div className="overflow-y-auto flex-grow bg-slate-50/30">
                    {!selectedProjectId ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 p-12">
                            <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-4 border border-slate-100 shadow-sm">
                                <div className="opacity-50">{ICONS.arrowUp}</div>{/* Using generic icon for placeholder */}
                            </div>
                            <p className="font-medium text-slate-600">Waiting for selection</p>
                            <p className="text-sm mt-1">Select a project to load budget categories</p>
                        </div>
                    ) : filteredAndSortedCategories.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-500 p-12">
                            <p className="font-medium">No expense categories found</p>
                            {searchQuery && <p className="text-sm mt-1">Try changing your search query</p>}
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {filteredAndSortedCategories.map(category => {
                                const budget = selectedProjectId
                                    ? state.budgets.find(b =>
                                        b.categoryId === category.id && b.projectId === selectedProjectId
                                    )
                                    : undefined;
                                const spent = totalSpending.get(category.id) || 0;
                                return (
                                    <BudgetRow
                                        key={`${category.id}-${selectedProjectId}`}
                                        category={category}
                                        budget={budget}
                                        totalSpent={spent}
                                        projectId={selectedProjectId}
                                    />
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default BudgetManagement;
