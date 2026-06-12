/**
 * Full PostgreSQL database backup (pg_dump) and restore (pg_restore).
 * AES-256 encrypted downloads; secure restore requires Super Admin / Company Admin authorization.
 */

import type { NextFunction, Response } from 'express';
import { Router } from 'express';
import { createReadStream, createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { requireOrgUserAdmin } from '../../../middleware/authMiddleware.js';
import { requireBackupRestoreAdmin } from '../../../middleware/backupSecurityMiddleware.js';
import { getPool } from '../../../db/pool.js';
import { sendFailure, sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import { buildTenantBackupPayload, compressTenantBackup } from '../../../services/tenantBackupService.js';
import {
  isDatabaseBackupRestoreEnabled,
  runPgDumpToFile,
} from '../../../services/fullPgBackupService.js';
import { runPgRestoreFromFile } from '../../../services/pgRestoreService.js';
import {
  encryptBackupForDownload,
  sha256Hex,
} from '../../../services/backup/backupCryptoService.js';
import { readBackupPlaintextFromBuffer } from '../../../services/backup/backupFileService.js';
import { getBackupSecuritySettings } from '../../../services/backup/backupSecuritySettingsService.js';
import {
  consumeRestoreSession,
  purgeExpiredRestoreSessions,
} from '../../../services/backup/backupRestoreAuthService.js';
import { backupAuditContext, logBackupAudit } from '../../../services/backup/backupAuditService.js';
import { getUserEmailForAudit } from '../services/backupAuditContext.js';

export const databaseBackupRouter = Router();

function requireBackupEnabled(_req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!process.env.DATABASE_URL) {
    sendFailure(res, 503, 'DB_NOT_CONFIGURED', 'DATABASE_URL is not configured on the server.');
    return;
  }
  if (!isDatabaseBackupRestoreEnabled()) {
    sendFailure(
      res,
      403,
      'BACKUP_DISABLED',
      'Database backup/restore is disabled for this server. Set ENABLE_DB_BACKUP_RESTORE=true in the API server environment, or use a localhost PostgreSQL URL.'
    );
    return;
  }
  next();
}

function backupPasswordFromRequest(req: AuthedRequest): string | undefined {
  const header = req.headers['x-backup-password'];
  if (typeof header === 'string' && header.trim()) return header.trim();
  const q = req.query.password;
  if (typeof q === 'string' && q.trim()) return q.trim();
  return undefined;
}

function restoreTokenFromRequest(req: AuthedRequest): string | undefined {
  const header = req.headers['x-restore-token'];
  if (typeof header === 'string' && header.trim()) return header.trim();
  return undefined;
}

/** Any admin: whether backup API is allowed (for Settings UI). */
databaseBackupRouter.get('/database/backup/capabilities', requireOrgUserAdmin, (_req: AuthedRequest, res) => {
  const hasUrl = !!process.env.DATABASE_URL;
  const enabled = hasUrl && isDatabaseBackupRestoreEnabled();
  sendSuccess(res, {
    backupRestoreEnabled: enabled,
    tenantBackupEnabled: enabled,
    format: 'custom',
    tenantFormat: 'json.gz',
    tenantRestoreEnabled: enabled,
    encryptedFormat: 'PBKENC1/PBKENC2',
    fileExtension: '.pbkenc',
    hint: enabled
      ? 'Full backup downloads are AES-256 encrypted. Optional backup password adds PBKENC2 protection. Restore requires Super Admin or Company Admin authorization.'
      : hasUrl
        ? 'Set ENABLE_DB_BACKUP_RESTORE=true in the API server environment to allow backup/restore when not using localhost.'
        : 'DATABASE_URL is not set on the API server.',
  });
});

/** Organization-scoped JSON backup (current tenant only; admin). */
databaseBackupRouter.get(
  '/database/backup/tenant',
  requireOrgUserAdmin,
  requireBackupEnabled,
  async (req: AuthedRequest, res: Response) => {
    const tenantId = req.tenantId;
    const userId = req.userId;
    if (!tenantId || !userId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const pool = getPool();
    try {
      const client = await pool.connect();
      try {
        const payload = await buildTenantBackupPayload(client, tenantId);
        const body = compressTenantBackup(payload);
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `pbooks-tenant-${tenantId}-${stamp}.json.gz`;
        const email = (await getUserEmailForAudit(client, userId)) ?? null;
        await logBackupAudit(client, {
          tenantId,
          userId,
          email,
          action: 'backup_downloaded',
          entityId: tenantId,
          summary: 'Organization tenant backup exported',
          details: { format: 'json.gz', sizeBytes: body.length },
          ctx: backupAuditContext(req),
        });
        res.setHeader('Content-Type', 'application/gzip');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', String(body.length));
        res.send(body);
      } finally {
        client.release();
      }
    } catch (e) {
      if (!res.headersSent) handleRouteError(res, e, { route: 'GET /database/backup/tenant' });
    }
  }
);

databaseBackupRouter.get(
  '/database/backup',
  requireOrgUserAdmin,
  requireBackupEnabled,
  async (req: AuthedRequest, res: Response) => {
    const tenantId = req.tenantId;
    const userId = req.userId;
    if (!tenantId || !userId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }

    const tmp = path.join(os.tmpdir(), `pbooks-backup-${Date.now()}.dump`);
    try {
      await runPgDumpToFile(tmp);
      const plain = await fs.readFile(tmp);
      const backupPassword = backupPasswordFromRequest(req);

      const pool = getPool();
      const client = await pool.connect();
      let minPasswordLen = 8;
      try {
        const sec = await getBackupSecuritySettings(client);
        minPasswordLen = sec.min_backup_password_length;
        if (backupPassword && backupPassword.length < minPasswordLen) {
          sendFailure(
            res,
            400,
            'WEAK_PASSWORD',
            `Backup password must be at least ${minPasswordLen} characters.`
          );
          return;
        }

        const encrypted = encryptBackupForDownload(plain, backupPassword);
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const ext = backupPassword ? '.pbkenc2' : '.pbkenc';
        const filename = `pbooks-full-backup-${stamp}${ext}`;
        const email = (await getUserEmailForAudit(client, userId)) ?? null;

        await logBackupAudit(client, {
          tenantId,
          userId,
          email,
          action: 'backup_created',
          summary: 'Full database backup created',
          details: {
            plainSha256: sha256Hex(plain),
            encryptedSizeBytes: encrypted.length,
            passwordProtected: !!backupPassword,
          },
          ctx: backupAuditContext(req),
        });
        await logBackupAudit(client, {
          tenantId,
          userId,
          email,
          action: 'backup_downloaded',
          summary: 'Full database backup downloaded',
          details: { filename, sizeBytes: encrypted.length, passwordProtected: !!backupPassword },
          ctx: backupAuditContext(req),
        });

        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', String(encrypted.length));
        res.send(encrypted);
      } finally {
        client.release();
      }
    } catch (e) {
      if (!res.headersSent) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('ENOENT') || msg.toLowerCase().includes('spawn')) {
          sendFailure(
            res,
            503,
            'PG_TOOLS_MISSING',
            'pg_dump was not found. Install PostgreSQL client tools and ensure pg_dump is on the server PATH.'
          );
        } else {
          handleRouteError(res, e, { route: 'GET /database/backup' });
        }
      }
    } finally {
      try {
        await fs.unlink(tmp);
      } catch {
        /* ignore */
      }
    }
  }
);

