import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import {
  clearEntityEventQueue,
  flushEntityEventQueue,
  queueEntityEvent,
  restoreEntityEventQueue,
  runWithEntityEventQueue,
  snapshotEntityEventQueue,
} from '../core/entityEventEmissions.js';
import {
  clearFinancialPostedQueue,
  flushFinancialPostedQueue,
  queueFinancialPosted,
  restoreFinancialPostedQueue,
  runWithFinancialPostedQueue,
  snapshotFinancialPostedQueue,
} from '../core/financialPostedEmissions.js';
import { withSavepoint } from './pool.js';

function createMockClient(): pg.PoolClient {
  const queries: string[] = [];
  return {
    query: async (sql: string) => {
      queries.push(sql);
      return { rows: [], rowCount: 0, command: '', oid: 0, fields: [] };
    },
    release: () => {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as pg.PoolClient;
}

describe('transaction queue integration', () => {
  it('double-nested savepoint rollback: outer and inner phantom events discarded', async () => {
    const entityQueue: Parameters<typeof runWithEntityEventQueue>[0] = [];
    const mockClient = createMockClient();

    await runWithEntityEventQueue(entityQueue, async () => {
      queueEntityEvent('tenant-1', 'created', 'invoice', { id: 'event_a' });

      await withSavepoint(mockClient, 'outer', async () => {
        queueEntityEvent('tenant-1', 'created', 'invoice', { id: 'event_b' });

        await withSavepoint(mockClient, 'inner', async () => {
          queueEntityEvent('tenant-1', 'created', 'invoice', { id: 'event_c' });
          throw new Error('inner failure');
        }).catch(() => {});

        queueEntityEvent('tenant-1', 'created', 'invoice', { id: 'event_d' });
        throw new Error('outer failure');
      }).catch(() => {});

      queueEntityEvent('tenant-1', 'updated', 'invoice', { id: 'event_e' });

      assert.equal(entityQueue.length, 2);
      assert.deepEqual(
        entityQueue.map((e) => e.opts.id),
        ['event_a', 'event_e']
      );
    });
  });

  it('nested savepoint rollback: event A survives, event B discarded', async () => {
    const entityQueue: Parameters<typeof runWithEntityEventQueue>[0] = [];
    const mockClient = createMockClient();

    await runWithEntityEventQueue(entityQueue, async () => {
      queueEntityEvent('tenant-1', 'created', 'invoice', { id: 'event_a' });

      await withSavepoint(mockClient, 'inner', async () => {
        queueEntityEvent('tenant-1', 'created', 'invoice', { id: 'event_b' });
        throw new Error('inner failure');
      }).catch(() => {});

      assert.equal(entityQueue.length, 1);
      assert.equal(entityQueue[0]?.opts.id, 'event_a');
    });
  });

  it('savepoint success: events queued inside savepoint survive', async () => {
    const entityQueue: Parameters<typeof runWithEntityEventQueue>[0] = [];
    const mockClient = createMockClient();

    await runWithEntityEventQueue(entityQueue, async () => {
      queueEntityEvent('tenant-1', 'updated', 'invoice', { id: 'outer' });

      await withSavepoint(mockClient, 'ok', async () => {
        queueEntityEvent('tenant-1', 'created', 'invoice', { id: 'inner' });
      });

      assert.equal(entityQueue.length, 2);
      assert.deepEqual(
        entityQueue.map((e) => e.opts.id),
        ['outer', 'inner']
      );
    });
  });

  it('swallowed savepoint rollback: outer events emit, savepoint events do not', async () => {
    const entityQueue: Parameters<typeof runWithEntityEventQueue>[0] = [];
    const mockClient = createMockClient();

    await runWithEntityEventQueue(entityQueue, async () => {
      queueEntityEvent('tenant-1', 'created', 'bill', { id: 'bill_outer' });

      await withSavepoint(mockClient, 'risky', async () => {
        queueEntityEvent('tenant-1', 'created', 'transaction', { id: 'tx_phantom' });
        throw new Error('rolled back');
      }).catch(() => {});

      queueEntityEvent('tenant-1', 'updated', 'bill', { id: 'bill_outer_2' });

      assert.equal(entityQueue.length, 2);
      assert.deepEqual(
        entityQueue.map((e) => e.opts.id),
        ['bill_outer', 'bill_outer_2']
      );
    });
  });

  it('financial posted queue: savepoint rollback discards queued financial events', async () => {
    const financialQueue: Parameters<typeof runWithFinancialPostedQueue>[0] = [];
    const mockClient = createMockClient();

    await runWithFinancialPostedQueue(financialQueue, async () => {
      queueFinancialPosted('tenant-1', { journalEntryId: 'je_outer', sourceModule: 'test' });

      await withSavepoint(mockClient, 'posting', async () => {
        queueFinancialPosted('tenant-1', { journalEntryId: 'je_phantom', sourceModule: 'test' });
        throw new Error('posting failed');
      }).catch(() => {});

      assert.equal(financialQueue.length, 1);
      assert.equal(financialQueue[0]?.payload.journalEntryId, 'je_outer');
    });
  });

  it('withSavepoint outside transaction: snapshot null, restore no-op', async () => {
    const mockClient = createMockClient();
    assert.equal(snapshotEntityEventQueue(), null);
    assert.equal(snapshotFinancialPostedQueue(), null);

    await withSavepoint(mockClient, 'standalone', async () => {
      assert.equal(snapshotEntityEventQueue(), null);
      assert.equal(snapshotFinancialPostedQueue(), null);
    });

    restoreEntityEventQueue(null);
    restoreFinancialPostedQueue(null);
  });

  it('commit path: flush financial before entity (insertion order preserved)', async () => {
    const financialQueue: Parameters<typeof runWithFinancialPostedQueue>[0] = [];
    const entityQueue: Parameters<typeof runWithEntityEventQueue>[0] = [];
    const flushOrder: string[] = [];

    await runWithFinancialPostedQueue(financialQueue, () =>
      runWithEntityEventQueue(entityQueue, async () => {
        queueFinancialPosted('tenant-1', { journalEntryId: 'je-1', sourceModule: 'test' });
        queueEntityEvent('tenant-1', 'created', 'transaction', { id: 'tx-1' });

        const origFlushFinancial = flushFinancialPostedQueue;
        const origFlushEntity = flushEntityEventQueue;

        // Mirror withTransaction flush order without DB
        try {
          flushFinancialPostedQueue();
          flushOrder.push('financial');
          flushEntityEventQueue();
          flushOrder.push('entity');
        } finally {
          void origFlushFinancial;
          void origFlushEntity;
        }
      })
    );

    assert.deepEqual(flushOrder, ['financial', 'entity']);
    assert.equal(financialQueue.length, 0);
    assert.equal(entityQueue.length, 0);
  });

  it('rollback path: clearEntityEventQueue discards without flush', async () => {
    const entityQueue: Parameters<typeof runWithEntityEventQueue>[0] = [];

    await runWithEntityEventQueue(entityQueue, async () => {
      queueEntityEvent('tenant-1', 'created', 'invoice', { id: 'never' });
      assert.equal(entityQueue.length, 1);
      clearEntityEventQueue();
      assert.equal(entityQueue.length, 0);
    });
  });

  it('rollback path: clearFinancialPostedQueue discards without flush', async () => {
    const financialQueue: Parameters<typeof runWithFinancialPostedQueue>[0] = [];

    await runWithFinancialPostedQueue(financialQueue, async () => {
      queueFinancialPosted('tenant-1', { journalEntryId: 'je-never', sourceModule: 'test' });
      assert.equal(financialQueue.length, 1);
      clearFinancialPostedQueue();
      assert.equal(financialQueue.length, 0);
    });
  });
});
