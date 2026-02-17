/**
 * useSyncStatus Hook
 * 
 * Provides sync queue status for desktop offline operations.
 * Shows pending, syncing, and failed operations.
 */

import { useState, useEffect } from 'react';
import { getSyncManager } from '../services/sync/syncManager';
import { isMobileDevice } from '../utils/platformDetection';
import { SyncProgress } from '../types/sync';

export interface UseSyncStatusResult {
  total: number;
  pending: number;
  syncing: number;
  failed: number;
  isSyncing: boolean;
  isInbound: boolean;
  hasPending: boolean;
  progress: SyncProgress | null;
}

export function useSyncStatus(): UseSyncStatusResult {
  const [status, setStatus] = useState({
    total: 0,
    pending: 0,
    syncing: 0,
    failed: 0,
    progress: null as SyncProgress | null,
  });

  useEffect(() => {
    // Mobile: No sync queue
    if (isMobileDevice()) {
      return;
    }

    const syncManager = getSyncManager();

    // Get initial status
    const updateStatus = () => {
      const newStatus = syncManager.getQueueStatus();
      // Reduced logging per user request
      // console.log('[useSyncStatus] Updating status:', newStatus);
      setStatus(newStatus);
    };

    updateStatus();

    // Listen for real-time progress updates
    const handleProgressUpdate = (event: any) => {
      const progress = event.detail ?? null;
      setStatus(prev => ({
        ...prev,
        progress
      }));
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('sync:progress-update', handleProgressUpdate);
    }

    // Update status periodically for queue counts
    const interval = setInterval(updateStatus, 1000);

    // Cleanup
    return () => {
      clearInterval(interval);
      if (typeof window !== 'undefined') {
        window.removeEventListener('sync:progress-update', handleProgressUpdate);
      }
    };
  }, []);

  return {
    ...status,
    isSyncing: status.syncing > 0 || !!status.progress,
    isInbound: !!status.progress?.inboundTotal && (status.progress.inboundCompleted ?? 0) < status.progress.inboundTotal,
    hasPending: status.pending > 0 || status.failed > 0,
  };
}
