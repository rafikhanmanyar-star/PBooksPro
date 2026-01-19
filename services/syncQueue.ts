/**
 * Sync Queue Service
 * 
 * Manages the queue of operations to be synced when connection is restored.
 * Uses IndexedDB for persistent storage across sessions.
 */

import { SyncQueueItem, SyncOperationType, SyncAction, SyncStatus } from '../types/sync';

const DB_NAME = 'FinanceTrackerSyncQueue';
const DB_VERSION = 1;
const STORE_NAME = 'sync_queue';

class SyncQueueService {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize IndexedDB
   */
  private async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('Failed to open sync queue database:', request.error);
        reject(new Error('Failed to open sync queue database'));
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('✅ Sync Queue database initialized');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          
          // Create indexes for efficient querying
          store.createIndex('tenantId', 'tenantId', { unique: false });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('tenantStatus', ['tenantId', 'status'], { unique: false });
          
          console.log('✅ Sync Queue object store created');
        }
      };
    });

    return this.initPromise;
  }

  /**
   * Generate unique ID for queue item
   */
  private generateId(): string {
    return `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Add operation to sync queue
   */
  async enqueue(
    tenantId: string,
    userId: string,
    type: SyncOperationType,
    action: SyncAction,
    data: any
  ): Promise<string> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    const item: SyncQueueItem = {
      id: this.generateId(),
      tenantId,
      userId,
      type,
      action,
      data,
      timestamp: Date.now(),
      retryCount: 0,
      status: 'pending'
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.add(item);

      request.onsuccess = () => {
        console.log(`📦 Queued ${action} ${type}:`, item.id);
        resolve(item.id);
      };

      request.onerror = () => {
        console.error('Failed to enqueue operation:', request.error);
        reject(new Error('Failed to enqueue operation'));
      };
    });
  }

  /**
   * Get all pending items for a tenant
   */
  async getPendingItems(tenantId: string): Promise<SyncQueueItem[]> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('tenantStatus');
      const request = index.getAll([tenantId, 'pending']);

      request.onsuccess = () => {
        const items = request.result as SyncQueueItem[];
        // Sort by timestamp (oldest first)
        items.sort((a, b) => a.timestamp - b.timestamp);
        resolve(items);
      };

      request.onerror = () => {
        console.error('Failed to get pending items:', request.error);
        reject(new Error('Failed to get pending items'));
      };
    });
  }

  /**
   * Get all items (any status) for a tenant
   */
  async getAllItems(tenantId: string): Promise<SyncQueueItem[]> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('tenantId');
      const request = index.getAll(tenantId);

      request.onsuccess = () => {
        const items = request.result as SyncQueueItem[];
        items.sort((a, b) => a.timestamp - b.timestamp);
        resolve(items);
      };

      request.onerror = () => {
        console.error('Failed to get all items:', request.error);
        reject(new Error('Failed to get all items'));
      };
    });
  }

  /**
   * Get item by ID
   */
  async getItem(id: string): Promise<SyncQueueItem | null> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        console.error('Failed to get item:', request.error);
        reject(new Error('Failed to get item'));
      };
    });
  }

  /**
   * Update item status
   */
  async updateStatus(
    id: string,
    status: SyncStatus,
    error?: string
  ): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    const item = await this.getItem(id);
    if (!item) {
      throw new Error(`Item not found: ${id}`);
    }

    item.status = status;
    item.lastAttempt = Date.now();
    
    if (error) {
      item.error = error;
    }

    if (status === 'failed') {
      item.retryCount += 1;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(item);

      request.onsuccess = () => {
        console.log(`📦 Updated status for ${id}: ${status}`);
        resolve();
      };

      request.onerror = () => {
        console.error('Failed to update item status:', request.error);
        reject(new Error('Failed to update item status'));
      };
    });
  }

  /**
   * Remove item from queue
   */
  async remove(id: string): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => {
        console.log(`📦 Removed item from queue: ${id}`);
        resolve();
      };

      request.onerror = () => {
        console.error('Failed to remove item:', request.error);
        reject(new Error('Failed to remove item'));
      };
    });
  }

  /**
   * Clear all completed items for a tenant
   */
  async clearCompleted(tenantId: string): Promise<number> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    const items = await this.getAllItems(tenantId);
    const completedItems = items.filter(item => item.status === 'completed');

    let cleared = 0;
    for (const item of completedItems) {
      await this.remove(item.id);
      cleared++;
    }

    console.log(`🧹 Cleared ${cleared} completed items for tenant ${tenantId}`);
    return cleared;
  }

  /**
   * Remove pending items for a specific entity (e.g. delete after create)
   */
  async removePendingByEntity(
    tenantId: string,
    type: SyncOperationType,
    entityId: string
  ): Promise<number> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    const items = await this.getAllItems(tenantId);
    const toRemove = items.filter(item => {
      if (item.type !== type) return false;
      if (item.status === 'completed') return false;
      if (item.action === 'delete') return false;
      const dataId = item.data?.id;
      return dataId === entityId;
    });

    if (toRemove.length === 0) return 0;

    await Promise.all(toRemove.map(item => this.remove(item.id)));
    return toRemove.length;
  }

  /**
   * Clear all items for a tenant (use with caution)
   */
  async clearAll(tenantId: string): Promise<number> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    const items = await this.getAllItems(tenantId);

    let cleared = 0;
    for (const item of items) {
      await this.remove(item.id);
      cleared++;
    }

    console.log(`🧹 Cleared all ${cleared} items for tenant ${tenantId}`);
    return cleared;
  }

  /**
   * Get count of pending items for a tenant
   */
  async getPendingCount(tenantId: string): Promise<number> {
    const items = await this.getPendingItems(tenantId);
    return items.length;
  }

  /**
   * Get count of failed items for a tenant
   */
  async getFailedCount(tenantId: string): Promise<number> {
    const items = await this.getAllItems(tenantId);
    return items.filter(item => item.status === 'failed').length;
  }
}

// Singleton instance
let syncQueueInstance: SyncQueueService | null = null;

export const getSyncQueue = (): SyncQueueService => {
  if (!syncQueueInstance) {
    syncQueueInstance = new SyncQueueService();
  }
  return syncQueueInstance;
};

export default SyncQueueService;
