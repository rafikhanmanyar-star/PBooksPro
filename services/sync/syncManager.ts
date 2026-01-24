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
  startAutoSync(): void {
    if (this.syncInterval !== null) {
      return; // Already running
    }

    // Sync immediately
    this.syncQueue();

    // Then sync periodically
    this.syncInterval = window.setInterval(() => {
      if (this.connectionMonitor.isOnline() && this.queue.length > 0) {
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
   * Sync all pending operations
   */
  async syncQueue(): Promise<void> {
    if (this.isSyncing) {
      return; // Already syncing
    }

    if (!this.connectionMonitor.isOnline()) {
      console.log('[SyncManager] Offline, skipping sync');
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
        } catch (error) {
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
    } catch (error) {
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
