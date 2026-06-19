import { Router } from 'express';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { getPool } from '../../../db/pool.js';
import { sendFailure, sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import { MONITORING_CATEGORIES, CATEGORY_LABELS } from '../../../constants/monitoring.js';
import type { MonitoringCategory } from '../../../constants/monitoring.js';
import {
  getMonitoringStats,
  listMonitoringEvents,
} from '../../../services/monitoring/monitoringEventService.js';
import {
  acknowledgeAlert,
  listOpenAlerts,
  resolveAlert,
} from '../../../services/monitoring/monitoringAlertService.js';
import {
  aggregateHealth,
  getStoredHealthChecks,
  runHealthChecks,
} from '../../../services/monitoring/monitoringHealthService.js';
import { getObservabilityStatus } from '../../../services/monitoring/observabilityProvider.js';
import {
  getApiMetricsSummary,
  getSlowApiReport,
  getAuditCoverageReport,
  getDatabaseObservability,
  getHealthCenterSnapshot,
  getSyncDiagnostics,
} from '../../../services/telemetry/index.js';

export const adminMonitoringRouter = Router();

adminMonitoringRouter.get('/admin/monitoring/overview', async (req, res) => {
  const hours = Math.min(Number(req.query.hours ?? 24), 168);
  const client = await getPool().connect();
  try {
    const [stats, alerts, health] = await Promise.all([
      getMonitoringStats(client, hours),
      listOpenAlerts(client, 20),
      getStoredHealthChecks(client),
    ]);
    const aggregated = aggregateHealth(health.length ? health : []);
    sendSuccess(res, {
      stats,
      alerts,
      health: aggregated,
      observability: getObservabilityStatus(),
      categories: MONITORING_CATEGORIES.map((c) => ({ id: c, label: CATEGORY_LABELS[c] })),
      windowHours: hours,
    });
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /admin/monitoring/overview' });
  } finally {
    client.release();
  }
});

adminMonitoringRouter.get('/admin/monitoring/events', async (req, res) => {
  const category = typeof req.query.category === 'string' ? req.query.category : undefined;
  const severity = typeof req.query.severity === 'string' ? req.query.severity : undefined;
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  const tenantId = typeof req.query.tenantId === 'string' ? req.query.tenantId : undefined;
  const limit = Number(req.query.limit ?? 100);
  const offset = Number(req.query.offset ?? 0);

  const client = await getPool().connect();
  try {
    const result = await listMonitoringEvents(client, {
      category: category as MonitoringCategory | undefined,
      severity: severity as 'error' | undefined,
      search,
      tenantId,
      limit,
      offset,
    });
    sendSuccess(res, result);
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /admin/monitoring/events' });
  } finally {
    client.release();
  }
});

adminMonitoringRouter.get('/admin/monitoring/health', async (_req, res) => {
  const client = await getPool().connect();
  try {
    const components = await runHealthChecks(client);
    sendSuccess(res, aggregateHealth(components));
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /admin/monitoring/health' });
  } finally {
    client.release();
  }
});

adminMonitoringRouter.get('/admin/monitoring/alerts', async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 100);
  const client = await getPool().connect();
  try {
    const alerts = await listOpenAlerts(client, limit);
    sendSuccess(res, { alerts });
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /admin/monitoring/alerts' });
  } finally {
    client.release();
  }
});

adminMonitoringRouter.post('/admin/monitoring/alerts/:id/acknowledge', async (req, res) => {
  const authed = req as AuthedRequest;
  const client = await getPool().connect();
  try {
    await acknowledgeAlert(client, String(req.params.id), authed.userId ?? 'system');
    sendSuccess(res, { ok: true });
  } catch (e) {
    handleRouteError(res, e, { route: 'POST /admin/monitoring/alerts/:id/acknowledge' });
  } finally {
    client.release();
  }
});

adminMonitoringRouter.post('/admin/monitoring/alerts/:id/resolve', async (req, res) => {
  const client = await getPool().connect();
  try {
    await resolveAlert(client, String(req.params.id));
    sendSuccess(res, { ok: true });
  } catch (e) {
    handleRouteError(res, e, { route: 'POST /admin/monitoring/alerts/:id/resolve' });
  } finally {
    client.release();
  }
});

adminMonitoringRouter.get('/admin/monitoring/health-center', async (_req, res) => {
  const client = await getPool().connect();
  try {
    const snapshot = await getHealthCenterSnapshot(client);
    sendSuccess(res, snapshot);
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /admin/monitoring/health-center' });
  } finally {
    client.release();
  }
});

adminMonitoringRouter.get('/admin/monitoring/api-stats', async (req, res) => {
  const minutes = Math.min(Number(req.query.minutes ?? 60), 1440);
  sendSuccess(res, getApiMetricsSummary(minutes));
});

adminMonitoringRouter.get('/admin/monitoring/slow-apis', async (req, res) => {
  const minutes = Math.min(Number(req.query.minutes ?? 60), 1440);
  const limit = Math.min(Number(req.query.limit ?? 20), 100);
  sendSuccess(res, {
    endpoints: getSlowApiReport(minutes, limit),
    thresholds: getApiMetricsSummary(minutes).thresholds,
  });
});

adminMonitoringRouter.get('/admin/monitoring/database', async (_req, res) => {
  const client = await getPool().connect();
  try {
    sendSuccess(res, await getDatabaseObservability(client));
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /admin/monitoring/database' });
  } finally {
    client.release();
  }
});

adminMonitoringRouter.get('/admin/monitoring/sync-diagnostics', async (_req, res) => {
  const client = await getPool().connect();
  try {
    sendSuccess(res, await getSyncDiagnostics(client));
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /admin/monitoring/sync-diagnostics' });
  } finally {
    client.release();
  }
});

adminMonitoringRouter.get('/admin/monitoring/audit-coverage', async (req, res) => {
  const days = Math.min(Number(req.query.days ?? 30), 365);
  const client = await getPool().connect();
  try {
    sendSuccess(res, await getAuditCoverageReport(client, days));
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /admin/monitoring/audit-coverage' });
  } finally {
    client.release();
  }
});
