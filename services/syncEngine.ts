/**
 * Sync Engine Service
 * 
 * Processes queued operations and syncs them to the cloud API.
 * Handles retries, errors, and progress tracking.
 */

import { SyncQueueItem, SyncProgress, SyncEngineStatus } from '../types/sync';
import { getSyncQueue } from './syncQueue';
import { getAppStateApiService } from './api/appStateApi';
import { logger } from './logger';

type SyncProgressListener = (progress: SyncProgress) => void;
type SyncCompleteListener = (success: boolean, progress: SyncProgress) => void;

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000; // 2 seconds base delay
const SYNC_TIMEOUT_MS = 30000; // 30 seconds timeout per item
const BATCH_SIZE = 5; // Process 5 items in parallel
const BATCH_DELAY_MS = 100; // Small delay between batches to avoid overwhelming the API

class SyncEngine {
  private isRunning = false;
  private isPaused = false;
  private currentTenantId: string | null = null;
  private progressListeners: Set<SyncProgressListener> = new Set();
  private completeListeners: Set<SyncCompleteListener> = new Set();
  private syncQueue = getSyncQueue();
  private apiService = getAppStateApiService();

  /**
   * Start syncing queued operations for a tenant
   */
  async start(tenantId: string): Promise<void> {
    if (this.isRunning) {
      console.warn('⚠️ Sync engine already running');
      return;
    }

    this.isRunning = true;
    this.isPaused = false;
    this.currentTenantId = tenantId;

    console.log('🔄 Starting sync engine for tenant:', tenantId);

    try {
      await this.processSyncQueue(tenantId);
    } catch (error) {
      console.error('❌ Sync engine error:', error);
      this.notifyComplete(false, { total: 0, completed: 0, failed: 0 });
    } finally {
      this.isRunning = false;
      this.currentTenantId = null;
    }
  }

  /**
   * Pause sync engine
   */
  pause(): void {
    if (this.isRunning) {
      this.isPaused = true;
      console.log('⏸️ Sync engine paused');
    }
  }

  /**
   * Resume sync engine
   */
  resume(): void {
    if (this.isRunning && this.isPaused) {
      this.isPaused = false;
      console.log('▶️ Sync engine resumed');
    }
  }

  /**
   * Stop sync engine
   */
  stop(): void {
    this.isRunning = false;
    this.isPaused = false;
    console.log('⏹️ Sync engine stopped');
  }

  /**
   * Check if sync engine is running
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Process all pending items in the sync queue with parallel batch processing
   */
  private async processSyncQueue(tenantId: string): Promise<void> {
    const pendingItems = await this.syncQueue.getPendingItems(tenantId);

    if (pendingItems.length === 0) {
      console.log('✅ No pending items to sync');
      this.notifyComplete(true, { total: 0, completed: 0, failed: 0 });
      return;
    }

    console.log(`📦 Found ${pendingItems.length} pending items to sync (processing in batches of ${BATCH_SIZE})`);

    const progress: SyncProgress = {
      total: pendingItems.length,
      completed: 0,
      failed: 0
    };

    // Process items in batches for parallel execution
    for (let i = 0; i < pendingItems.length; i += BATCH_SIZE) {
      if (!this.isRunning) {
        console.log('⏹️ Sync stopped by user');
        break;
      }

      // Wait if paused
      while (this.isPaused && this.isRunning) {
        await this.sleep(500);
      }

      // Get batch of items to process
      const batch = pendingItems.slice(i, i + BATCH_SIZE);
      console.log(`🔄 Processing batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} items)`);

      // Process batch in parallel
      const batchPromises = batch.map(item => this.processSyncItem(item, progress));
      await Promise.allSettled(batchPromises);

      // Small delay between batches to avoid overwhelming the API
      if (i + BATCH_SIZE < pendingItems.length) {
        await this.sleep(BATCH_DELAY_MS);
      }

      // Update progress after each batch
      this.notifyProgress(progress);
    }

    // Clean up completed items
    await this.syncQueue.clearCompleted(tenantId);

    const success = progress.failed === 0;
    console.log(`${success ? '✅' : '⚠️'} Sync complete: ${progress.completed} succeeded, ${progress.failed} failed`);
    
    this.notifyComplete(success, progress);
  }

