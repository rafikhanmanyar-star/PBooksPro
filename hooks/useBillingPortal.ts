import { useQuery } from '@tanstack/react-query';
import {
  subscriptionBillingApi,
  type BillingPortalSummary,
} from '../services/api/subscriptionBillingApi';
import { usePermissions } from './usePermissions';

export const billingPortalQueryKey = ['billingPortal'] as const;

/** Shared React Query hook for billing portal data. Deduplicates concurrent calls. */
export function useBillingPortal(): {
  portal: BillingPortalSummary | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const { canAccessBillingPortal } = usePermissions();
  const query = useQuery({
    queryKey: billingPortalQueryKey,
    queryFn: () => subscriptionBillingApi.getPortal(),
    enabled: canAccessBillingPortal,
    staleTime: 60_000,
  });
  return {
    portal: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: () => { void query.refetch(); },
  };
}
