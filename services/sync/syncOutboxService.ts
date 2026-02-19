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
  private tableVerified = false;

  private get db() {
    if (isMobileDevice()) throw new Error('SyncOutboxService is for desktop only');
    return getDatabaseService();
  }

  private ensureTable(): void {
    if (this.tableVerified) return;
    const db = this.db;
    if (!db.isReady()) return;
    try {
      const tables = db.query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='sync_outbox'"
      );
      if (tables.length === 0) {
        db.execute(`
          CREATE TABLE IF NOT EXISTS sync_outbox (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            user_id TEXT,
            entity_type TEXT NOT NULL,
            action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
            entity_id TEXT NOT NULL,
            payload_json TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            synced_at TEXT,
            status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'syncing', 'synced', 'failed')),
            retry_count INTEGER NOT NULL DEFAULT 0,
            error_message TEXT
          )
        `);
        db.execute('CREATE INDEX IF NOT EXISTS idx_sync_outbox_tenant_status ON sync_outbox(tenant_id, status)');
        db.execute('CREATE INDEX IF NOT EXISTS idx_sync_outbox_created ON sync_outbox(created_at)');
        console.log('[SyncOutbox] Created missing sync_outbox table');
      }
      this.tableVerified = true;
    } catch (err) {
      console.warn('[SyncOutbox] ensureTable failed:', err);
    }
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
    this.ensureTable();
    this.db.execute(
      `INSERT INTO sync_outbox (id, tenant_id, user_id, entity_type, action, entity_id, payload_json, created_at, updated_at, synced_at, status, retry_count, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), NULL, 'pending', 0, NULL)`,
      [id, tenantId, userId ?? null, entityType, action, entityId, payloadJson]
    );
    this.db.save();
    return id;
  }

  private static readonly MAX_RETRIES = 10;

  /**
   * Get all pending items for a tenant (oldest first).
   * Applies exponential backoff for failed items: retry_count N waits 2^N seconds before retry.
   * Items that have exceeded MAX_RETRIES are auto-marked as permanently failed and excluded.
   */
  getPending(tenantId: string): SyncOutboxItem[] {
    if (!this.db.isReady()) return [];
    this.ensureTable();
    const rows = this.db.query<SyncOutboxItem>(
      `SELECT * FROM sync_outbox WHERE tenant_id = ? AND status IN ('pending', 'failed') ORDER BY created_at ASC`,
      [tenantId]
    );
    const now = Date.now() / 1000; // seconds
    return rows.filter((item) => {
      if ((item.retry_count || 0) >= SyncOutboxService.MAX_RETRIES) {
        this.markPermanentlyFailed(item.id, item.error_message || 'Max retries exceeded');
        return false;
      }
      if (item.status === 'pending') return true;
      // Exponential backoff for failed: wait 2^retry_count seconds
      const backoffSeconds = Math.pow(2, Math.min(item.retry_count || 0, 10));
      const updatedAt = item.updated_at ? new Date(item.updated_at).getTime() / 1000 : 0;
      const elapsed = now - updatedAt;
      return elapsed >= backoffSeconds;
    });
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
   * Mark item as permanently failed (won't be retried).
   */
  markPermanentlyFailed(id: string, errorMessage: string): void {
    if (!this.db.isReady()) return;
    this.db.execute(
      `UPDATE sync_outbox SET status = 'synced', updated_at = datetime('now'), error_message = ? WHERE id = ?`,
      [`PERMANENT: ${errorMessage?.slice(0, 480) ?? 'Max retries exceeded'}`, id]
    );
    this.db.save();
  }

  /**
   * Mark ALL pending/failed entries for a given entity as synced.
   * Used when the server confirms the entity state is correct (e.g. TRANSACTION_IMMUTABLE).
   */
  markAllSyncedForEntity(tenantId: string, entityType: string, entityId: string): void {
    if (!this.db.isReady()) return;
    this.db.execute(
      `UPDATE sync_outbox SET status = 'synced', synced_at = datetime('now'), updated_at = datetime('now'), error_message = NULL
       WHERE tenant_id = ? AND entity_type = ? AND entity_id = ? AND status IN ('pending', 'failed', 'syncing')`,
      [tenantId, entityType, entityId]
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
