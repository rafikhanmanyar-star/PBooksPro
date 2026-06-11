import { getPool } from '../../../db/pool.js';
import { upsertSnapshot } from './DashboardSnapshotService.js';
import { BACKEND_KPI_REGISTRY } from './kpiRegistry.js';
import { getDashboardMetricsJson } from '../../../services/dashboard/dashboardMetricsService.js';
import { parseDashboardFilters } from '../../../services/dashboard/dashboardMetricsHelpers.js';
import { listAllTenantIds } from '../repositories/TenantListRepository.js';

const INTERVAL_MS = 24 * 60 * 60 * 1000;

export function startDashboardSnapshotScheduler(): void {
  const run = async () => {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const tenantIds = await listAllTenantIds(client);
      const today = new Date().toISOString().slice(0, 10);
      const filters = parseDashboardFilters({ from: `${today.slice(0, 8)}01`, to: today });

      for (const tid of tenantIds) {
        const t = { id: tid };
        try {
          const metrics = await getDashboardMetricsJson(client, t.id, filters);
          const findVal = (id: string) =>
            Number(metrics.financial.find((m) => m.id === id)?.value ?? 0);
          const ctx = {
            tenantId: t.id,
            revenue: findVal('revenue'),
            expenses: findVal('expenses'),
            receivables: findVal('accountsReceivable'),
            collections: Number(
              metrics.realEstate.find((m) => m.id === 'collectionRate')?.value ?? 0
            ),
          };
          for (const kpi of BACKEND_KPI_REGISTRY) {
            const value = kpi.compute(ctx);
            await upsertSnapshot(client, t.id, {
              snapshotDate: today,
              kpiKey: kpi.key,
              valueNumeric: value,
              periodStart: filters.from,
              periodEnd: filters.to,
            });
          }
        } catch (e) {
          console.warn(`[dashboard-snapshot] tenant ${t.id}:`, e);
        }
      }
    } finally {
      client.release();
    }
  };

  void run();
  setInterval(() => void run(), INTERVAL_MS);
}
