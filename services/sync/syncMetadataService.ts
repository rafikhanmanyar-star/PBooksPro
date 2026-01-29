/**
 * Sync Metadata Service
 *
 * Stores last_synced_at (and last_pull_at) per tenant for incremental sync.
 * Used by bidirectional sync to fetch only changes since last sync.
 */

import { getDatabaseService } from '../database/databaseService';
import { isMobileDevice } from '../../utils/platformDetection';

const DEFAULT_EPOCH = '1970-01-01T00:00:00.000Z';

export interface SyncMetadataRow {
  tenant_id: string;
  entity_type: string;
  last_synced_at: string;
  last_pull_at: string | null;
  updated_at: string;
}

class SyncMetadataService {
  private get db() {
    if (isMobileDevice()) throw new Error('SyncMetadataService is for desktop only');
    return getDatabaseService();
  }

  /**
   * Get last synced timestamp for downstream pull (incremental).
   * Returns ISO string or DEFAULT_EPOCH if never synced.
   */
  getLastPullAt(tenantId: string): string {
    if (!this.db.isReady()) return DEFAULT_EPOCH;
    const row = this.db.query<SyncMetadataRow>(
      `SELECT last_pull_at FROM sync_metadata WHERE tenant_id = ? AND entity_type = '_global' LIMIT 1`,
      [tenantId]
    )[0];
    const at = row?.last_pull_at;
    return at && at !== '' ? at : DEFAULT_EPOCH;
  }

  /**
   * Set last pull timestamp after successful downstream sync.
   */
  setLastPullAt(tenantId: string, isoTimestamp: string): void {
    if (!this.db.isReady()) return;
    this.db.execute(
      `INSERT INTO sync_metadata (tenant_id, entity_type, last_synced_at, last_pull_at, updated_at)
       VALUES (?, '_global', ?, ?, datetime('now'))
       ON CONFLICT(tenant_id, entity_type) DO UPDATE SET
         last_pull_at = excluded.last_pull_at,
         updated_at = datetime('now')`,
      [tenantId, isoTimestamp, isoTimestamp]
    );
  }

  /**
   * Get last synced-at for a specific entity type (optional granularity).
   */
  getLastSyncedAt(tenantId: string, entityType: string = '_global'): string {
    if (!this.db.isReady()) return DEFAULT_EPOCH;
    const row = this.db.query<SyncMetadataRow>(
      `SELECT last_synced_at FROM sync_metadata WHERE tenant_id = ? AND entity_type = ? LIMIT 1`,
      [tenantId, entityType]
    )[0];
    const at = row?.last_synced_at;
    return at && at !== '' ? at : DEFAULT_EPOCH;
  }

  /**
   * Set last synced-at for an entity type (e.g. after upstream push).
   */
  setLastSyncedAt(tenantId: string, entityType: string, isoTimestamp: string): void {
    if (!this.db.isReady()) return;
    this.db.execute(
      `INSERT INTO sync_metadata (tenant_id, entity_type, last_synced_at, last_pull_at, updated_at)
       VALUES (?, ?, ?, NULL, datetime('now'))
       ON CONFLICT(tenant_id, entity_type) DO UPDATE SET
         last_synced_at = excluded.last_synced_at,
         updated_at = datetime('now')`,
      [tenantId, entityType, isoTimestamp]
    );
  }
}

let instance: SyncMetadataService | null = null;

export function getSyncMetadataService(): SyncMetadataService {
  if (!instance) instance = new SyncMetadataService();
  return instance;
}
