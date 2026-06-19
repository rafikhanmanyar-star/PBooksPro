import type { QueryClient } from '@tanstack/react-query';
import { dashboardMetricsQueryKeys } from '../../hooks/useDashboardMetrics';

/** Query key prefixes invalidated on every approval_* socket event (tenant-wide). */
export const APPROVAL_INVALIDATION_QUERY_KEYS = [
  ['workflow'],
  ['purchase-orders'],
  ['notifications'],
  dashboardMetricsQueryKeys.root,
  ['contracts'],
  ['bills'],
  ['transactions'],
  ['vendors'],
] as const;

/** Verbatim extract from hooks/useWorkflow.ts invalidateApprovalQueries. */
export function invalidateApprovalQueries(queryClient: QueryClient): void {
  for (const queryKey of APPROVAL_INVALIDATION_QUERY_KEYS) {
    void queryClient.invalidateQueries({ queryKey: [...queryKey] });
  }
}
