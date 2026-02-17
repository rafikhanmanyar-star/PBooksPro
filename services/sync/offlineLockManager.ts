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
import { isElectronWithSqlite, sqliteQuery, sqliteRun } from '../electronSqliteStorage';

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
  private locksLoadPromise: Promise<void> | null = null;

  constructor() {
    this.locksLoadPromise = this.loadOfflineLocks();
    
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
        void this.saveOfflineLocks();
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
    void this.saveOfflineLocks();

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
      void this.saveOfflineLocks();
      
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
    void this.saveOfflineLocks();
    console.log(`[OfflineLockManager] 🔓 Offline lock force-released for tenant ${tenantId}`);
  }

  private useSqliteLocks(): boolean {
    return isElectronWithSqlite();
  }

  /**
   * Save offline locks to storage (SQLite in Electron, localStorage on web)
   */
  private async saveOfflineLocks(): Promise<void> {
    if (this.useSqliteLocks()) {
      await this.saveOfflineLocksToSqlite();
      return;
    }
    try {
      const locksArray = Array.from(this.offlineLocks.values());
      localStorage.setItem('offline_locks', JSON.stringify(locksArray));
    } catch (error) {
      console.error('[OfflineLockManager] Failed to save offline locks:', error);
    }
  }

  private async saveOfflineLocksToSqlite(): Promise<void> {
    await sqliteRun('DELETE FROM offline_locks');
    for (const lock of this.offlineLocks.values()) {
      const expiresAt = lock.lockedAt + 7 * 24 * 60 * 60 * 1000;
      await sqliteRun(
        `INSERT INTO offline_locks (id, tenant_id, user_id, user_name, locked_at, entity_type, entity_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?, 'tenant', ?, ?, ?)`,
        [lock.tenantId, lock.tenantId, lock.userId, lock.userName || '', lock.lockedAt, lock.tenantId, expiresAt, lock.lockedAt]
      );
    }
  }

  /**
   * Load offline locks from storage (SQLite in Electron, localStorage on web)
   */
  private async loadOfflineLocks(): Promise<void> {
    if (this.useSqliteLocks()) {
      await this.loadOfflineLocksFromSqlite();
      return;
    }
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

  private async loadOfflineLocksFromSqlite(): Promise<void> {
    const rows = await sqliteQuery<{ id: string; tenant_id: string | null; user_id: string; user_name: string | null; locked_at: number | null; created_at: number | null }>(
      'SELECT id, tenant_id, user_id, user_name, locked_at, created_at FROM offline_locks'
    );
    for (const r of rows) {
      const tenantId = r.tenant_id ?? r.id;
      this.offlineLocks.set(tenantId, {
        tenantId,
        userId: r.user_id,
        userName: r.user_name || '',
        lockedAt: r.locked_at ?? r.created_at ?? 0,
      });
    }
    if (rows.length > 0) {
      console.log(`[OfflineLockManager] Loaded ${this.offlineLocks.size} offline locks from SQLite`);
    }
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('offline_locks') : null;
    if (saved && rows.length === 0) {
      try {
        const legacy: OfflineLock[] = JSON.parse(saved);
        for (const lock of legacy) {
          this.offlineLocks.set(lock.tenantId, lock);
          const expiresAt = lock.lockedAt + 7 * 24 * 60 * 60 * 1000;
          await sqliteRun(
            `INSERT INTO offline_locks (id, tenant_id, user_id, user_name, locked_at, entity_type, entity_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?, 'tenant', ?, ?, ?)`,
            [lock.tenantId, lock.tenantId, lock.userId, lock.userName || '', lock.lockedAt, lock.tenantId, expiresAt, lock.lockedAt]
          );
        }
        if (typeof localStorage !== 'undefined') localStorage.removeItem('offline_locks');
      } catch (_) { }
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
    void this.saveOfflineLocks();
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
