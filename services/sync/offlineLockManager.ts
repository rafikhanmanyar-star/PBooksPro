/**
 * Offline Lock Manager
 * 
 * Manages offline user locking for multi-user scenarios.
 * When users are offline, only the first user to go offline gets write access.
 * Other users are restricted to read-only mode.
 * 
 * This prevents data conflicts when multiple users are working offline.
 */

import { getDatabaseService } from '../database/databaseService';
import { getConnectionMonitor } from '../connection/connectionMonitor';
import { isMobileDevice } from '../../utils/platformDetection';

export interface OfflineLock {
  tenantId: string;
  userId: string;
  userName: string;
  lockedAt: number;
}

class OfflineLockManager {
  private offlineLocks: Map<string, OfflineLock> = new Map();
  private connectionMonitor = getConnectionMonitor();
  private currentUserId: string | null = null;
  private currentTenantId: string | null = null;

  constructor() {
    // Load offline locks from local storage
    this.loadOfflineLocks();
    
    // Monitor connection status
    this.connectionMonitor.startMonitoring({
      onOffline: () => {
        this.handleOffline();
      },
      onOnline: () => {
        this.handleOnline();
      },
    });
  }

  /**
   * Set current user context
   */
  setUserContext(userId: string, tenantId: string): void {
    this.currentUserId = userId;
    this.currentTenantId = tenantId;
  }

  /**
   * Handle going offline
   */
  private handleOffline(): void {
    // Mobile: No offline support, so no locking needed
    if (isMobileDevice()) {
      return;
    }

    if (!this.currentUserId || !this.currentTenantId) {
      console.warn('[OfflineLockManager] No user context set, cannot acquire offline lock');
      return;
    }

    // Check if another user already has the offline lock for this tenant
    const existingLock = this.offlineLocks.get(this.currentTenantId);
    
    if (existingLock) {
      // Another user already has the lock
      if (existingLock.userId !== this.currentUserId) {
        console.log(
          `[OfflineLockManager] ⚠️ Another user (${existingLock.userName}) already has offline write access for tenant ${this.currentTenantId}`
        );
        return; // Current user doesn't get write access
      } else {
        // Same user - lock already exists, extend it
        existingLock.lockedAt = Date.now();
        this.saveOfflineLocks();
        return;
      }
    }

    // Acquire offline lock (first user to go offline)
    const lock: OfflineLock = {
      tenantId: this.currentTenantId,
      userId: this.currentUserId,
      userName: 'Current User', // TODO: Get actual user name from auth context
      lockedAt: Date.now(),
    };

    this.offlineLocks.set(this.currentTenantId, lock);
    this.saveOfflineLocks();

    console.log(
      `[OfflineLockManager] ✅ Offline write lock acquired for tenant ${this.currentTenantId} by user ${this.currentUserId}`
    );
  }

  /**
   * Handle coming back online
   */
  private handleOnline(): void {
    // Mobile: No offline support, so no locking needed
    if (isMobileDevice()) {
      return;
    }

    if (!this.currentTenantId) {
      return;
    }

    // Release offline lock when coming back online
    const lock = this.offlineLocks.get(this.currentTenantId);
    
    if (lock && lock.userId === this.currentUserId) {
      this.offlineLocks.delete(this.currentTenantId);
      this.saveOfflineLocks();
      
      console.log(
        `[OfflineLockManager] 🔓 Offline write lock released for tenant ${this.currentTenantId}`
      );
    }
  }

  /**
   * Check if current user has offline write access
   */
  hasOfflineWriteAccess(): boolean {
    // Mobile: No offline support
    if (isMobileDevice()) {
      return false;
    }

    // If online, always have write access
    if (this.connectionMonitor.isOnline()) {
      return true;
    }

    // If offline, check if current user has the lock
    if (!this.currentUserId || !this.currentTenantId) {
      return false;
    }

    const lock = this.offlineLocks.get(this.currentTenantId);
    
    if (!lock) {
      // No lock exists - first user to go offline gets write access
      return true;
    }

    // Check if current user owns the lock
    return lock.userId === this.currentUserId;
  }

  /**
   * Check if another user has offline write access
   */
  getOfflineLockOwner(): { userId: string; userName: string } | null {
    // Mobile: No offline support
    if (isMobileDevice()) {
      return null;
    }

    // If online, no offline lock owner
    if (this.connectionMonitor.isOnline()) {
      return null;
    }

    if (!this.currentTenantId) {
      return null;
    }

    const lock = this.offlineLocks.get(this.currentTenantId);
    
    if (!lock) {
      return null;
    }

    // If current user owns the lock, return null (they have access)
    if (lock.userId === this.currentUserId) {
      return null;
    }

    // Another user has the lock
    return {
      userId: lock.userId,
      userName: lock.userName,
    };
  }

  /**
   * Get offline lock information for a tenant
   */
  getOfflineLock(tenantId: string): OfflineLock | null {
    return this.offlineLocks.get(tenantId) || null;
  }

  /**
   * Check if tenant has an offline lock
   */
  isTenantLocked(tenantId: string): boolean {
    return this.offlineLocks.has(tenantId);
  }

  /**
   * Force release offline lock (admin/cleanup function)
   */
  releaseOfflineLock(tenantId: string): void {
    this.offlineLocks.delete(tenantId);
    this.saveOfflineLocks();
    console.log(`[OfflineLockManager] 🔓 Offline lock force-released for tenant ${tenantId}`);
  }

  /**
   * Save offline locks to localStorage
   */
  private saveOfflineLocks(): void {
    try {
      const locksArray = Array.from(this.offlineLocks.values());
      localStorage.setItem('offline_locks', JSON.stringify(locksArray));
    } catch (error) {
      console.error('[OfflineLockManager] Failed to save offline locks:', error);
    }
  }

  /**
   * Load offline locks from localStorage
   */
  private loadOfflineLocks(): void {
    try {
      const saved = localStorage.getItem('offline_locks');
      if (saved) {
        const locksArray: OfflineLock[] = JSON.parse(saved);
        
        for (const lock of locksArray) {
          this.offlineLocks.set(lock.tenantId, lock);
        }
        
        console.log(`[OfflineLockManager] Loaded ${this.offlineLocks.size} offline locks`);
      }
    } catch (error) {
      console.error('[OfflineLockManager] Failed to load offline locks:', error);
      this.offlineLocks.clear();
    }
  }

  /**
   * Get all offline locks
   */
  getAllOfflineLocks(): OfflineLock[] {
    return Array.from(this.offlineLocks.values());
  }

  /**
   * Clear all offline locks (for testing/cleanup)
   */
  clearAllOfflineLocks(): void {
    this.offlineLocks.clear();
    this.saveOfflineLocks();
    console.log('[OfflineLockManager] All offline locks cleared');
  }

  /**
   * Cleanup
   */
  destroy(): void {
    // Connection monitor cleanup is handled by its own destroy method
  }
}

// Singleton instance
let offlineLockManagerInstance: OfflineLockManager | null = null;

export function getOfflineLockManager(): OfflineLockManager {
  if (!offlineLockManagerInstance) {
    offlineLockManagerInstance = new OfflineLockManager();
  }
  return offlineLockManagerInstance;
}
