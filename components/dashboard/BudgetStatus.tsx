import React, { useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Budget, TransactionType } from '../../types';
import { CURRENCY } from '../../constants';
import Card from '../ui/Card';

const BudgetProgress: React.FC<{ budget: Budget; spent: number }> = ({ budget, spent }) => {
    const { state } = useAppContext();
    const category = state.categories.find(c => c.id === budget.categoryId);
    if (!category) return null;

    const progress = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;
    const isOverBudget = spent > budget.amount;

    return (
        <div>
            <div className="flex justify-between items-baseline mb-1">
                <span className="font-semibold text-slate-700 text-sm">{category.name}</span>
                <span className={`text-xs font-medium ${isOverBudget ? 'text-danger' : 'text-slate-500'}`}>
                    {CURRENCY} {spent.toLocaleString()} / {CURRENCY} {budget.amount.toLocaleString()}
                </span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2.5">
                <div
                    className={`h-2.5 rounded-full ${isOverBudget ? 'bg-danger' : 'bg-accent'}`}
                    style={{ width: `${Math.min(progress, 100)}%` }}
                ></div>
            </div>
        </div>
    );
};


const BudgetStatus: React.FC = () => {
    const { state } = useAppContext();
    
    const currentMonth = useMemo(() => new Date().toISOString().slice(0, 7), []);

    const budgetsForMonth = useMemo(() => {
        return state.budgets.filter(b => b.month === currentMonth && b.amount > 0);
    }, [state.budgets, currentMonth]);

    const monthlySpending = useMemo(() => {
        const spendingMap = new Map<string, number>();
        state.transactions.forEach(tx => {
            if (tx.type === TransactionType.EXPENSE && tx.date.startsWith(currentMonth) && tx.categoryId) {
                const currentSpent = spendingMap.get(tx.categoryId) || 0;
                spendingMap.set(tx.categoryId, currentSpent + tx.amount);
            }
        });
        return spendingMap;
    }, [state.transactions, currentMonth]);

    const { totalBudgeted, totalSpent } = useMemo(() => {
        let totalBudgeted = 0;
        let totalSpent = 0;
        budgetsForMonth.forEach(budget => {
            totalBudgeted += budget.amount;
            totalSpent += monthlySpending.get(budget.categoryId) || 0;
        });
        return { totalBudgeted, totalSpent };
    }, [budgetsForMonth, monthlySpending]);
    
    if (budgetsForMonth.length === 0) {
        return (
            <Card>
                <h3 className="text-xl font-bold text-slate-800 mb-2">This Month's Budget</h3>
                <p className="text-sm text-center text-slate-500 py-8">
                    No budgets set for this month. You can set them in the Settings page.
                </p>
            </Card>
        );
    }
    
    const overallProgress = totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0;
    const isOverallOverBudget = totalSpent > totalBudgeted;

    return (
        <Card>
            <h3 className="text-xl font-bold text-slate-800 mb-4">This Month's Budget Status</h3>
            
            {/* Overall Summary */}
            <div className="mb-6">
                <div className="flex justify-between items-baseline mb-1">
                    <span className="font-semibold text-slate-800 text-md">Overall Progress</span>
                     <span className={`text-sm font-medium ${isOverallOverBudget ? 'text-danger' : 'text-slate-600'}`}>
                        {CURRENCY} {totalSpent.toLocaleString()} / {CURRENCY} {totalBudgeted.toLocaleString()}
                    </span>
                </div>
                 <div className="w-full bg-slate-200 rounded-full h-4">
                    <div
                        className={`h-4 rounded-full ${isOverallOverBudget ? 'bg-danger' : 'bg-accent'}`}
                        style={{ width: `${Math.min(overallProgress, 100)}%` }}
                    ></div>
                </div>
            </div>

            <div className="space-y-4">
                {budgetsForMonth.map(budget => (
                    <BudgetProgress
                        key={budget.id}
                        budget={budget}
                        spent={monthlySpending.get(budget.categoryId) || 0}
                    />
                ))}
            </div>
        </Card>
    );
};

export default BudgetStatus;