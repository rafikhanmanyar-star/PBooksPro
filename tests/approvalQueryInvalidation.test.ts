import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { QueryClient } from '@tanstack/react-query';
import {
  APPROVAL_INVALIDATION_QUERY_KEYS,
  invalidateApprovalQueries,
} from '../services/realtime/approvalQueryInvalidation';

const APPROVAL_EVENTS = [
  'approval_requested',
  'approval_approved',
  'approval_rejected',
  'approval_returned',
  'approval_escalated',
  'approval_delegated',
] as const;

function createTrackingClient(): { client: QueryClient; keys: unknown[][] } {
  const keys: unknown[][] = [];
  const client = {
    invalidateQueries: ({ queryKey }: { queryKey: readonly unknown[] }) => {
      keys.push([...queryKey]);
    },
  } as unknown as QueryClient;
  return { client, keys };
}

describe('approvalQueryInvalidation', () => {
  it('exports exactly 8 approval query key prefixes', () => {
    assert.equal(APPROVAL_INVALIDATION_QUERY_KEYS.length, 8);
    assert.deepEqual(
      APPROVAL_INVALIDATION_QUERY_KEYS.map((k) => k[0]),
      [
        'workflow',
        'purchase-orders',
        'notifications',
        'dashboardMetrics',
        'contracts',
        'bills',
        'transactions',
        'vendors',
      ]
    );
  });

  it('invalidates all 8 keys on each call', () => {
    const { client, keys } = createTrackingClient();
    invalidateApprovalQueries(client);
    assert.equal(keys.length, 8);
    for (const expected of APPROVAL_INVALIDATION_QUERY_KEYS) {
      assert.ok(
        keys.some((k) => k.length === expected.length && k.every((v, i) => v === expected[i])),
        `missing key ${String(expected[0])}`
      );
    }
  });

  for (const event of APPROVAL_EVENTS) {
    it(`${event}: same 8-key invalidation set (hub parity)`, () => {
      const { client, keys } = createTrackingClient();
      invalidateApprovalQueries(client);
      assert.equal(keys.length, 8);
    });
  }
});
