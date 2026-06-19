import type pg from 'pg';
import { getConnectedClientsSnapshot } from '../../core/realtime.js';
import { getObservabilityStatus } from '../monitoring/observabilityProvider.js';
import { getMonitoringStats } from '../monitoring/monitoringEventService.js';
import { aggregateHealth, runHealthChecks } from '../monitoring/monitoringHealthService.js';
import { getApiMetricsSummary } from './apiMetricsStore.js';
import { getDatabaseObservability } from './databaseObservabilityService.js';
import { getSyncDiagnostics } from './syncDiagnosticsService.js';
import { getAuditCoverageReport } from './auditCoverageService.js';

export type HealthCenterSnapshot = {
  generatedAt: string;
  overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  frontend: {
    note: string;
    clientTelemetryIngest: boolean;
  };
  backend: {
    api: ReturnType<typeof getApiMetricsSummary>;
    components: Awaited<ReturnType<typeof runHealthChecks>>;
    observability: ReturnType<typeof getObservabilityStatus>;
  };
  synchronization: Awaited<ReturnType<typeof getSyncDiagnostics>> & {
    connectedSocketClients: number;
  };
  database: Awaited<ReturnType<typeof getDatabaseObservability>>;
  audit: Awaited<ReturnType<typeof getAuditCoverageReport>>;
  errors: Awaited<ReturnType<typeof getMonitoringStats>>;
};

export async function getHealthCenterSnapshot(client: pg.PoolClient): Promise<HealthCenterSnapshot> {
  const [components, database, sync, audit, errors] = await Promise.all([
    runHealthChecks(client),
    getDatabaseObservability(client),
    getSyncDiagnostics(client),
    getAuditCoverageReport(client, 30),
    getMonitoringStats(client, 24),
  ]);

  const aggregated = aggregateHealth(components);
  const api = getApiMetricsSummary(60);
  const sockets = await getConnectedClientsSnapshot();

  let overallStatus = aggregated.status;
  if (sync.queue.failed > 0 || sync.queue.pending > 100) {
    overallStatus = overallStatus === 'healthy' ? 'degraded' : overallStatus;
  }
  if (api.slowCriticalCount > 10 || errors.recentErrors > 100) {
    overallStatus = 'unhealthy';
  } else if (api.slowWarningCount > 20 || errors.recentErrors > 25) {
    if (overallStatus === 'healthy') overallStatus = 'degraded';
  }

  return {
    generatedAt: new Date().toISOString(),
    overallStatus,
    frontend: {
      note: 'Client metrics via POST /monitoring/telemetry and client-errors ingest.',
      clientTelemetryIngest: true,
    },
    backend: {
      api,
      components,
      observability: getObservabilityStatus(),
    },
    synchronization: {
      ...sync,
      connectedSocketClients: sockets.total,
    },
    database,
    audit,
    errors,
  };
}
