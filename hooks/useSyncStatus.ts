/**
 * useSyncStatus Hook
 * 
 * Provides sync queue status for desktop offline operations.
 * Shows pending, syncing, and failed operations.
 */

import { useState, useEffect } from 'react';
import { getSyncManager } from '../services/sync/syncManager';
import { isMobileDevice } from '../utils/platformDetection';

export interface UseSyncStatusResult {
  total: number;
  pending: number;
  syncing: number;
  failed: number;
  isSyncing: boolean;
  hasPending: boolean;
}

export function useSyncStatus(): UseSyncStatusResult {
  const [status, setStatus] = useState({
    total: 0,
    pending: 0,
    syncing: 0,
    failed: 0,
  });

  useEffect(() => {
    const syncManager = getSyncManager();
    
    // Get initial status
    const updateStatus = () => {
      setStatus(syncManager.getQueueStatus());
    };
    
    updateStatus();

    // Update status periodically
    const interval = setInterval(updateStatus, 2000); // Every 2 seconds

    // Cleanup
    return () => {
      clearInterval(interval);
    };
  }, []);

  return {
    ...status,
    isSyncing: status.syncing > 0,
    hasPending: status.pending > 0 || status.failed > 0,
  };
}
