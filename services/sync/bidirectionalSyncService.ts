/**
 * Bi-directional Sync Service
 *
 * Production-ready sync: connectivity-driven, outbox-based upstream,
 * incremental downstream, tiered conflict resolution.
 *
 * Security features:
 * - Client-side tenant validation on all push/pull operations
 * - Idempotency keys to prevent duplicate processing
 * - Optimistic version checking
 * - Lock manager integration
 * - Conflict logging to sync_conflicts table
 */

import { getConnectionMonitor } from '../connectionMonitor';
import { getSyncOutboxService } from './syncOutboxService';
import { getSyncMetadataService } from './syncMetadataService';
import { getConflictResolver, buildConflictContext, ConflictResult } from './conflictResolution';
import { logConflict } from './conflictLogger';
import { getLockManager } from './lockManager';
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
  downstream: { applied: number; skipped: number; conflicts: number };
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
        logger.logCategory('sync', 'Online: starting bi-directional sync');
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
      return { upstream: { pushed: 0, failed: 0 }, downstream: { applied: 0, skipped: 0, conflicts: 0 }, success: true };
    }

    const monitor = getConnectionMonitor();
    if (!monitor.isOnline()) {
      logger.logCategory('sync', 'Skipping sync: offline');
      return { upstream: { pushed: 0, failed: 0 }, downstream: { applied: 0, skipped: 0, conflicts: 0 }, success: true };
    }

    if (this.isRunning) {
      logger.logCategory('sync', 'Sync already in progress');
      return { upstream: { pushed: 0, failed: 0 }, downstream: { applied: 0, skipped: 0, conflicts: 0 }, success: true };
    }

    logger.logCategory('sync', 'Starting bi-directional sync for tenant:', tenantId);
    this.isRunning = true;
    const result: BidirectionalSyncResult = {
      upstream: { pushed: 0, failed: 0 },
      downstream: { applied: 0, skipped: 0, conflicts: 0 },
      success: true,
    };

    try {
      logger.logCategory('sync', 'Running upstream sync...');
      result.upstream = await this.runUpstream(tenantId);
      logger.logCategory('sync', 'Upstream result:', result.upstream);

      logger.logCategory('sync', 'Running downstream sync...');
      result.downstream = await this.runDownstream(tenantId);
      logger.logCategory('sync', 'Downstream result:', result.downstream);

      result.success = result.upstream.failed === 0;
      logger.logCategory('sync', 'Bi-directional sync completed successfully');
    } catch (error) {
      logger.errorCategory('sync', 'Bidirectional sync failed:', error);
      result.success = false;
    } finally {
      this.isRunning = false;
    }

    return result;
  }

  /**
   * Upstream: push pending items from BOTH sync_outbox AND SyncManager queue.
   * Features: tenant assertion, idempotency keys, version headers, lock checks.
   */
  private async runUpstream(tenantId: string): Promise<{ pushed: number; failed: number }> {
    const outbox = getSyncOutboxService();
    const metadata = getSyncMetadataService();
    const syncManager = getSyncManager();
    const lockManager = getLockManager();
    let pushed = 0;
    let failed = 0;

    // Process sync_outbox items (persistent queue)
    const outboxPending = outbox.getPending(tenantId);
    for (const item of outboxPending) {
      // SECURITY: Verify outbox item belongs to the current tenant before pushing
      if (item.tenant_id !== tenantId) {
        logger.errorCategory('sync', `SECURITY: Outbox item ${item.id} belongs to tenant ${item.tenant_id}, active tenant is ${tenantId}. Skipping.`);
        outbox.markFailed(item.id, 'Tenant mismatch - skipped for security');
        failed++;
        continue;
      }

      // Check if entity is locked by another user (H5: lock integration)
      const lock = lockManager.getLock(item.entity_type, item.entity_id);
      const currentUserId = typeof window !== 'undefined' ? localStorage.getItem('user_id') : null;
      if (lock && lock.userId !== currentUserId && lock.expiresAt > Date.now()) {
        logger.warnCategory('sync', `Entity ${item.entity_type}:${item.entity_id} is locked by ${lock.userName}. Deferring push.`);
        // Don't mark as failed — just skip for now, will retry next sync
        continue;
      }

      outbox.markSyncing(item.id);
      const endpoint = ENTITY_TO_ENDPOINT[item.entity_type] || `/${item.entity_type.replace(/_/g, '-')}`;
      const payload = item.payload_json ? JSON.parse(item.payload_json) : null;

      // Extract version from payload for optimistic locking header
      const entityVersion = payload?.version ?? undefined;

      try {
        // Build request headers with idempotency key and version
        const headers: Record<string, string> = {};
        // Use outbox item ID as idempotency key (H4)
        headers['Idempotency-Key'] = item.id;
        if (entityVersion != null) {
          headers['X-Entity-Version'] = String(entityVersion);
        }

        if (item.action === 'delete') {
          await apiClient.delete(`${endpoint}/${item.entity_id}`);
        } else {
          await apiClient.post(endpoint, payload, { headers });
        }
        outbox.markSynced(item.id);
        pushed++;
        syncManager.removeByEntity(item.entity_type, item.entity_id);
      } catch (error: unknown) {
        const err = error as { status?: number; code?: string; message?: string; error?: string };
        const msg = error instanceof Error ? error.message : String(err?.message || err?.error || error);
        const status = err?.status;

        // Handle 400 PAYMENT_OVERPAYMENT for transactions - treat as success (invoice/bill already paid)
        if (status === 400 && (item.entity_type === 'transactions' || item.entity_type === 'transaction')) {
          const code = err?.code;
          const errMsg = String(msg || '');
          if (code === 'PAYMENT_OVERPAYMENT' || errMsg.includes('Overpayment') || errMsg.includes('would exceed')) {
            logger.logCategory('sync', `⏭️ PAYMENT_OVERPAYMENT for ${item.entity_type}:${item.entity_id} - already paid on server, marking synced`);
            outbox.markSynced(item.id);
            pushed++;
            syncManager.removeByEntity(item.entity_type, item.entity_id);
            continue;
          }
        }

        // Handle 409 Conflict (version mismatch / optimistic locking failure)
        if (status === 409) {
          logger.warnCategory('sync', `Version conflict for ${item.entity_type}:${item.entity_id}. Logging conflict.`);
          logConflict({
            tenantId,
            entityType: item.entity_type,
            entityId: item.entity_id,
            localVersion: entityVersion,
            localData: payload,
            remoteData: null, // Will be fetched on next pull
            resolution: 'pending_review',
          });
          outbox.markFailed(item.id, `Version conflict (409): ${msg}`);
          failed++;
          continue;
        }

        outbox.markFailed(item.id, msg);
        failed++;
      }
    }

    // ALSO process SyncManager queue (in case outbox wasn't populated yet)
    logger.logCategory('sync', 'Checking SyncManager queue...');
    const syncMgrStatus = syncManager.getQueueStatus();
    logger.logCategory('sync', `SyncManager status: ${syncMgrStatus.total} total, ${syncMgrStatus.pending} pending, ${syncMgrStatus.syncing} syncing, ${syncMgrStatus.failed} failed`);

    if (syncMgrStatus.pending > 0 || syncMgrStatus.failed > 0) {
      logger.logCategory('sync', `SyncManager has ${syncMgrStatus.pending} pending + ${syncMgrStatus.failed} failed, triggering syncQueueBatch...`);
      try {
        await syncManager.syncQueueBatch();
        logger.logCategory('sync', 'SyncManager.syncQueueBatch completed');
      } catch (syncMgrError) {
        logger.errorCategory('sync', 'SyncManager.syncQueueBatch failed:', syncMgrError);
      }
    } else {
      logger.logCategory('sync', 'SyncManager queue is empty, nothing to sync');
    }

    if (pushed > 0) {
      metadata.setLastSyncedAt(tenantId, '_global', new Date().toISOString());
    }
    logger.logCategory('sync', `Upstream: ${pushed} from outbox, SyncManager also processed`);
    return { pushed, failed };
  }

  /**
   * Downstream: pull incremental changes from cloud and apply to local with tiered conflict resolution.
   * Features: tenant validation, version comparison, conflict logging.
   */
  private async runDownstream(tenantId: string): Promise<{ applied: number; skipped: number; conflicts: number }> {
    const metadata = getSyncMetadataService();
    const api = getAppStateApiService();
    const since = metadata.getLastPullAt(tenantId);
    let conflicts = 0;

    let response;
    try {
      response = await api.loadStateChanges(since);
    } catch (error) {
      logger.errorCategory('sync', 'Downstream fetch failed:', error);
      return { applied: 0, skipped: 0, conflicts: 0 };
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

          // SECURITY: Validate that pulled data belongs to the current tenant.
          const remoteTenantId = (remote as { tenant_id?: string }).tenant_id;
          if (remoteTenantId && remoteTenantId !== tenantId) {
            logger.errorCategory('sync', `SECURITY: Pull received data for tenant ${remoteTenantId}, expected ${tenantId}. Discarding ${entityKey}/${id}.`);
            skipped++;
            continue;
          }

          try {
            const local = appStateRepo.getEntityById(entityKey, id);
            const context = buildConflictContext(
              entityKey,
              id,
              local ?? {},
              remote as Record<string, unknown>,
              tenantId
            );
            const resolution: ConflictResult = resolver.resolve(context);

            // Log conflicts when there's an actual data difference
            if (local && resolution.resolution && resolution.resolution !== 'remote_wins') {
              logConflict({
                tenantId,
                entityType: entityKey,
                entityId: id,
                localVersion: context.localVersion,
                remoteVersion: context.remoteVersion,
                localData: local,
                remoteData: remote,
                resolution: resolution.resolution || 'unknown',
              });
              conflicts++;
            }

            // Log for manual review if flagged
            if (resolution.needsManualReview) {
              logConflict({
                tenantId,
                entityType: entityKey,
                entityId: id,
                localVersion: context.localVersion,
                remoteVersion: context.remoteVersion,
                localData: local,
                remoteData: remote,
                resolution: 'pending_review',
              });
              conflicts++;
            }

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
    logger.logCategory('sync', `Downstream: ${applied} applied, ${skipped} skipped, ${conflicts} conflicts logged`);
    return { applied, skipped, conflicts };
  }
}

let instance: BidirectionalSyncService | null = null;

export function getBidirectionalSyncService(): BidirectionalSyncService {
  if (!instance) instance = new BidirectionalSyncService();
  return instance;
}
