import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import {
  integrationTestsEnabled,
  INTEGRATION_TENANT_ID,
  prepareIntegrationTenant,
  withRollbackTransaction,
} from '../../test/integrationHarness.js';
import { defaultDashboardPeriod, dashboardCacheKey } from './dashboardMetricsHelpers.js';
import { getDashboardMetricsJson } from './dashboardMetricsService.js';
import { getDashboardChartsJson } from './dashboardChartsService.js';
import { getDashboardActivityJson } from './dashboardActivityService.js';
import { memoryCacheGet, memoryCacheSet } from '../../utils/memoryCache.js';

/** Design target: cold PostgreSQL aggregation (see doc/DASHBOARD_MODERNIZATION_AUDIT.md). */
const COLD_MS_MAX = Number(process.env.DASHBOARD_PERF_COLD_MS_MAX ?? 2000);

/** Design target: in-memory cache hit + JSON serialization (route hot path). */
const CACHED_MS_MAX = Number(process.env.DASHBOARD_PERF_CACHED_MS_MAX ?? 500);

async function timeMs(fn: () => Promise<void>): Promise<number> {
  const start = performance.now();
  await fn();
  return performance.now() - start;
}

const describePerf = integrationTestsEnabled() ? describe : describe.skip;

describePerf('dashboard analytics cold-path performance', () => {
  it('metrics, charts, and activity meet cold-path budget', async () => {
    await withRollbackTransaction(async (client) => {
      await prepareIntegrationTenant(client);

      const filters = {
        ...defaultDashboardPeriod(),
        comparisonPeriod: 'previous_period' as const,
      };
      const year = new Date().getFullYear();

      const metricsMs = await timeMs(async () => {
        await getDashboardMetricsJson(client, INTEGRATION_TENANT_ID, filters);
      });

      const chartsMs = await timeMs(async () => {
        await getDashboardChartsJson(client, INTEGRATION_TENANT_ID, filters, year);
      });

      const activityMs = await timeMs(async () => {
        await getDashboardActivityJson(client, INTEGRATION_TENANT_ID, 5);
      });

      assert.ok(
        metricsMs < COLD_MS_MAX,
        `getDashboardMetricsJson took ${metricsMs.toFixed(1)}ms (max ${COLD_MS_MAX}ms)`
      );
      assert.ok(
        chartsMs < COLD_MS_MAX,
        `getDashboardChartsJson took ${chartsMs.toFixed(1)}ms (max ${COLD_MS_MAX}ms)`
      );
      assert.ok(
        activityMs < COLD_MS_MAX,
        `getDashboardActivityJson took ${activityMs.toFixed(1)}ms (max ${COLD_MS_MAX}ms)`
      );

      console.info(
        '[dashboard-perf] cold ms:',
        JSON.stringify({ metricsMs: Math.round(metricsMs), chartsMs: Math.round(chartsMs), activityMs: Math.round(activityMs) })
      );
    });
  });

  it('memory cache hit path meets cached budget', async () => {
    await withRollbackTransaction(async (client) => {
      await prepareIntegrationTenant(client);

      const filters = {
        ...defaultDashboardPeriod(),
        comparisonPeriod: 'none' as const,
      };
      const data = await getDashboardMetricsJson(client, INTEGRATION_TENANT_ID, filters);
      const cacheKey = dashboardCacheKey(INTEGRATION_TENANT_ID, filters);
      memoryCacheSet(cacheKey, data, 300_000);

      const cachedMs = await timeMs(async () => {
        const hit = memoryCacheGet<typeof data>(cacheKey);
        assert.ok(hit, 'expected cache hit');
        JSON.stringify(hit);
      });

      assert.ok(
        cachedMs < CACHED_MS_MAX,
        `cached metrics path took ${cachedMs.toFixed(1)}ms (max ${CACHED_MS_MAX}ms)`
      );

      console.info('[dashboard-perf] cached ms:', Math.round(cachedMs));
    });
  });
});
