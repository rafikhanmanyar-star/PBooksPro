/**
 * Lock Manager
 * 
 * Manages record-level locking to prevent concurrent edits.
 * Locks are stored in local SQLite (desktop) and synced to cloud PostgreSQL.
 * 
 * Lock Structure:
 * - entity: string (e.g., 'transaction', 'contact')
 * - entityId: string (record ID)
 * - userId: string (user who has the lock)
 * - userName: string (display name)
 * - tenantId: string
 * - lockedAt: number (timestamp)
 * - expiresAt: number (timestamp, 5 minutes from lock)
 */

import { getDatabaseService } from '../database/databaseService';
import { getWebSocketClient } from '../websocketClient';
import { apiClient } from '../api/client';
import { isMobileDevice } from '../../utils/platformDetection';
import { isElectronWithSqlite, sqliteQuery, sqliteRun } from '../electronSqliteStorage';

export interface RecordLock {
  entity: string;
  entityId: string;
  userId: string;
  userName: string;
  tenantId: string;
  lockedAt: number;
  expiresAt: number;
}

class LockManager {
  private localLocks: Map<string, RecordLock> = new Map();
  private lockTimeout = 5 * 60 * 1000; // 5 minutes
  private cleanupInterval: number | null = null;
  private wsClient = getWebSocketClient();
  private locksLoadPromise: Promise<void> | null = null;

  constructor() {
    this.locksLoadPromise = this.loadLocks();
    
    // Start cleanup interval (remove expired locks)
    this.startCleanup();
    
    // Listen for lock events from WebSocket
    this.setupWebSocketListeners();
  }

  /**
   * Acquire a lock on a record
   */
  private useSqliteLocks(): boolean {
    return isElectronWithSqlite();
  }

  private async ensureLocksLoaded(): Promise<void> {
    if (this.locksLoadPromise) {
      await this.locksLoadPromise;
      this.locksLoadPromise = null;
    }
  }

  async acquireLock(
    entity: string,
    entityId: string,
    userId: string,
    userName: string,
    tenantId: string
  ): Promise<boolean> {
    await this.ensureLocksLoaded();
    const lockKey = `${entity}:${entityId}`;
    const now = Date.now();

    // Check if lock exists and is still valid
    const existingLock = this.localLocks.get(lockKey);
    if (existingLock && existingLock.expiresAt > now) {
      // Lock exists and is valid
      if (existingLock.userId === userId) {
        // Same user - extend lock
        existingLock.expiresAt = now + this.lockTimeout;
        await this.saveLocks();
        return true;
      } else {
        // Different user - lock conflict
        return false;
      }
    }

    // Create new lock
    const lock: RecordLock = {
      entity,
      entityId,
      userId,
      userName,
      tenantId,
      lockedAt: now,
      expiresAt: now + this.lockTimeout,
    };

    this.localLocks.set(lockKey, lock);
    await this.saveLocks();

    // Sync lock to cloud (if online)
    if (!isMobileDevice()) {
      try {
        await this.syncLockToCloud(lock);
      } catch (error) {
        console.warn('[LockManager] Failed to sync lock to cloud:', error);
        // Continue anyway - lock is still valid locally
      }
    }

    // Broadcast lock via WebSocket
    this.broadcastLock(lock);

    console.log(`[LockManager] ✅ Lock acquired: ${lockKey} by ${userName}`);
    return true;
  }

  /**
   * Release a lock on a record
   */
  async releaseLock(entity: string, entityId: string, userId: string): Promise<void> {
    const lockKey = `${entity}:${entityId}`;
    const lock = this.localLocks.get(lockKey);

    if (!lock) {
      return; // Lock doesn't exist
    }

    // Only the lock owner can release it
    if (lock.userId !== userId) {
      throw new Error('Cannot release lock owned by another user');
    }

    this.localLocks.delete(lockKey);
    await this.saveLocks();

    // Remove lock from cloud (if online)
    if (!isMobileDevice()) {
      try {
        await this.removeLockFromCloud(lock);
      } catch (error) {
        console.warn('[LockManager] Failed to remove lock from cloud:', error);
      }
    }

    // Broadcast lock release via WebSocket
    this.broadcastLockRelease(entity, entityId);

    console.log(`[LockManager] 🔓 Lock released: ${lockKey}`);
  }

