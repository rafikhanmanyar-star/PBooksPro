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
  type: 'create' | 'update' | 'delete';
  entity: string; // 'transaction', 'contact', etc.
  entityId: string;
  data: any;
  timestamp: number;
  source: 'local';
  status: 'pending' | 'syncing' | 'completed' | 'failed';
  retries: number;
  errorMessage?: string;
}

class SyncManager {
  private queue: SyncOperation[] = [];
  private isSyncing = false;
  private syncInterval: number | null = null;
  private connectionMonitor = getConnectionMonitor();
  private maxRetries = 3;
  private retryDelay = 5000; // 5 seconds
  
  // Batching configuration
  private readonly BATCH_SIZE = 10; // Process max 10 operations per batch

  constructor() {
    // Load sync queue from local storage on initialization
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

    // Deduplication: Remove any existing pending operations for the same entity+entityId
    // This prevents duplicate sync operations if the same record is modified multiple times
    this.queue = this.queue.filter(op => 
      !(op.entity === entity && op.entityId === entityId && op.status === 'pending')
    );

    const operation: SyncOperation = {
      id: `${entity}_${entityId}_${Date.now()}`,
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
    if (isMobileDevice()) {
      return; // No sync needed on mobile
    }

    if (this.isSyncing) {
      return; // Already syncing
    }

    if (!this.connectionMonitor.isOnline()) {
      console.log('[SyncManager] Offline, skipping sync');
      return;
    }

    // Check if user is authenticated before attempting sync
    const authenticated = await this.isAuthenticated();
    if (!authenticated) {
      console.log('[SyncManager] User not authenticated, skipping sync');
      return;
    }

    // Get pending operations
    const pendingOps = this.queue.filter(op => op.status === 'pending' || op.status === 'failed');
    
    if (pendingOps.length === 0) {
      return; // Nothing to sync
    }

    // BATCH: Only sync a limited number of operations at a time
    // This prevents server overload when there are many pending operations
    const batchToSync = pendingOps.slice(0, this.BATCH_SIZE);
    const remainingCount = pendingOps.length - batchToSync.length;

    this.isSyncing = true;
    
    console.log(`[SyncManager] Starting sync batch: ${batchToSync.length} operations (${remainingCount} remaining in queue)`);

    try {
      for (const operation of batchToSync) {
        try {
          await this.syncOperation(operation);
          operation.status = 'completed';
          console.log(`[SyncManager] ✅ Synced ${operation.type} for ${operation.entity}:${operation.entityId}`);
        } catch (error: any) {
          // Don't retry if authentication is required
          if (error?.message === 'Authentication required' || error?.status === 401) {
            console.log(`[SyncManager] ⚠️ Authentication required, marking operation as pending (will sync after login)`);
            operation.status = 'pending'; // Keep as pending, will sync after login
            continue; // Skip to next operation
          }
          
          operation.retries++;
          operation.status = 'failed';
          operation.errorMessage = error instanceof Error ? error.message : String(error);
          
          if (operation.retries >= this.maxRetries) {
            console.error(`[SyncManager] ❌ Failed to sync ${operation.entity}:${operation.entityId} after ${this.maxRetries} retries`);
          } else {
            console.warn(`[SyncManager] ⚠️ Sync failed, will retry on next login/reconnection (${operation.retries}/${this.maxRetries}):`, error);
            // Don't auto-retry - will retry on next login/reconnection
          }
        }
      }

      // Remove completed operations
      this.queue = this.queue.filter(op => op.status !== 'completed');
      this.saveSyncQueue();

      const remainingPending = this.queue.filter(op => op.status === 'pending' || op.status === 'failed').length;
      console.log(`[SyncManager] Batch sync completed. ${remainingPending} operations remaining`);

      // If there are more pending operations, continue syncing batches
      // This ensures all pending operations are synced on login/reconnection
      if (remainingPending > 0) {
        // Continue with next batch after a short delay
        setTimeout(async () => {
          if (!this.isSyncing && this.connectionMonitor.isOnline()) {
            const isAuth = await this.isAuthenticated();
            if (isAuth) {
              await this.syncQueueBatch();
            }
          }
        }, 2000); // 2 second delay between batches
      }
    } catch (error) {
      console.error('[SyncManager] Sync error:', error);
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
    return {
      total: this.queue.length,
      pending: this.queue.filter(op => op.status === 'pending').length,
      syncing: this.queue.filter(op => op.status === 'syncing').length,
      failed: this.queue.filter(op => op.status === 'failed').length,
    };
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
   * Used when loading data from cloud to remove stale sync operations
   */
  clearAll(): void {
    const count = this.queue.length;
    this.queue = [];
    this.saveSyncQueue();
    if (count > 0) {
      console.log(`[SyncManager] Cleared all ${count} operations from queue (data loaded from cloud)`);
    }
  }

  /**
   * Save sync queue to localStorage
   */
  private saveSyncQueue(): void {
    try {
      localStorage.setItem('sync_queue', JSON.stringify(this.queue));
    } catch (error) {
      console.error('[SyncManager] Failed to save sync queue:', error);
    }
  }

  /**
   * Load sync queue from localStorage
   */
  private loadSyncQueue(): void {
    try {
      const saved = localStorage.getItem('sync_queue');
      if (saved) {
        this.queue = JSON.parse(saved);
        // Filter out completed operations on load (they shouldn't be in the queue)
        const beforeCount = this.queue.length;
        this.queue = this.queue.filter(op => op.status !== 'completed');
        const afterCount = this.queue.length;
        
        if (beforeCount !== afterCount) {
          this.saveSyncQueue();
          console.log(`[SyncManager] Loaded ${afterCount} pending operations (removed ${beforeCount - afterCount} completed operations)`);
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
