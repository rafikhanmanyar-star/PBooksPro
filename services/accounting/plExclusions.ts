/**
 * P&L exclusion list — financing, BS-only, and system profit-distribution expense legs.
 * Kept separate from report engines to avoid circular imports.
 */

import type { AppState } from '../../types';
import { CANONICAL_PROFIT_DISTRIBUTION_EXPENSE_CATEGORY_ID } from '../database/resolveProfitDistributionExpenseCategory';

export function getProfitLossExcludedCategoryIds(state: Pick<AppState, 'categories'>): Set<string> {
  const ids = new Set<string>();
  for (const c of state.categories || []) {
    if (c.name === 'Owner Equity' || c.name === 'Owner Withdrawn') ids.add(c.id);
    if (c.name === 'Owner Rental Allocation (Clearing)' || c.name === 'Owner Rental Income Share') ids.add(c.id);
  }
  ids.add(CANONICAL_PROFIT_DISTRIBUTION_EXPENSE_CATEGORY_ID);
  return ids;
}

export function isProfitLossExcludedCategoryId(
  categoryId: string | undefined,
  state: Pick<AppState, 'categories'>
): boolean {
  if (!categoryId) return false;
  return getProfitLossExcludedCategoryIds(state).has(categoryId);
}
