import { Router } from 'express';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { requirePermission } from '../../../middleware/rbacMiddleware.js';
import { sendFailure, sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import { getPool } from '../../../db/pool.js';
import { getDrDashboard } from '../services/dr/drDashboardService.js';
import {
  listVerificationRuns,
  runVerificationForBackupRun,
  runVerificationForLatestBackup,
} from '../services/dr/drVerificationService.js';
import {
  listRestoreTests,
  runRecoveryTest,
  runRestoreSimulation,
  runRestoreTestForLatest,
} from '../services/dr/drRestoreTestService.js';
import {
  acknowledgeAlert,
  getNotificationSettings,
  listAlerts,
  updateNotificationSettings,
  raiseVerificationFailureAlert,
} from '../services/dr/drAlertService.js';
import {
  generateDrReport,
  getDrReport,
  listDrReports,
} from '../services/dr/drReportService.js';

export const disasterRecoveryRouter = Router();

disasterRecoveryRouter.get('/dr/dashboard', requirePermission('backups.read'), async (_req, res) => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const dashboard = await getDrDashboard(client);
    sendSuccess(res, dashboard);
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /dr/dashboard' });
  } finally {
    client.release();
  }
});

disasterRecoveryRouter.post(
  '/dr/verify/latest',
  requirePermission('backups.manage'),
  async (req: AuthedRequest, res) => {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const result = await runVerificationForLatestBackup(client, req.userId ?? null);
      if (result.status === 'failed') {
        await raiseVerificationFailureAlert(
          client,
          result.backup_run_id ?? '',
          result.failure_reason ?? 'Verification failed.'
        );
      }
      sendSuccess(res, result);
    } catch (e) {
      handleRouteError(res, e, { route: 'POST /dr/verify/latest' });
    } finally {
      client.release();
    }
  }
);

disasterRecoveryRouter.post(
  '/dr/verify/:runId',
  requirePermission('backups.manage'),
  async (req: AuthedRequest, res) => {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const result = await runVerificationForBackupRun(
        client,
        req.params.runId,
        req.userId ?? null
      );
      if (result.status === 'failed') {
        await raiseVerificationFailureAlert(
          client,
          req.params.runId,
          result.failure_reason ?? 'Verification failed.'
        );
      }
      sendSuccess(res, result);
    } catch (e) {
      handleRouteError(res, e, { route: 'POST /dr/verify/:runId' });
    } finally {
      client.release();
    }
  }
);

disasterRecoveryRouter.get(
  '/dr/verification/history',
  requirePermission('backups.read'),
  async (_req, res) => {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const items = await listVerificationRuns(client);
      sendSuccess(res, { items, count: items.length });
    } catch (e) {
      handleRouteError(res, e, { route: 'GET /dr/verification/history' });
    } finally {
      client.release();
    }
  }
);

disasterRecoveryRouter.post(
  '/dr/restore-test/latest',
  requirePermission('backups.manage'),
  async (req: AuthedRequest, res) => {
    const testType =
      req.body?.testType === 'recovery' ? ('recovery' as const) : ('simulation' as const);
    const pool = getPool();
    const client = await pool.connect();
    try {
      const result = await runRestoreTestForLatest(client, testType, req.userId ?? null);
      sendSuccess(res, result);
    } catch (e) {
      handleRouteError(res, e, { route: 'POST /dr/restore-test/latest' });
    } finally {
      client.release();
    }
  }
);

disasterRecoveryRouter.post(
  '/dr/restore-test/:runId/simulate',
  requirePermission('backups.manage'),
  async (req: AuthedRequest, res) => {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const result = await runRestoreSimulation(
        client,
        req.params.runId,
        req.userId ?? null
      );
      sendSuccess(res, result);
    } catch (e) {
      handleRouteError(res, e, { route: 'POST /dr/restore-test/:runId/simulate' });
    } finally {
      client.release();
    }
  }
);

disasterRecoveryRouter.post(
  '/dr/restore-test/:runId/recovery',
  requirePermission('backups.manage'),
  async (req: AuthedRequest, res) => {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const result = await runRecoveryTest(client, req.params.runId, req.userId ?? null);
      sendSuccess(res, result);
    } catch (e) {
      handleRouteError(res, e, { route: 'POST /dr/restore-test/:runId/recovery' });
    } finally {
      client.release();
    }
  }
);

