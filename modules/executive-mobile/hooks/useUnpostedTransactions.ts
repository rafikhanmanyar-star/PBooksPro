import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createUnpostedTransaction,
  getUnpostedTransactionCounts,
  listUnpostedTransactions,
  updateUnpostedTransactionStatus,
  type CreateUnpostedTransactionPayload,
} from '../../../services/api/unpostedTransactionsApi';
import type { UnpostedTransactionStatus } from '../../../types/executiveMobile.types';

export function useUnpostedTransactions(options?: {
  status?: UnpostedTransactionStatus | UnpostedTransactionStatus[];
  mine?: boolean;
}) {
  return useQuery({
    queryKey: ['unposted-transactions', options?.status, options?.mine],
    queryFn: () => listUnpostedTransactions(options),
    staleTime: 15_000,
  });
}

export function useUnpostedTransactionCounts() {
  return useQuery({
    queryKey: ['unposted-transaction-counts'],
    queryFn: getUnpostedTransactionCounts,
    staleTime: 30_000,
  });
}

export function useCreateUnpostedTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateUnpostedTransactionPayload) => createUnpostedTransaction(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['unposted-transactions'] });
      void qc.invalidateQueries({ queryKey: ['unposted-transaction-counts'] });
    },
  });
}

export function useUpdateUnpostedTransactionStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      status,
      rejectionReason,
    }: {
      id: string;
      status: UnpostedTransactionStatus;
      rejectionReason?: string;
    }) => updateUnpostedTransactionStatus(id, status, rejectionReason),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['unposted-transactions'] });
      void qc.invalidateQueries({ queryKey: ['unposted-transaction-counts'] });
    },
  });
}
