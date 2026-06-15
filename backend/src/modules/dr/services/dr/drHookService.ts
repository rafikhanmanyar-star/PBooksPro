/**
 * Hooks from backup scheduler into DR alerts / auto-verify.
 */

import { getPool } from '../../../../db/pool.js';
import { getBackupRun } from '../../../backup/services/backupSchedulerService.js';
import { raiseBackupFailureAlert, raiseVerificationFailureAlert } from './drAlertService.js';
import { runVerificationForBackupRun } from './drVerificationService.js';

export async function onBackupJobFinished(runId: string, success: boolean): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const run = await getBackupRun(client, runId);
    if (!run) return;

    if (!success) {
      await raiseBackupFailureAlert(
        client,
        runId,
        run.job_id,
        run.failure_reason ?? 'Unknown failure'
      );
      return;
    }

    if (process.env.DR_AUTO_VERIFY === 'true' && run.storage_path) {
      try {
        const verification = await runVerificationForBackupRun(client, runId, null);
        if (verification.status === 'failed') {
          await raiseVerificationFailureAlert(
            client,
            runId,
            verification.failure_reason ?? 'Verification failed after backup.'
          );
        }
      } catch (e) {
        console.error('[DR Hook] Auto-verify failed:', e);
      }
    }
  } finally {
    client.release();
  }
}
