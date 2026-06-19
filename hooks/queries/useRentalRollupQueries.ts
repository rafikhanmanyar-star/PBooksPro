import { useQuery } from '@tanstack/react-query';
import { rentalOwnerSummariesApi } from '../../services/api/rentalOwnerSummariesApi';

export const rentalRollupQueryKeys = {
  root: ['rentalRollup'] as const,
  ownerBalancesAll: () => [...rentalRollupQueryKeys.root, 'ownerBalances', 'all'] as const,
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
