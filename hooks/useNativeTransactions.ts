/**
 * Hook for paginated transaction loading using native backend
 * 
 * This hook provides paginated access to transactions for better performance
 * with large datasets. Falls back to sql.js if native backend is not available.
 */

import { useState, useEffect, useCallback } from 'react';
import { Transaction } from '../types';
import { TransactionsRepository } from '../services/database/repositories';

interface UseNativeTransactionsOptions {
  projectId?: string | null;
  pageSize?: number;
  enabled?: boolean;
}

interface UseNativeTransactionsResult {
  transactions: Transaction[];
  isLoading: boolean;
  error: Error | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  totalCount: number | null;
  isNativeEnabled: boolean;
}

export function useNativeTransactions(
  options: UseNativeTransactionsOptions = {}
): UseNativeTransactionsResult {
  const { projectId, pageSize = 100, enabled = true } = options;
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(0);

  const repo = new TransactionsRepository();
  const isNativeEnabled = repo.isNativeEnabled();

  const loadPage = useCallback(async (page: number, append: boolean = false) => {
    if (!enabled) return;

    setIsLoading(true);
    setError(null);

    try {
      const offset = page * pageSize;
      const pageTransactions = await repo.findAllPaginated({
        projectId,
        limit: pageSize,
        offset,
      });

      if (append) {
        setTransactions(prev => [...prev, ...pageTransactions]);
      } else {
        setTransactions(pageTransactions);
      }

      // Check if there are more pages
      setHasMore(pageTransactions.length === pageSize);
      setCurrentPage(page);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      console.error('Failed to load transactions:', error);
    } finally {
      setIsLoading(false);
    }
  }, [enabled, projectId, pageSize, repo]);

  const loadMore = useCallback(async () => {
    if (!hasMore || isLoading) return;
    await loadPage(currentPage + 1, true);
  }, [hasMore, isLoading, currentPage, loadPage]);

  const refresh = useCallback(async () => {
    setCurrentPage(0);
    await loadPage(0, false);
  }, [loadPage]);

  // Initial load
  useEffect(() => {
    if (enabled) {
      loadPage(0, false);
    }
  }, [enabled, projectId]); // Reload when projectId changes

  return {
    transactions,
    isLoading,
    error,
    hasMore,
    loadMore,
    refresh,
    totalCount,
    isNativeEnabled,
  };
}

