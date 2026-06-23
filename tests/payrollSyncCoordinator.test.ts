import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getPayrollSyncCoordinator,
  resetPayrollSyncCoordinatorForTests,
  requestPayrollSync,
  PAYROLL_SYNC_FRESH_MS,
  _setPayrollSyncCoreForTests,
} from '../components/payroll/services/payrollSyncCoordinator';

describe('PayrollSyncCoordinator (PAYROLL-PERF-02)', () => {
  beforeEach(() => {
    resetPayrollSyncCoordinatorForTests();
    _setPayrollSyncCoreForTests(null);
  });

  afterEach(() => {
    _setPayrollSyncCoreForTests(null);
  });

  it('requestSync attaches concurrent callers to one in-flight promise', async () => {
    let runs = 0;
    _setPayrollSyncCoreForTests(async () => {
      runs += 1;
      await new Promise((r) => setTimeout(r, 25));
    });

    const coord = getPayrollSyncCoordinator();
    const p1 = requestPayrollSync('tenant-a', { source: 'test-a' });
    const p2 = requestPayrollSync('tenant-a', { source: 'test-b' });

    await Promise.all([p1, p2]);
    assert.equal(runs, 1);
    assert.equal(coord.getMetrics().deduplicatedSyncs, 1);
    assert.equal(coord.getMetrics().activeSyncs, 0);
    assert.ok(coord.getMetrics().syncDuration >= 20);
  });

  it('skipIfFresh skips sync when lastSyncedAt is recent', async () => {
    let runs = 0;
    _setPayrollSyncCoreForTests(async () => {
      runs += 1;
    });

    const coord = getPayrollSyncCoordinator();
    coord['lastSyncedAtByTenant'].set('tenant-fresh', Date.now());

    await requestPayrollSync('tenant-fresh', { skipIfFresh: true, source: 'test-fresh' });

    assert.equal(runs, 0);
    assert.equal(coord.getMetrics().cacheHits, 1);
    assert.equal(coord.getMetrics().activeSyncs, 0);
  });

  it('skipIfFresh runs sync when cache is stale', async () => {
    let runs = 0;
    _setPayrollSyncCoreForTests(async () => {
      runs += 1;
    });

    const coord = getPayrollSyncCoordinator();
    coord['lastSyncedAtByTenant'].set('tenant-stale', Date.now() - PAYROLL_SYNC_FRESH_MS - 1000);

    await requestPayrollSync('tenant-stale', { skipIfFresh: true, source: 'test-stale' });

    assert.equal(runs, 1);
    assert.equal(coord.getMetrics().cacheMisses, 1);
    assert.equal(coord.getMetrics().cacheHits, 0);
  });

  it('force bypasses freshness skip', async () => {
    let runs = 0;
    _setPayrollSyncCoreForTests(async () => {
      runs += 1;
    });

    const coord = getPayrollSyncCoordinator();
    coord['lastSyncedAtByTenant'].set('tenant-force', Date.now());

    await requestPayrollSync('tenant-force', { skipIfFresh: true, force: true, source: 'test-force' });

    assert.equal(runs, 1);
    assert.equal(coord.getMetrics().cacheHits, 0);
  });

  it('isFresh returns false when never synced', () => {
    const coord = getPayrollSyncCoordinator();
    assert.equal(coord.isFresh('never-synced'), false);
  });
});
