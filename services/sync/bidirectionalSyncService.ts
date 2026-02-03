/**
 * Bi-directional Sync Service
 *
 * Production-ready sync: connectivity-driven, outbox-based upstream,
 * incremental downstream, conflict resolution (LWW by default).
 */

import { getConnectionMonitor } from '../connectionMonitor';
import { getSyncOutboxService } from './syncOutboxService';
import { getSyncMetadataService } from './syncMetadataService';
import { getConflictResolver, buildConflictContext, ConflictResult } from './conflictResolution';
import { getAppStateApiService } from '../api/appStateApi';
import { apiClient } from '../api/client';
import { getSyncManager } from './syncManager';
import { isMobileDevice } from '../../utils/platformDetection';
import { logger } from '../logger';
import { BaseRepository } from '../database/repositories/baseRepository';
import { AppStateRepository } from '../database/repositories/appStateRepository';

const ENTITY_TO_ENDPOINT: Record<string, string> = {
  accounts: '/accounts',
  contacts: '/contacts',
  categories: '/categories',
  projects: '/projects',
  buildings: '/buildings',
  properties: '/properties',
  units: '/units',
  transactions: '/transactions',
  invoices: '/invoices',
  bills: '/bills',
  budgets: '/budgets',
  plan_amenities: '/plan-amenities',
  contracts: '/contracts',
  sales_returns: '/sales-returns',
  quotations: '/quotations',
  documents: '/documents',
  recurring_invoice_templates: '/recurring-invoice-templates',
  pm_cycle_allocations: '/pm-cycle-allocations',
  rental_agreements: '/rental-agreements',
  project_agreements: '/project-agreements',
  installment_plans: '/installment-plans',
};

export interface BidirectionalSyncResult {
  upstream: { pushed: number; failed: number };
  downstream: { applied: number; skipped: number };
  success: boolean;
}

class BidirectionalSyncService {
  private connectionUnsubscribe: (() => void) | null = null;
  private isRunning = false;

  /**
   * Start listening for connectivity and run sync when online.
   */
  start(tenantId: string | null): void {
    if (isMobileDevice()) return;
    if (this.connectionUnsubscribe) return;

    const monitor = getConnectionMonitor();
    this.connectionUnsubscribe = monitor.subscribe((status) => {
      if (status === 'online' && tenantId && !this.isRunning) {
        logger.logCategory('sync', '🌐 Online: starting bi-directional sync');
        this.runSync(tenantId).catch((err) => {
          logger.errorCategory('sync', 'Bidirectional sync error:', err);
        });
      }
    });
  }

  stop(): void {
    if (this.connectionUnsubscribe) {
      this.connectionUnsubscribe();
      this.connectionUnsubscribe = null;
    }
  }

  /**
   * Run full bi-directional sync: upstream (push outbox) then downstream (pull changes).
   */
  async runSync(tenantId: string): Promise<BidirectionalSyncResult> {
    if (isMobileDevice()) {
      return { upstream: { pushed: 0, failed: 0 }, downstream: { applied: 0, skipped: 0 }, success: true };
    }

    const monitor = getConnectionMonitor();
    if (!monitor.isOnline()) {
      logger.logCategory('sync', '⏸️ Skipping sync: offline');
      return { upstream: { pushed: 0, failed: 0 }, downstream: { applied: 0, skipped: 0 }, success: true };
    }

    if (this.isRunning) {
      logger.logCategory('sync', '⏸️ Sync already in progress');
      return { upstream: { pushed: 0, failed: 0 }, downstream: { applied: 0, skipped: 0 }, success: true };
    }

    logger.logCategory('sync', '🔄 Starting bi-directional sync for tenant:', tenantId);
    this.isRunning = true;
    const result: BidirectionalSyncResult = {
      upstream: { pushed: 0, failed: 0 },
      downstream: { applied: 0, skipped: 0 },
      success: true,
    };

    try {
      logger.logCategory('sync', '📤 Running upstream sync...');
      result.upstream = await this.runUpstream(tenantId);
      logger.logCategory('sync', '📤 Upstream result:', result.upstream);

      logger.logCategory('sync', '📥 Running downstream sync...');
      result.downstream = await this.runDownstream(tenantId);
      logger.logCategory('sync', '📥 Downstream result:', result.downstream);

      result.success = result.upstream.failed === 0;
      logger.logCategory('sync', '✅ Bi-directional sync completed successfully');
    } catch (error) {
      logger.errorCategory('sync', '❌ Bidirectional sync failed:', error);
      result.success = false;
    } finally {
      this.isRunning = false;
    }

    return result;
  }

