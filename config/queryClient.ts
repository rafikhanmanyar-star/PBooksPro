import { QueryClient } from '@tanstack/react-query';
import { dashboardMetricsQueryKeys } from '../hooks/useDashboardMetrics';

/** Default cache policy for list/report API and DB-backed queries (Phase 2). */
export const QUERY_STALE_MS = 5 * 60 * 1000;
export const QUERY_GC_MS = 10 * 60 * 1000;

/** Phase 1: financial query tier (ledger, invoices, transactions, dashboardMetrics). */
export const FINANCIAL_QUERY_STALE_MS = 30_000;
/** Phase 1: operational query tier. */
export const OPERATIONAL_QUERY_STALE_MS = 2 * 60 * 1000;

/**
 * Prefix passed to `setQueryDefaults` for dashboard KPI queries.
 * Must stay aligned with `dashboardMetricsQueryKeys.root` (see implementation notes).
 */
export const DASHBOARD_METRICS_FINANCIAL_QUERY_PREFIX = dashboardMetricsQueryKeys.root;

const FINANCIAL_QUERY_PREFIXES: readonly (readonly unknown[])[] = [
  ['ledger'],
  ['invoices'],
  ['transactions'],
  DASHBOARD_METRICS_FINANCIAL_QUERY_PREFIX,
];

/** Dev-only guard: financial stale-time prefix must match invalidation root key. */
export function assertDashboardMetricsQueryKeyPrefix(): void {
  const rootPrefix = dashboardMetricsQueryKeys.root[0];
  const defaultsPrefix = DASHBOARD_METRICS_FINANCIAL_QUERY_PREFIX[0];
  if (rootPrefix !== defaultsPrefix) {
    throw new Error(
      `dashboardMetrics query key mismatch: dashboardMetricsQueryKeys.root[0]=${JSON.stringify(rootPrefix)} ` +
        `but queryClient financial prefix[0]=${JSON.stringify(defaultsPrefix)}`
    );
  }
}

const OPERATIONAL_QUERY_PREFIXES: readonly (readonly unknown[])[] = [
  ['purchase-orders'],
  ['goods-receipts'],
  ['contracts'],
  ['workflow'],
  ['payroll'],
  ['attendance'],
  ['leave'],
  ['procurement-dashboard'],
];

let client: QueryClient | null = null;

function applyPhase1QueryDefaults(queryClient: QueryClient): void {
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
    assertDashboardMetricsQueryKeyPrefix();
  }
  for (const queryKey of FINANCIAL_QUERY_PREFIXES) {
    queryClient.setQueryDefaults(queryKey, {
      staleTime: FINANCIAL_QUERY_STALE_MS,
      refetchOnWindowFocus: true,
    });
  }
  for (const queryKey of OPERATIONAL_QUERY_PREFIXES) {
    queryClient.setQueryDefaults(queryKey, {
      staleTime: OPERATIONAL_QUERY_STALE_MS,
    });
  }
}

export function getQueryClient(): QueryClient {
  if (!client) {
    client = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: QUERY_STALE_MS,
          gcTime: QUERY_GC_MS,
          refetchOnWindowFocus: false,
          retry: 1,
        },
      },
    });
    applyPhase1QueryDefaults(client);
  }
  return client;
}
