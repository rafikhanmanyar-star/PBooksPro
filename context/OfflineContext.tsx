/**
 * Offline Context
 * 
 * Manages offline state, sync queue status, and provides methods
 * for checking connectivity and triggering sync operations.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { getConnectionMonitor, ConnectionStatus } from '../services/connection/connectionMonitor';
import { getSyncQueue } from '../services/syncQueue';
import { getSyncEngine } from '../services/syncEngine';
import { SyncProgress } from '../types/sync';
import { useAuth } from './AuthContext';

interface OfflineContextType {
  isOnline: boolean;
  isOffline: boolean;
  connectionStatus: ConnectionStatus;
  pendingCount: number;
  failedCount: number;
  isSyncing: boolean;
  syncProgress: SyncProgress | null;
  forceCheck: () => Promise<ConnectionStatus>;
  startSync: () => Promise<void>;
  pauseSync: () => void;
  resumeSync: () => void;
  stopSync: () => void;
  clearQueue: () => Promise<void>;
}

const OfflineContext = createContext<OfflineContextType | undefined>(undefined);

export const OfflineProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('checking');
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);

  const monitor = getConnectionMonitor();
  const syncQueue = getSyncQueue();
  const syncEngine = getSyncEngine();

  /**
   * Load queue counts
   */
  const loadQueueCounts = useCallback(async () => {
    if (!isAuthenticated || !user?.tenant?.id) {
      setPendingCount(0);
      setFailedCount(0);
      return;
    }

    try {
      const pending = await syncQueue.getPendingCount(user.tenant.id);
      const failed = await syncQueue.getFailedCount(user.tenant.id);
      setPendingCount(pending);
      setFailedCount(failed);
    } catch (error) {
      console.error('Failed to load queue counts:', error);
    }
  }, [isAuthenticated, user?.tenant?.id, syncQueue]);

  /**
   * Force connection check
   */
  const forceCheck = useCallback(async (): Promise<ConnectionStatus> => {
    const status = await monitor.forceCheck();
    setConnectionStatus(status);
    return status;
  }, [monitor]);

  /**
   * Start sync process.
   * Accepts an optional statusOverride so callers from the connection
   * subscriber can pass the freshly-received status instead of relying
   * on React state (which may be stale in the same tick).
   */
  const startSync = useCallback(async (statusOverride?: ConnectionStatus) => {
    if (!isAuthenticated || !user?.tenant?.id) {
      return;
    }

    const effectiveStatus = statusOverride ?? connectionStatus;
    if (effectiveStatus !== 'online') {
      return;
    }

    if (isSyncing) {
      return;
    }

    const currentPending = await syncQueue.getPendingCount(user.tenant.id);
    setPendingCount(currentPending);

    if (currentPending === 0) {
      return;
    }

    try {
      setIsSyncing(true);
      await syncEngine.start(user.tenant.id);
    } catch (error) {
      console.error('❌ Sync failed:', error);
      setIsSyncing(false);
      setSyncProgress(null);
    }
  }, [isAuthenticated, user?.tenant?.id, connectionStatus, isSyncing, syncEngine, syncQueue]);

  /**
   * Initialize connection monitor
   */
  useEffect(() => {
    // Set initial status
    setConnectionStatus(monitor.getStatus());

    // Subscribe to connection changes
    const unsubscribe = monitor.subscribe((status) => {
      setConnectionStatus(status);

      // Auto-sync when connection is restored — pass status directly
      // to avoid the stale-closure problem (React state hasn't updated yet)
      if (status === 'online') {
        startSync('online');
      }
    });

    return unsubscribe;
  }, [monitor, startSync]);

  /**
   * Load queue counts on mount and when authentication changes
   */
  useEffect(() => {
    loadQueueCounts();
  }, [loadQueueCounts]);

  /**
   * Subscribe to sync progress
   */
  useEffect(() => {
    const unsubscribeProgress = syncEngine.onProgress((progress) => {
      setSyncProgress(progress);
    });

    const unsubscribeComplete = syncEngine.onComplete((success, progress) => {
      setIsSyncing(false);
      setSyncProgress(null);
      
      // Reload queue counts
      loadQueueCounts();
    });

    return () => {
      unsubscribeProgress();
      unsubscribeComplete();
    };
  }, [syncEngine, loadQueueCounts]);

  /**
   * Monitor queue changes (but don't auto-sync - sync only on login/reconnection)
   */
  useEffect(() => {
    const handleQueueChange = () => {
      loadQueueCounts();
      // Don't auto-sync - just update the UI with queue counts
      // Sync will happen on login/reconnection only
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('sync-queue:change', handleQueueChange);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('sync-queue:change', handleQueueChange);
      }
    };
  }, [loadQueueCounts]);

  /**
   * When connection comes online, process any queued operations from the
   * IndexedDB sync queue (queueOperationForSync in AppContext) in addition
   * to the SyncManager outbox handled by BidirectionalSyncService.
   */
  useEffect(() => {
    if (connectionStatus === 'online' && isAuthenticated && user?.tenant?.id) {
      loadQueueCounts();
      startSync('online');
    }
  }, [connectionStatus, isAuthenticated, user?.tenant?.id, loadQueueCounts, startSync]);

  /**
   * Heartbeat: Update queue counts periodically (but don't sync)
   * Sync only happens on login/reconnection
   */
  useEffect(() => {
    if (connectionStatus !== 'online' || !isAuthenticated || !user?.tenant?.id) {
      return;
    }

    // Just update queue counts for UI - don't trigger sync
    const interval = window.setInterval(() => {
      loadQueueCounts();
    }, 60000); // Update counts every minute for UI

    return () => clearInterval(interval);
  }, [connectionStatus, isAuthenticated, user?.tenant?.id, loadQueueCounts]);

  /**
   * Pause sync
   */
  const pauseSync = useCallback(() => {
    syncEngine.pause();
  }, [syncEngine]);

  /**
   * Resume sync
   */
  const resumeSync = useCallback(() => {
    syncEngine.resume();
  }, [syncEngine]);

  /**
   * Stop sync
   */
  const stopSync = useCallback(() => {
    syncEngine.stop();
    setIsSyncing(false);
    setSyncProgress(null);
  }, [syncEngine]);

  /**
   * Clear all completed items from queue
   */
  const clearQueue = useCallback(async () => {
    if (!isAuthenticated || !user?.tenant?.id) {
      return;
    }

    try {
      await syncQueue.clearCompleted(user.tenant.id);
      await loadQueueCounts();
    } catch (error) {
      console.error('Failed to clear queue:', error);
    }
  }, [isAuthenticated, user?.tenant?.id, syncQueue, loadQueueCounts]);

  const value: OfflineContextType = {
    isOnline: connectionStatus === 'online',
    isOffline: connectionStatus === 'offline',
    connectionStatus,
    pendingCount,
    failedCount,
    isSyncing,
    syncProgress,
    forceCheck,
    startSync,
    pauseSync,
    resumeSync,
    stopSync,
    clearQueue
  };

  return (
    <OfflineContext.Provider value={value}>
      {children}
    </OfflineContext.Provider>
  );
};

export const useOffline = (): OfflineContextType => {
  const context = useContext(OfflineContext);
  if (!context) {
    throw new Error('useOffline must be used within an OfflineProvider');
  }
  return context;
};
