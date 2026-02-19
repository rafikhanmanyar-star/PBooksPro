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
import { SyncProgress } from '../../types/sync';
import { isElectronWithSqlite, sqliteQuery, sqliteRun } from '../electronSqliteStorage';

// Dependency order: parent entities first so FK constraints are satisfied on the server.
const ENTITY_SYNC_ORDER: Record<string, number> = {
  accounts: 0,
  account: 0,
  contacts: 1,
  contact: 1,
  vendors: 2,
  vendor: 2,
  categories: 3,
  category: 3,
  projects: 4,
  project: 4,
  buildings: 5,
  building: 5,
  properties: 6,
  property: 6,
  units: 7,
  unit: 7,
  invoices: 14,
  invoice: 14,
  bills: 15,
  bill: 15,
  transactions: 17,
  transaction: 17,
};
const ENTITY_SYNC_DEFAULT_ORDER = 50;

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
  private syncProgress: SyncProgress | null = null;
  private queueLoadPromise: Promise<void> | null = null; // For async SQLite load

  // Batching configuration - larger batches and parallel execution for faster sync
  private readonly BATCH_SIZE = 20; // Process up to 20 operations per batch in parallel
  private readonly BATCH_DELAY_MS = 300; // Short delay between batches (was 2000ms)

  constructor() {
    // Load sync queue from local storage on initialization
    // Try to get tenantId from localStorage for initial load
    this.activeTenantId = typeof window !== 'undefined' ? localStorage.getItem('tenant_id') : null;
    this.queueLoadPromise = this.loadSyncQueue();

    // Start monitoring connection
    // Only sync on reconnection, not continuously
    this.connectionMonitor.startMonitoring({
      onOnline: () => {
        this.syncOnReconnection();
      },
      onOffline: () => {
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
    await this.ensureQueueLoaded();
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
    void this.saveSyncQueue();

    const pendingCount = this.queue.filter(op => op.status === 'pending').length;

    // DO NOT sync automatically - operations are queued and will sync only on:
    // 1. User login
    // 2. Connection restore (reconnection)
  }

  /**
   * Wait for database to be ready (with retries). Sync runs immediately on login,
   * often before useDatabaseState/AppContext has finished initializing the DB.
   */
  private async waitForDatabaseReady(maxWaitMs: number = 8000): Promise<boolean> {
    const dbService = getDatabaseService();
    if (dbService.isReady()) return true;
    try {
      await dbService.initialize();
      if (dbService.isReady()) return true;
    } catch (err) {
      console.warn('[SyncManager] DB init failed, will retry:', err);
    }
    const pollInterval = 300;
    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, pollInterval));
      if (dbService.isReady()) return true;
      try {
        await dbService.initialize();
      } catch {
        // Ignore - keep polling
      }
    }
    return dbService.isReady();
  }

  /**
   * Sync on login - delegates to BidirectionalSyncService (outbox is source of truth).
   */
  async syncOnLogin(): Promise<void> {
    if (isMobileDevice()) {
      return; // No sync needed on mobile
    }

    const authenticated = await this.isAuthenticated();
    if (!authenticated) {
      return;
    }

    // Sync runs in login handler before main app mounts - DB may not be ready yet.
    // Wait up to 8s for DB, then let AuthContext's delayed bidir (5s) retry if needed.
    const dbReady = await this.waitForDatabaseReady(8000);
    if (!dbReady) {
      console.warn('[SyncManager] Database not ready after wait, deferring to delayed bidir sync');
      return;
    }

    const tenantId = this.getCurrentTenantId();
    if (tenantId) {
      const { getBidirectionalSyncService } = await import('./bidirectionalSyncService');
      await getBidirectionalSyncService().runSync(tenantId);
    } else {
      await this.syncQueueBatch(); // Fallback for legacy SyncManager queue (if any)
    }
  }

  /**
   * Sync on reconnection - delegates to BidirectionalSyncService (outbox is source of truth).
   */
  async syncOnReconnection(): Promise<void> {
    if (isMobileDevice()) {
      return; // No sync needed on mobile
    }

    const authenticated = await this.isAuthenticated();
    if (!authenticated) {
      return;
    }

    const tenantId = this.getCurrentTenantId();
    if (tenantId) {
      const { getBidirectionalSyncService } = await import('./bidirectionalSyncService');
      await getBidirectionalSyncService().runSync(tenantId);
    } else {
      await this.syncQueueBatch(); // Fallback for legacy SyncManager queue (if any)
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
    await this.ensureQueueLoaded();
    if (isMobileDevice()) {
      return; // No sync needed on mobile
    }

    if (this.isSyncing) {
      console.warn('[SyncManager] ⚠️ Already syncing (isSyncing=true) - skipping. This might indicate the flag is stuck!');
      return; // Already syncing
    }

    if (!this.connectionMonitor.isOnline()) {
      return;
    }

    // Check if user is authenticated before attempting sync
    const authenticated = await this.isAuthenticated();
    if (!authenticated) {
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
      } else {
      }
      this.syncProgress = null; // Reset progress when finished
      return; // Nothing to sync
    }

    // Sort by entity dependency order so parent entities (contacts) sync before children (transactions)
    pendingOps.sort(
      (a, b) =>
        (ENTITY_SYNC_ORDER[a.entity] ?? ENTITY_SYNC_DEFAULT_ORDER) -
        (ENTITY_SYNC_ORDER[b.entity] ?? ENTITY_SYNC_DEFAULT_ORDER)
    );

    // Initialize or update progress tracking
    const currentRemaining = pendingOps.length;
    if (!this.syncProgress) {
      this.syncProgress = {
        total: currentRemaining,
        completed: 0,
        failed: 0
      };
    } else {
      // If remaining work + what we already did is more than current total, 
      // it means new items were added. Update total so progress bar doesn't jump.
      const discoveredTotal = currentRemaining + this.syncProgress.completed + this.syncProgress.failed;
      if (discoveredTotal > this.syncProgress.total) {
        this.syncProgress.total = discoveredTotal;
      }
    }

    // BATCH: Process operations in parallel within each batch for much faster sync
    const batchToSync = pendingOps.slice(0, this.BATCH_SIZE);
    const remainingCount = pendingOps.length - batchToSync.length;

    this.isSyncing = true;


    try {
      // Mark operations as syncing with timestamp
      batchToSync.forEach(op => {
        op.status = 'syncing';
        op.syncStartedAt = Date.now();
      });
      await this.saveSyncQueue(); // Save immediately so status is visible

      // Process batch in parallel (like SyncEngine) instead of one-by-one
      await Promise.allSettled(
        batchToSync.map(async (operation) => {
          try {
            await this.syncOperation(operation);
            operation.status = 'completed';
            operation.syncStartedAt = undefined;
            if (this.syncProgress) this.syncProgress.completed++;
          } catch (error: any) {
            // Don't retry if authentication is required
            if (error?.message === 'Authentication required' || error?.status === 401) {
              operation.status = 'pending'; // Keep as pending, will sync after login
              return;
            }

            // Non-retriable server rejections: mark completed to stop retrying
            const errMsg = (error?.message || error?.error || '').toLowerCase();
            const isNonRetriable =
              error?.code === 'TRANSACTION_IMMUTABLE' ||
              error?.code === 'PAYMENT_OVERPAYMENT' ||
              errMsg.includes('cannot modify a payment transaction linked to a paid') ||
              (error?.status === 409 && (errMsg.includes('duplicate') || errMsg.includes('already exists')));
            if (isNonRetriable) {
              console.log(`[SyncManager] ⏭️ Non-retriable error for ${operation.entity}:${operation.entityId}, marking completed:`, errMsg);
              operation.status = 'completed';
              operation.syncStartedAt = undefined;
              if (this.syncProgress) this.syncProgress.completed++;
              return;
            }

            operation.retries++;
            operation.status = 'failed';
            operation.syncStartedAt = undefined;
            operation.errorMessage = error instanceof Error ? error.message : String(error);
            if (this.syncProgress) this.syncProgress.failed++;

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
      await this.saveSyncQueue();

      const remainingPending = this.queue.filter(op => op.status === 'pending').length;
      const totalFailed = this.queue.filter(op => op.status === 'failed').length;

      // If there are more pending operations, continue syncing batches
      if (remainingPending > 0) {
        setTimeout(async () => {
          if (!this.isSyncing && this.connectionMonitor.isOnline()) {
            const isAuth = await this.isAuthenticated();
            if (isAuth) {
              await this.syncQueueBatch();
            }
          }
        }, this.BATCH_DELAY_MS);
      } else {
        // All done
        this.syncProgress = null;
      }
    } catch (error) {
      console.error('[SyncManager] ❌ Batch sync error:', error);
      this.syncProgress = null;
    } finally {
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
        this.stopAutoSync(); // Stop auto-sync until authenticated
        throw new Error('Authentication required'); // Don't retry
      }

      // Handle 409 Conflict: duplicate = success; version conflict = accept server, remove from queue
      if (error?.status === 409) {
        const errorMessage = (error?.message || error?.error || String(error)).toLowerCase();
        const isDuplicateError = errorMessage.includes('duplicate') ||
          errorMessage.includes('already exists');
        const isVersionConflict = errorMessage.includes('version conflict') ||
          errorMessage.includes('expected version');
        const isImmutable = error?.code === 'TRANSACTION_IMMUTABLE' ||
          errorMessage.includes('cannot modify a payment transaction linked to a paid');

        if (isDuplicateError && (operation.type === 'create' || operation.type === 'update')) {
          return; // Success - record already exists
        }
        if (isVersionConflict || isImmutable) {
          return;
        }
      }

      // Handle 400 PAYMENT_OVERPAYMENT for transaction sync - non-retriable
      // Invoice/bill is already fully paid on server (likely from invoice sync or prior sync).
      // Retrying will never succeed. Treat as success and remove from queue to stop error spam.
      if (error?.status === 400 && (operation.entity === 'transaction' || operation.entity === 'transactions')) {
        const msg = String(error?.message || error?.error || '');
        const code = (error as any)?.code;
        if (code === 'PAYMENT_OVERPAYMENT' || msg.includes('Overpayment') || msg.includes('would exceed')) {
          return; // Success - payment already reflected, no need to retry
        }
      }

      // Handle TRANSACTION_IMMUTABLE: transaction linked to paid invoice/bill — non-retriable
      if (operation.entity === 'transaction' || operation.entity === 'transactions') {
        const msg = String(error?.message || error?.error || '');
        const code = (error as any)?.code;
        if (code === 'TRANSACTION_IMMUTABLE' || /cannot modify a payment transaction linked to a paid/i.test(msg)) {
          return; // Server already has the correct state, no need to retry
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
    progress: SyncProgress | null;
  } {
    const status = {
      total: this.queue.length,
      pending: this.queue.filter(op => op.status === 'pending').length,
      syncing: this.queue.filter(op => op.status === 'syncing').length,
      failed: this.queue.filter(op => op.status === 'failed').length,
      progress: this.syncProgress
    };
    return status;
  }

  /**
   * Set pull (inbound) progress
   */
  setPullProgress(completed: number, total: number | null): void {
    if (!this.syncProgress) {
      this.syncProgress = {
        total: this.queue.filter(op => op.status === 'pending').length,
        completed: 0,
        failed: 0
      };
    }

    if (total !== null) {
      this.syncProgress.inboundTotal = total;
    }
    this.syncProgress.inboundCompleted = completed;

    // Dispatch event for UI updates
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sync:progress-update', { detail: this.syncProgress }));
    }
  }

  /**
   * Clear pull progress (call when inbound sync completes)
   */
  clearPullProgress(): void {
    this.syncProgress = null;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sync:progress-update', { detail: null }));
    }
  }

  private _lastLoggedStatus?: { total: number; pending: number; syncing: number; failed: number; progress: SyncProgress | null };
  private _statusCallCount = 0;

  /**
   * Remove a pending/completed operation by entity and entityId (e.g. after synced from outbox)
   */
  async removeByEntity(entity: string, entityId: string): Promise<void> {
    await this.ensureQueueLoaded();
    const before = this.queue.length;
    this.queue = this.queue.filter(
      op => !(op.entity === entity && op.entityId === entityId)
    );
    if (this.queue.length !== before) {
      await this.saveSyncQueue();
    }
  }

  /**
   * Clear completed operations from queue
   */
  async clearCompleted(): Promise<void> {
    await this.ensureQueueLoaded();
    const before = this.queue.length;
    this.queue = this.queue.filter(op => op.status !== 'completed');
    const after = this.queue.length;

    if (before !== after) {
      await this.saveSyncQueue();
    }
  }

  /**
   * Clear all operations from queue
   * ⚠️ WARNING: Should NOT be called during bi-directional sync!
   * Local changes need to be pushed upstream before clearing.
   * @deprecated Use bi-directional sync instead of clearing queue
   */
  async clearAll(): Promise<void> {
    await this.ensureQueueLoaded();
    const count = this.queue.length;
    console.warn(`[SyncManager] ⚠️ clearAll() called - clearing ${count} operations! Stack:`, new Error().stack?.split('\n').slice(2, 5).join('\n'));
    this.queue = [];
    await this.saveSyncQueue();
    if (count > 0) {
      console.warn(`[SyncManager] ⚠️ Cleared all ${count} operations from queue`);
    }
  }

  /**
   * Check if sync queue uses SQLite (Electron) or localStorage
   */
  private useSqliteQueue(): boolean {
    return isElectronWithSqlite();
  }

  /** Ensure queue is loaded from storage (waits for async SQLite load if in progress) */
  private async ensureQueueLoaded(): Promise<void> {
    if (this.queueLoadPromise) {
      await this.queueLoadPromise;
      this.queueLoadPromise = null;
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

    if (tenantId !== previousTenantId) {
      if (!this.useSqliteQueue()) {
        // Migrate legacy unscoped queue if it exists (localStorage only)
        try {
          const legacyQueue = localStorage.getItem('sync_queue');
          const scopedKey = tenantId ? `sync_queue_${tenantId}` : 'sync_queue';
          const scopedQueue = localStorage.getItem(scopedKey);
          if (legacyQueue && !scopedQueue) {
            localStorage.setItem(scopedKey, legacyQueue);
            localStorage.removeItem('sync_queue');
          }
        } catch (_) { /* ignore migration errors */ }
      }
      this.queueLoadPromise = this.loadSyncQueue();
    }
  }

  /**
   * Save sync queue to storage (SQLite in Electron, localStorage on web).
   * SECURITY: Queue is keyed by tenant to prevent cross-tenant data leaks.
   */
  private async saveSyncQueue(): Promise<void> {
    if (this.useSqliteQueue()) {
      await this.saveSyncQueueToSqlite();
      return;
    }
    try {
      const queueData = JSON.stringify(this.queue);
      const queueSizeKB = Math.round(queueData.length / 1024);
      if (queueSizeKB > 500) {
        console.warn(`[SyncManager] ⚠️ Sync queue is large: ${queueSizeKB}KB (${this.queue.length} operations)`);
      }
      localStorage.setItem(this.getSyncQueueKey(), queueData);
    } catch (error: any) {
      const isQuotaError = error?.name === 'QuotaExceededError' ||
        error?.code === 22 ||
        error?.code === 1014 ||
        error?.message?.includes('quota');
      if (isQuotaError) {
        console.error(`[SyncManager] ❌ localStorage quota exceeded! Queue has ${this.queue.length} operations. Cleaning up...`);
        const beforeCount = this.queue.length;
        this.queue = this.queue.filter(op =>
          !(op.status === 'failed' && op.retries >= this.maxRetries)
        );
        if (this.queue.length > 100) {
          const pending = this.queue.filter(op => op.status === 'pending')
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 100);
          const syncing = this.queue.filter(op => op.status === 'syncing');
          this.queue = [...pending, ...syncing];
        }
        try {
          localStorage.setItem(this.getSyncQueueKey(), JSON.stringify(this.queue));
        } catch {
          this.queue = [];
          try { localStorage.removeItem(this.getSyncQueueKey()); } catch { /* ignore */ }
        }
      } else {
        console.error('[SyncManager] Failed to save sync queue:', error?.message || String(error));
      }
    }
  }

  /** Save queue to SQLite sync_queue table (Electron only) */
  private async saveSyncQueueToSqlite(): Promise<void> {
    const tenantId = this.getCurrentTenantId();
    const tenantKey = tenantId ?? '';
    // Replace tenant's ops: delete existing, insert current
    await sqliteRun(
      "DELETE FROM sync_queue WHERE COALESCE(tenant_id, '') = ?",
      [tenantKey]
    );
    for (const op of this.queue) {
      const dataJson = op.data != null ? JSON.stringify(op.data) : null;
      await sqliteRun(
        `INSERT INTO sync_queue (id, tenant_id, type, entity, entity_id, data, timestamp, source, status, retries, error_message, sync_started_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          op.id,
          op.tenantId ?? null,
          op.type,
          op.entity,
          op.entityId,
          dataJson,
          op.timestamp,
          op.source ?? 'local',
          op.status,
          op.retries ?? 0,
          op.errorMessage ?? null,
          op.syncStartedAt ?? null,
        ]
      );
    }
  }

  /**
   * Load sync queue from storage (SQLite in Electron, localStorage on web).
   * SECURITY: Only loads the queue for the current tenant.
   */
  private async loadSyncQueue(): Promise<void> {
    if (this.useSqliteQueue()) {
      await this.loadSyncQueueFromSqlite();
      return;
    }
    try {
      const saved = localStorage.getItem(this.getSyncQueueKey());
      if (saved) {
        this.queue = JSON.parse(saved);
        const beforeCount = this.queue.length;
        this.queue = this.queue.filter(op => op.status !== 'completed');
        const tenantId = this.getCurrentTenantId();
        if (tenantId) {
          this.queue = this.queue.filter(op => !op.tenantId || op.tenantId === tenantId);
        }
        if (beforeCount !== this.queue.length) {
          void this.saveSyncQueue();
        }
      }
    } catch (error) {
      console.error('[SyncManager] Failed to load sync queue:', error);
      this.queue = [];
    }
  }

  /** Load queue from SQLite sync_queue table (Electron only). Migrates from localStorage on first run. */
  private async loadSyncQueueFromSqlite(): Promise<void> {
    const tenantId = this.getCurrentTenantId();
    const tenantKey = tenantId ?? '';
    const key = tenantId ? `sync_queue_${tenantId}` : 'sync_queue';

    let rows = await sqliteQuery<{
      id: string; tenant_id: string | null; type: string; entity: string; entity_id: string;
      data: string | null; timestamp: number; source: string; status: string;
      retries: number; error_message: string | null; sync_started_at: number | null;
    }>(
      "SELECT id, tenant_id, type, entity, entity_id, data, timestamp, source, status, retries, error_message, sync_started_at FROM sync_queue WHERE COALESCE(tenant_id, '') = ? ORDER BY timestamp ASC",
      [tenantKey]
    );

    // One-time migration from localStorage if SQLite is empty
    if (rows.length === 0 && typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(key);
      if (saved) {
        try {
          const legacy: SyncOperation[] = JSON.parse(saved);
          const toMigrate = legacy.filter(op => op.status !== 'completed');
          const tenantFiltered = tenantId ? toMigrate.filter(op => !op.tenantId || op.tenantId === tenantId) : toMigrate;
          for (const op of tenantFiltered) {
            await sqliteRun(
              `INSERT INTO sync_queue (id, tenant_id, type, entity, entity_id, data, timestamp, source, status, retries, error_message, sync_started_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [op.id, op.tenantId ?? null, op.type, op.entity, op.entityId, op.data != null ? JSON.stringify(op.data) : null, op.timestamp, op.source ?? 'local', op.status, op.retries ?? 0, op.errorMessage ?? null, op.syncStartedAt ?? null]
            );
          }
          if (tenantFiltered.length > 0) {
            localStorage.removeItem(key);
          }
        } catch (_) { /* ignore migration errors */ }
        rows = await sqliteQuery<{
          id: string; tenant_id: string | null; type: string; entity: string; entity_id: string;
          data: string | null; timestamp: number; source: string; status: string;
          retries: number; error_message: string | null; sync_started_at: number | null;
        }>(
          "SELECT id, tenant_id, type, entity, entity_id, data, timestamp, source, status, retries, error_message, sync_started_at FROM sync_queue WHERE COALESCE(tenant_id, '') = ? ORDER BY timestamp ASC",
          [tenantKey]
        );
      }
    }

    this.queue = rows
      .filter(r => r.status !== 'completed')
      .map(r => ({
        id: r.id,
        tenantId: r.tenant_id ?? undefined,
        type: r.type as SyncOperation['type'],
        entity: r.entity,
        entityId: r.entity_id,
        data: r.data ? JSON.parse(r.data) : null,
        timestamp: r.timestamp,
        source: 'local' as const,
        status: r.status as SyncOperation['status'],
        retries: r.retries ?? 0,
        errorMessage: r.error_message ?? undefined,
        syncStartedAt: r.sync_started_at ?? undefined,
      }));
    if (tenantId) {
      this.queue = this.queue.filter(op => !op.tenantId || op.tenantId === tenantId);
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
