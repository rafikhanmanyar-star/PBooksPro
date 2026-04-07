import type { Category } from '../types';

/** Stable ids — must match database/migrations/019_sales_return_categories.sql and mandatorySystemCategories */
export const SALES_RETURN_CATEGORY_IDS = {
  /** Refund payouts to buyer: EXPENSE tx with this Income-type category reduces Unit Selling / revenue in P&L */
  REFUND_REVENUE_REDUCTION: 'sys-cat-sales-return-refund',
  /** Penalty leg of cancellation (alongside legacy Penalty Income) */
  PENALTY: 'sys-cat-sales-return-penalty',
} as const;

const NAMES: Record<keyof typeof SALES_RETURN_CATEGORY_IDS, string> = {
  REFUND_REVENUE_REDUCTION: 'Sales Return Refund (revenue reduction)',
  PENALTY: 'Sales Return Penalty',
};

/**
 * Resolve a sales-return system category by stable id first, then legacy name match.
 */
export function findSalesReturnCategory<K extends keyof typeof SALES_RETURN_CATEGORY_IDS>(
  categories: Category[] | undefined,
  key: K
): Category | undefined {
  const list = categories ?? [];
  const id = SALES_RETURN_CATEGORY_IDS[key];
  const name = NAMES[key];
  return (
    list.find((c) => c.id === id || c.id.endsWith(`__${id}`)) ?? list.find((c) => c.name === name)
  );
}

/** Legacy: refunds historically used Unit Selling Income (`sys-cat-unit-sell`). */
const UNIT_SELLING_ID = 'sys-cat-unit-sell';
const UNIT_SELLING_NAME = 'Unit Selling Income';

/**
 * Category ids that count as “sales return refund” lines for unpaid-refund math (new + legacy).
 */
export function getSalesReturnRefundCategoryIdSet(categories: Category[] | undefined): Set<string> {
  const ids = new Set<string>();
  const list = categories ?? [];
  const refund = findSalesReturnCategory(list, 'REFUND_REVENUE_REDUCTION');
  const unit =
    list.find((c) => c.id === UNIT_SELLING_ID) ??
    list.find((c) => c.id.endsWith(`__${UNIT_SELLING_ID}`)) ??
    list.find((c) => c.name === UNIT_SELLING_NAME);
  if (refund?.id) ids.add(refund.id);
  if (unit?.id) ids.add(unit.id);
  return ids;
}
