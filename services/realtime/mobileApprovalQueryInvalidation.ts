import type { QueryClient } from '@tanstack/react-query';

/** Mobile approval queue — tenant-wide invalidation on approval_* socket events. */
export const MOBILE_APPROVALS_QUERY_KEY = ['mobile-approvals'] as const;

export function invalidateMobileApprovalQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: [...MOBILE_APPROVALS_QUERY_KEY] });
}
