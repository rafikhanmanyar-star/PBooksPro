/**
 * Paginated Transactions Hook (API mode)
 *
 * Transactions come from AppState (synced via API). Native SQLite pagination was removed.
 */

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Transaction } from '../types';
import { useStateSelector } from './useSelectiveState';
import { queryKeys } from './queries/queryKeys';

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
  _options: UsePaginatedTransactionsOptions = {}
): UsePaginatedTransactionsResult {
  const stateTransactions = useStateSelector(s => s.transactions);
  const queryClient = useQueryClient();

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.ledger.all });
  }, [queryClient]);

  const loadMore = useCallback(async () => {}, []);

  return {
    transactions: stateTransactions,
    isLoading: false,
    error: null,
    hasMore: false,
    loadMore,
    refresh,
    totalCount: stateTransactions.length,
    isNativeEnabled: false,
    isUsingNative: false,
  };
}
