/**
 * Offline Context
 *
 * Manages offline state, sync queue status, and provides methods
 * for checking connectivity and triggering sync operations.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import {
  connectionMonitorStub,
  syncEngineStub,
  syncQueueStub,
  type ConnectionStatus,
} from '../services/sync/localOnlyStubs';
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
  const { user, tenant, isAuthenticated } = useAuth();
  const tenantId = tenant?.id ?? user?.tenantId ?? '';
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('checking');
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);

  const monitor = connectionMonitorStub;
  const syncQueue = syncQueueStub;
  const syncEngine = syncEngineStub;

  const loadQueueCounts = useCallback(async () => {
    if (!isAuthenticated || !tenantId) {
      setPendingCount(0);
      setFailedCount(0);
      return;
    }

    try {
      const pending = await syncQueue.getPendingCount(tenantId);
      const failed = await syncQueue.getFailedCount(tenantId);
      setPendingCount(pending);
      setFailedCount(failed);
    } catch (error) {
      console.error('Failed to load queue counts:', error);
    }
  }, [isAuthenticated, tenantId, syncQueue]);

  const forceCheck = useCallback(async (): Promise<ConnectionStatus> => {
    const status = await monitor.forceCheck();
    setConnectionStatus(status);
    return status;
  }, [monitor]);

  const startSync = useCallback(async (statusOverride?: ConnectionStatus) => {
    if (!isAuthenticated || !tenantId) {
      return;
    }

    const effectiveStatus = statusOverride ?? connectionStatus;
    if (effectiveStatus !== 'online') {
      return;
    }

    if (isSyncing) {
      return;
    }

    const currentPending = await syncQueue.getPendingCount(tenantId);
    setPendingCount(currentPending);

    if (currentPending === 0) {
      return;
    }

    try {
      setIsSyncing(true);
      await syncEngine.start(tenantId);
    } catch (error) {
      console.error('❌ Sync failed:', error);
      setIsSyncing(false);
      setSyncProgress(null);
    }
  }, [isAuthenticated, tenantId, connectionStatus, isSyncing, syncEngine, syncQueue]);

  useEffect(() => {
    setConnectionStatus(monitor.getStatus());

    const unsubscribe = monitor.subscribe((status: ConnectionStatus) => {
      setConnectionStatus(status);

      if (status === 'online') {
        startSync('online');
      }
    });

    return unsubscribe;
  }, [monitor, startSync]);

  useEffect(() => {
    loadQueueCounts();
  }, [loadQueueCounts]);

  useEffect(() => {
    const unsubscribeProgress = syncEngine.onProgress((progress: SyncProgress) => {
      setSyncProgress(progress);
    });

    const unsubscribeComplete = syncEngine.onComplete((success: boolean, progress: SyncProgress) => {
      void success;
      void progress;
      setIsSyncing(false);
      setSyncProgress(null);
      loadQueueCounts();
    });

    return () => {
      unsubscribeProgress();
      unsubscribeComplete();
    };
  }, [syncEngine, loadQueueCounts]);

  useEffect(() => {
    const handleQueueChange = () => {
      loadQueueCounts();
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

  useEffect(() => {
    if (connectionStatus === 'online' && isAuthenticated && tenantId) {
      loadQueueCounts();
      startSync('online');
    }
  }, [connectionStatus, isAuthenticated, tenantId, loadQueueCounts, startSync]);

  useEffect(() => {
    if (connectionStatus !== 'online' || !isAuthenticated || !tenantId) {
      return;
    }

    const interval = window.setInterval(() => {
      loadQueueCounts();
    }, 60000);

    return () => clearInterval(interval);
  }, [connectionStatus, isAuthenticated, tenantId, loadQueueCounts]);

  const pauseSync = useCallback(() => {
    syncEngine.pause();
  }, [syncEngine]);

  const resumeSync = useCallback(() => {
    syncEngine.resume();
  }, [syncEngine]);

  const stopSync = useCallback(() => {
    syncEngine.stop();
    setIsSyncing(false);
    setSyncProgress(null);
  }, [syncEngine]);

  const clearQueue = useCallback(async () => {
    if (!isAuthenticated || !tenantId) {
      return;
    }

    try {
      await syncQueue.clearCompleted(tenantId);
      await loadQueueCounts();
    } catch (error) {
      console.error('Failed to clear queue:', error);
    }
  }, [isAuthenticated, tenantId, syncQueue, loadQueueCounts]);

  const value = useMemo<OfflineContextType>(() => ({
    isOnline: connectionStatus === 'online',
    isOffline: connectionStatus === 'offline',
    connectionStatus,
    pendingCount,
    failedCount,
    isSyncing,
    syncProgress,
    forceCheck,
    startSync: () => startSync(),
    pauseSync,
    resumeSync,
    stopSync,
    clearQueue
  }), [connectionStatus, pendingCount, failedCount, isSyncing, syncProgress, forceCheck, startSync, pauseSync, resumeSync, stopSync, clearQueue]);

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
