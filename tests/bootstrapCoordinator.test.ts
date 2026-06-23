import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getBootstrapCoordinator,
  resetBootstrapCoordinatorForTests,
} from '../services/api/bootstrapCoordinator';

describe('BootstrapCoordinator (PERF-P3)', () => {
  beforeEach(() => {
    resetBootstrapCoordinatorForTests();
  });

  it('runPrimaryBootstrap attaches concurrent callers to one promise', async () => {
    const coord = getBootstrapCoordinator();
    let runs = 0;
    const fn = async () => {
      runs += 1;
      await new Promise((r) => setTimeout(r, 20));
      return { ok: true };
    };

    const p1 = coord.runPrimaryBootstrap('tenant-a', 'init', fn);
    const p2 = coord.runPrimaryBootstrap('tenant-a', 'refresh', fn);

    assert.equal(p1, p2);
    await p1;
    assert.equal(runs, 1);
    assert.equal(coord.getHealth(), 'healthy');
  });

  it('dedupeBulkRequest returns same promise for identical tenant+endpoint', async () => {
    const coord = getBootstrapCoordinator();
    let calls = 0;
    const fn = async () => {
      calls += 1;
      return 'payload';
    };

    const p1 = coord.dedupeBulkRequest('tenant-a', '/state/bulk?entities=contacts', fn);
    const p2 = coord.dedupeBulkRequest('tenant-a', '/state/bulk?entities=contacts', fn);

    assert.equal(p1, p2);
    await p1;
    assert.equal(calls, 1);
    assert.equal(coord.getMetrics().deduplicatedBulkRequests, 1);
  });

  it('withCoalescedBulkRetry coalesces parallel retry trees', async () => {
    const coord = getBootstrapCoordinator();
    let runs = 0;
    const fn = async () => {
      runs += 1;
      await new Promise((r) => setTimeout(r, 10));
      return 42;
    };

    const p1 = coord.withCoalescedBulkRetry('tenant-a', 'loadStateBulk', fn);
    const p2 = coord.withCoalescedBulkRetry('tenant-a', 'loadStateBulk', fn);

    assert.equal(p1, p2);
    await p1;
    assert.equal(runs, 1);
    assert.equal(coord.getMetrics().coalescedRetries, 1);
  });

  it('awaitDeferredBootstrapGate waits while primary bootstrap is running', async () => {
    const coord = getBootstrapCoordinator();
    let primaryDone = false;

    const primary = coord.runPrimaryBootstrap('tenant-a', 'init', async () => {
      await new Promise((r) => setTimeout(r, 30));
      primaryDone = true;
      return {};
    });

    const gate = coord.awaitDeferredBootstrapGate();
    assert.equal(coord.getMetrics().suppressedDeferredBootstraps, 1);
    await primary;
    await gate;
    assert.equal(primaryDone, true);
  });

  it('enterSoftFailure increments overlayRecoveryEvents', () => {
    const coord = getBootstrapCoordinator();
    coord.enterSoftFailure(new Error('POOL_SATURATED'));
    assert.equal(coord.isSoftFailure(), true);
    assert.equal(coord.getMetrics().overlayRecoveryEvents, 1);
  });
});
