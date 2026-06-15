/**
 * @deprecated Use usePaginatedTransactions — native SQLite pagination was removed.
 */
import { usePaginatedTransactions } from './usePaginatedTransactions';

export function useNativeTransactions(
  options: Parameters<typeof usePaginatedTransactions>[0] = {}
) {
  return usePaginatedTransactions(options);
}