  /**
   * Process a single sync item with timeout and error handling
   */
  private async processSyncItem(item: SyncQueueItem, progress: SyncProgress): Promise<void> {
    progress.current = item;
    this.notifyProgress(progress);

    try {
      // Wrap sync operation with timeout
      await this.syncItemWithTimeout(item);
      progress.completed++;
      await this.syncQueue.updateStatus(item.id, 'completed');
      console.log(`✅ Successfully synced ${item.action} ${item.type}: ${item.id}`);
    } catch (error: any) {
      const errorMessage = error?.message || error?.error || 'Unknown error';
      console.error(`❌ Failed to sync item ${item.id} (${item.type}/${item.action}):`, errorMessage);
      progress.failed++;

      // Update with error and retry count
      if (item.retryCount < MAX_RETRIES) {
        // Increment retry count
        item.retryCount += 1;
        // Mark as pending for retry
        await this.syncQueue.updateStatus(item.id, 'pending', errorMessage);
        console.log(`🔄 Will retry item ${item.id} (attempt ${item.retryCount}/${MAX_RETRIES}): ${errorMessage}`);
      } else {
        // Max retries reached, mark as failed
        await this.syncQueue.updateStatus(item.id, 'failed', errorMessage);
        console.error(`❌ Max retries reached for item ${item.id}: ${errorMessage}`);
      }
    }

    this.notifyProgress(progress);
  }

  /**
   * Sync item with timeout protection
   */
  private async syncItemWithTimeout(item: SyncQueueItem): Promise<void> {
    return Promise.race([
      this.syncItem(item),
      new Promise<void>((_, reject) => 
        setTimeout(() => reject(new Error(`Sync timeout after ${SYNC_TIMEOUT_MS}ms`)), SYNC_TIMEOUT_MS)
      )
    ]);
  }

  /**
   * Sync a single queue item
   */
  private async syncItem(item: SyncQueueItem): Promise<void> {
    const startTime = Date.now();
    console.log(`🔄 Syncing ${item.action} ${item.type}: ${item.id} (retry ${item.retryCount}/${MAX_RETRIES})`);

    // Add exponential backoff for retries
    if (item.retryCount > 0) {
      const delay = RETRY_DELAY_MS * Math.pow(2, item.retryCount - 1);
      console.log(`⏳ Retry delay: ${delay}ms`);
      await this.sleep(delay);
    }

    // Update status to syncing
    await this.syncQueue.updateStatus(item.id, 'syncing');

    // Skip system users (sys-admin) - they shouldn't be synced
    if (item.type === 'user' || item.type === 'users') {
      const userId = item.data?.id || item.id;
      if (userId === 'sys-admin' || userId?.startsWith('sys-')) {
        console.log(`[SyncEngine] ⏭️ Skipping sync of system user: ${userId}`);
        await this.syncQueue.updateStatus(item.id, 'completed');
        return; // Skip system users
      }
      
      // Validate required fields for user sync
      if (item.action === 'create' || item.action === 'update') {
        const user = item.data;
        if (!user || !user.username || !user.name || !user.password) {
          console.warn(`[SyncEngine] ⚠️ Skipping user sync - missing required fields:`, {
            hasUsername: !!user?.username,
            hasName: !!user?.name,
            hasPassword: !!user?.password,
            userId: user?.id
          });
          await this.syncQueue.updateStatus(item.id, 'completed'); // Mark as completed to avoid retries
          return; // Skip users with missing required fields
        }
      }
    }
    
    // Route to appropriate API based on type and action
    switch (item.type) {
      case 'transaction':
        await this.syncTransaction(item);
        break;
      case 'contact':
        await this.syncContact(item);
        break;
      case 'invoice':
        await this.syncInvoice(item);
        break;
      case 'bill':
        await this.syncBill(item);
        break;
      case 'account':
        await this.syncAccount(item);
        break;
      case 'category':
        await this.syncCategory(item);
        break;
      case 'project':
        await this.syncProject(item);
        break;
      case 'building':
        await this.syncBuilding(item);
        break;
      case 'property':
        await this.syncProperty(item);
        break;
      case 'unit':
        await this.syncUnit(item);
        break;
      case 'budget':
        await this.syncBudget(item);
        break;
      case 'plan_amenity':
        await this.syncPlanAmenity(item);
        break;
      case 'inventory_item':
        await this.syncInventoryItem(item);
        break;
      case 'rental_agreement':
        await this.syncRentalAgreement(item);
        break;
      case 'project_agreement':
        await this.syncProjectAgreement(item);
        break;
      case 'contract':
        await this.syncContract(item);
        break;
      case 'sales_return':
        await this.syncSalesReturn(item);
        break;
      case 'quotation':
        await this.syncQuotation(item);
        break;
      case 'document':
        await this.syncDocument(item);
        break;
      case 'user':
      case 'users':
        // Users are handled by the validation check above
        // If we reach here, it means it's a valid user (not system user, has required fields)
        // Use generic API client to sync user
        const { apiClient } = await import('../api/client');
        switch (item.action) {
          case 'create':
          case 'update':
            await apiClient.post('/users', item.data);
            break;
          case 'delete':
            await apiClient.delete(`/users/${item.data?.id || item.id}`);
            break;
        }
        break;
      default:
        throw new Error(`Unknown sync type: ${item.type}`);
    }

    const duration = Date.now() - startTime;
    logger.logCategory('sync', `✅ Successfully synced ${item.action} ${item.type}: ${item.id} (${duration}ms)`);
  }

