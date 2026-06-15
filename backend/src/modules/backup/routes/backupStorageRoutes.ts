import { Router } from 'express';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { requirePermission } from '../../../middleware/rbacMiddleware.js';
import { requireBackupRestoreAdmin } from '../../../middleware/backupSecurityMiddleware.js';
import { sendFailure, sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import { getPool } from '../../../db/pool.js';
import {
  getStorageSettingsRow,
  saveStorageSettings,
  testStorageConnection,
  toPublicSettings,
  type SaveBackupStorageSettingsInput,
} from '../services/backup/backupStorageSettingsService.js';
import type { StorageProviderId } from '../services/backup/storage/types.js';
import { defaultEndpointHint } from '../services/backup/storage/providerFactory.js';
import {
  executeOffsiteUploadForRun,
  listOffsiteUploads,
  restoreDatabaseFromCloudRun,
  retryOffsiteUpload,
} from '../services/backup/backupOffsiteService.js';
import {
  consumeRestoreSession,
  purgeExpiredRestoreSessions,
} from '../services/backup/backupRestoreAuthService.js';
import { getBackupSecuritySettings } from '../services/backup/backupSecuritySettingsService.js';
import { backupAuditContext, logBackupAudit } from '../services/backup/backupAuditService.js';
import { getUserEmailForAudit } from '../services/backupAuditContext.js';

export const backupStorageRouter = Router();

const VALID_PROVIDERS: StorageProviderId[] = [
  'aws_s3',
  'cloudflare_r2',
  'backblaze_b2',
  'azure_blob',
];

function parseProvider(raw: unknown): StorageProviderId | null {
  if (typeof raw !== 'string') return null;
  return VALID_PROVIDERS.includes(raw as StorageProviderId) ? (raw as StorageProviderId) : null;
}

backupStorageRouter.get('/backups/storage/settings', requirePermission('backups.read'), async (_req, res) => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const row = await getStorageSettingsRow(client);
    sendSuccess(res, {
      settings: toPublicSettings(row),
      endpointHint: defaultEndpointHint(toPublicSettings(row).provider),
    });
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /backups/storage/settings' });
  } finally {
    client.release();
  }
});

backupStorageRouter.put('/backups/storage/settings', requirePermission('backups.manage'), async (req: AuthedRequest, res) => {
  const body = req.body as Partial<SaveBackupStorageSettingsInput>;
  const provider = parseProvider(body.provider);
  if (!provider) {
    sendFailure(res, 400, 'INVALID_PROVIDER', 'Invalid storage provider.');
    return;
  }
  if (!body.bucketName?.trim()) {
    sendFailure(res, 400, 'INVALID_BUCKET', 'Bucket / container name is required.');
    return;
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    const saved = await saveStorageSettings(client, {
      provider,
      bucketName: body.bucketName,
      region: body.region ?? null,
      endpointUrl: body.endpointUrl ?? null,
      enabled: body.enabled,
      autoUpload: body.autoUpload,
      accessKey: body.accessKey,
      secretKey: body.secretKey,
    });
    sendSuccess(res, { settings: saved });
  } catch (e) {
    handleRouteError(res, e, { route: 'PUT /backups/storage/settings' });
  } finally {
    client.release();
  }
});

backupStorageRouter.post('/backups/storage/test', requirePermission('backups.manage'), async (req: AuthedRequest, res) => {
  const body = req.body as Partial<SaveBackupStorageSettingsInput> | undefined;
  const pool = getPool();
  const client = await pool.connect();
  try {
    if (body?.provider) {
      const provider = parseProvider(body.provider);
      if (!provider) {
        sendFailure(res, 400, 'INVALID_PROVIDER', 'Invalid storage provider.');
        return;
      }
      await testStorageConnection(client, {
        provider,
        bucketName: body.bucketName ?? '',
        region: body.region ?? null,
        endpointUrl: body.endpointUrl ?? null,
        accessKey: body.accessKey,
        secretKey: body.secretKey,
      });
    } else {
      await testStorageConnection(client);
    }
    sendSuccess(res, { ok: true, message: 'Connection successful. Probe object uploaded and verified.' });
  } catch (e) {
    handleRouteError(res, e, { route: 'POST /backups/storage/test' });
  } finally {
    client.release();
  }
});

backupStorageRouter.get('/backups/offsite/uploads', requirePermission('backups.read'), async (req: AuthedRequest, res) => {
  const runId = typeof req.query.runId === 'string' ? req.query.runId : undefined;
  const pool = getPool();
  const client = await pool.connect();
  try {
    const items = await listOffsiteUploads(client, { runId });
    sendSuccess(res, { items, count: items.length });
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /backups/offsite/uploads' });
  } finally {
    client.release();
  }
});

backupStorageRouter.post(
  '/backups/runs/:runId/offsite/upload',
  requirePermission('backups.manage'),
  async (req: AuthedRequest, res) => {
    try {
      const upload = await executeOffsiteUploadForRun(req.params.runId, 1);
      sendSuccess(res, upload);
    } catch (e) {
      handleRouteError(res, e, { route: 'POST /backups/runs/:runId/offsite/upload' });
    }
  }
);

backupStorageRouter.post(
  '/backups/runs/:runId/offsite/retry',
  requirePermission('backups.manage'),
  async (req: AuthedRequest, res) => {
    try {
      const upload = await retryOffsiteUpload(req.params.runId);
      sendSuccess(res, upload);
    } catch (e) {
      handleRouteError(res, e, { route: 'POST /backups/runs/:runId/offsite/retry' });
    }
  }
);

backupStorageRouter.post(
  '/backups/runs/:runId/restore-from-cloud',
  requireBackupRestoreAdmin,
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    const userId = req.userId;
    if (!tenantId || !userId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }

    const pool = getPool();
    const client = await pool.connect();
    try {
      const settings = await getBackupSecuritySettings(client);
      await purgeExpiredRestoreSessions(client);
      if (settings.require_restore_authorization) {
        const token =
          typeof req.headers['x-restore-token'] === 'string'
            ? req.headers['x-restore-token'].trim()
            : typeof (req.body as { restoreToken?: string })?.restoreToken === 'string'
              ? (req.body as { restoreToken: string }).restoreToken
              : '';
        if (!token) {
          sendFailure(res, 403, 'RESTORE_TOKEN_REQUIRED', 'Restore authorization required.');
          return;
        }
        const ok = await consumeRestoreSession(client, token, userId, tenantId);
        if (!ok) {
          sendFailure(res, 403, 'RESTORE_TOKEN_INVALID', 'Restore authorization token is invalid or expired.');
          return;
        }
      }
    } finally {
      client.release();
    }

    try {
      const result = await restoreDatabaseFromCloudRun(req.params.runId);
      const auditClient = await pool.connect();
      try {
        const email = (await getUserEmailForAudit(auditClient, userId)) ?? null;
        await logBackupAudit(auditClient, {
          tenantId,
          userId,
          email,
          action: 'backup_restored',
          entityId: req.params.runId,
          summary: 'Database restored from cloud backup',
          details: { runId: req.params.runId, source: 'cloud' },
          ctx: backupAuditContext(req),
        });
      } finally {
        auditClient.release();
      }
      sendSuccess(res, result);
    } catch (e) {
      handleRouteError(res, e, { route: 'POST /backups/runs/:runId/restore-from-cloud' });
    }
  }
);