  /**
   * Check if a record is locked
   */
  isLocked(entity: string, entityId: string): boolean {
    const lockKey = `${entity}:${entityId}`;
    const lock = this.localLocks.get(lockKey);
    
    if (!lock) {
      return false;
    }

    // Check if lock is expired
    if (lock.expiresAt <= Date.now()) {
      this.localLocks.delete(lockKey);
      void this.saveLocks();
      return false;
    }

    return true;
  }

  /**
   * Get lock information for a record
   */
  getLock(entity: string, entityId: string): RecordLock | null {
    const lockKey = `${entity}:${entityId}`;
    const lock = this.localLocks.get(lockKey);
    
    if (!lock) {
      return null;
    }

    // Check if lock is expired
    if (lock.expiresAt <= Date.now()) {
      this.localLocks.delete(lockKey);
      void this.saveLocks();
      return null;
    }

    return lock;
  }

  /**
   * Check if current user owns the lock
   */
  isLockOwner(entity: string, entityId: string, userId: string): boolean {
    const lock = this.getLock(entity, entityId);
    return lock !== null && lock.userId === userId;
  }

  /**
   * Get lock owner information
   */
  getLockOwner(entity: string, entityId: string): { userId: string; userName: string } | null {
    const lock = this.getLock(entity, entityId);
    if (!lock) {
      return null;
    }
    return {
      userId: lock.userId,
      userName: lock.userName,
    };
  }

  /**
   * Sync lock to cloud PostgreSQL (via API)
   */
  private async syncLockToCloud(lock: RecordLock): Promise<void> {
    try {
      await apiClient.post('/locks', {
        entity: lock.entity,
        entityId: lock.entityId,
        userId: lock.userId,
        userName: lock.userName,
        tenantId: lock.tenantId,
        lockedAt: lock.lockedAt,
        expiresAt: lock.expiresAt,
      });
    } catch (error) {
      // If endpoint doesn't exist yet, that's okay
      // Locks will work locally until API is implemented
      if (error instanceof Error && error.message.includes('404')) {
        console.debug('[LockManager] Lock API endpoint not yet implemented');
      } else {
        throw error;
      }
    }
  }

  /**
   * Remove lock from cloud PostgreSQL (via API)
   */
  private async removeLockFromCloud(lock: RecordLock): Promise<void> {
    try {
      await apiClient.delete(`/locks/${lock.entity}/${lock.entityId}`);
    } catch (error) {
      // If endpoint doesn't exist yet, that's okay
      if (error instanceof Error && error.message.includes('404')) {
        console.debug('[LockManager] Lock API endpoint not yet implemented');
      } else {
        throw error;
      }
    }
  }

  /**
   * Broadcast lock via WebSocket
   */
  private broadcastLock(lock: RecordLock): void {
    if (this.wsClient.isConnected()) {
      this.wsClient.emit('lock:acquired', {
        entity: lock.entity,
        entityId: lock.entityId,
        userId: lock.userId,
        userName: lock.userName,
        tenantId: lock.tenantId,
        lockedAt: lock.lockedAt,
        expiresAt: lock.expiresAt,
      });
    }
  }

  /**
   * Broadcast lock release via WebSocket
   */
  private broadcastLockRelease(entity: string, entityId: string): void {
    if (this.wsClient.isConnected()) {
      this.wsClient.emit('lock:released', {
        entity,
        entityId,
      });
    }
  }

  /**
   * Setup WebSocket listeners for lock events
   */
  private setupWebSocketListeners(): void {
    // Listen for lock acquired events from other users
    this.wsClient.on('lock:acquired', (data: RecordLock) => {
      const lockKey = `${data.entity}:${data.entityId}`;
      
      // Only update if lock is newer or doesn't exist locally
      const existingLock = this.localLocks.get(lockKey);
      if (!existingLock || data.lockedAt > existingLock.lockedAt) {
        this.localLocks.set(lockKey, data);
        void this.saveLocks();
        console.log(`[LockManager] 🔒 Lock received from another user: ${lockKey} by ${data.userName}`);
      }
    });

    // Listen for lock released events from other users
    this.wsClient.on('lock:released', (data: { entity: string; entityId: string }) => {
      const lockKey = `${data.entity}:${data.entityId}`;
      this.localLocks.delete(lockKey);
      void this.saveLocks();
      console.log(`[LockManager] 🔓 Lock released by another user: ${lockKey}`);
    });
  }

  /**
   * Start cleanup interval (remove expired locks)
   */
  private startCleanup(): void {
    this.cleanupInterval = window.setInterval(() => {
      this.cleanupExpiredLocks();
    }, 60000); // Check every minute
  }