  // Sync methods for each entity type
  private async syncTransaction(item: SyncQueueItem): Promise<void> {
    switch (item.action) {
      case 'create':
        await this.apiService.saveTransaction(item.data);
        break;
      case 'update':
        await this.apiService.saveTransaction(item.data);
        break;
      case 'delete':
        await this.apiService.deleteTransaction(item.data.id);
        break;
    }
  }

  private async syncContact(item: SyncQueueItem): Promise<void> {
    switch (item.action) {
      case 'create':
        await this.apiService.saveContact(item.data);
        break;
      case 'update':
        await this.apiService.saveContact(item.data);
        break;
      case 'delete':
        await this.apiService.deleteContact(item.data.id);
        break;
    }
  }

  private async syncInvoice(item: SyncQueueItem): Promise<void> {
    switch (item.action) {
      case 'create':
        await this.apiService.saveInvoice(item.data);
        break;
      case 'update':
        await this.apiService.saveInvoice(item.data);
        break;
      case 'delete':
        await this.apiService.deleteInvoice(item.data.id);
        break;
    }
  }

  private async syncBill(item: SyncQueueItem): Promise<void> {
    switch (item.action) {
      case 'create':
        await this.apiService.saveBill(item.data);
        break;
      case 'update':
        await this.apiService.saveBill(item.data);
        break;
      case 'delete':
        await this.apiService.deleteBill(item.data.id);
        break;
    }
  }

  private async syncAccount(item: SyncQueueItem): Promise<void> {
    switch (item.action) {
      case 'create':
        await this.apiService.saveAccount(item.data);
        break;
      case 'update':
        await this.apiService.saveAccount(item.data);
        break;
      case 'delete':
        await this.apiService.deleteAccount(item.data.id);
        break;
    }
  }

  private async syncCategory(item: SyncQueueItem): Promise<void> {
    switch (item.action) {
      case 'create':
        await this.apiService.saveCategory(item.data);
        break;
      case 'update':
        await this.apiService.saveCategory(item.data);
        break;
      case 'delete':
        await this.apiService.deleteCategory(item.data.id);
        break;
    }
  }

  private async syncProject(item: SyncQueueItem): Promise<void> {
    switch (item.action) {
      case 'create':
        await this.apiService.saveProject(item.data);
        break;
      case 'update':
        await this.apiService.saveProject(item.data);
        break;
      case 'delete':
        await this.apiService.deleteProject(item.data.id);
        break;
    }
  }

  private async syncBuilding(item: SyncQueueItem): Promise<void> {
    switch (item.action) {
      case 'create':
        await this.apiService.saveBuilding(item.data);
        break;
      case 'update':
        await this.apiService.saveBuilding(item.data);
        break;
      case 'delete':
        await this.apiService.deleteBuilding(item.data.id);
        break;
    }
  }

  private async syncProperty(item: SyncQueueItem): Promise<void> {
    switch (item.action) {
      case 'create':
        await this.apiService.saveProperty(item.data);
        break;
      case 'update':
        await this.apiService.saveProperty(item.data);
        break;
      case 'delete':
        await this.apiService.deleteProperty(item.data.id);
        break;
    }
  }

  private async syncUnit(item: SyncQueueItem): Promise<void> {
    switch (item.action) {
      case 'create':
        await this.apiService.saveUnit(item.data);
        break;
      case 'update':
        await this.apiService.saveUnit(item.data);
        break;
      case 'delete':
        await this.apiService.deleteUnit(item.data.id);
        break;
    }
  }

