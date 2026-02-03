/**
 * Sync Notification Component
 * 
 * Displays sync progress, success, and error notifications
 * Uses the new useSyncStatus hook for better integration
 */

import React, { useEffect, useState } from 'react';
import { useSyncStatus } from '../../hooks/useSyncStatus';
import { isMobileDevice } from '../../utils/platformDetection';
// import SyncDiagnosticPanel from './SyncDiagnosticPanel'; // Disabled per user request

const SyncNotification: React.FC = () => {
  const { pending, syncing, failed, isSyncing } = useSyncStatus();
  const isMobile = isMobileDevice();
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastCompletedCount, setLastCompletedCount] = useState(0);
  const [previousSyncing, setPreviousSyncing] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // Mobile doesn't have sync queue, so don't show anything
  if (isMobile) {
    return null;
  }

  /**
   * Show success notification when sync completes
   */
  useEffect(() => {
    // Detect when sync transitions from syncing to not syncing
    if (previousSyncing && !isSyncing && syncing === 0) {
      // Calculate completed count from pending reduction
      const completed = syncing; // Items that were syncing are now done
      if (completed > 0) {
        setLastCompletedCount(completed);
        setShowSuccess(true);
        
        // Auto-dismiss after 5 seconds
        const timer = setTimeout(() => {
          setShowSuccess(false);
        }, 5000);

        return () => clearTimeout(timer);
      }
    }
    setPreviousSyncing(isSyncing);
  }, [isSyncing, syncing, previousSyncing]);

  // Don't render if nothing to show
  if (!isSyncing && !showSuccess && pending === 0 && failed === 0) {
    return null;
  }

  return (
    <>
      <div className="fixed bottom-20 right-4 z-50 space-y-2">
        {/* Syncing Progress */}
        {isSyncing && syncing > 0 && (
          <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-4 max-w-sm animate-slide-up">
            <div className="flex items-start gap-3">
              {/* Spinning Icon */}
              <div className="flex-shrink-0">
                <svg 
                  className="w-6 h-6 text-blue-600 animate-spin" 
                  fill="none" 
                  viewBox="0 0 24 24"
                >
                  <circle 
                    className="opacity-25" 
                    cx="12" 
                    cy="12" 
                    r="10" 
                    stroke="currentColor" 
                    strokeWidth="4"
                  />
                  <path 
                    className="opacity-75" 
                    fill="currentColor" 
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">
                  Syncing data to cloud...
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  {syncing} operation{syncing !== 1 ? 's' : ''} in progress
                </p>
                
                {pending > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    {pending} more waiting
                  </p>
                )}
              </div>

              {/* Details button removed per user request */}
            </div>
          </div>
        )}

      {/* Success Notification */}
      {showSuccess && !isSyncing && (
        <div className="bg-white rounded-lg shadow-lg border border-green-200 p-4 max-w-sm animate-slide-up">
          <div className="flex items-start gap-3">
            {/* Success Icon */}
            <div className="flex-shrink-0">
              <svg 
                className="w-6 h-6 text-green-600" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" 
                />
              </svg>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">
                Sync complete
              </p>
              <p className="text-xs text-gray-600 mt-1">
                Successfully synced {lastCompletedCount} operation{lastCompletedCount !== 1 ? 's' : ''}
              </p>
            </div>

            {/* Close Button */}
            <button
              onClick={() => setShowSuccess(false)}
              className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Failed Items Warning */}
      {failed > 0 && !isSyncing && (
        <div className="bg-white rounded-lg shadow-lg border border-red-200 p-4 max-w-sm">
          <div className="flex items-start gap-3">
            {/* Warning Icon */}
            <div className="flex-shrink-0">
              <svg 
                className="w-6 h-6 text-red-600" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
                />
              </svg>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">
                Some items failed to sync
              </p>
              <p className="text-xs text-gray-600 mt-1">
                {failed} operation{failed !== 1 ? 's' : ''} failed after multiple retries
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Will retry on reconnect
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Pending Items Info (when offline) */}
      {pending > 0 && !isSyncing && (
        <div className="bg-white rounded-lg shadow-lg border border-amber-200 p-4 max-w-sm">
          <div className="flex items-start gap-3">
            {/* Info Icon */}
            <div className="flex-shrink-0">
              <svg 
                className="w-6 h-6 text-amber-600" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
                />
              </svg>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">
                Changes saved locally
              </p>
              <p className="text-xs text-gray-600 mt-1">
                {pending} operation{pending !== 1 ? 's' : ''} waiting to sync
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Will sync automatically when online
              </p>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Diagnostic Panel - removed per user request */}
    </>
  );
};

export default SyncNotification;