databaseBackupRouter.post(
  '/database/restore',
  requireBackupRestoreAdmin,
  requireBackupEnabled,
  async (req: AuthedRequest, res: Response) => {
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
        const token = restoreTokenFromRequest(req);
        if (!token) {
          sendFailure(
            res,
            403,
            'RESTORE_TOKEN_REQUIRED',
            'Restore authorization required. Call POST /backups/security/restore/authorize first.'
          );
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

    const tmpEnc = path.join(os.tmpdir(), `pbooks-restore-enc-${Date.now()}.bin`);
    const tmpPlain = path.join(os.tmpdir(), `pbooks-restore-${Date.now()}.dump`);
    try {
      await pipeline(req, createWriteStream(tmpEnc));

      const st = await fs.stat(tmpEnc);
      if (st.size < 64) {
        sendFailure(res, 400, 'INVALID_FILE', 'Backup file is empty or too small.');
        return;
      }

      const raw = await fs.readFile(tmpEnc);
      const backupPassword =
        typeof req.headers['x-backup-password'] === 'string'
          ? req.headers['x-backup-password'].trim()
          : undefined;

      let plain: Buffer;
      try {
        plain = await readBackupPlaintextFromBuffer(raw, { password: backupPassword });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        sendFailure(res, 400, 'DECRYPT_FAILED', msg);
        return;
      }

      await fs.writeFile(tmpPlain, plain);
      await runPgRestoreFromFile(tmpPlain);

      const auditClient = await pool.connect();
      try {
        const email = userId ? ((await getUserEmailForAudit(auditClient, userId)) ?? null) : null;
        await logBackupAudit(auditClient, {
          tenantId,
          userId,
          email,
          action: 'backup_restored',
          summary: 'Full database restored from backup file',
          details: { sizeBytes: plain.length },
          ctx: backupAuditContext(req),
        });
      } finally {
        auditClient.release();
      }

      sendSuccess(res, {
        ok: true,
        message: 'Database restored. Reload the application to reconnect.',
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('ENOENT') || msg.toLowerCase().includes('spawn')) {
        sendFailure(
          res,
          503,
          'PG_TOOLS_MISSING',
          'pg_restore was not found. Install PostgreSQL client tools and ensure pg_restore is on the server PATH.'
        );
        return;
      }
      handleRouteError(res, e, { route: 'POST /database/restore' });
    } finally {
      try {
        await fs.unlink(tmpEnc);
        await fs.unlink(tmpPlain);
      } catch {
        /* ignore */
      }
    }
  }
);