  private async syncBudget(item: SyncQueueItem): Promise<void> {
    switch (item.action) {
      case 'create':
        await this.apiService.saveBudget(item.data);
        break;
      case 'update':
        await this.apiService.saveBudget(item.data);
        break;
      case 'delete':
        await this.apiService.deleteBudget(item.data.id);
        break;
    }
  }

  private async syncPlanAmenity(item: SyncQueueItem): Promise<void> {
    switch (item.action) {
      case 'create':
        await this.apiService.savePlanAmenity(item.data);
        break;
      case 'update':
        await this.apiService.savePlanAmenity(item.data);
        break;
      case 'delete':
        await this.apiService.deletePlanAmenity(item.data.id);
        break;
    }
  }

  private async syncInventoryItem(item: SyncQueueItem): Promise<void> {
    switch (item.action) {
      case 'create':
        await this.apiService.saveInventoryItem(item.data);
        break;
      case 'update':
        await this.apiService.saveInventoryItem(item.data);
        break;
      case 'delete':
        await this.apiService.deleteInventoryItem(item.data.id);
        break;
    }
  }

  private async syncRentalAgreement(item: SyncQueueItem): Promise<void> {
    switch (item.action) {
      case 'create':
        await this.apiService.saveRentalAgreement(item.data);
        break;
      case 'update':
        await this.apiService.saveRentalAgreement(item.data);
        break;
      case 'delete':
        await this.apiService.deleteRentalAgreement(item.data.id);
        break;
    }
  }

  private async syncProjectAgreement(item: SyncQueueItem): Promise<void> {
    switch (item.action) {
      case 'create':
        await this.apiService.saveProjectAgreement(item.data);
        break;
      case 'update':
        await this.apiService.saveProjectAgreement(item.data);
        break;
      case 'delete':
        await this.apiService.deleteProjectAgreement(item.data.id);
        break;
    }
  }

  private async syncContract(item: SyncQueueItem): Promise<void> {
    switch (item.action) {
      case 'create':
        await this.apiService.saveContract(item.data);
        break;
      case 'update':
        await this.apiService.saveContract(item.data);
        break;
      case 'delete':
        await this.apiService.deleteContract(item.data.id);
        break;
    }
  }

  private async syncSalesReturn(item: SyncQueueItem): Promise<void> {
    switch (item.action) {
      case 'create':
        await this.apiService.saveSalesReturn(item.data);
        break;
      case 'update':
        await this.apiService.saveSalesReturn(item.data);
        break;
      case 'delete':
        await this.apiService.deleteSalesReturn(item.data.id);
        break;
    }
  }

  private async syncQuotation(item: SyncQueueItem): Promise<void> {
    switch (item.action) {
      case 'create':
        await this.apiService.saveQuotation(item.data);
        break;
      case 'update':
        await this.apiService.saveQuotation(item.data);
        break;
      case 'delete':
        await this.apiService.deleteQuotation(item.data.id);
        break;
    }
  }

  private async syncDocument(item: SyncQueueItem): Promise<void> {
    switch (item.action) {
      case 'create':
        await this.apiService.saveDocument(item.data);
        break;
      case 'update':
        await this.apiService.saveDocument(item.data);
        break;
      case 'delete':
        await this.apiService.deleteDocument(item.data.id);
        break;
    }
  }

  /**
   * Subscribe to progress updates
   */
  onProgress(listener: SyncProgressListener): () => void {
    this.progressListeners.add(listener);
    return () => this.progressListeners.delete(listener);
  }

  /**
   * Subscribe to completion events
   */
  onComplete(listener: SyncCompleteListener): () => void {
    this.completeListeners.add(listener);
    return () => this.completeListeners.delete(listener);
  }

  /**
   * Notify progress listeners
   */
  private notifyProgress(progress: SyncProgress): void {
    this.progressListeners.forEach(listener => {
      try {
        listener(progress);
      } catch (error) {
        console.error('Error in progress listener:', error);
      }
    });
  }

  /**
   * Notify completion listeners
   */
  private notifyComplete(success: boolean, progress: SyncProgress): void {
    this.completeListeners.forEach(listener => {
      try {
        listener(success, progress);
      } catch (error) {
        console.error('Error in complete listener:', error);
      }
    });
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
let syncEngineInstance: SyncEngine | null = null;

export const getSyncEngine = (): SyncEngine => {
  if (!syncEngineInstance) {
    syncEngineInstance = new SyncEngine();
  }
  return syncEngineInstance;
};

export default SyncEngine;
