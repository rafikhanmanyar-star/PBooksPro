/**
 * Sync Manager
 * 
 * Manages synchronization between local SQLite (desktop) and cloud PostgreSQL.
 * Handles sync queue, conflict resolution, and bidirectional sync.
 * 
 * SYNC POLICY: Only syncs on login and reconnection - NOT on each entry.
 * Operations are queued locally and synced only when:
 * 1. User logs in
 * 2. Connection is restored (reconnection)
 * 
 * Note: This is primarily for desktop platforms. Mobile uses cloud PostgreSQL directly.
 */

import { getDatabaseService } from '../database/databaseService';
import { getCloudPostgreSQLService } from '../database/postgresqlCloudService';
import { getConnectionMonitor } from '../connection/connectionMonitor';
import { isMobileDevice } from '../../utils/platformDetection';

export interface SyncOperation {
  id: string;
  tenantId?: string; // Tenant that owns this operation (for isolation)
  type: 'create' | 'update' | 'delete';
  entity: string; // 'transaction', 'contact', etc.
  entityId: string;
  data: any;
  timestamp: number;
  source: 'local';
  status: 'pending' | 'syncing' | 'completed' | 'failed';
  retries: number;
  errorMessage?: string;
  syncStartedAt?: number; // Timestamp when sync started (to detect stuck operations)
}

class SyncManager {
  private queue: SyncOperation[] = [];
  private isSyncing = false;
  private syncInterval: number | null = null;
  private connectionMonitor = getConnectionMonitor();
  private maxRetries = 3;
  private retryDelay = 5000; // 5 seconds
  private activeTenantId: string | null = null;

  // Batching configuration - larger batches and parallel execution for faster sync
  private readonly BATCH_SIZE = 20; // Process up to 20 operations per batch in parallel
  private readonly BATCH_DELAY_MS = 300; // Short delay between batches (was 2000ms)

  constructor() {
    // Load sync queue from local storage on initialization
    // Try to get tenantId from localStorage for initial load
    this.activeTenantId = typeof window !== 'undefined' ? localStorage.getItem('tenant_id') : null;
    this.loadSyncQueue();

    // Start monitoring connection
    // Only sync on reconnection, not continuously
    this.connectionMonitor.startMonitoring({
      onOnline: () => {
        console.log('[SyncManager] Connection restored, syncing pending operations...');
        this.syncOnReconnection();
      },
      onOffline: () => {
        console.log('[SyncManager] Connection lost, sync paused');
        // Don't stop anything - just log that we're offline
      },
    });
  }

  /**
   * Add operation to sync queue with deduplication
   * Only syncs NEW operations, not already-synced data
   */
  async queueOperation(
    type: 'create' | 'update' | 'delete',
    entity: string,
    entityId: string,
    data: any
  ): Promise<void> {
    // Mobile: Don't queue, operations go directly to cloud
    if (isMobileDevice()) {
      console.warn('[SyncManager] Queue operation called on mobile - this should not happen');
      return;
    }

    // Prevent queue from growing too large (max 1000 operations)
    // This prevents localStorage quota issues
    if (this.queue.length >= 1000) {
      console.warn(`[SyncManager] ⚠️ Queue is full (${this.queue.length} operations). Cleaning up old failed operations...`);
      // Remove old failed operations to make room
      const beforeCount = this.queue.length;
      this.queue = this.queue.filter(op =>
        op.status !== 'failed' || op.retries < this.maxRetries
      );

      // If still too many, remove oldest pending operations
      if (this.queue.length >= 1000) {
        this.queue = this.queue
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, 900); // Keep newest 900
      }

      console.warn(`[SyncManager] Cleaned up queue: ${beforeCount} -> ${this.queue.length} operations`);
    }

    // Deduplication: Remove any existing pending OR failed operations for the same entity+entityId
    // This prevents the queue from growing with multiple failed attempts for the same record
    const beforeDedupe = this.queue.length;
    this.queue = this.queue.filter(op =>
      !(op.entity === entity && op.entityId === entityId && (op.status === 'pending' || op.status === 'failed'))
    );

    if (this.queue.length !== beforeDedupe) {
      console.debug(`[SyncManager] Removed ${beforeDedupe - this.queue.length} existing operations for ${entity}:${entityId}`);
    }

