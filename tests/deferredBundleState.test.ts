import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCanonicalBulkEntitiesEndpoint,
  normalizeEntityBundle,
  resolveDeferredMissingEntities,
  markDeferredBundleLoadSuccess,
  isDeferredSliceLoaded,
  isDeferredBundleSessionLoaded,
  resetDeferredBundleStateForTests,
  getDeferredBundleMetrics,
} from '../services/api/deferredBundleState';

describe('deferredBundleState (PERF-P3.2)', () => {
  beforeEach(() => {
    resetDeferredBundleStateForTests();
  });

  it('normalizeEntityBundle sorts entity order for stable keys', () => {
    assert.equal(normalizeEntityBundle('vendors,bills'), 'bills,vendors');
    assert.equal(normalizeEntityBundle('bills,vendors'), 'bills,vendors');
    assert.equal(normalizeEntityBundle('invoices,bills'), 'bills,invoices');
  });

  it('buildCanonicalBulkEntitiesEndpoint uses sorted entities in query', () => {
    const a = buildCanonicalBulkEntitiesEndpoint('vendors,bills');
    const b = buildCanonicalBulkEntitiesEndpoint('bills,vendors');
    assert.equal(a, b);
    assert.equal(a, '/state/bulk?entities=bills%2Cvendors');
    assert.equal(getDeferredBundleMetrics().canonicalizedBundleRequests, 1);
  });

  it('resolveDeferredMissingEntities suppresses reload for loaded empty slices', () => {
    markDeferredBundleLoadSuccess(['vendors'], 'vendors');
    assert.equal(isDeferredSliceLoaded('vendors'), true);

    const missing = resolveDeferredMissingEntities(['vendors'], { vendors: 0 } as any);
    assert.deepEqual(missing, []);
    assert.equal(getDeferredBundleMetrics().emptySliceSuppressions, 1);
  });

  it('resolveDeferredMissingEntities treats non-empty slices as hydrated', () => {
    const missing = resolveDeferredMissingEntities(['vendors', 'bills'], {
      vendors: 3,
      bills: 0,
    } as any);
    assert.deepEqual(missing, ['bills']);
    assert.equal(isDeferredSliceLoaded('vendors'), true);
  });

  it('markDeferredBundleLoadSuccess enables session bundle cache hit', () => {
    markDeferredBundleLoadSuccess(['bills', 'vendors'], 'bills,vendors');
    assert.equal(isDeferredBundleSessionLoaded('bills,vendors'), true);
    assert.equal(isDeferredBundleSessionLoaded('vendors,bills'), false);
    assert.equal(normalizeEntityBundle('vendors,bills'), 'bills,vendors');
    assert.equal(isDeferredBundleSessionLoaded(normalizeEntityBundle('vendors,bills')), true);
  });
});
