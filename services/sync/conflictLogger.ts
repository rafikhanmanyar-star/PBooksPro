/**
 * Conflict Logger Service
 *
 * Persists all sync conflict resolutions to the sync_conflicts table
 * for audit trail, admin visibility, and compliance.
 *
 * Every conflict — whether auto-resolved or flagged for manual review —
 * is logged with both local and remote data snapshots.
 */

import { getDatabaseService } from '../database/databaseService';
import { isMobileDevice } from '../../utils/platformDetection';

export interface ConflictLogEntry {
  tenantId: string;
  entityType: string;
  entityId: string;
  localVersion?: number;
  remoteVersion?: number;
  localData: unknown;
  remoteData: unknown;
  resolution: string; // 'local_wins' | 'remote_wins' | 'merged' | 'pending_review'
  resolvedBy?: string; // user_id or 'auto'
  deviceId?: string;
}

function generateId(): string {
  return `conflict_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Log a conflict resolution to the sync_conflicts table.
 */
export function logConflict(entry: ConflictLogEntry): void {
  if (isMobileDevice()) return; // Mobile doesn't have local SQLite

  try {
    const db = getDatabaseService();
    if (!db.isReady()) return;

    db.execute(
      `INSERT INTO sync_conflicts
        (id, tenant_id, entity_type, entity_id, local_version, remote_version,
         local_data, remote_data, resolution, resolved_by, device_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        generateId(),
        entry.tenantId,
        entry.entityType,
        entry.entityId,
        entry.localVersion ?? null,
        entry.remoteVersion ?? null,
        entry.localData != null ? JSON.stringify(entry.localData) : null,
        entry.remoteData != null ? JSON.stringify(entry.remoteData) : null,
        entry.resolution,
        entry.resolvedBy ?? 'auto',
        entry.deviceId ?? null,
      ]
    );
    db.save();
  } catch (error) {
    // Best-effort: don't crash sync because of a logging failure
    console.warn('[ConflictLogger] Failed to log conflict:', error);
  }
}

/**
 * Get recent conflicts for a tenant (for admin visibility).
 */
export function getRecentConflicts(tenantId: string, limit: number = 50): ConflictLogEntry[] {
  if (isMobileDevice()) return [];

  try {
    const db = getDatabaseService();
    if (!db.isReady()) return [];

    return db.query<any>(
      `SELECT * FROM sync_conflicts WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?`,
      [tenantId, limit]
    );
  } catch {
    return [];
  }
}

/**
 * Get count of unresolved conflicts (pending_review) for a tenant.
 */
export function getPendingReviewCount(tenantId: string): number {
  if (isMobileDevice()) return 0;

  try {
    const db = getDatabaseService();
    if (!db.isReady()) return 0;

    const result = db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM sync_conflicts WHERE tenant_id = ? AND resolution = 'pending_review'`,
      [tenantId]
    );
    return result[0]?.count ?? 0;
  } catch {
    return 0;
  }
}
