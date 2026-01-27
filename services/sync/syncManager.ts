/**
 * Sync Manager
 * 
 * Manages synchronization between local SQLite (desktop) and cloud PostgreSQL.
 * Handles sync queue, conflict resolution, and bidirectional sync.
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

  constructor() {
    // Load sync queue from local storage on initialization
    this.loadSyncQueue();
    
    // Start monitoring connection
    this.connectionMonitor.startMonitoring({
      onOnline: () => {
        console.log('[SyncManager] Connection restored, starting sync...');
        this.startAutoSync();
      },
      onOffline: () => {
        console.log('[SyncManager] Connection lost, pausing sync...');
        this.stopAutoSync();
      },
    });
  }

  /**
   * Add operation to sync queue
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

    console.log(`[SyncManager] Queued ${type} operation for ${entity}:${entityId}`);

    // Try to sync immediately if online
    if (this.connectionMonitor.isOnline()) {
      this.syncQueue();
    }
  }

  /**
   * Start automatic syncing
   */
  async startAutoSync(): Promise<void> {
    if (isMobileDevice()) {
      return; // No sync needed on mobile
    }

    if (this.syncInterval !== null) {
      return; // Already running
    }

    // Check authentication before starting
    const authenticated = await this.isAuthenticated();
    if (!authenticated) {
      console.log('[SyncManager] Cannot start auto-sync: User not authenticated');
      return;
    }

    // Sync immediately
    this.syncQueue();

    // Then sync periodically
    this.syncInterval = window.setInterval(async () => {
      const isAuth = await this.isAuthenticated();
      if (this.connectionMonitor.isOnline() && this.queue.length > 0 && isAuth) {
        this.syncQueue();
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Stop automatic syncing
   */
  stopAutoSync(): void {
    if (this.syncInterval !== null) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
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
   * Sync all pending operations
   */
  async syncQueue(): Promise<void> {
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

    if (this.queue.length === 0) {
      return; // Nothing to sync
    }

    this.isSyncing = true;
    console.log(`[SyncManager] Starting sync of ${this.queue.length} operations`);

    try {
      const pendingOps = this.queue.filter(op => op.status === 'pending' || op.status === 'failed');
      
      for (const operation of pendingOps) {
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
            console.warn(`[SyncManager] ⚠️ Sync failed, will retry (${operation.retries}/${this.maxRetries}):`, error);
            // Retry after delay
            setTimeout(() => {
              operation.status = 'pending';
              this.syncQueue();
            }, this.retryDelay * operation.retries);
          }
        }
      }

      // Remove completed operations
      this.queue = this.queue.filter(op => op.status !== 'completed');
      this.saveSyncQueue();

      console.log(`[SyncManager] Sync completed. ${this.queue.length} operations remaining`);
    } catch (error) {
      console.error('[SyncManager] Sync error:', error);
    } finally {
      this.isSyncing = false;
    }
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
        console.log(`[SyncManager] Loaded ${this.queue.length} operations from queue`);
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
    this.stopAutoSync();
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
