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
  // Lazy initialization to avoid TDZ errors during module load
  private _wsClient: ReturnType<typeof getWebSocketClient> | null = null;

  private get wsClient() {
    if (!this._wsClient) {
      this._wsClient = getWebSocketClient();
    }
    return this._wsClient;
  }

  constructor() {
    // Load locks from local storage on initialization
    this.loadLocks();
    
    // Start cleanup interval (remove expired locks)
    this.startCleanup();
    
    // Listen for lock events from WebSocket
    this.setupWebSocketListeners();
  }

  /**
   * Acquire a lock on a record
   */
  async acquireLock(
    entity: string,
    entityId: string,
    userId: string,
    userName: string,
    tenantId: string
  ): Promise<boolean> {
    const lockKey = `${entity}:${entityId}`;
    const now = Date.now();

    // Check if lock exists and is still valid
    const existingLock = this.localLocks.get(lockKey);
    if (existingLock && existingLock.expiresAt > now) {
      // Lock exists and is valid
      if (existingLock.userId === userId) {
        // Same user - extend lock
        existingLock.expiresAt = now + this.lockTimeout;
        this.saveLocks();
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
    this.saveLocks();

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
    this.saveLocks();

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
      this.saveLocks();
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
      this.saveLocks();
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
        this.saveLocks();
        console.log(`[LockManager] 🔒 Lock received from another user: ${lockKey} by ${data.userName}`);
      }
    });

    // Listen for lock released events from other users
    this.wsClient.on('lock:released', (data: { entity: string; entityId: string }) => {
      const lockKey = `${data.entity}:${data.entityId}`;
      this.localLocks.delete(lockKey);
      this.saveLocks();
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
      this.saveLocks();
      console.log(`[LockManager] 🧹 Cleaned up ${cleaned} expired locks`);
    }
  }

  /**
   * Save locks to localStorage
   */
  private saveLocks(): void {
    try {
      const locksArray = Array.from(this.localLocks.values());
      localStorage.setItem('record_locks', JSON.stringify(locksArray));
    } catch (error) {
      console.error('[LockManager] Failed to save locks:', error);
    }
  }

  /**
   * Load locks from localStorage
   */
  private loadLocks(): void {
    try {
      const saved = localStorage.getItem('record_locks');
      if (saved) {
        const locksArray: RecordLock[] = JSON.parse(saved);
        const now = Date.now();
        
        // Only load non-expired locks
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
    this.saveLocks();
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
