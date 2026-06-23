import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDIT_CACHE_TTL_MS,
  getPayrollAuditCacheStore,
  loadPayrollAuditEvents,
  readPayrollAuditCache,
  resetPayrollAuditCacheStoreForTests,
  _setPayrollAuditFetchForTests,
  type PayrollAuditEvent,
} from '../components/payroll/services/payrollAuditCache';

const sampleEvent: PayrollAuditEvent = {
  id: 'evt-1',
  created_at: '2026-01-01T00:00:00.000Z',
  user_id: 'user-1',
  module: 'payroll',
  entity_type: 'payroll_run',
  entity_id: 'run-1',
  action: 'payroll.run.approved',
  audit_action: 'payroll.run.approved',
  summary: 'Approved',
};

describe('PayrollAuditCache (PAYROLL-PERF-03A)', () => {
  beforeEach(() => {
    resetPayrollAuditCacheStoreForTests();
    _setPayrollAuditFetchForTests(null);
  });

  afterEach(() => {
    _setPayrollAuditFetchForTests(null);
  });

  it('loadEvents returns cached data without fetch when fresh', async () => {
    let fetches = 0;
    _setPayrollAuditFetchForTests(async () => {
      fetches += 1;
      return [sampleEvent];
    });

    const store = getPayrollAuditCacheStore();
    store.writeCache('tenant-a', [sampleEvent]);

    const events = await loadPayrollAuditEvents('tenant-a');
    assert.equal(fetches, 0);
    assert.equal(events.length, 1);
    assert.equal(store.getMetrics().auditCacheHits, 1);
  });

  it('loadEvents fetches on cache miss', async () => {
    let fetches = 0;
    _setPayrollAuditFetchForTests(async () => {
      fetches += 1;
      return [sampleEvent];
    });

    const store = getPayrollAuditCacheStore();
    const events = await loadPayrollAuditEvents('tenant-a');

    assert.equal(fetches, 1);
    assert.equal(events.length, 1);
    assert.equal(store.getMetrics().auditCacheMisses, 1);

    const cached = readPayrollAuditCache('tenant-a');
    assert.ok(cached);
    assert.equal(cached!.events.length, 1);
  });

  it('loadEvents refreshes stale cache in background path', async () => {
    let fetches = 0;
    _setPayrollAuditFetchForTests(async () => {
      fetches += 1;
      return [sampleEvent];
    });

    const store = getPayrollAuditCacheStore();
    store.writeCache('tenant-a', []);
    store['lastLoadedAtByTenant'].set('tenant-a', Date.now() - AUDIT_CACHE_TTL_MS - 1000);

    const events = await loadPayrollAuditEvents('tenant-a', { background: true });

    assert.equal(fetches, 1);
    assert.equal(events.length, 1);
    assert.equal(store.getMetrics().auditCacheStale, 1);
    assert.equal(store.getMetrics().auditBackgroundRefreshes, 1);
  });

  it('loadEvents dedupes concurrent fetches per tenant', async () => {
    let fetches = 0;
    _setPayrollAuditFetchForTests(async () => {
      fetches += 1;
      await new Promise((r) => setTimeout(r, 20));
      return [sampleEvent];
    });

    const p1 = loadPayrollAuditEvents('tenant-a');
    const p2 = loadPayrollAuditEvents('tenant-a');

    await Promise.all([p1, p2]);
    assert.equal(fetches, 1);
  });

  it('filterEvents applies action filter client-side', () => {
    const store = getPayrollAuditCacheStore();
    const filtered = store.filterEvents(
      [
        sampleEvent,
        { ...sampleEvent, id: 'evt-2', audit_action: 'payroll.payslip.paid', action: 'payroll.payslip.paid' },
      ],
      'payroll.payslip.paid'
    );
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].id, 'evt-2');
  });
});
