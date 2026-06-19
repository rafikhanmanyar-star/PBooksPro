import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertDashboardMetricsQueryKeyPrefix,
  DASHBOARD_METRICS_FINANCIAL_QUERY_PREFIX,
  FINANCIAL_QUERY_STALE_MS,
  getQueryClient,
  OPERATIONAL_QUERY_STALE_MS,
  QUERY_STALE_MS,
} from '../config/queryClient';
import { dashboardMetricsQueryKeys } from '../hooks/useDashboardMetrics';

describe('queryClient Phase 1 defaults', () => {
  it('keeps global stale time at 5 minutes', () => {
    assert.equal(QUERY_STALE_MS, 5 * 60 * 1000);
    const client = getQueryClient();
    assert.equal(client.getDefaultOptions().queries?.staleTime, QUERY_STALE_MS);
    assert.equal(client.getDefaultOptions().queries?.refetchOnWindowFocus, false);
  });

  it('applies financial tier with refetchOnWindowFocus', () => {
    const client = getQueryClient();
    const ledger = client.getQueryDefaults(['ledger']);
    assert.equal(ledger.staleTime, FINANCIAL_QUERY_STALE_MS);
    assert.equal(ledger.refetchOnWindowFocus, true);
    const dashboard = client.getQueryDefaults(dashboardMetricsQueryKeys.root);
    assert.equal(dashboard.staleTime, FINANCIAL_QUERY_STALE_MS);
    assert.equal(dashboard.refetchOnWindowFocus, true);
  });

  it('QI-1: dashboardMetrics financial prefix matches dashboardMetricsQueryKeys.root', () => {
    assert.equal(dashboardMetricsQueryKeys.root[0], 'dashboardMetrics');
    assert.deepEqual(DASHBOARD_METRICS_FINANCIAL_QUERY_PREFIX, dashboardMetricsQueryKeys.root);
    assert.doesNotThrow(() => assertDashboardMetricsQueryKeyPrefix());
  });

  it('applies operational tier without focus refetch', () => {
    const client = getQueryClient();
    const po = client.getQueryDefaults(['purchase-orders']);
    assert.equal(po.staleTime, OPERATIONAL_QUERY_STALE_MS);
    assert.equal(po.refetchOnWindowFocus, undefined);
  });
});
