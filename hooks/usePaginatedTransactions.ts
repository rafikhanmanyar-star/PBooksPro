/**
 * Enhanced Paginated Transactions Hook
 * 
 * Provides paginated access to transactions with smart fallback:
 * - Uses native backend when available (fast, paginated)
 * - Falls back to state.transactions when native unavailable
 * - Maintains all filtering, sorting, and grouping functionality
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Transaction } from '../types';
import { TransactionsRepository } from '../services/database/repositories';
import { useAppContext } from '../context/AppContext';
import { getDatabaseService } from '../services/database/databaseService';
import { getUnifiedDatabaseService } from '../services/database/unifiedDatabaseService';
import { isMobileDevice } from '../utils/platformDetection';

interface UsePaginatedTransactionsOptions {
  projectId?: string | null;
  pageSize?: number;
  enabled?: boolean;
}

interface UsePaginatedTransactionsResult {
  transactions: Transaction[];
  isLoading: boolean;
  error: Error | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  totalCount: number | null;
  isNativeEnabled: boolean;
  isUsingNative: boolean;
}

export function usePaginatedTransactions(
  options: UsePaginatedTransactionsOptions = {}
): UsePaginatedTransactionsResult {
  const { state } = useAppContext();
  const { projectId, pageSize = 200, enabled = true } = options;
  const [nativeTransactions, setNativeTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [isUsingNative, setIsUsingNative] = useState(false);
  const [totalCount, setTotalCount] = useState<number | null>(null);

  // Memoize repository instance to avoid repeated setup
  const repo = useMemo(() => new TransactionsRepository(), []);
  const isNativeEnabled = useMemo(() => repo.isNativeEnabled(), [repo]);

  // Check if we should use native backend
  const shouldUseNative = useMemo(() => {
    if (!enabled) return false;
    if (!isNativeEnabled) return false;

    if (typeof window !== 'undefined') {
      const flag = localStorage.getItem('useNativeDatabase');
      if (flag === 'false') return false;
    }
    return true;
  }, [enabled, isNativeEnabled]);

  const loadPage = useCallback(async (page: number, append: boolean = false) => {
    if (!enabled) return;

    setIsLoading(true);
    setError(null);

    try {
      // Always fetch count on first page or when it's null
      // Only fetch if database is ready to avoid warnings
      if (page === 0 || totalCount === null) {
        const dbService = getDatabaseService();
        if (dbService.isReady()) {
          try {
            const count = await repo.getCount({ projectId });
            setTotalCount(count);
          } catch (error) {
            // Silently handle count errors during initialization
            console.debug('Count query failed:', error);
          }
        } else {
          // Database not ready yet, will retry on next render or when database becomes ready
          // For now, use state transactions length as fallback
          if (!shouldUseNative) {
            setTotalCount(state.transactions.length);
          }
        }
      }

      if (shouldUseNative) {
        const offset = page * pageSize;
        const pageTransactions = await repo.findAllPaginated({
          projectId,
          limit: pageSize,
          offset,
        });

        if (append) {
          setNativeTransactions(prev => [...prev, ...pageTransactions]);
        } else {
          setNativeTransactions(pageTransactions);
        }

        setHasMore(pageTransactions.length === pageSize);
        setCurrentPage(page);
        setIsUsingNative(true);
      } else {
        setNativeTransactions([]);
        setIsUsingNative(false);
        setHasMore(false);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      console.error('Failed to load transactions:', error);
      setIsUsingNative(false);
      setHasMore(false);
    } finally {
      setIsLoading(false);
    }
  }, [enabled, projectId, pageSize, repo, shouldUseNative, totalCount, state.transactions.length, state]);

  const loadMore = useCallback(async () => {
    if (!hasMore || isLoading || !shouldUseNative) return;
    await loadPage(currentPage + 1, true);
  }, [hasMore, isLoading, currentPage, loadPage, shouldUseNative]);

  const refresh = useCallback(async () => {
    setCurrentPage(0);
    setTotalCount(null);
    await loadPage(0, false);
  }, [loadPage]);

  // Initial load or when projectId/shouldUseNative changes
  useEffect(() => {
    if (enabled) {
      if (shouldUseNative) {
        loadPage(0, false);
      } else {
        setIsUsingNative(false);
        setNativeTransactions([]);
        // When not using native, we'll use state transactions, so we can set total count
        setTotalCount(state.transactions.length);
      }
    } else {
      setNativeTransactions([]);
      setIsUsingNative(false);
      setTotalCount(null); // Clear total count if disabled
    }
  }, [enabled, projectId, shouldUseNative, loadPage, state.transactions.length]);

  // Get transactions (native or fallback)
  const transactions = useMemo(() => {
    if (isUsingNative && nativeTransactions.length > 0) {
      return nativeTransactions;
    }
    return state.transactions;
  }, [isUsingNative, nativeTransactions, state.transactions]);

  return {
    transactions,
    isLoading,
    error,
    hasMore,
    loadMore,
    refresh,
    totalCount,
    isNativeEnabled,
    isUsingNative,
  };
}
