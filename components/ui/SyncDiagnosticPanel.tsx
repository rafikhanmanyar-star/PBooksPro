/**
 * Sync Diagnostic Panel Component
 * 
 * Provides detailed view of sync queue status, failed items, and diagnostic tools
 */

import React, { useState, useEffect } from 'react';
import { getSyncQueue } from '../../services/syncQueue';
import { getSyncEngine } from '../../services/syncEngine';
import { getSyncManager } from '../../services/sync/syncManager';
import { SyncQueueItem } from '../../types/sync';
import { useAuth } from '../../context/AuthContext';
import { isMobileDevice } from '../../utils/platformDetection';

interface SyncDiagnosticPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const SyncDiagnosticPanel: React.FC<SyncDiagnosticPanelProps> = ({ isOpen, onClose }) => {
  const { user, isAuthenticated } = useAuth();
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    syncing: 0,
    completed: 0,
    failed: 0,
  });
  // Local queue (SyncManager) - same source as the status indicator "1 in progress, 65 waiting"
  const [localQueueStats, setLocalQueueStats] = useState({ total: 0, pending: 0, syncing: 0, failed: 0 });
  const [failedItems, setFailedItems] = useState<SyncQueueItem[]>([]);
  const [syncingItems, setSyncingItems] = useState<SyncQueueItem[]>([]);
  const [pendingItems, setPendingItems] = useState<SyncQueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);

  const syncQueue = getSyncQueue();
  const syncEngine = getSyncEngine();
  const syncManager = getSyncManager();

  // Mobile doesn't have sync queue
  if (isMobileDevice()) {
    return null;
  }

  // Refresh SyncManager stats immediately when modal opens and every 1s (same source as status indicator)
  const refreshLocalQueueStats = React.useCallback(() => {
    const status = getSyncManager().getQueueStatus();
    console.log('[SyncDiagnosticPanel] Refreshing local queue stats:', status);
    setLocalQueueStats(status);
  }, []);

  useEffect(() => {
    if (isOpen && isAuthenticated && user?.tenant?.id) {
      refreshLocalQueueStats();
      const fastInterval = setInterval(refreshLocalQueueStats, 1000);
      return () => clearInterval(fastInterval);
    }
  }, [isOpen, isAuthenticated, user?.tenant?.id, refreshLocalQueueStats]);

  useEffect(() => {
    if (isOpen && isAuthenticated && user?.tenant?.id) {
      loadDiagnostics();
      // Full refresh (IndexedDB + SyncManager) every 3 seconds while open
      const interval = setInterval(loadDiagnostics, 3000);
      return () => clearInterval(interval);
    }
  }, [isOpen, isAuthenticated, user?.tenant?.id]);

  const loadDiagnostics = async () => {
    if (!isAuthenticated || !user?.tenant?.id) return;

    try {
      setLoading(true);
      // Local queue (SyncManager) - keep in sync with status indicator
      const mgrStatus = syncManager.getQueueStatus();
      console.log('[SyncDiagnosticPanel] loadDiagnostics - SyncManager status:', mgrStatus);
      setLocalQueueStats(mgrStatus);
      const [statsData, failed, syncing, pending] = await Promise.all([
        syncQueue.getSyncStats(user.tenant.id),
        syncQueue.getFailedItems(user.tenant.id),
        syncQueue.getSyncingItems(user.tenant.id),
        syncQueue.getPendingItems(user.tenant.id),
      ]);

      setStats(statsData);
      setFailedItems(failed);
      setSyncingItems(syncing);
      setPendingItems(pending.slice(0, 20)); // Show first 20 pending items
    } catch (error) {
      console.error('Failed to load sync diagnostics:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRetryFailed = async (itemId: string) => {
    try {
      setRetrying(itemId);
      await syncQueue.retryFailedItem(itemId);
      await loadDiagnostics();
      
      // Auto-start sync if not already running
      if (!syncEngine.getIsRunning()) {
        await syncEngine.start(user!.tenant!.id);
      }
    } catch (error) {
      console.error('Failed to retry item:', error);
      alert(`Failed to retry item: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setRetrying(null);
    }
  };

  const handleRetryAllFailed = async () => {
    if (failedItems.length === 0) return;
    
    if (!confirm(`Retry all ${failedItems.length} failed items?`)) return;

    try {
      setLoading(true);
      for (const item of failedItems) {
        await syncQueue.retryFailedItem(item.id);
      }
      await loadDiagnostics();
      
      // Auto-start sync if not already running
      if (!syncEngine.getIsRunning()) {
        await syncEngine.start(user!.tenant!.id);
      }
    } catch (error) {
      console.error('Failed to retry all items:', error);
      alert(`Failed to retry items: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleClearFailed = async () => {
    if (failedItems.length === 0) return;
    
    if (!confirm(`Permanently remove all ${failedItems.length} failed items from queue? This cannot be undone.`)) return;

    try {
      setLoading(true);
      for (const item of failedItems) {
        await syncQueue.remove(item.id);
      }
      await loadDiagnostics();
    } catch (error) {
      console.error('Failed to clear failed items:', error);
      alert(`Failed to clear items: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatError = (error?: string) => {
    if (!error) return 'No error message';
    // Truncate long errors
    return error.length > 100 ? error.substring(0, 100) + '...' : error;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Sync Queue Diagnostics</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Local queue (SyncManager) - always visible, updates every 1s; same source as status indicator */}
          <div className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">
              Local sync queue (SyncManager) — matches status indicator
            </h3>
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-white p-3 rounded border border-slate-100">
                <div className="text-xs text-gray-600">Total</div>
                <div className="text-xl font-bold text-slate-700">{localQueueStats.total}</div>
              </div>
              <div className="bg-white p-3 rounded border border-slate-100">
                <div className="text-xs text-gray-600">Pending</div>
                <div className="text-xl font-bold text-amber-600">{localQueueStats.pending}</div>
              </div>
              <div className="bg-white p-3 rounded border border-slate-100">
                <div className="text-xs text-gray-600">Syncing</div>
                <div className="text-xl font-bold text-blue-600">{localQueueStats.syncing}</div>
              </div>
              <div className="bg-white p-3 rounded border border-slate-100">
                <div className="text-xs text-gray-600">Failed</div>
                <div className="text-xl font-bold text-red-600">{localQueueStats.failed}</div>
              </div>
            </div>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          )}

          {!loading && (
            <>
              {/* IndexedDB queue (transactions, contacts, etc.) */}
              <div className="grid grid-cols-5 gap-4 mb-6">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600">Total</div>
                  <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
                </div>
                <div className="bg-amber-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600">Pending</div>
                  <div className="text-2xl font-bold text-amber-600">{stats.pending}</div>
                </div>
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600">Syncing</div>
                  <div className="text-2xl font-bold text-blue-600">{stats.syncing}</div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600">Completed</div>
                  <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
                </div>
                <div className="bg-red-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600">Failed</div>
                  <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
                </div>
              </div>

              {/* Failed Items */}
              {failedItems.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-semibold text-gray-900">
                      Failed Items ({failedItems.length})
                    </h3>
                    <div className="flex gap-2">
                      <button
                        onClick={handleRetryAllFailed}
                        disabled={loading || retrying !== null}
                        className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        Retry All
                      </button>
                      <button
                        onClick={handleClearFailed}
                        disabled={loading}
                        className="px-3 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="max-h-64 overflow-y-auto">
                      {failedItems.map((item) => (
                        <div
                          key={item.id}
                          className="p-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium text-gray-900">
                                  {item.action.toUpperCase()} {item.type}
                                </span>
                                <span className="text-xs text-gray-500">
                                  Retries: {item.retryCount}/3
                                </span>
                              </div>
                              <div className="text-xs text-gray-600 mb-1">
                                ID: {item.id}
                              </div>
                              <div className="text-xs text-gray-500 mb-1">
                                Queued: {formatTimestamp(item.timestamp)}
                              </div>
                              {item.error && (
                                <div className="text-xs text-red-600 bg-red-50 p-2 rounded mt-1">
                                  {formatError(item.error)}
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() => handleRetryFailed(item.id)}
                              disabled={loading || retrying === item.id}
                              className="ml-4 px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50"
                            >
                              {retrying === item.id ? 'Retrying...' : 'Retry'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Syncing Items */}
              {syncingItems.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">
                    Currently Syncing ({syncingItems.length})
                  </h3>
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="max-h-48 overflow-y-auto">
                      {syncingItems.map((item) => (
                        <div
                          key={item.id}
                          className="p-3 border-b border-gray-100 last:border-b-0 bg-blue-50"
                        >
                          <div className="flex items-center gap-2">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                            <span className="font-medium text-gray-900">
                              {item.action.toUpperCase()} {item.type}
                            </span>
                            <span className="text-xs text-gray-500 ml-auto">
                              Started: {item.lastAttempt ? formatTimestamp(item.lastAttempt) : 'Unknown'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Pending Items (Sample) */}
              {pendingItems.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">
                    Pending Items (showing first 20 of {stats.pending})
                  </h3>
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="max-h-48 overflow-y-auto">
                      {pendingItems.map((item) => (
                        <div
                          key={item.id}
                          className="p-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-medium text-gray-900">
                                {item.action.toUpperCase()} {item.type}
                              </span>
                              <span className="text-xs text-gray-500 ml-2">
                                Queued: {formatTimestamp(item.timestamp)}
                              </span>
                            </div>
                            {item.retryCount > 0 && (
                              <span className="text-xs text-amber-600">
                                Retry #{item.retryCount}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Empty State - both queues empty */}
              {stats.total === 0 && localQueueStats.total === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <p>No items in sync queue</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={loadDiagnostics}
            disabled={loading}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50"
          >
            Refresh
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default SyncDiagnosticPanel;
