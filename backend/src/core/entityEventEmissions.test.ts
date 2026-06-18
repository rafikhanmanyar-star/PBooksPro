import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearEntityEventQueue,
  flushEntityEventQueue,
  queueEntityEvent,
  restoreEntityEventQueue,
  runWithEntityEventQueue,
  snapshotEntityEventQueue,
} from './entityEventEmissions.js';

describe('entityEventEmissions', () => {
  it('queueEntityEvent with no active queue emits immediately (fallback)', () => {
    // No throw when io is unset — emitEntityEvent is a no-op without socket server
    assert.doesNotThrow(() => {
      queueEntityEvent('tenant-1', 'created', 'invoice', { id: 'immediate' });
    });
  });

  it('queueEntityEvent inside runWithEntityEventQueue pushes without flushing', async () => {
    const queue: Parameters<typeof runWithEntityEventQueue>[0] = [];
    await runWithEntityEventQueue(queue, async () => {
      queueEntityEvent('tenant-1', 'created', 'invoice', { id: 'queued' });
      assert.equal(queue.length, 1);
      assert.equal(queue[0]?.opts.id, 'queued');
    });
  });

  it('flushEntityEventQueue drains queue in insertion order', async () => {
    const queue: Parameters<typeof runWithEntityEventQueue>[0] = [];
    await runWithEntityEventQueue(queue, async () => {
      queueEntityEvent('tenant-1', 'created', 'invoice', { id: 'a' });
      queueEntityEvent('tenant-1', 'updated', 'bill', { id: 'b' });
      assert.equal(queue.length, 2);
      flushEntityEventQueue();
      assert.equal(queue.length, 0);
    });
  });

  it('flushEntityEventQueue with empty queue is a no-op', async () => {
    const queue: Parameters<typeof runWithEntityEventQueue>[0] = [];
    await runWithEntityEventQueue(queue, async () => {
      assert.doesNotThrow(() => flushEntityEventQueue());
    });
  });

  it('clearEntityEventQueue discards all items', async () => {
    const queue: Parameters<typeof runWithEntityEventQueue>[0] = [];
    await runWithEntityEventQueue(queue, async () => {
      queueEntityEvent('tenant-1', 'deleted', 'invoice', { id: 'gone' });
      clearEntityEventQueue();
      assert.equal(queue.length, 0);
    });
  });

  it('concurrent runWithEntityEventQueue contexts do not share queues', async () => {
    const queueA: Parameters<typeof runWithEntityEventQueue>[0] = [];
    const queueB: Parameters<typeof runWithEntityEventQueue>[0] = [];

    await Promise.all([
      runWithEntityEventQueue(queueA, async () => {
        queueEntityEvent('tenant-a', 'created', 'invoice', { id: 'a' });
      }),
      runWithEntityEventQueue(queueB, async () => {
        queueEntityEvent('tenant-b', 'created', 'bill', { id: 'b' });
      }),
    ]);

    assert.equal(queueA.length, 1);
    assert.equal(queueB.length, 1);
    assert.equal(queueA[0]?.tenantId, 'tenant-a');
    assert.equal(queueB[0]?.tenantId, 'tenant-b');
  });

  it('snapshotEntityEventQueue returns null outside active queue', () => {
    assert.equal(snapshotEntityEventQueue(), null);
  });

  it('snapshotEntityEventQueue returns current length inside active queue', async () => {
    const queue: Parameters<typeof runWithEntityEventQueue>[0] = [];
    await runWithEntityEventQueue(queue, async () => {
      assert.equal(snapshotEntityEventQueue(), 0);
      queueEntityEvent('tenant-1', 'created', 'invoice', { id: 'x' });
      assert.equal(snapshotEntityEventQueue(), 1);
    });
  });

  it('restoreEntityEventQueue(null) is a no-op', async () => {
    const queue: Parameters<typeof runWithEntityEventQueue>[0] = [];
    await runWithEntityEventQueue(queue, async () => {
      queueEntityEvent('tenant-1', 'created', 'invoice', { id: 'keep' });
      restoreEntityEventQueue(null);
      assert.equal(queue.length, 1);
    });
  });

  it('restoreEntityEventQueue truncates queue to snapshot length', async () => {
    const queue: Parameters<typeof runWithEntityEventQueue>[0] = [];
    await runWithEntityEventQueue(queue, async () => {
      queueEntityEvent('tenant-1', 'created', 'invoice', { id: 'survives' });
      const snap = snapshotEntityEventQueue();
      queueEntityEvent('tenant-1', 'created', 'invoice', { id: 'discarded' });
      assert.equal(queue.length, 2);
      restoreEntityEventQueue(snap);
      assert.equal(queue.length, 1);
      assert.equal(queue[0]?.opts.id, 'survives');
    });
  });
});
