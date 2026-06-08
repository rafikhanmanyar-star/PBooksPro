import { Router } from 'express';
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/rbacMiddleware.js';
import { requireBackupRestoreAdmin } from '../middleware/backupSecurityMiddleware.js';
import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';
import { getPool } from '../db/pool.js';
import {
  getBackupJob,
  getBackupRun,
  deleteBackupRun,
  isBackupSchedulerEnabled,
  listBackupHistory,
  listBackupJobs,
  retryFailedRun,
  runBackupJobById,
  getBackupStorageRoot,
} from '../services/backupSchedulerService.js';
import { backupAuditContext, logBackupAudit } from '../services/backup/backupAuditService.js';
import {
  isDatabaseBackupRestoreEnabled,
  isPgBackupAvailable,
} from '../services/fullPgBackupService.js';

export const backupSchedulerRouter = Router();

backupSchedulerRouter.get('/backups/scheduler/status', requirePermission('backups.read'), (_req, res) => {
  sendSuccess(res, {
    schedulerEnabled: isBackupSchedulerEnabled(),
    pgBackupAvailable: isPgBackupAvailable(),
    backupRestoreEnabled: isDatabaseBackupRestoreEnabled(),
    storageRoot: getBackupStorageRoot(),
  });
});

backupSchedulerRouter.get('/backups/jobs', requirePermission('backups.read'), async (_req: AuthedRequest, res) => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const jobs = await listBackupJobs(client);
    sendSuccess(res, { items: jobs, count: jobs.length });
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /backups/jobs' });
  } finally {
    client.release();
  }
});

backupSchedulerRouter.get('/backups/history', requirePermission('backups.read'), async (req: AuthedRequest, res) => {
  const q = req.query;
  const jobId = typeof q.jobId === 'string' ? q.jobId : undefined;
  const limitRaw = q.limit;
  const offsetRaw = q.offset;
  const limit = typeof limitRaw === 'string' && limitRaw !== '' ? Number(limitRaw) : undefined;
  const offset = typeof offsetRaw === 'string' && offsetRaw !== '' ? Number(offsetRaw) : undefined;

  const pool = getPool();
  const client = await pool.connect();
  try {
    const result = await listBackupHistory(client, { jobId, limit, offset });
    sendSuccess(res, result);
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /backups/history' });
  } finally {
    client.release();
  }
});

backupSchedulerRouter.get('/backups/runs/:runId', requirePermission('backups.read'), async (req: AuthedRequest, res) => {
  const runId = req.params.runId;
  const pool = getPool();
  const client = await pool.connect();
  try {
    const run = await getBackupRun(client, runId);
    if (!run) {
      sendFailure(res, 404, 'NOT_FOUND', 'Backup run not found.');
      return;
    }
    sendSuccess(res, run);
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /backups/runs/:runId' });
  } finally {
    client.release();
  }
});

backupSchedulerRouter.post(
  '/backups/jobs/:jobId/run',
  requirePermission('backups.manage'),
  async (req: AuthedRequest, res) => {
    const jobId = req.params.jobId;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const pool = getPool();
    const client = await pool.connect();
    try {
      const job = await getBackupJob(client, jobId);
      if (!job) {
        sendFailure(res, 404, 'NOT_FOUND', 'Backup job not found.');
        return;
      }
    } finally {
      client.release();
    }

    try {
      const run = await runBackupJobById(jobId, 1);
      if (tenantId && run.success) {
        const auditClient = await pool.connect();
        try {
          const { rows } = await auditClient.query(`SELECT email FROM users WHERE id = $1`, [userId]);
          await logBackupAudit(auditClient, {
            tenantId,
            userId,
            email: rows[0]?.email ?? null,
            action: 'backup_created',
            entityId: run.id,
            summary: `Manual backup job run: ${run.job_name ?? jobId}`,
            details: { jobId, runId: run.id, sizeBytes: run.size_bytes },
            ctx: backupAuditContext(req),
          });
        } finally {
          auditClient.release();
        }
      }
      sendSuccess(res, run);
    } catch (e) {
      handleRouteError(res, e, { route: 'POST /backups/jobs/:jobId/run' });
    }
  }
);

backupSchedulerRouter.post(
  '/backups/runs/:runId/retry',
  requirePermission('backups.manage'),
  async (req: AuthedRequest, res) => {
    const runId = req.params.runId;
    try {
      const run = await retryFailedRun(runId);
      sendSuccess(res, run);
    } catch (e) {
      handleRouteError(res, e, { route: 'POST /backups/runs/:runId/retry' });
    }
  }
);

backupSchedulerRouter.delete(
  '/backups/runs/:runId',
  requirePermission('backups.manage'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    const userId = req.userId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const pool = getPool();
    const client = await pool.connect();
    try {
      const run = await getBackupRun(client, req.params.runId);
      if (!run) {
        sendFailure(res, 404, 'NOT_FOUND', 'Backup run not found.');
        return;
      }
      const result = await deleteBackupRun(client, req.params.runId);
      const { rows } = await client.query(`SELECT email FROM users WHERE id = $1`, [userId]);
      await logBackupAudit(client, {
        tenantId,
        userId,
        email: rows[0]?.email ?? null,
        action: 'backup_deleted',
        entityId: req.params.runId,
        summary: 'Scheduled backup run deleted',
        details: { storagePath: result.storagePath, jobId: run.job_id },
        ctx: backupAuditContext(req),
      });
      sendSuccess(res, result);
    } catch (e) {
      handleRouteError(res, e, { route: 'DELETE /backups/runs/:runId' });
    } finally {
      client.release();
    }
  }
);
