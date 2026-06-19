import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient } from '@tanstack/react-query';
import {
  invalidateMobileApprovalQueries,
  MOBILE_APPROVALS_QUERY_KEY,
} from '../services/realtime/mobileApprovalQueryInvalidation';

describe('mobileApprovalQueryInvalidation', () => {
  it('exports mobile-approvals query key prefix', () => {
    assert.deepEqual(MOBILE_APPROVALS_QUERY_KEY, ['mobile-approvals']);
  });

  it('invalidates mobile-approvals on each call', () => {
    const keys: unknown[][] = [];
    const queryClient = {
      invalidateQueries: ({ queryKey }: { queryKey: readonly unknown[] }) => {
        keys.push([...queryKey]);
      },
    } as unknown as QueryClient;

    invalidateMobileApprovalQueries(queryClient);
    assert.equal(keys.length, 1);
    assert.deepEqual(keys[0], ['mobile-approvals']);
  });
});
