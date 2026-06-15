/**
 * Guaranteed persistence for mission-critical local SQLite flows.
 * All financial writes should await this after state updates (use flushSync + save).
 */

import type { AppState } from '../../types';
import { getDatabaseService } from './databaseService';
import { AppStateRepository } from './repositories/appStateRepository';
import { logger } from '../logger';

/**
 * Persist the given app state to the native SQLite file and flush WAL to disk.
 * Throws if no company database is open or save fails (callers must surface errors — do not treat as success).
 */
export async function flushAppStateToDatabase(state: AppState): Promise<void> {
  const db = getDatabaseService();
  if (!db.isReady()) {
    await db.initialize();
  }
  if (!db.isReady()) {
    throw new Error('Cannot persist: no SQLite database is open. Open a company first.');
  }
  const repo = new AppStateRepository();
  await repo.saveState(state, true);
  const eds = db as unknown as { commitAllPendingToDisk?: () => Promise<{ ok: boolean; error?: string }> };
  if (typeof eds.commitAllPendingToDisk === 'function') {
    const r = await eds.commitAllPendingToDisk();
    if (!r.ok && r.error) {
      logger.warnCategory('database', 'WAL checkpoint after save:', r.error);
    }
  }
  logger.logCategory('database', '[DB COMMIT SUCCESS] Full state persisted to SQLite + WAL flush');
}
