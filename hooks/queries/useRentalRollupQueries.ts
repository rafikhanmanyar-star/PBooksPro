import { useQuery } from '@tanstack/react-query';
import { rentalOwnerSummariesApi } from '../../services/api/rentalOwnerSummariesApi';

export const rentalRollupQueryKeys = {
  root: ['rentalRollup'] as const,
  ownerBalancesAll: () => [...rentalRollupQueryKeys.root, 'ownerBalances', 'all'] as const,
  monthlyRange: (startMonth: string, endMonth: string) =>
    [...rentalRollupQueryKeys.root, 'monthly', startMonth, endMonth] as const,
};

/** Longer stale window avoids refetch storms when switching views after a full sync (large tenants). */
const ROLLUP_STALE_MS = 120_000;

/** Full tenant owner_balances list (for Payouts / dashboards). */
export function useAllOwnerBalancesRollupQuery(enabled: boolean) {
  return useQuery({
    queryKey: rentalRollupQueryKeys.ownerBalancesAll(),
    queryFn: () => rentalOwnerSummariesApi.getOwnerBalances({ limit: 12_000 }),
    enabled,
    staleTime: ROLLUP_STALE_MS,
  });
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Monthly owner summary rows for a date range (charts / KPIs). */
export function useMonthlyRentalSummaryRangeQuery(enabled: boolean, monthsBack = 5) {
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - monthsBack);
  const startMonth = monthKey(start);
  const endMonth = monthKey(end);

  return useQuery({
    queryKey: rentalRollupQueryKeys.monthlyRange(startMonth, endMonth),
    queryFn: () =>
      rentalOwnerSummariesApi.getMonthlySummary({
        startMonth,
        endMonth,
        limit: 500,
      }),
    enabled,
    staleTime: ROLLUP_STALE_MS,
  });
}
