/**
 * Drill-down transaction filter aligned with {@link ProjectCategoryReport} aggregation
 * (payment transactions + proportional split from bills with expenseCategoryItems).
 * Differs from P&L drill-down, which skips bill payments when accrual already counted the bill.
 */

import type { AppState, Transaction } from '../../types';
import { TransactionType } from '../../types';
import { isResolvedPlCategoryInDrilldownRow } from './projectProfitLossComputation';

export function transactionMatchesProjectCategoryDrilldown(
  tx: Transaction,
  state: AppState,
  params: {
    type: TransactionType.INCOME | TransactionType.EXPENSE;
    selectedProjectId: string;
    start: Date;
    end: Date;
    drilldownCategoryId: string;
  }
): boolean {
  const { type, selectedProjectId, start, end, drilldownCategoryId } = params;
  const rentalCategoryIds = new Set(state.categories.filter((c) => c.isRental).map((c) => c.id));
  const uncategorizedRow = drilldownCategoryId === 'uncategorized';

  let projectId = tx.projectId;
  let categoryId = tx.categoryId;

  if (tx.billId) {
    const bill = state.bills.find((b) => b.id === tx.billId);
    if (bill) {
      if (!projectId) projectId = bill.projectId;
      if (!projectId) return false;
      if (selectedProjectId !== 'all' && projectId !== selectedProjectId) return false;

      if (bill.expenseCategoryItems && bill.expenseCategoryItems.length > 0) {
        const totalBillAmount = bill.expenseCategoryItems.reduce((sum, item) => sum + (item.netValue || 0), 0);
        if (totalBillAmount > 0) {
          const matchesSplit = bill.expenseCategoryItems.some((item) => {
            if (!item.categoryId) return false;
            if (rentalCategoryIds.has(item.categoryId)) return false;
            if (uncategorizedRow) return false;
            return isResolvedPlCategoryInDrilldownRow(
              item.categoryId,
              drilldownCategoryId,
              state.categories
            );
          });
          if (!matchesSplit) return false;
          const txDate = new Date(tx.date);
          if (txDate < start || txDate > end) return false;
          return tx.type === type;
        }
      } else if (!categoryId) {
        categoryId = bill.categoryId;
      }
    }
  }

  if (tx.invoiceId) {
    const inv = state.invoices.find((i) => i.id === tx.invoiceId);
    if (inv) {
      if (!projectId) projectId = inv.projectId;
      if (!categoryId) categoryId = inv.categoryId;
    }
  }

  if (!projectId) return false;
  if (selectedProjectId !== 'all' && projectId !== selectedProjectId) return false;
  if (tx.type !== type) return false;
  if (categoryId && rentalCategoryIds.has(categoryId)) return false;

  const txDate = new Date(tx.date);
  if (txDate < start || txDate > end) return false;

  const catId = categoryId || 'uncategorized';
  if (uncategorizedRow) return catId === 'uncategorized';
  return isResolvedPlCategoryInDrilldownRow(categoryId, drilldownCategoryId, state.categories);
}