disasterRecoveryRouter.get(
  '/dr/restore-tests/history',
  requirePermission('backups.read'),
  async (_req, res) => {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const items = await listRestoreTests(client);
      sendSuccess(res, { items, count: items.length });
    } catch (e) {
      handleRouteError(res, e, { route: 'GET /dr/restore-tests/history' });
    } finally {
      client.release();
    }
  }
);

disasterRecoveryRouter.get('/dr/alerts', requirePermission('backups.read'), async (req, res) => {
  const acknowledged =
    req.query.acknowledged === 'true'
      ? true
      : req.query.acknowledged === 'false'
        ? false
        : undefined;
  const pool = getPool();
  const client = await pool.connect();
  try {
    const items = await listAlerts(client, { acknowledged });
    sendSuccess(res, { items, count: items.length });
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /dr/alerts' });
  } finally {
    client.release();
  }
});

disasterRecoveryRouter.post(
  '/dr/alerts/:alertId/acknowledge',
  requirePermission('backups.manage'),
  async (req: AuthedRequest, res) => {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const alert = await acknowledgeAlert(client, req.params.alertId, req.userId ?? '');
      if (!alert) {
        sendFailure(res, 404, 'NOT_FOUND', 'Alert not found or already acknowledged.');
        return;
      }
      sendSuccess(res, alert);
    } catch (e) {
      handleRouteError(res, e, { route: 'POST /dr/alerts/:alertId/acknowledge' });
    } finally {
      client.release();
    }
  }
);

disasterRecoveryRouter.get(
  '/dr/notifications/settings',
  requirePermission('backups.read'),
  async (_req, res) => {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const settings = await getNotificationSettings(client);
      sendSuccess(res, settings);
    } catch (e) {
      handleRouteError(res, e, { route: 'GET /dr/notifications/settings' });
    } finally {
      client.release();
    }
  }
);

disasterRecoveryRouter.put(
  '/dr/notifications/settings',
  requirePermission('backups.manage'),
  async (req: AuthedRequest, res) => {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const body = req.body ?? {};
      const settings = await updateNotificationSettings(client, {
        enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
        email_recipients: Array.isArray(body.email_recipients)
          ? body.email_recipients.filter((e: unknown) => typeof e === 'string')
          : undefined,
        alert_on_backup_failure:
          typeof body.alert_on_backup_failure === 'boolean'
            ? body.alert_on_backup_failure
            : undefined,
        alert_on_verification_failure:
          typeof body.alert_on_verification_failure === 'boolean'
            ? body.alert_on_verification_failure
            : undefined,
        alert_on_stale_backup:
          typeof body.alert_on_stale_backup === 'boolean' ? body.alert_on_stale_backup : undefined,
        stale_backup_hours:
          typeof body.stale_backup_hours === 'number' ? body.stale_backup_hours : undefined,
      });
      sendSuccess(res, settings);
    } catch (e) {
      handleRouteError(res, e, { route: 'PUT /dr/notifications/settings' });
    } finally {
      client.release();
    }
  }
);

disasterRecoveryRouter.post(
  '/dr/reports/generate',
  requirePermission('backups.manage'),
  async (req: AuthedRequest, res) => {
    const reportType =
      req.body?.reportType === 'weekly'
        ? 'weekly'
        : req.body?.reportType === 'daily_health'
          ? 'daily_health'
          : 'manual';
    const pool = getPool();
    const client = await pool.connect();
    try {
      const report = await generateDrReport(client, {
        reportType,
        requestedBy: req.userId ?? null,
      });
      sendSuccess(res, report);
    } catch (e) {
      handleRouteError(res, e, { route: 'POST /dr/reports/generate' });
    } finally {
      client.release();
    }
  }
);

disasterRecoveryRouter.get('/dr/reports', requirePermission('backups.read'), async (_req, res) => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const items = await listDrReports(client);
    sendSuccess(res, { items, count: items.length });
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /dr/reports' });
  } finally {
    client.release();
  }
});

disasterRecoveryRouter.get(
  '/dr/reports/:reportId',
  requirePermission('backups.read'),
  async (req, res) => {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const report = await getDrReport(client, req.params.reportId);
      if (!report) {
        sendFailure(res, 404, 'NOT_FOUND', 'Report not found.');
        return;
      }
      sendSuccess(res, report);
    } catch (e) {
      handleRouteError(res, e, { route: 'GET /dr/reports/:reportId' });
    } finally {
      client.release();
    }
  }
);
