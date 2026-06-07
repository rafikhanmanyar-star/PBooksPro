import type { Response, NextFunction } from 'express';
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import { sendFailure } from '../utils/apiResponse.js';
import { canRestoreBackup } from '../services/backup/backupRestoreAuthService.js';

/** Only Super Admin and Company Admin may restore backups. */
export function requireBackupRestoreAdmin(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!canRestoreBackup(req.role)) {
    sendFailure(
      res,
      403,
      'RESTORE_FORBIDDEN',
      'Only Super Admin and Company Admin can restore backups.'
    );
    return;
  }
  next();
}
