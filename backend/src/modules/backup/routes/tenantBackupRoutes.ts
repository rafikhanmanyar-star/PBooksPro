/**
 * Tenant backup validate / preview / restore API.
 */

import { Router } from 'express';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { requirePermission } from '../../../middleware/rbacMiddleware.js';
import { requireBackupRestoreAdmin } from '../../../middleware/backupSecurityMiddleware.js';
import { sendFailure, sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import { getPool } from '../../../db/pool.js';
import {
  buildTenantBackupPayload,
  compressTenantBackup,
  decompressTenantBackup,
} from '../services/tenantBackupService.js';
import {
  buildRestorePreview,
  executeTenantRestore,
  listTenantRestoreRuns,
  type ConflictPolicy,
  type RestoreMode,
} from '../services/tenantRestoreService.js';
import { isDatabaseBackupRestoreEnabled } from '../services/fullPgBackupService.js';
import {
  consumeRestoreSession,
  purgeExpiredRestoreSessions,
} from '../services/backup/backupRestoreAuthService.js';
import { getBackupSecuritySettings } from '../services/backup/backupSecuritySettingsService.js';
import { backupAuditContext, logBackupAudit } from '../services/backup/backupAuditService.js';
import { getUserEmailForAudit } from '../services/backupAuditContext.js';

export const tenantBackupRouter = Router();

function requireTenantBackupEnabled(_req: AuthedRequest, res: import('express').Response, next: import('express').NextFunction): void {
  if (!process.env.DATABASE_URL) {
    sendFailure(res, 503, 'DB_NOT_CONFIGURED', 'DATABASE_URL is not configured.');
    return;
  }
  if (!isDatabaseBackupRestoreEnabled()) {
    sendFailure(res, 403, 'BACKUP_DISABLED', 'Tenant backup/restore is disabled on this server.');
    return;
  }
  next();
}

function parseMode(raw: unknown): RestoreMode | null {
  if (raw === 'existing_tenant' || raw === 'new_tenant') return raw;
  return null;
}

function parsePolicy(raw: unknown): ConflictPolicy | null {
  if (raw === 'replace' || raw === 'skip' || raw === 'merge') return raw;
  return null;
}

async function readBackupFromRequest(req: AuthedRequest): Promise<Buffer> {
  const body = req.body as { backupBase64?: string } | undefined;
  if (body?.backupBase64 && typeof body.backupBase64 === 'string') {
    return Buffer.from(body.backupBase64, 'base64');
  }
  throw new Error('backupBase64 is required in the request body.');
}

/** Export tenant business data (v2 JSON.gz). */
tenantBackupRouter.get(
  '/backups/tenant/export',
  requirePermission('backups.manage'),
  requireTenantBackupEnabled,
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const pool = getPool();
    const client = await pool.connect();
    try {
      const payload = await buildTenantBackupPayload(client, tenantId);
      const body = compressTenantBackup(payload);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `pbooks-tenant-${tenantId}-${stamp}.json.gz`;
      const email = (await getUserEmailForAudit(client, req.userId)) ?? null;
      await logBackupAudit(client, {
        tenantId,
        userId: req.userId,
        email,
        action: 'backup_downloaded',
        entityId: tenantId,
        summary: 'Tenant backup exported via API',
        details: { format: 'json.gz', sizeBytes: body.length },
        ctx: backupAuditContext(req),
      });
      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', String(body.length));
      res.send(body);
    } catch (e) {
      if (!res.headersSent) handleRouteError(res, e, { route: 'GET /backups/tenant/export' });
    } finally {
      client.release();
    }
  }
);

/** Dry-run validation + restore preview. */
tenantBackupRouter.post(
  '/backups/tenant/validate',
  requirePermission('backups.read'),
  requireTenantBackupEnabled,
  async (req: AuthedRequest, res) => {
    try {
      const buf = await readBackupFromRequest(req);
      const payload = decompressTenantBackup(buf);
      const mode = parseMode((req.body as { mode?: string })?.mode) ?? 'existing_tenant';
      const conflictPolicy =
        parsePolicy((req.body as { conflictPolicy?: string })?.conflictPolicy) ?? 'replace';
      const body = req.body as {
        newTenantName?: string;
        targetTenantId?: string;
      };

      const pool = getPool();
      const client = await pool.connect();
      try {
        const targetTenantId =
          mode === 'existing_tenant' ? body.targetTenantId ?? req.tenantId ?? '' : body.targetTenantId;

        const preview = await buildRestorePreview(client, payload, {
          mode,
          targetTenantId,
          newTenantName: body.newTenantName,
          conflictPolicy,
        });
        sendSuccess(res, preview);
      } finally {
        client.release();
      }
    } catch (e) {
      handleRouteError(res, e, { route: 'POST /backups/tenant/validate' });
    }
  }
);