    // Get current tenant for scoping
    const currentTenantId = this.getCurrentTenantId();

    const operation: SyncOperation = {
      id: `${entity}_${entityId}_${Date.now()}`,
      tenantId: currentTenantId || undefined,
      type,
      entity,
      entityId,
      data,
      timestamp: Date.now(),
      source: 'local',
      status: 'pending',
      retries: 0,
    };

    this.queue.push(operation);
    this.saveSyncQueue();

    const pendingCount = this.queue.filter(op => op.status === 'pending').length;
    console.log(`[SyncManager] Queued ${type} operation for ${entity}:${entityId} (${pendingCount} pending total - will sync on login/reconnection)`);

    // DO NOT sync automatically - operations are queued and will sync only on:
    // 1. User login
    // 2. Connection restore (reconnection)
  }

  /**
   * Sync on login - called explicitly when user logs in
   */
  async syncOnLogin(): Promise<void> {
    if (isMobileDevice()) {
      return; // No sync needed on mobile
    }

    // Check authentication
    const authenticated = await this.isAuthenticated();
    if (!authenticated) {
      console.log('[SyncManager] Cannot sync on login: User not authenticated');
      return;
    }

    // Sync pending operations
    const pendingCount = this.queue.filter(op => op.status === 'pending' || op.status === 'failed').length;
    if (pendingCount > 0) {
      console.log(`[SyncManager] User logged in, syncing ${pendingCount} pending operations...`);
      await this.syncQueueBatch();
    } else {
      console.log('[SyncManager] User logged in, no pending operations to sync');
    }
  }

  /**
   * Sync on reconnection - called when connection is restored
   */
  async syncOnReconnection(): Promise<void> {
    if (isMobileDevice()) {
      return; // No sync needed on mobile
    }

    // Check authentication
    const authenticated = await this.isAuthenticated();
    if (!authenticated) {
      console.log('[SyncManager] Cannot sync on reconnection: User not authenticated');
      return;
    }

    // Sync pending operations
    const pendingCount = this.queue.filter(op => op.status === 'pending' || op.status === 'failed').length;
    if (pendingCount > 0) {
      console.log(`[SyncManager] Connection restored, syncing ${pendingCount} pending operations...`);
      await this.syncQueueBatch();
    } else {
      console.log('[SyncManager] Connection restored, no pending operations to sync');
    }
  }

  /**
   * Start automatic syncing (DEPRECATED - kept for backward compatibility)
   * @deprecated Use syncOnLogin() or syncOnReconnection() instead
   */
  async startAutoSync(): Promise<void> {
    console.warn('[SyncManager] startAutoSync() is deprecated. Use syncOnLogin() or syncOnReconnection() instead.');
    await this.syncOnReconnection();
  }

  /**
   * Stop automatic syncing (DEPRECATED - no longer needed)
   * @deprecated Sync is now manual only
   */
  stopAutoSync(): void {
    // No-op - sync is now manual only
    console.warn('[SyncManager] stopAutoSync() is deprecated. Sync is now manual only.');
  }

  /**
   * Check if user is authenticated
   */
  private async isAuthenticated(): Promise<boolean> {
    try {
      const { isAuthenticatedSafe } = await import('../api/client');
      return isAuthenticatedSafe();
    } catch (error) {
      return false;
    }
  }

  /**
   * Sync a batch of pending operations (limited to BATCH_SIZE)
   * This prevents overloading the server with too many simultaneous requests
   * Public method - can be called explicitly on login/reconnection
   */
  async syncQueueBatch(): Promise<void> {
    console.log('[SyncManager] 🔄 syncQueueBatch() called');

    if (isMobileDevice()) {
      console.log('[SyncManager] Mobile device - skipping sync');
      return; // No sync needed on mobile
    }

    if (this.isSyncing) {
      console.warn('[SyncManager] ⚠️ Already syncing (isSyncing=true) - skipping. This might indicate the flag is stuck!');
      return; // Already syncing
    }

    if (!this.connectionMonitor.isOnline()) {
      console.log('[SyncManager] ⚠️ Offline - skipping sync');
      return;
    }

    // Check if user is authenticated before attempting sync
    const authenticated = await this.isAuthenticated();
    if (!authenticated) {
      console.log('[SyncManager] ⚠️ User not authenticated - skipping sync');
      return;
    }

    // Get pending operations
    // Only pick up operations that haven't failed too many times
    let pendingOps = this.queue.filter(op =>
      op.status === 'pending' ||
      (op.status === 'failed' && op.retries < this.maxRetries)
    );

    // SECURITY: Filter out operations that don't belong to the current tenant
    const currentTenant = this.getCurrentTenantId();
    if (currentTenant) {
      const beforeFilter = pendingOps.length;
      pendingOps = pendingOps.filter(op => !op.tenantId || op.tenantId === currentTenant);
      if (pendingOps.length !== beforeFilter) {
        console.warn(`[SyncManager] SECURITY: Filtered out ${beforeFilter - pendingOps.length} operations from other tenants`);
      }
    }

    if (pendingOps.length === 0) {
      const failedCount = this.queue.filter(op => op.status === 'failed' && op.retries >= this.maxRetries).length;
      if (failedCount > 0) {
        console.log(`[SyncManager] ℹ️ No runnable operations. ${failedCount} operations have reached max retries and will be skipped.`);
      } else {
        console.log('[SyncManager] ℹ️ No pending operations to sync');
      }
      return; // Nothing to sync
    }

    // BATCH: Process operations in parallel within each batch for much faster sync
    const batchToSync = pendingOps.slice(0, this.BATCH_SIZE);
    const remainingCount = pendingOps.length - batchToSync.length;

    this.isSyncing = true;

    console.log(`[SyncManager] 🚀 Starting sync batch: ${batchToSync.length} operations in parallel (${remainingCount} remaining runnable)`);

    try {
      // Mark operations as syncing with timestamp
      batchToSync.forEach(op => {
        op.status = 'syncing';
        op.syncStartedAt = Date.now();
      });
      this.saveSyncQueue(); // Save immediately so status is visible

      // Process batch in parallel (like SyncEngine) instead of one-by-one
      await Promise.allSettled(
        batchToSync.map(async (operation) => {
          try {
            await this.syncOperation(operation);
            operation.status = 'completed';
            operation.syncStartedAt = undefined;
            console.log(`[SyncManager] ✅ Synced ${operation.type} for ${operation.entity}:${operation.entityId}`);
          } catch (error: any) {
            // Don't retry if authentication is required
            if (error?.message === 'Authentication required' || error?.status === 401) {
              console.log(`[SyncManager] ⚠️ Authentication required, marking operation as pending (will sync after login)`);
              operation.status = 'pending'; // Keep as pending, will sync after login
              return;
            }

            operation.retries++;
            operation.status = 'failed';
            operation.syncStartedAt = undefined;
            operation.errorMessage = error instanceof Error ? error.message : String(error);

            if (operation.retries >= this.maxRetries) {
              console.error(`[SyncManager] ❌ Failed to sync ${operation.entity}:${operation.entityId} after ${this.maxRetries} retries:`, error);
            } else {
              console.warn(`[SyncManager] ⚠️ Sync failed (${operation.retries}/${this.maxRetries}), will retry: ${operation.entity}:${operation.entityId}`, error);
            }
          }
        })
      );

      // Remove completed operations
      this.queue = this.queue.filter(op => op.status !== 'completed');
      this.saveSyncQueue();

      const remainingPending = this.queue.filter(op => op.status === 'pending').length;
      const totalFailed = this.queue.filter(op => op.status === 'failed').length;
      console.log(`[SyncManager] ✅ Batch sync completed. ${remainingPending} pending, ${totalFailed} failed (will retry on reconnect)`);

      // If there are more pending operations, continue syncing batches
      if (remainingPending > 0) {
        console.log(`[SyncManager] ⏱️ Scheduling next batch in ${this.BATCH_DELAY_MS}ms...`);
        setTimeout(async () => {
          if (!this.isSyncing && this.connectionMonitor.isOnline()) {
            const isAuth = await this.isAuthenticated();
            if (isAuth) {
              console.log('[SyncManager] 🔄 Starting next batch...');
              await this.syncQueueBatch();
            }
          }
        }, this.BATCH_DELAY_MS);
      } else {
        console.log(`[SyncManager] 🎉 All pending operations synced! (${totalFailed} failed operations will retry on reconnect)`);
      }
    } catch (error) {
      console.error('[SyncManager] ❌ Batch sync error:', error);
    } finally {
      console.log('[SyncManager] 🔓 Resetting isSyncing flag to false');
      this.isSyncing = false;
    }
  }

  /**
   * Sync all pending operations (legacy method - now uses batching)
   * @deprecated Use syncQueueBatch() instead
   */
  async syncQueue(): Promise<void> {
    await this.syncQueueBatch();
  }

  /**
   * Sync a single operation
   */
  private async syncOperation(operation: SyncOperation): Promise<void> {
    operation.status = 'syncing';

    // Import API client dynamically to avoid circular dependencies
    const { apiClient } = await import('../api/client');

    // Map entity names to API endpoints
    const endpointMap: Record<string, string> = {
      'transaction': '/transactions',
      'transactions': '/transactions',
      'contact': '/contacts',
      'contacts': '/contacts',
      'account': '/accounts',
      'accounts': '/accounts',
      'category': '/categories',
      'categories': '/categories',
      'project': '/projects',
      'projects': '/projects',
      'invoice': '/invoices',
      'invoices': '/invoices',
      'bill': '/bills',
      'bills': '/bills',
      'installment_plans': '/installment-plans',
      'plan_amenities': '/plan-amenities',
      'sales_returns': '/sales-returns',
      'vendor': '/vendors',
      'vendors': '/vendors',
    };

    const endpoint = endpointMap[operation.entity] || `/${operation.entity}`;

    // Skip system users (sys-admin) - they shouldn't be synced
    if (operation.entity === 'users' || operation.entity === 'user') {
      const userId = operation.entityId || operation.data?.id;
      if (userId === 'sys-admin' || userId?.startsWith('sys-')) {
        console.log(`[SyncManager] ⏭️ Skipping sync of system user: ${userId}`);
        return; // Skip system users
      }

      // Validate required fields for user sync
      if (operation.type === 'create' || operation.type === 'update') {
        const user = operation.data;
        if (!user || !user.username || !user.name || !user.password) {
          console.warn(`[SyncManager] ⚠️ Skipping user sync - missing required fields:`, {
            hasUsername: !!user?.username,
            hasName: !!user?.name,
            hasPassword: !!user?.password,
            userId: user?.id
          });
          return; // Skip users with missing required fields
        }
      }
    }

    try {
      switch (operation.type) {
        case 'create':
        case 'update':
          await apiClient.post(endpoint, operation.data);
          break;
        case 'delete':
          await apiClient.delete(`${endpoint}/${operation.entityId}`);
          break;
      }
    } catch (error: any) {
      // Handle 401 Unauthorized - user not authenticated
      // Don't retry, just pause sync until user logs in
      if (error?.status === 401) {
        console.log('[SyncManager] ⚠️ Authentication required, pausing sync until user logs in');
        this.stopAutoSync(); // Stop auto-sync until authenticated
        throw new Error('Authentication required'); // Don't retry
      }

      // Handle 409 Conflict errors for create operations
      // If the record already exists in the cloud, treat it as success
      // This happens when local DB has records that were already synced to cloud
      if (error?.status === 409 && operation.type === 'create') {
        const errorMessage = (error?.message || error?.error || String(error)).toLowerCase();
        const isDuplicateError = errorMessage.includes('duplicate') ||
          errorMessage.includes('already exists');

        if (isDuplicateError) {
          console.log(`[SyncManager] ✅ Record already exists in cloud for ${operation.entity}:${operation.entityId}, treating as success`);
          return; // Success - record already exists, no need to retry
        }
      }

      // Handle 400 PAYMENT_OVERPAYMENT for transaction sync - non-retriable
      // Invoice/bill is already fully paid on server (likely from invoice sync or prior sync).
      // Retrying will never succeed. Treat as success and remove from queue to stop error spam.
      if (error?.status === 400 && (operation.entity === 'transaction' || operation.entity === 'transactions')) {
        const msg = String(error?.message || error?.error || '');
        const code = (error as any)?.code;
        if (code === 'PAYMENT_OVERPAYMENT' || msg.includes('Overpayment') || msg.includes('would exceed')) {
          console.log(`[SyncManager] ⏭️ PAYMENT_OVERPAYMENT for ${operation.entityId} - invoice/bill already paid on server, skipping (non-retriable)`);
          return; // Success - payment already reflected, no need to retry
        }
      }

      // Re-throw other errors
      throw new Error(`Failed to sync ${operation.type} for ${operation.entity}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get sync queue status
   */
  getQueueStatus(): {
    total: number;
    pending: number;
    syncing: number;
    failed: number;
  } {
    const status = {
      total: this.queue.length,
      pending: this.queue.filter(op => op.status === 'pending').length,
      syncing: this.queue.filter(op => op.status === 'syncing').length,
      failed: this.queue.filter(op => op.status === 'failed').length,
    };
    // Reduced logging - only log when status changes or every 10 calls
    if (!this._lastLoggedStatus ||
      JSON.stringify(status) !== JSON.stringify(this._lastLoggedStatus) ||
      (this._statusCallCount++ % 10 === 0)) {
      console.log(`[SyncManager] 📊 Queue: ${status.pending} pending, ${status.syncing} syncing, ${status.failed} failed (${status.total} total)`);
      this._lastLoggedStatus = status;
    }
    return status;
  }

  private _lastLoggedStatus?: { total: number; pending: number; syncing: number; failed: number };
  private _statusCallCount = 0;

  /**
   * Remove a pending/completed operation by entity and entityId (e.g. after synced from outbox)
   */
  removeByEntity(entity: string, entityId: string): void {
    const before = this.queue.length;
    this.queue = this.queue.filter(
      op => !(op.entity === entity && op.entityId === entityId)
    );
    if (this.queue.length !== before) {
      this.saveSyncQueue();
    }
  }

  /**
   * Clear completed operations from queue
   */
  clearCompleted(): void {
    const before = this.queue.length;
    this.queue = this.queue.filter(op => op.status !== 'completed');
    const after = this.queue.length;

    if (before !== after) {
      this.saveSyncQueue();
      console.log(`[SyncManager] Cleared ${before - after} completed operations`);
    }
  }

  /**
   * Clear all operations from queue
   * ⚠️ WARNING: Should NOT be called during bi-directional sync!
   * Local changes need to be pushed upstream before clearing.
   * @deprecated Use bi-directional sync instead of clearing queue
   */
  clearAll(): void {
    const count = this.queue.length;
    console.warn(`[SyncManager] ⚠️ clearAll() called - clearing ${count} operations! Stack:`, new Error().stack?.split('\n').slice(2, 5).join('\n'));
    this.queue = [];
    this.saveSyncQueue();
    if (count > 0) {
      console.warn(`[SyncManager] ⚠️ Cleared all ${count} operations from queue`);
    }
  }

  /**
   * Get the localStorage key for the sync queue, scoped by tenant.
   * SECURITY: Each tenant gets its own queue key to prevent cross-tenant data leaks.
   */
  private getSyncQueueKey(): string {
    const tenantId = this.getCurrentTenantId();
    if (tenantId) {
      return `sync_queue_${tenantId}`;
    }
    return 'sync_queue'; // Fallback for backward compatibility
  }

  /**
   * Get the current tenant ID from activeTenantId or localStorage.
   */
  private getCurrentTenantId(): string | null {
    if (this.activeTenantId) return this.activeTenantId;
    if (typeof window !== 'undefined') {
      return localStorage.getItem('tenant_id');
    }
    return null;
  }

  /**
   * Set the active tenant ID. Call this on login/tenant switch.
   * Also migrates any legacy unscoped queue data to the new tenant-scoped key.
   */
  setTenantId(tenantId: string | null): void {
    const previousTenantId = this.activeTenantId;
    this.activeTenantId = tenantId;

    if (tenantId && tenantId !== previousTenantId) {
      // Migrate legacy unscoped queue if it exists and new scoped key is empty
      try {
        const legacyQueue = localStorage.getItem('sync_queue');
        const scopedKey = `sync_queue_${tenantId}`;
        const scopedQueue = localStorage.getItem(scopedKey);
        if (legacyQueue && !scopedQueue) {
          // Move legacy queue to scoped key
          localStorage.setItem(scopedKey, legacyQueue);
          localStorage.removeItem('sync_queue');
          console.log(`[SyncManager] Migrated legacy sync_queue to ${scopedKey}`);
        }
      } catch (_) { /* ignore migration errors */ }

      // Reload queue for the new tenant
      this.loadSyncQueue();
    }
  }

  /**
   * Save sync queue to localStorage (tenant-scoped)
   * SECURITY: Queue is keyed by tenant to prevent cross-tenant data leaks.
   * Handles quota exceeded errors by cleaning up old operations.
   */
  private saveSyncQueue(): void {
    try {
      const queueData = JSON.stringify(this.queue);
      const queueSizeKB = Math.round(queueData.length / 1024);

      // Warn if queue is getting large (> 500KB)
      if (queueSizeKB > 500) {
        console.warn(`[SyncManager] ⚠️ Sync queue is large: ${queueSizeKB}KB (${this.queue.length} operations)`);
      }

      localStorage.setItem(this.getSyncQueueKey(), queueData);
    } catch (error: any) {
      // Check if it's a quota exceeded error
      const isQuotaError = error?.name === 'QuotaExceededError' ||
        error?.code === 22 ||
        error?.code === 1014 ||
        error?.message?.includes('quota');

      if (isQuotaError) {
        console.error(`[SyncManager] ❌ localStorage quota exceeded! Queue has ${this.queue.length} operations. Cleaning up...`);

        // Emergency cleanup: Remove old failed operations and keep only recent pending ones
        const beforeCount = this.queue.length;

        // 1. Remove all failed operations that have exceeded max retries
        this.queue = this.queue.filter(op =>
          !(op.status === 'failed' && op.retries >= this.maxRetries)
        );

        // 2. If still too many, keep only the most recent 100 pending operations
        if (this.queue.length > 100) {
          const pending = this.queue.filter(op => op.status === 'pending')
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 100);
          const syncing = this.queue.filter(op => op.status === 'syncing');
          this.queue = [...pending, ...syncing];
        }

        console.warn(`[SyncManager] Cleaned up queue: ${beforeCount} -> ${this.queue.length} operations`);

        // Try saving again
        try {
          localStorage.setItem(this.getSyncQueueKey(), JSON.stringify(this.queue));
          console.log('[SyncManager] ✅ Queue saved after cleanup');
        } catch (retryError) {
          console.error('[SyncManager] ❌ Still failed after cleanup. Clearing queue to prevent data loss:', retryError);
          // Last resort: clear the queue to prevent app from breaking
          this.queue = [];
          try {
            localStorage.removeItem(this.getSyncQueueKey());
          } catch { /* ignore */ }
        }
      } else {
        console.error('[SyncManager] Failed to save sync queue:', {
          error: error?.message || String(error),
          name: error?.name,
          code: error?.code,
          queueLength: this.queue.length
        });
      }
    }
  }

  /**
   * Load sync queue from localStorage (tenant-scoped)
   * SECURITY: Only loads the queue for the current tenant.
   */
  private loadSyncQueue(): void {
    try {
      const saved = localStorage.getItem(this.getSyncQueueKey());
      if (saved) {
        this.queue = JSON.parse(saved);
        // Filter out completed operations on load (they shouldn't be in the queue)
        const beforeCount = this.queue.length;
        this.queue = this.queue.filter(op => op.status !== 'completed');
        const afterCount = this.queue.length;

        // SECURITY: Also filter out operations that don't match the current tenant
        const tenantId = this.getCurrentTenantId();
        if (tenantId) {
          this.queue = this.queue.filter(op => !op.tenantId || op.tenantId === tenantId);
        }

        if (beforeCount !== this.queue.length) {
          this.saveSyncQueue();
          console.log(`[SyncManager] Loaded ${this.queue.length} pending operations (filtered from ${beforeCount})`);
        } else {
          console.log(`[SyncManager] Loaded ${afterCount} operations from queue`);
        }
      }
    } catch (error) {
      console.error('[SyncManager] Failed to load sync queue:', error);
      this.queue = [];
    }
  }

  /**
   * Cleanup
   */
  destroy(): void {
    // No cleanup needed - sync is now manual only
  }
}

// Singleton instance
let syncManagerInstance: SyncManager | null = null;

export function getSyncManager(): SyncManager {
  if (!syncManagerInstance) {
    syncManagerInstance = new SyncManager();
  }
  return syncManagerInstance;
}
