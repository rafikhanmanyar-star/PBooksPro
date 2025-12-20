
import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Category, TransactionType, Budget } from '../../types';
import MonthNavigator from '../transactions/MonthNavigator';
import Input from '../ui/Input';
import { CURRENCY } from '../../constants';

const BudgetRow: React.FC<{
    category: Category;
    budget: Budget | undefined;
    spent: number;
    month: string; // YYYY-MM
}> = ({ category, budget, spent, month }) => {
    const { dispatch } = useAppContext();
    const [amount, setAmount] = useState(budget?.amount?.toString() || '');
    
    useEffect(() => {
        setAmount(budget?.amount?.toString() || '');
    }, [budget]);

    const handleBlur = () => {
        const numericAmount = parseFloat(amount) || 0;
        const id = `${category.id}-${month}`;
        
        if (budget) { // Budget exists, update it
            if (numericAmount > 0) {
                if (numericAmount !== budget.amount) {
                    dispatch({ type: 'UPDATE_BUDGET', payload: { ...budget, amount: numericAmount } });
                }
            } else {
                // If user clears the input, effectively deleting the budget for that month
                dispatch({ type: 'DELETE_BUDGET', payload: id });
            }
        } else if (numericAmount > 0) { // No budget, create one
            const newBudget: Budget = {
                id,
                categoryId: category.id,
                month,
                amount: numericAmount,
            };
            dispatch({ type: 'ADD_BUDGET', payload: newBudget });
        }
    };
    
    const budgetAmount = budget?.amount || 0;
    const progress = budgetAmount > 0 ? (spent / budgetAmount) * 100 : 0;
    const isOverBudget = spent > budgetAmount && budgetAmount > 0;

    return (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center py-4 px-4 hover:bg-slate-50 border-b border-slate-100 last:border-0 transition-colors">
            <div className="md:col-span-4">
                <p className="font-semibold text-slate-800">{category.name}</p>
                <p className="text-xs text-slate-500 truncate" title={category.description}>{category.description || 'No description'}</p>
            </div>
            
            <div className="md:col-span-5 flex flex-col justify-center">
                <div className="flex justify-between text-xs mb-1">
                    <span className={`${isOverBudget ? 'text-rose-600 font-bold' : 'text-slate-600'}`}>
                        {CURRENCY} {spent.toLocaleString()}
                    </span>
                    <span className="text-slate-400">
                        {Math.min(progress, 100).toFixed(0)}%
                    </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                    <div
                        className={`h-2 rounded-full transition-all duration-500 ${isOverBudget ? 'bg-rose-500' : 'bg-emerald-500'}`}
                        style={{ width: `${Math.min(progress, 100)}%` }}
                    ></div>
                </div>
            </div>

            <div className="md:col-span-3">
                <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-sm">
                        {CURRENCY}
                    </span>
                    <input
                        type="text"
                        inputMode="decimal"
                        className="block w-full pl-12 pr-3 py-2 border rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm border-slate-300 text-right font-medium text-slate-700"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        onBlur={handleBlur}
                        placeholder="0.00"
                    />
                </div>
            </div>
        </div>
    );
};

const BudgetManagement: React.FC = () => {
    const { state } = useAppContext();
    const [currentDate, setCurrentDate] = useState(new Date());

    const selectedMonth = useMemo(() => currentDate.toISOString().slice(0, 7), [currentDate]);

    const expenseCategories = useMemo(() => state.categories.filter(c => c.type === TransactionType.EXPENSE), [state.categories]);

    const monthlySpending = useMemo(() => {
        const spendingMap = new Map<string, number>();
        state.transactions.forEach(tx => {
            if (tx.type === TransactionType.EXPENSE && tx.date.startsWith(selectedMonth) && tx.categoryId) {
                const currentSpent = spendingMap.get(tx.categoryId) || 0;
                spendingMap.set(tx.categoryId, currentSpent + Number(tx.amount));
            }
        });
        return spendingMap;
    }, [state.transactions, selectedMonth]);
    
    // Calculate Summary
    const budgetsForMonth = useMemo(() => {
        return state.budgets.filter(b => b.month === selectedMonth);
    }, [state.budgets, selectedMonth]);

    const totalBudgeted = budgetsForMonth.reduce((sum: number, b) => sum + (Number(b.amount) || 0), 0);
    const totalSpent = Array.from(monthlySpending.values()).reduce((a: number, b: number) => a + (Number(b) || 0), 0);
    const totalRemaining = Math.max(0, Number(totalBudgeted) - Number(totalSpent));
    const overallProgress = Number(totalBudgeted) > 0 ? (Number(totalSpent) / Number(totalBudgeted)) * 100 : 0;

    return (
        <div className="space-y-6 h-full flex flex-col">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex-shrink-0">
                <MonthNavigator currentDate={currentDate} onDateChange={setCurrentDate} />
                
                <div className="flex gap-6 text-center sm:text-right">
                    <div>
                        <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Budgeted</p>
                        <p className="text-lg font-bold text-slate-800">{CURRENCY} {totalBudgeted.toLocaleString()}</p>
                    </div>
                    <div>
                        <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Spent</p>
                        <p className={`text-lg font-bold ${totalSpent > totalBudgeted ? 'text-rose-600' : 'text-slate-700'}`}>
                            {CURRENCY} {totalSpent.toLocaleString()}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Remaining</p>
                        <p className="text-lg font-bold text-emerald-600">{CURRENCY} {totalRemaining.toLocaleString()}</p>
                    </div>
                </div>
            </div>

            {/* Total Progress Bar */}
            <div className="bg-white px-4 py-3 rounded-lg border border-slate-200 shadow-sm flex-shrink-0">
                <div className="flex justify-between text-xs font-semibold text-slate-500 mb-1">
                    <span>Monthly Utilization</span>
                    <span>{Math.min(overallProgress, 100).toFixed(0)}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                    <div 
                        className={`h-full transition-all duration-700 ${overallProgress > 100 ? 'bg-rose-500' : 'bg-indigo-500'}`} 
                        style={{ width: `${Math.min(overallProgress, 100)}%` }}
                    ></div>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-slate-200 flex-grow overflow-hidden flex flex-col">
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex justify-between items-center font-semibold text-sm text-slate-700">
                    <span>Category</span>
                    <span className="hidden md:inline">Allocation</span>
                </div>
                <div className="overflow-y-auto flex-grow">
                    {expenseCategories.map(category => {
                        const budget = state.budgets.find(b => b.categoryId === category.id && b.month === selectedMonth);
                        const spent = monthlySpending.get(category.id) || 0;
                        return (
                            <BudgetRow
                                key={`${category.id}-${selectedMonth}`}
                                category={category}
                                budget={budget}
                                spent={spent}
                                month={selectedMonth}
                            />
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default BudgetManagement;
