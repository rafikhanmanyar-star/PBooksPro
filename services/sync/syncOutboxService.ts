/**
 * Sync Outbox Service
 *
 * Persistent change log in SQLite (sync_outbox table). When offline, write operations
 * are stored here; when online, bidirectional sync pushes these to the cloud.
 */

import { getDatabaseService } from '../database/databaseService';
import { isMobileDevice } from '../../utils/platformDetection';

export type OutboxAction = 'create' | 'update' | 'delete';
export type OutboxStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export interface SyncOutboxItem {
  id: string;
  tenant_id: string;
  user_id: string | null;
  entity_type: string;
  action: OutboxAction;
  entity_id: string;
  payload_json: string | null;
  created_at: string;
  updated_at: string;
  synced_at: string | null;
  status: OutboxStatus;
  retry_count: number;
  error_message: string | null;
}

function generateId(): string {
  return `outbox_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

class SyncOutboxService {
  private get db() {
    if (isMobileDevice()) throw new Error('SyncOutboxService is for desktop only');
    return getDatabaseService();
  }

  /**
   * Enqueue a write for later sync (call when offline or from queue path).
   */
  enqueue(
    tenantId: string,
    entityType: string,
    action: OutboxAction,
    entityId: string,
    payload: unknown,
    userId?: string
  ): string {
    const id = generateId();
    const payloadJson = payload != null ? JSON.stringify(payload) : null;
    if (!this.db.isReady()) {
      console.warn('[SyncOutbox] DB not ready, skipping enqueue');
      return id;
    }
    this.db.execute(
      `INSERT INTO sync_outbox (id, tenant_id, user_id, entity_type, action, entity_id, payload_json, created_at, updated_at, synced_at, status, retry_count, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), NULL, 'pending', 0, NULL)`,
      [id, tenantId, userId ?? null, entityType, action, entityId, payloadJson]
    );
    this.db.save();
    return id;
  }

  /**
   * Get all pending items for a tenant (oldest first).
   */
  getPending(tenantId: string): SyncOutboxItem[] {
    if (!this.db.isReady()) return [];
    const rows = this.db.query<SyncOutboxItem>(
      `SELECT * FROM sync_outbox WHERE tenant_id = ? AND status IN ('pending', 'failed') ORDER BY created_at ASC`
    );
    return rows;
  }

  /**
   * Mark item as syncing (optional, for progress UI).
   */
  markSyncing(id: string): void {
    if (!this.db.isReady()) return;
    this.db.execute(
      `UPDATE sync_outbox SET status = 'syncing', updated_at = datetime('now') WHERE id = ?`,
      [id]
    );
    this.db.save();
  }

  /**
   * Mark item as synced after successful push.
   */
  markSynced(id: string): void {
    if (!this.db.isReady()) return;
    this.db.execute(
      `UPDATE sync_outbox SET status = 'synced', synced_at = datetime('now'), updated_at = datetime('now'), error_message = NULL WHERE id = ?`,
      [id]
    );
    this.db.save();
  }

  /**
   * Mark item as failed (will retry on next sync).
   */
  markFailed(id: string, errorMessage: string): void {
    if (!this.db.isReady()) return;
    this.db.execute(
      `UPDATE sync_outbox SET status = 'failed', updated_at = datetime('now'), retry_count = retry_count + 1, error_message = ? WHERE id = ?`,
      [errorMessage?.slice(0, 500) ?? 'Unknown error', id]
    );
    this.db.save();
  }

  /**
   * Count pending items for a tenant.
   */
  getPendingCount(tenantId: string): number {
    if (!this.db.isReady()) return 0;
    const row = this.db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM sync_outbox WHERE tenant_id = ? AND status IN ('pending', 'failed')`,
      [tenantId]
    )[0];
    return row?.count ?? 0;
  }

  /**
   * Remove synced items older than given days (cleanup).
   */
  clearSyncedOlderThanDays(tenantId: string, days: number): number {
    if (!this.db.isReady()) return 0;
    this.db.execute(
      `DELETE FROM sync_outbox WHERE tenant_id = ? AND status = 'synced' AND datetime(synced_at) < datetime('now', ?)`,
      [tenantId, `-${days} days`]
    );
    this.db.save();
    return 1;
  }
}

let instance: SyncOutboxService | null = null;

export function getSyncOutboxService(): SyncOutboxService {
  if (!instance) instance = new SyncOutboxService();
  return instance;
}
