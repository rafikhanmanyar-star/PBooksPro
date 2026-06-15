import { Router } from 'express';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { requirePermission } from '../../../middleware/rbacMiddleware.js';
import { requireBackupRestoreAdmin } from '../../../middleware/backupSecurityMiddleware.js';
import { sendFailure, sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import { getPool } from '../../../db/pool.js';
import {
  getBackupSecuritySettings,
  getBackupSecurityStatus,
  rotateBackupKeyVersion,
  updateBackupSecuritySettings,
} from '../services/backup/backupSecuritySettingsService.js';
import {
  canRestoreBackup,
  createRestoreSession,
  purgeExpiredRestoreSessions,
  RESTORE_CONFIRM_PHRASE,
} from '../services/backup/backupRestoreAuthService.js';
import { backupAuditContext } from '../services/backup/backupAuditService.js';

export const backupSecurityRouter = Router();

backupSecurityRouter.get(
  '/backups/security/status',
  requirePermission('backups.read'),
  async (_req, res) => {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const status = await getBackupSecurityStatus(client);
      sendSuccess(res, status);
    } catch (e) {
      handleRouteError(res, e, { route: 'GET /backups/security/status' });
    } finally {
      client.release();
    }
  }
);

backupSecurityRouter.get(
  '/backups/security/settings',
  requirePermission('backups.read'),
  async (_req, res) => {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const settings = await getBackupSecuritySettings(client);
      sendSuccess(res, settings);
    } catch (e) {
      handleRouteError(res, e, { route: 'GET /backups/security/settings' });
    } finally {
      client.release();
    }
  }
);

backupSecurityRouter.put(
  '/backups/security/settings',
  requirePermission('backups.manage'),
  async (req: AuthedRequest, res) => {
    const body = req.body ?? {};
    const pool = getPool();
    const client = await pool.connect();
    try {
      const settings = await updateBackupSecuritySettings(client, {
        encrypt_at_rest:
          typeof body.encrypt_at_rest === 'boolean' ? body.encrypt_at_rest : undefined,
        encrypt_before_upload:
          typeof body.encrypt_before_upload === 'boolean'
            ? body.encrypt_before_upload
            : undefined,
        require_restore_authorization:
          typeof body.require_restore_authorization === 'boolean'
            ? body.require_restore_authorization
            : undefined,
        min_backup_password_length:
          typeof body.min_backup_password_length === 'number'
            ? body.min_backup_password_length
            : undefined,
      });
      sendSuccess(res, settings);
    } catch (e) {
      handleRouteError(res, e, { route: 'PUT /backups/security/settings' });
    } finally {
      client.release();
    }
  }
);

backupSecurityRouter.post(
  '/backups/security/rotate-key',
  requirePermission('backups.manage'),
  async (_req, res) => {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const settings = await rotateBackupKeyVersion(client);
      sendSuccess(res, {
        settings,
        message:
          'Key version incremented. Update BACKUP_ENCRYPTION_KEY in the server environment to complete rotation.',
      });
    } catch (e) {
      handleRouteError(res, e, { route: 'POST /backups/security/rotate-key' });
    } finally {
      client.release();
    }
  }
);

backupSecurityRouter.get(
  '/backups/security/restore-policy',
  requirePermission('backups.read'),
  async (req: AuthedRequest, res) => {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const settings = await getBackupSecuritySettings(client);
      await purgeExpiredRestoreSessions(client);
      sendSuccess(res, {
        canRestore: canRestoreBackup(req.role),
        requireRestoreAuthorization: settings.require_restore_authorization,
        confirmPhrase: RESTORE_CONFIRM_PHRASE,
        role: req.role ?? null,
      });
    } catch (e) {
      handleRouteError(res, e, { route: 'GET /backups/security/restore-policy' });
    } finally {
      client.release();
    }
  }
);

backupSecurityRouter.post(
  '/backups/security/restore/authorize',
  requireBackupRestoreAdmin,
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    const userId = req.userId;
    if (!tenantId || !userId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }

    const confirmPhrase =
      typeof (req.body as { confirmPhrase?: string })?.confirmPhrase === 'string'
        ? (req.body as { confirmPhrase: string }).confirmPhrase
        : '';

    const pool = getPool();
    const client = await pool.connect();
    try {
      const session = await createRestoreSession(client, {
        tenantId,
        userId,
        confirmPhrase,
      });
      sendSuccess(res, session);
    } catch (e) {
      handleRouteError(res, e, { route: 'POST /backups/security/restore/authorize' });
    } finally {
      client.release();
    }
  }
);

/** Expose audit context helper for routes that need it */
export { backupAuditContext };
