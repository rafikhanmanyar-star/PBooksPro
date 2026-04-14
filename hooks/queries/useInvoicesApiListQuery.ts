import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { InvoicesApiRepository } from '../../services/api/repositories/invoicesApi';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { queryKeys } from './queryKeys';

/**
 * Cached invoice list for API/LAN mode (local-only uses AppState + SQLite).
 */
export function useInvoicesApiListQuery(
  filters?: Parameters<InvoicesApiRepository['findAll']>[0],
  enabled = true
) {
  const repo = useMemo(() => new InvoicesApiRepository(), []);
  const key = JSON.stringify(filters ?? {});
  return useQuery({
    queryKey: queryKeys.invoices.apiList(key),
    queryFn: () => repo.findAll(filters),
    enabled: enabled && !isLocalOnlyMode(),
  });
}
