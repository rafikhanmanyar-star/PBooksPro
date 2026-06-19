import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { QueryClient } from '@tanstack/react-query';
import { invalidateQueriesForEntityEvent } from '../services/realtime/entityQueryInvalidation';
import { logger } from '../services/logger';

function createTrackingQueryClient(): {
  client: QueryClient;
  maxConcurrent: number;
  keys: unknown[][];
} {
  let concurrent = 0;
  let maxConcurrent = 0;
  const keys: unknown[][] = [];
  const client = {
    invalidateQueries: async ({ queryKey }: { queryKey: readonly unknown[] }) => {
      keys.push([...queryKey]);
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((resolve) => setTimeout(resolve, 15));
      concurrent -= 1;
    },
  } as unknown as QueryClient;
  return { client, maxConcurrent: 0, keys };
}

describe('entityQueryInvalidation', () => {
  it('invalidates financial queries in parallel', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    const client = {
      invalidateQueries: async () => {
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((resolve) => setTimeout(resolve, 10));
        concurrent -= 1;
      },
    } as unknown as QueryClient;

    await invalidateQueriesForEntityEvent(client, {
      type: 'transaction',
      action: 'updated',
      tenantId: 'tenant-1',
    });

    assert.ok(maxConcurrent >= 2, `expected parallel invalidation, saw maxConcurrent=${maxConcurrent}`);
  });

  it('does not invalidate when tenant scope mismatches', async () => {
    const tracker = createTrackingQueryClient();
    await invalidateQueriesForEntityEvent(
      tracker.client,
      { type: 'transaction', action: 'updated', tenantId: 'tenant-a' },
      { currentTenantId: 'tenant-b' }
    );
    assert.equal(tracker.keys.length, 0);
  });

  it('purchase_order invalidates purchase-order-report and GRN keys', async () => {
    const tracker = createTrackingQueryClient();
    await invalidateQueriesForEntityEvent(tracker.client, {
      type: 'purchase_order',
      action: 'updated',
      tenantId: 'tenant-1',
    });
    assert.ok(tracker.keys.some((k) => k[0] === 'purchase-order-report'));
    assert.ok(tracker.keys.some((k) => k[0] === 'goods-receipts'));
    assert.ok(tracker.keys.some((k) => k[0] === 'goods-receipt-report'));
    assert.ok(tracker.keys.some((k) => k[0] === 'purchase-orders'));
  });

  it('bill invalidates purchase-order-report and purchase-orders', async () => {
    const tracker = createTrackingQueryClient();
    await invalidateQueriesForEntityEvent(tracker.client, {
      type: 'bill',
      action: 'updated',
      tenantId: 'tenant-1',
    });
    assert.ok(tracker.keys.some((k) => k[0] === 'purchase-order-report'));
    assert.ok(tracker.keys.some((k) => k[0] === 'purchase-orders'));
  });

  it('warns when selling analytics invalidation fails', async () => {
    const warnings: string[] = [];
    const originalWarn = logger.warnCategory.bind(logger);
    logger.warnCategory = (category: string, message: string) => {
      if (category === 'realtime') warnings.push(message);
      return originalWarn(category, message);
    };

    const client = {
      invalidateQueries: async ({ queryKey }: { queryKey: readonly unknown[] }) => {
        if (queryKey[0] === 'sellingAnalytics') {
          throw new Error('invalidate failed');
        }
      },
    } as unknown as QueryClient;

    try {
      await invalidateQueriesForEntityEvent(client, {
        type: 'unit',
        action: 'updated',
        tenantId: 'tenant-1',
      });
      assert.ok(warnings.includes('selling_analytics.invalidate_failed'));
    } finally {
      logger.warnCategory = originalWarn;
    }
  });
});
