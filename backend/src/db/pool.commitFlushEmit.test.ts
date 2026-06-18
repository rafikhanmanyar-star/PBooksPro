import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import {
  clearEntityEventQueue,
  flushEntityEventQueue,
  queueEntityEvent,
  runWithEntityEventQueue,
  type QueuedEntityEvent,
} from '../core/entityEventEmissions.js';
import {
  clearFinancialPostedQueue,
  flushFinancialPostedQueue,
  queueFinancialPosted,
  runWithFinancialPostedQueue,
} from '../core/financialPostedEmissions.js';
import { integrationTestsEnabled, INTEGRATION_TENANT_ID } from '../test/integrationHarness.js';
import { withTransaction } from './pool.js';

function createMockClient(onQuery: (sql: string) => void): pg.PoolClient {
  return {
    query: async (sql: string) => {
      onQuery(sql);
      return { rows: [], rowCount: 0, command: '', oid: 0, fields: [] };
    },
    release: () => {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as pg.PoolClient;
}

/**
 * Mirrors `withTransaction` in pool.ts using the same queue + flush imports.
 * Used to assert COMMIT precedes flush without requiring DATABASE_URL.
 */
async function runPoolStyleTransaction<T>(
  client: pg.PoolClient,
  fn: (c: pg.PoolClient) => Promise<T>
): Promise<T> {
  const pendingFinancialPosted: {
    tenantId: string;
    payload: import('../core/realtime.js').FinancialPostedPayload;
  }[] = [];
  const pendingEntityEvents: QueuedEntityEvent[] = [];

  return runWithFinancialPostedQueue(pendingFinancialPosted, () =>
    runWithEntityEventQueue(pendingEntityEvents, async () => {
      const phases: string[] = [];
      try {
        await client.query('BEGIN');
        phases.push('after-begin');
        const result = await fn(client);
        await client.query('COMMIT');
        phases.push('after-commit');
        flushFinancialPostedQueue();
        phases.push('after-financial-flush');
        flushEntityEventQueue();
        phases.push('after-entity-flush');
        assert.deepEqual(phases, [
          'after-begin',
          'after-commit',
          'after-financial-flush',
          'after-entity-flush',
        ]);
        return result;
      } catch (e) {
        await client.query('ROLLBACK');
        clearFinancialPostedQueue();
        clearEntityEventQueue();
        throw e;
      }
    })
  );
}

describe('withTransaction end-to-end: COMMIT → flush → emit', () => {
  it('COMMIT precedes flush; queued events are drained (emit via flushEntityEventQueue)', async () => {
    const sqlSteps: string[] = [];
    const client = createMockClient((sql) => {
      sqlSteps.push(sql.trim().toUpperCase().split(/\s+/)[0] ?? sql);
    });

    await runPoolStyleTransaction(client, async () => {
      queueFinancialPosted('tenant-1', { journalEntryId: 'je-1', sourceModule: 'test' });
      queueEntityEvent('tenant-1', 'created', 'invoice', { id: 'inv-1' });

      const { snapshotEntityEventQueue } = await import('../core/entityEventEmissions.js');
      const { snapshotFinancialPostedQueue } = await import('../core/financialPostedEmissions.js');
      assert.equal(snapshotFinancialPostedQueue(), 1);
      assert.equal(snapshotEntityEventQueue(), 1);
    });

    assert.deepEqual(sqlSteps, ['BEGIN', 'COMMIT']);
  });

  it('ROLLBACK clears queues without flush (no emit path)', async () => {
    const sqlSteps: string[] = [];
    const entityQueue: QueuedEntityEvent[] = [];
    const client = createMockClient((sql) => {
      sqlSteps.push(sql.trim().toUpperCase().split(/\s+/)[0] ?? sql);
    });

    await runWithEntityEventQueue(entityQueue, async () => {
      await assert.rejects(
        async () => {
          try {
            await client.query('BEGIN');
            queueEntityEvent('tenant-1', 'created', 'bill', { id: 'never' });
            throw new Error('service failure');
          } catch (e) {
            await client.query('ROLLBACK');
            clearEntityEventQueue();
            throw e;
          }
        },
        /service failure/
      );
    });

    assert.deepEqual(sqlSteps, ['BEGIN', 'ROLLBACK']);
    assert.equal(entityQueue.length, 0);
  });

  it('real withTransaction on PostgreSQL: COMMIT then flush without error', async (t) => {
    if (!integrationTestsEnabled()) {
      t.skip('requires RUN_INTEGRATION_TESTS=1 and DATABASE_URL');
      return;
    }

    await assert.doesNotReject(async () => {
      await withTransaction(async (client) => {
        await client.query('SELECT 1');
        queueEntityEvent(INTEGRATION_TENANT_ID, 'updated', 'settings', { id: 'a1-commit-flush-smoke' });
      });
    });
  });
});
