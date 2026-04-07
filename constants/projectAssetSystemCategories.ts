import type { Category } from '../types';

/** Stable ids — must match database/migrations/017_project_asset_categories.sql and mandatorySystemCategories */
export const PROJECT_ASSET_CATEGORY_IDS = {
  REVENUE_ASSET_IN_KIND: 'sys-cat-rev-asset-in-kind',
  ASSET_BALANCE_SHEET_ONLY: 'sys-cat-asset-bs-only',
  SALES_OF_FIXED_ASSET: 'sys-cat-sales-fixed-asset',
  ASSET_SALE_PROCEEDS: 'sys-cat-asset-sale-proceeds',
  COST_OF_ASSET_SOLD: 'sys-cat-cost-asset-sold',
} as const;

const NAMES: Record<keyof typeof PROJECT_ASSET_CATEGORY_IDS, string> = {
  REVENUE_ASSET_IN_KIND: 'Revenue - Asset received in kind',
  ASSET_BALANCE_SHEET_ONLY: 'Asset received (balance sheet only)',
  SALES_OF_FIXED_ASSET: 'Sales of fixed asset',
  ASSET_SALE_PROCEEDS: 'Asset Sale Proceeds',
  COST_OF_ASSET_SOLD: 'Cost of Asset Sold',
};

/**
 * Resolve a project-asset system category by stable id first, then legacy name match.
 */
export function findProjectAssetCategory<K extends keyof typeof PROJECT_ASSET_CATEGORY_IDS>(
  categories: Category[] | undefined,
  key: K
): Category | undefined {
  const list = categories ?? [];
  const id = PROJECT_ASSET_CATEGORY_IDS[key];
  const name = NAMES[key];
  return (
    list.find((c) => c.id === id || c.id.endsWith(`__${id}`)) ?? list.find((c) => c.name === name)
  );
}
