import { useBudgetDashboardState } from '../../hooks/useSelectiveState';
import React, { useMemo } from 'react';
import { Budget, TransactionType } from '../../types';
import { CURRENCY } from '../../constants';
import Card from '../ui/Card';
import { formatCurrency } from '../../utils/numberUtils';

const BudgetProgress: React.FC<{
    budget: Budget;
    spent: number;
    categoryName: string;
    projectName?: string | null;
}> = ({ budget, spent, categoryName, projectName }) => {
    const progress = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;
    const isOverBudget = spent > budget.amount;
    const remaining = budget.amount - spent;

    return (
        <div>
            <div className="flex justify-between items-baseline mb-1">
                <span className="font-semibold text-slate-700 text-sm">
                    {categoryName}
                    {projectName && <span className="text-xs text-slate-500 ml-1">({projectName})</span>}
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
    const { budgets, categories, projects, transactions, bills, invoices } = useBudgetDashboardState();

    const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
    const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

    const activeBudgets = useMemo(() => budgets.filter((b) => b.amount > 0), [budgets]);

    const budgetSpending = useMemo(() => {
        const spendingMap = new Map<string, number>();

        activeBudgets.forEach((budget) => {
            let totalSpent = 0;

            transactions.forEach((tx) => {
                if (tx.type !== TransactionType.EXPENSE) return;

                let projectId = tx.projectId;
                let categoryId = tx.categoryId;

                if (tx.billId) {
                    const bill = bills.find((b) => b.id === tx.billId);
                    if (bill) {
                        if (!projectId) projectId = bill.projectId;
                        if (bill.expenseCategoryItems && bill.expenseCategoryItems.length > 0) {
                            const totalBillAmount = bill.expenseCategoryItems.reduce(
                                (sum, item) => sum + (item.netValue || 0),
                                0
                            );
                            if (totalBillAmount > 0) {
                                const matchingItem = bill.expenseCategoryItems.find(
                                    (item) => item.categoryId === budget.categoryId
                                );
                                if (matchingItem) {
                                    const proportion = (matchingItem.netValue || 0) / totalBillAmount;
                                    const allocatedAmount = tx.amount * proportion;
                                    if (
                                        (budget.projectId && projectId === budget.projectId) ||
                                        (!budget.projectId && !projectId)
                                    ) {
                                        totalSpent += allocatedAmount;
                                    }
                                }
                            }
                            return;
                        }
                        if (!categoryId) categoryId = bill.categoryId;
                    }
                }

                if (tx.invoiceId) {
                    const inv = invoices.find((i) => i.id === tx.invoiceId);
                    if (inv) {
                        if (!projectId) projectId = inv.projectId;
                        if (!categoryId) categoryId = inv.categoryId;
                    }
                }

                if (categoryId === budget.categoryId) {
                    if (
                        (budget.projectId && projectId === budget.projectId) ||
                        (!budget.projectId && !projectId)
                    ) {
                        totalSpent += tx.amount;
                    }
                }
            });

            spendingMap.set(budget.id, totalSpent);
        });

        return spendingMap;
    }, [transactions, bills, invoices, activeBudgets]);

    const { totalBudgeted, totalSpent } = useMemo(() => {
        let budgeted = 0;
        let spent = 0;
        activeBudgets.forEach((budget) => {
            budgeted += budget.amount;
            spent += budgetSpending.get(budget.id) || 0;
        });
        return { totalBudgeted: budgeted, totalSpent: spent };
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
                        {CURRENCY} {formatCurrency(Math.abs(totalRemaining))} (
                        {Math.abs((totalRemaining / totalBudgeted) * 100).toFixed(1)}%)
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
                {activeBudgets.map((budget) => {
                    const category = categoryById.get(budget.categoryId);
                    if (!category) return null;
                    const project = budget.projectId ? projectById.get(budget.projectId) : null;
                    return (
                        <BudgetProgress
                            key={budget.id}
                            budget={budget}
                            spent={budgetSpending.get(budget.id) || 0}
                            categoryName={category.name}
                            projectName={project?.name}
                        />
                    );
                })}
            </div>
        </Card>
    );
};

export default BudgetStatus;
