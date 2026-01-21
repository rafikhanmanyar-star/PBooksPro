/**
 * Offline Context
 * 
 * Manages offline state, sync queue status, and provides methods
 * for checking connectivity and triggering sync operations.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { getConnectionMonitor } from '../services/connection/connectionMonitor';
import { getSyncQueue } from '../services/syncQueue';
import { getSyncEngine } from '../services/syncEngine';
import { ConnectionStatus, SyncProgress } from '../types/sync';
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
   * Initialize connection monitor
   */
  useEffect(() => {
    // Set initial status
    setConnectionStatus(monitor.getStatus());

    // Subscribe to connection changes
    const unsubscribe = monitor.subscribe((status) => {
      console.log('🌐 Connection status changed:', status);
      setConnectionStatus(status);

      // Auto-sync when connection is restored
      if (status === 'online') {
        console.log('🔄 Connection restored, starting auto-sync...');
        startSync();
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
      console.log(`🔄 Sync progress: ${progress.completed}/${progress.total}`);
    });

    const unsubscribeComplete = syncEngine.onComplete((success, progress) => {
      console.log(`${success ? '✅' : '⚠️'} Sync complete:`, progress);
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
   * Force connection check
   */
  const forceCheck = useCallback(async (): Promise<ConnectionStatus> => {
    const status = await monitor.forceCheck();
    setConnectionStatus(status);
    return status;
  }, [monitor]);

  /**
   * Start sync process
   */
  const startSync = useCallback(async () => {
    if (!isAuthenticated || !user?.tenant?.id) {
      console.warn('⚠️ Cannot sync: User not authenticated');
      return;
    }

    if (connectionStatus !== 'online') {
      console.warn('⚠️ Cannot sync: Device is offline');
      return;
    }

    if (isSyncing) {
      console.warn('⚠️ Sync already in progress');
      return;
    }

    const currentPending = await syncQueue.getPendingCount(user.tenant.id);
    setPendingCount(currentPending);

    if (currentPending === 0) {
      console.log('✅ No pending items to sync');
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
   * Auto-sync on queue changes while online
   */
  useEffect(() => {
    const handleQueueChange = () => {
      loadQueueCounts();
      if (monitor.getStatus() === 'online') {
        startSync();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('sync-queue:change', handleQueueChange);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('sync-queue:change', handleQueueChange);
      }
    };
  }, [loadQueueCounts, monitor, startSync]);

  /**
   * Trigger sync when already online (e.g., after login)
   */
  useEffect(() => {
    if (connectionStatus === 'online' && isAuthenticated && user?.tenant?.id) {
      startSync();
    }
  }, [connectionStatus, isAuthenticated, user?.tenant?.id, startSync]);

  /**
   * Heartbeat: check for pending items while online
   */
  useEffect(() => {
    if (connectionStatus !== 'online' || !isAuthenticated || !user?.tenant?.id) {
      return;
    }

    const interval = window.setInterval(() => {
      startSync();
    }, 15000);

    return () => clearInterval(interval);
  }, [connectionStatus, isAuthenticated, user?.tenant?.id, startSync]);

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
