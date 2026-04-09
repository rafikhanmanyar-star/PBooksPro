import type { Category } from '../../types';
import { TransactionType } from '../../types';

/** Canonical PK for the expense line on Internal Clearing when recording investor profit distribution. */
export const CANONICAL_PROFIT_DISTRIBUTION_EXPENSE_CATEGORY_ID = 'sys-cat-profit-share' as const;

/**
 * Resolves the expense category for profit-distribution clearing legs.
 * Must not fall back to an arbitrary first expense (that mis-tags COA / P&L drilldowns).
 */
export function resolveProfitDistributionExpenseCategory(categories: Category[]): Category | undefined {
    const byCanonical = categories.find(
        (c) =>
            c.id === CANONICAL_PROFIT_DISTRIBUTION_EXPENSE_CATEGORY_ID &&
            c.type === TransactionType.EXPENSE
    );
    if (byCanonical) return byCanonical;

    const byName = (name: string) =>
        categories.find((c) => c.name === name && c.type === TransactionType.EXPENSE);
    return byName('Profit Share') || byName('Dividend') || byName('Owner Withdrawn');
}
