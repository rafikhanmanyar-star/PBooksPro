import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createUnpostedTransaction,
  getUnpostedTransactionCounts,
  listUnpostedTransactionSubmitters,
  listUnpostedTransactions,
  updateUnpostedTransactionStatus,
  type CreateUnpostedTransactionPayload,
  type UnpostedTransactionListOptions,
} from '../../../services/api/unpostedTransactionsApi';
import type { UnpostedTransactionStatus } from '../../../types/executiveMobile.types';

export function useUnpostedTransactions(options?: UnpostedTransactionListOptions) {
  return useQuery({
    queryKey: [
      'unposted-transactions',
      options?.status,
      options?.mine,
      options?.createdBy,
      options?.dateFrom,
      options?.dateTo,
    ],
    queryFn: () => listUnpostedTransactions(options),
    staleTime: 15_000,
  });
}

export function useUnpostedTransactionSubmitters() {
  return useQuery({
    queryKey: ['unposted-transaction-submitters'],
    queryFn: listUnpostedTransactionSubmitters,
    staleTime: 60_000,
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
      void qc.invalidateQueries({ queryKey: ['user-notifications'] });
      void qc.invalidateQueries({ queryKey: ['mobile-notifications'] });
      void qc.invalidateQueries({ queryKey: ['mobile-command-center'] });
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
      void qc.invalidateQueries({ queryKey: ['user-notifications'] });
      void qc.invalidateQueries({ queryKey: ['mobile-notifications'] });
    },
  });
}
