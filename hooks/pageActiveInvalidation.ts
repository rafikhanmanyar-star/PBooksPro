import { getQueryClient } from '../config/queryClient';
import { dashboardMetricsQueryKeys } from './useDashboardMetrics';
import { rentalRollupQueryKeys } from './queries/useRentalRollupQueries';
import { rentalAnalyticsQueryKeys } from '../modules/rental-analytics/hooks/useRentalAnalytics';
import { collectionsAnalyticsQueryKeys } from '../modules/collections-analytics/hooks/useCollectionsAnalytics';
import { expenseAnalyticsQueryKeys } from '../modules/expense-analytics/hooks/useExpenseAnalytics';
import { vendorAnalyticsQueryKeys } from '../modules/vendor-analytics/hooks/useVendorAnalytics';
import { accountingAnalyticsQueryKeys } from '../modules/accounting-analytics/hooks/useAccountingAnalytics';
import { bankingAnalyticsQueryKeys } from '../modules/banking-analytics/hooks/useBankingAnalytics';
import { sellingAnalyticsQueryKeys } from '../modules/selling-analytics/hooks/useSellingAnalytics';

/** Page groups that receive targeted invalidation on re-activation (PERF-A2.3). */
export const PAGE_ACTIVE_GATE_PRIORITY_GROUPS = [
  'DASHBOARD',
  'TRANSACTIONS',
  'RENTAL',
  'PROJECT',
  'VENDORS',
  'PAYROLL',
] as const;

/**
 * Lightweight refresh when a hidden persistent page becomes active again.
 * AppContext still receives socket patches while inactive; this ensures RQ caches catch up.
 */
export async function invalidatePageGroupQueries(pageGroup: string): Promise<void> {
  const queryClient = getQueryClient();

  switch (pageGroup) {
    case 'DASHBOARD':
      await queryClient.invalidateQueries({ queryKey: dashboardMetricsQueryKeys.root });
      break;
    case 'TRANSACTIONS':
      await queryClient.invalidateQueries({ queryKey: ['ledger'] });
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      break;
    case 'RENTAL':
      await queryClient.invalidateQueries({ queryKey: rentalRollupQueryKeys.root });
      await queryClient.invalidateQueries({ queryKey: rentalAnalyticsQueryKeys.root });
      await queryClient.invalidateQueries({ queryKey: collectionsAnalyticsQueryKeys.root });
      await queryClient.invalidateQueries({ queryKey: ['invoices'] });
      break;
    case 'PROJECT':
      await queryClient.invalidateQueries({ queryKey: ['bills'] });
      await queryClient.invalidateQueries({ queryKey: sellingAnalyticsQueryKeys.root });
      break;
    case 'VENDORS':
      await queryClient.invalidateQueries({ queryKey: vendorAnalyticsQueryKeys.root });
      await queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      await queryClient.invalidateQueries({ queryKey: ['goods-receipts'] });
      break;
    case 'PAYROLL':
      await queryClient.invalidateQueries({ queryKey: ['payroll'] });
      break;
    case 'ACCOUNTING':
      await queryClient.invalidateQueries({ queryKey: accountingAnalyticsQueryKeys.root });
      await queryClient.invalidateQueries({ queryKey: bankingAnalyticsQueryKeys.root });
      break;
    case 'PERSONAL_TRANSACTIONS':
      await queryClient.invalidateQueries({ queryKey: ['personal'] });
      break;
    default:
      break;
  }

  // Expense analytics appears under rental + project modules
  if (pageGroup === 'RENTAL' || pageGroup === 'PROJECT') {
    await queryClient.invalidateQueries({ queryKey: expenseAnalyticsQueryKeys.root });
  }
}
