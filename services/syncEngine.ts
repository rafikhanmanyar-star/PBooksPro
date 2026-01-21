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
   * Process all pending items in the sync queue
   */
  private async processSyncQueue(tenantId: string): Promise<void> {
    const pendingItems = await this.syncQueue.getPendingItems(tenantId);

    if (pendingItems.length === 0) {
      console.log('✅ No pending items to sync');
      this.notifyComplete(true, { total: 0, completed: 0, failed: 0 });
      return;
    }

    console.log(`📦 Found ${pendingItems.length} pending items to sync`);

    const progress: SyncProgress = {
      total: pendingItems.length,
      completed: 0,
      failed: 0
    };

    for (let i = 0; i < pendingItems.length; i++) {
      if (!this.isRunning) {
        console.log('⏹️ Sync stopped by user');
        break;
      }

      // Wait if paused
      while (this.isPaused && this.isRunning) {
        await this.sleep(500);
      }

      const item = pendingItems[i];
      progress.current = item;
      this.notifyProgress(progress);

      try {
        await this.syncItem(item);
        progress.completed++;
        await this.syncQueue.updateStatus(item.id, 'completed');
      } catch (error: any) {
        console.error(`❌ Failed to sync item ${item.id}:`, error);
        progress.failed++;

        // Update with error and retry count
        if (item.retryCount < MAX_RETRIES) {
          // Mark as pending for retry
          await this.syncQueue.updateStatus(item.id, 'pending', error.message);
          console.log(`🔄 Will retry item ${item.id} (attempt ${item.retryCount + 1}/${MAX_RETRIES})`);
        } else {
          // Max retries reached, mark as failed
          await this.syncQueue.updateStatus(item.id, 'failed', error.message);
          console.error(`❌ Max retries reached for item ${item.id}`);
        }
      }

      this.notifyProgress(progress);
    }

    // Clean up completed items
    await this.syncQueue.clearCompleted(tenantId);

    const success = progress.failed === 0;
    console.log(`${success ? '✅' : '⚠️'} Sync complete: ${progress.completed} succeeded, ${progress.failed} failed`);
    
    this.notifyComplete(success, progress);
  }

  /**
   * Sync a single queue item
   */
  private async syncItem(item: SyncQueueItem): Promise<void> {
    console.log(`🔄 Syncing ${item.action} ${item.type}:`, item.id);

    // Add exponential backoff for retries
    if (item.retryCount > 0) {
      const delay = RETRY_DELAY_MS * Math.pow(2, item.retryCount - 1);
      console.log(`⏳ Retry delay: ${delay}ms`);
      await this.sleep(delay);
    }

    // Update status to syncing
    await this.syncQueue.updateStatus(item.id, 'syncing');

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
      default:
        throw new Error(`Unknown sync type: ${item.type}`);
    }

    logger.logCategory('sync', `✅ Successfully synced ${item.action} ${item.type}:`, item.id);
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