  /**
   * Upstream: push pending items from BOTH sync_outbox AND SyncManager queue.
   * Prioritizes sync_outbox (persistent) but falls back to SyncManager (in-memory) if needed.
   */
  private async runUpstream(tenantId: string): Promise<{ pushed: number; failed: number }> {
    const outbox = getSyncOutboxService();
    const metadata = getSyncMetadataService();
    const syncManager = getSyncManager();
    let pushed = 0;
    let failed = 0;

    // Process sync_outbox items (persistent queue)
    const outboxPending = outbox.getPending(tenantId);
    for (const item of outboxPending) {
      outbox.markSyncing(item.id);
      const endpoint = ENTITY_TO_ENDPOINT[item.entity_type] || `/${item.entity_type.replace(/_/g, '-')}`;
      const payload = item.payload_json ? JSON.parse(item.payload_json) : null;

      try {
        if (item.action === 'delete') {
          await apiClient.delete(`${endpoint}/${item.entity_id}`);
        } else {
          await apiClient.post(endpoint, payload);
        }
        outbox.markSynced(item.id);
        pushed++;
        syncManager.removeByEntity(item.entity_type, item.entity_id);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        outbox.markFailed(item.id, msg);
        failed++;
      }
    }

    // ALSO process SyncManager queue (in case outbox wasn't populated yet)
    // This ensures existing queued operations are synced
    logger.logCategory('sync', '📤 Checking SyncManager queue...');
    const syncMgrStatus = syncManager.getQueueStatus();
    logger.logCategory('sync', `📤 SyncManager status: ${syncMgrStatus.total} total, ${syncMgrStatus.pending} pending, ${syncMgrStatus.syncing} syncing, ${syncMgrStatus.failed} failed`);

    if (syncMgrStatus.pending > 0 || syncMgrStatus.failed > 0) {
      logger.logCategory('sync', `📤 SyncManager has ${syncMgrStatus.pending} pending + ${syncMgrStatus.failed} failed, triggering syncQueueBatch...`);
      try {
        await syncManager.syncQueueBatch();
        logger.logCategory('sync', '📤 SyncManager.syncQueueBatch completed');
        // Count as pushed (syncManager logs internally)
      } catch (syncMgrError) {
        logger.errorCategory('sync', '❌ SyncManager.syncQueueBatch failed:', syncMgrError);
      }
    } else {
      logger.logCategory('sync', '📤 SyncManager queue is empty, nothing to sync');
    }

    if (pushed > 0) {
      metadata.setLastSyncedAt(tenantId, '_global', new Date().toISOString());
    }
    logger.logCategory('sync', `📤 Upstream: ${pushed} from outbox, SyncManager also processed`);
    return { pushed, failed };
  }

  /**
   * Downstream: pull incremental changes from cloud and apply to local with conflict resolution.
   */
  private async runDownstream(tenantId: string): Promise<{ applied: number; skipped: number }> {
    const metadata = getSyncMetadataService();
    const api = getAppStateApiService();
    const since = metadata.getLastPullAt(tenantId);

    let response;
    try {
      response = await api.loadStateChanges(since);
    } catch (error) {
      logger.errorCategory('sync', 'Downstream fetch failed:', error);
      return { applied: 0, skipped: 0 };
    }

    const entities = response?.entities ?? {};
    let applied = 0;
    let skipped = 0;

    BaseRepository.disableSyncQueueing();
    try {
      const appStateRepo = new AppStateRepository();
      const resolver = getConflictResolver();

      for (const [entityKey, items] of Object.entries(entities)) {
        if (!Array.isArray(items)) continue;
        for (const remote of items) {
          const id = (remote as { id?: string }).id;
          if (!id) continue;
          try {
            const local = appStateRepo.getEntityById(entityKey, id);
            const context = buildConflictContext(entityKey, id, local ?? {}, remote as Record<string, unknown>);
            const resolution: ConflictResult = resolver.resolve(context);

            if (resolution.use === 'local') {
              skipped++;
              continue;
            }
            const toApply = resolution.merged ?? remote;
            appStateRepo.upsertEntity(entityKey, toApply as Record<string, unknown>);
            applied++;
          } catch (err) {
            logger.warnCategory('sync', `Downstream apply ${entityKey}/${id}:`, err);
            skipped++;
          }
        }
      }
    } finally {
      BaseRepository.enableSyncQueueing();
    }

    metadata.setLastPullAt(tenantId, new Date().toISOString());
    logger.logCategory('sync', `📥 Downstream: ${applied} applied, ${skipped} skipped`);
    return { applied, skipped };
  }
}

let instance: BidirectionalSyncService | null = null;

export function getBidirectionalSyncService(): BidirectionalSyncService {
  if (!instance) instance = new BidirectionalSyncService();
  return instance;
}