/** Execute restore (transactional; rolls back on failure). */
tenantBackupRouter.post(
  '/backups/tenant/restore',
  requireBackupRestoreAdmin,
  requireTenantBackupEnabled,
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId;
      const userId = req.userId;
      if (!tenantId || !userId) {
        sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
        return;
      }

      const pool = getPool();
      const authClient = await pool.connect();
      try {
        const settings = await getBackupSecuritySettings(authClient);
        await purgeExpiredRestoreSessions(authClient);
        if (settings.require_restore_authorization) {
          const token =
            typeof (req.body as { restoreToken?: string })?.restoreToken === 'string'
              ? (req.body as { restoreToken: string }).restoreToken
              : typeof req.headers['x-restore-token'] === 'string'
                ? req.headers['x-restore-token'].trim()
                : '';
          if (!token) {
            sendFailure(res, 403, 'RESTORE_TOKEN_REQUIRED', 'Restore authorization required.');
            return;
          }
          const ok = await consumeRestoreSession(authClient, token, userId, tenantId);
          if (!ok) {
            sendFailure(res, 403, 'RESTORE_TOKEN_INVALID', 'Restore authorization token is invalid or expired.');
            return;
          }
        }
      } finally {
        authClient.release();
      }

      const buf = await readBackupFromRequest(req);
      const payload = decompressTenantBackup(buf);
      const body = req.body as {
        mode?: string;
        conflictPolicy?: string;
        newTenantName?: string;
        targetTenantId?: string;
        confirm?: boolean;
      };

      if (body.confirm !== true) {
        sendFailure(
          res,
          400,
          'CONFIRMATION_REQUIRED',
          'Set confirm=true after reviewing the validation report.'
        );
        return;
      }

      const mode = parseMode(body.mode);
      if (!mode) {
        sendFailure(res, 400, 'INVALID_MODE', 'mode must be existing_tenant or new_tenant.');
        return;
      }
      const conflictPolicy = parsePolicy(body.conflictPolicy) ?? 'replace';

      const client = await pool.connect();
      try {
        const targetTenantId =
          mode === 'existing_tenant' ? body.targetTenantId ?? req.tenantId ?? '' : body.targetTenantId;

        if (mode === 'existing_tenant' && targetTenantId !== req.tenantId) {
          sendFailure(
            res,
            403,
            'TENANT_MISMATCH',
            'Cannot restore into a different organization than your session.'
          );
          return;
        }

        const result = await executeTenantRestore(client, payload, {
          mode,
          targetTenantId,
          newTenantName: body.newTenantName,
          conflictPolicy,
          requestedBy: req.userId,
        });
        const email = (await getUserEmailForAudit(client, userId)) ?? null;
        await logBackupAudit(client, {
          tenantId,
          userId,
          email,
          action: 'backup_restored',
          entityId: result.restoreRunId,
          summary: 'Tenant data restored from backup',
          details: { mode, targetTenantId, conflictPolicy },
          ctx: backupAuditContext(req),
        });
        sendSuccess(res, result);
      } finally {
        client.release();
      }
    } catch (e) {
      handleRouteError(res, e, { route: 'POST /backups/tenant/restore' });
    }
  }
);

tenantBackupRouter.get(
  '/backups/tenant/restore/history',
  requirePermission('backups.read'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const pool = getPool();
    const client = await pool.connect();
    try {
      const items = await listTenantRestoreRuns(client, tenantId);
      sendSuccess(res, { items, count: items.length });
    } catch (e) {
      handleRouteError(res, e, { route: 'GET /backups/tenant/restore/history' });
    } finally {
      client.release();
    }
  }
);
