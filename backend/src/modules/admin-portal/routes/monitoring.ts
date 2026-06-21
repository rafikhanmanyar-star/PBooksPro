// @ts-nocheck
/**
 * Platform admin portal — cross-tenant system health & monitoring.
 * Mounted at /api/admin/monitoring behind adminAuthMiddleware (admin_users).
 * Relocated from the tenant API to enforce tenant isolation — platform-wide
 * health/telemetry must never be reachable by a tenant token.
 */
import { Router } from 'express';
import { getPool } from '../../../db/pool.js';
import { sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import { MONITORING_CATEGORIES, CATEGORY_LABELS } from '../../../constants/monitoring.js';
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
import { requireAdminPortalSuperAdmin } from '../../../adminPortal/middleware/requireAdminPortalSuperAdmin.js';

const router = Router();

router.get('/overview', async (req, res) => {
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

router.get('/events', async (req, res) => {
  const category = typeof req.query.category === 'string' ? req.query.category : undefined;
  const severity = typeof req.query.severity === 'string' ? req.query.severity : undefined;
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  const tenantId = typeof req.query.tenantId === 'string' ? req.query.tenantId : undefined;
  const limit = Number(req.query.limit ?? 100);
  const offset = Number(req.query.offset ?? 0);
  const client = await getPool().connect();
  try {
    const result = await listMonitoringEvents(client, {
      category,
      severity,
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

router.get('/health', async (_req, res) => {
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

router.get('/alerts', async (req, res) => {
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

router.post('/alerts/:id/acknowledge', requireAdminPortalSuperAdmin(), async (req, res) => {
  const client = await getPool().connect();
  try {
    await acknowledgeAlert(client, String(req.params.id), req.adminId ?? 'system');
    sendSuccess(res, { ok: true });
  } catch (e) {
    handleRouteError(res, e, { route: 'POST /admin/monitoring/alerts/:id/acknowledge' });
  } finally {
    client.release();
  }
});

router.post('/alerts/:id/resolve', requireAdminPortalSuperAdmin(), async (req, res) => {
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

router.get('/health-center', async (_req, res) => {
  const client = await getPool().connect();
  try {
    sendSuccess(res, await getHealthCenterSnapshot(client));
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /admin/monitoring/health-center' });
  } finally {
    client.release();
  }
});

router.get('/api-stats', async (req, res) => {
  const minutes = Math.min(Number(req.query.minutes ?? 60), 1440);
  sendSuccess(res, getApiMetricsSummary(minutes));
});

router.get('/slow-apis', async (req, res) => {
  const minutes = Math.min(Number(req.query.minutes ?? 60), 1440);
  const limit = Math.min(Number(req.query.limit ?? 20), 100);
  sendSuccess(res, {
    endpoints: getSlowApiReport(minutes, limit),
    thresholds: getApiMetricsSummary(minutes).thresholds,
  });
});

router.get('/database', async (_req, res) => {
  const client = await getPool().connect();
  try {
    sendSuccess(res, await getDatabaseObservability(client));
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /admin/monitoring/database' });
  } finally {
    client.release();
  }
});

router.get('/sync-diagnostics', async (_req, res) => {
  const client = await getPool().connect();
  try {
    sendSuccess(res, await getSyncDiagnostics(client));
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /admin/monitoring/sync-diagnostics' });
  } finally {
    client.release();
  }
});

router.get('/audit-coverage', async (req, res) => {
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

export default router;