  /**
   * Clean up expired locks
   */
  private cleanupExpiredLocks(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, lock] of this.localLocks.entries()) {
      if (lock.expiresAt <= now) {
        this.localLocks.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      void this.saveLocks();
      console.log(`[LockManager] 🧹 Cleaned up ${cleaned} expired locks`);
    }
  }

  /**
   * Save locks to storage (SQLite in Electron, localStorage on web)
   */
  private async saveLocks(): Promise<void> {
    if (this.useSqliteLocks()) {
      await this.saveLocksToSqlite();
      return;
    }
    try {
      const locksArray = Array.from(this.localLocks.values());
      localStorage.setItem('record_locks', JSON.stringify(locksArray));
    } catch (error) {
      console.error('[LockManager] Failed to save locks:', error);
    }
  }

  private async saveLocksToSqlite(): Promise<void> {
    await sqliteRun('DELETE FROM record_locks');
    for (const lock of this.localLocks.values()) {
      const id = `${lock.entity}:${lock.entityId}`;
      await sqliteRun(
        `INSERT INTO record_locks (id, entity_type, entity_id, user_id, user_name, tenant_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, lock.entity, lock.entityId, lock.userId, lock.userName || '', lock.tenantId || '', lock.expiresAt, lock.lockedAt]
      );
    }
  }

  /**
   * Load locks from storage (SQLite in Electron, localStorage on web)
   */
  private async loadLocks(): Promise<void> {
    if (this.useSqliteLocks()) {
      await this.loadLocksFromSqlite();
      return;
    }
    try {
      const saved = localStorage.getItem('record_locks');
      if (saved) {
        const locksArray: RecordLock[] = JSON.parse(saved);
        const now = Date.now();
        for (const lock of locksArray) {
          if (lock.expiresAt > now) {
            const lockKey = `${lock.entity}:${lock.entityId}`;
            this.localLocks.set(lockKey, lock);
          }
        }
        console.log(`[LockManager] Loaded ${this.localLocks.size} active locks`);
      }
    } catch (error) {
      console.error('[LockManager] Failed to load locks:', error);
      this.localLocks.clear();
    }
  }

  private async loadLocksFromSqlite(): Promise<void> {
    const rows = await sqliteQuery<{ id: string; entity_type: string; entity_id: string; user_id: string; user_name: string | null; tenant_id: string | null; expires_at: number; created_at: number }>('SELECT id, entity_type, entity_id, user_id, user_name, tenant_id, expires_at, created_at FROM record_locks');
    const now = Date.now();
    for (const r of rows) {
      if (r.expires_at > now) {
        const lockKey = `${r.entity_type}:${r.entity_id}`;
        this.localLocks.set(lockKey, {
          entity: r.entity_type,
          entityId: r.entity_id,
          userId: r.user_id,
          userName: r.user_name || '',
          tenantId: r.tenant_id || '',
          lockedAt: r.created_at,
          expiresAt: r.expires_at,
        });
      }
    }
    if (rows.length > 0) {
      console.log(`[LockManager] Loaded ${this.localLocks.size} active locks from SQLite`);
    }
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('record_locks') : null;
    if (saved && rows.length === 0) {
      try {
        const legacy: RecordLock[] = JSON.parse(saved);
        for (const lock of legacy) {
          if (lock.expiresAt > now) {
            const lockKey = `${lock.entity}:${lock.entityId}`;
            this.localLocks.set(lockKey, lock);
            await sqliteRun(
              `INSERT INTO record_locks (id, entity_type, entity_id, user_id, user_name, tenant_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [`${lock.entity}:${lock.entityId}`, lock.entity, lock.entityId, lock.userId, lock.userName || '', lock.tenantId || '', lock.expiresAt, lock.lockedAt]
            );
          }
        }
        if (typeof localStorage !== 'undefined') localStorage.removeItem('record_locks');
      } catch (_) { }
    }
  }

  /**
   * Get all active locks
   */
  getAllLocks(): RecordLock[] {
    return Array.from(this.localLocks.values());
  }

  /**
   * Clear all locks (for testing/cleanup)
   */
  clearAllLocks(): void {
    this.localLocks.clear();
    void this.saveLocks();
    console.log('[LockManager] All locks cleared');
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.cleanupInterval !== null) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Singleton instance
let lockManagerInstance: LockManager | null = null;

export function getLockManager(): LockManager {
  if (!lockManagerInstance) {
    lockManagerInstance = new LockManager();
  }
  return lockManagerInstance;
}
