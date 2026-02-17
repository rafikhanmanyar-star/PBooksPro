/**
 * Sync Status Indicator Component
 * 
 * Displays sync queue status for desktop offline operations
 * Uses the new useSyncStatus hook
 */

import React from 'react';
import { useSyncStatus } from '../../hooks/useSyncStatus';
import { isMobileDevice } from '../../utils/platformDetection';

interface SyncStatusIndicatorProps {
  showDetails?: boolean;
  className?: string;
}

const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = ({
  showDetails = false,
  className = ''
}) => {
  const { pending, syncing, failed, isSyncing, isInbound, hasPending } = useSyncStatus();
  const isMobile = isMobileDevice();

  // Mobile doesn't have sync queue
  if (isMobile) {
    return null;
  }

  // Don't show if nothing to sync
  if (!hasPending && !isSyncing) {
    return null;
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {isSyncing && (
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <div className={`w-2 h-2 rounded-full animate-pulse ${isInbound ? 'bg-emerald-500' : 'bg-blue-500'}`} />
            <div className={`absolute inset-0 w-2 h-2 rounded-full animate-ping opacity-75 ${isInbound ? 'bg-emerald-500' : 'bg-blue-500'}`} />
          </div>
          {showDetails && (
            <span className={`text-xs font-medium ${isInbound ? 'text-emerald-700' : 'text-slate-700'}`}>
              {isInbound ? 'Loading...' : 'Syncing...'}
            </span>
          )}
        </div>
      )}

      {pending > 0 && !isSyncing && (
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-amber-500" />
          {showDetails && (
            <span className="text-xs font-medium text-amber-600">
              {pending} pending
            </span>
          )}
          {!showDetails && (
            <span className="text-xs font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
              {pending}
            </span>
          )}
        </div>
      )}

      {failed > 0 && (
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          {showDetails && (
            <span className="text-xs font-medium text-red-600">
              {failed} failed
            </span>
          )}
          {!showDetails && (
            <span className="text-xs font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">
              {failed}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default SyncStatusIndicator;
