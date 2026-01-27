import React, { useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Budget, TransactionType } from '../../types';
import { CURRENCY } from '../../constants';
import Card from '../ui/Card';
import { formatCurrency } from '../../utils/numberUtils';

const BudgetProgress: React.FC<{ budget: Budget; spent: number }> = ({ budget, spent }) => {
    const { state } = useAppContext();
    const category = state.categories.find(c => c.id === budget.categoryId);
    const project = budget.projectId ? state.projects.find(p => p.id === budget.projectId) : null;
    
    if (!category) return null;

    const progress = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;
    const isOverBudget = spent > budget.amount;
    const remaining = budget.amount - spent;

    return (
        <div>
            <div className="flex justify-between items-baseline mb-1">
                <span className="font-semibold text-slate-700 text-sm">
                    {category.name}
                    {project && <span className="text-xs text-slate-500 ml-1">({project.name})</span>}
                </span>
                <span className={`text-xs font-medium ${isOverBudget ? 'text-danger' : 'text-slate-500'}`}>
                    {CURRENCY} {formatCurrency(spent)} / {CURRENCY} {formatCurrency(budget.amount)}
                </span>
            </div>
            <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>{remaining >= 0 ? 'Remaining' : 'Over Budget'}</span>
                <span className={remaining >= 0 ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold'}>
                    {CURRENCY} {formatCurrency(Math.abs(remaining))}
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

    // Get all budgets with amount > 0
    const activeBudgets = useMemo(() => {
        return state.budgets.filter(b => b.amount > 0);
    }, [state.budgets]);

    // Calculate total spending per budget (lifetime)
    const budgetSpending = useMemo(() => {
        const spendingMap = new Map<string, number>();
        
        activeBudgets.forEach(budget => {
            let totalSpent = 0;
            
            state.transactions.forEach(tx => {
                if (tx.type !== TransactionType.EXPENSE) return;
                
                // Resolve projectId and categoryId from linked entities
                let projectId = tx.projectId;
                let categoryId = tx.categoryId;
                
                // Resolve from linked Bill if missing
                if (tx.billId) {
                    const bill = state.bills.find(b => b.id === tx.billId);
                    if (bill) {
                        if (!projectId) projectId = bill.projectId;
                        // Handle expenseCategoryItems: if bill has multiple categories, distribute transaction amount proportionally
                        if (bill.expenseCategoryItems && bill.expenseCategoryItems.length > 0) {
                            const totalBillAmount = bill.expenseCategoryItems.reduce((sum, item) => sum + (item.netValue || 0), 0);
                            if (totalBillAmount > 0) {
                                // Check if this budget's category is in the bill's expenseCategoryItems
                                const matchingItem = bill.expenseCategoryItems.find(item => item.categoryId === budget.categoryId);
                                if (matchingItem) {
                                    const proportion = (matchingItem.netValue || 0) / totalBillAmount;
                                    const allocatedAmount = tx.amount * proportion;
                                    // Match budget project scope
                                    if ((budget.projectId && projectId === budget.projectId) || 
                                        (!budget.projectId && !projectId)) {
                                        totalSpent += allocatedAmount;
                                    }
                                }
                            }
                            return; // Skip single category processing for this transaction
                        } else if (!categoryId) {
                            categoryId = bill.categoryId;
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
                
                if (categoryId === budget.categoryId) {
                    // Match budget project scope
                    if ((budget.projectId && projectId === budget.projectId) || 
                        (!budget.projectId && !projectId)) {
                        totalSpent += tx.amount;
                    }
                }
            });
            
            spendingMap.set(budget.id, totalSpent);
        });
        
        return spendingMap;
    }, [state.transactions, state.bills, state.invoices, activeBudgets]);

    const { totalBudgeted, totalSpent } = useMemo(() => {
        let totalBudgeted = 0;
        let totalSpent = 0;
        activeBudgets.forEach(budget => {
            totalBudgeted += budget.amount;
            totalSpent += budgetSpending.get(budget.id) || 0;
        });
        return { totalBudgeted, totalSpent };
    }, [activeBudgets, budgetSpending]);
    
    if (activeBudgets.length === 0) {
        return (
            <Card>
                <h3 className="text-xl font-bold text-slate-800 mb-2">Budget Status</h3>
                <p className="text-sm text-center text-slate-500 py-8">
                    No budgets set. You can set them in the Configuration → Budget Management section.
                </p>
            </Card>
        );
    }
    
    const overallProgress = totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0;
    const isOverallOverBudget = totalSpent > totalBudgeted;
    const totalRemaining = totalBudgeted - totalSpent;

    return (
        <Card>
            <h3 className="text-xl font-bold text-slate-800 mb-4">Budget Status</h3>
            
            {/* Overall Summary */}
            <div className="mb-6">
                <div className="flex justify-between items-baseline mb-1">
                    <span className="font-semibold text-slate-800 text-md">Overall Budget Progress</span>
                     <span className={`text-sm font-medium ${isOverallOverBudget ? 'text-danger' : 'text-slate-600'}`}>
                        {CURRENCY} {formatCurrency(totalSpent)} / {CURRENCY} {formatCurrency(totalBudgeted)}
                    </span>
                </div>
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>{totalRemaining >= 0 ? 'Remaining Budget' : 'Over Budget'}</span>
                    <span className={totalRemaining >= 0 ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold'}>
                        {CURRENCY} {formatCurrency(Math.abs(totalRemaining))} ({Math.abs(totalRemaining / totalBudgeted * 100).toFixed(1)}%)
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
                {activeBudgets.map(budget => (
                    <BudgetProgress
                        key={budget.id}
                        budget={budget}
                        spent={budgetSpending.get(budget.id) || 0}
                    />
                ))}
            </div>
        </Card>
    );
};

export default BudgetStatus;
