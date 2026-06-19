import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AppState } from '../types';
import { applyChangeLogToMergedState, type ChangeLogEntry } from '../services/api/changeLogMerge';

/**
 * Regression: change_log payloads for transactions are partial summaries (no invoiceId/billId).
 * They must NOT clobber the full row already present from the entities feed, otherwise an invoice/
 * bill payment loses its invoiceId/billId and disappears from the screen until logout/login.
 */
describe('applyChangeLogToMergedState', () => {
  it('shallow-merges a partial change_log payload onto the full entities-feed row (keeps invoiceId)', () => {
    const merged: Partial<AppState> = {
      transactions: [
        {
          id: 'pay-1',
          type: 'Income',
          amount: 3333,
          date: '2026-06-19',
          accountId: 'acc-cash',
          invoiceId: 'inv-1',
          version: 1,
        },
      ] as AppState['transactions'],
    };

    const entries: ChangeLogEntry[] = [
      {
        id: 'cl-1',
        entityType: 'transaction',
        entityId: 'pay-1',
        action: 'create',
        version: 1,
        changedAt: '2026-06-19T00:00:00.000Z',
        // Partial summary stored by recordDomainMutation — no invoiceId.
        payload: { id: 'pay-1', type: 'Income', amount: 3333, date: '2026-06-19', accountId: 'acc-cash' },
      },
    ];

    applyChangeLogToMergedState(merged, entries);

    const row = (merged.transactions as Array<Record<string, unknown>>).find((t) => t.id === 'pay-1');
    assert.ok(row, 'transaction should still be present');
    assert.equal(row.invoiceId, 'inv-1', 'invoiceId must be preserved from the full row');
    assert.equal(row.amount, 3333);
  });

  it('keeps billId for a bill payment when change_log payload omits it', () => {
    const merged: Partial<AppState> = {
      transactions: [
        { id: 'bp-1', type: 'Expense', amount: 500, date: '2026-06-19', accountId: 'acc-cash', billId: 'bill-9', version: 2 },
      ] as AppState['transactions'],
    };

    applyChangeLogToMergedState(merged, [
      {
        id: 'cl-2',
        entityType: 'transaction',
        entityId: 'bp-1',
        action: 'create',
        version: 2,
        changedAt: '2026-06-19T00:00:00.000Z',
        payload: { id: 'bp-1', type: 'Expense', amount: 500, date: '2026-06-19', accountId: 'acc-cash' },
      },
    ]);

    const row = (merged.transactions as Array<Record<string, unknown>>).find((t) => t.id === 'bp-1');
    assert.ok(row);
    assert.equal(row.billId, 'bill-9', 'billId must be preserved');
  });

  it('still applies deletes', () => {
    const merged: Partial<AppState> = {
      transactions: [{ id: 'del-1', type: 'Income', amount: 1, date: '2026-06-19', accountId: 'a' }] as AppState['transactions'],
    };
    applyChangeLogToMergedState(merged, [
      { id: 'cl-3', entityType: 'transaction', entityId: 'del-1', action: 'delete', version: 3, changedAt: '2026-06-19T00:00:00.000Z' },
    ]);
    assert.equal((merged.transactions as unknown[]).length, 0);
  });

  it('skips a stale change_log entry (lower version than baseline)', () => {
    const merged: Partial<AppState> = {
      transactions: [
        { id: 'v-1', type: 'Income', amount: 999, date: '2026-06-19', accountId: 'a', invoiceId: 'inv-x', version: 5 },
      ] as AppState['transactions'],
    };
    applyChangeLogToMergedState(merged, [
      {
        id: 'cl-4',
        entityType: 'transaction',
        entityId: 'v-1',
        action: 'update',
        version: 3,
        changedAt: '2026-06-19T00:00:00.000Z',
        payload: { id: 'v-1', type: 'Income', amount: 111, accountId: 'a' },
      },
    ]);
    const row = (merged.transactions as Array<Record<string, unknown>>).find((t) => t.id === 'v-1');
    assert.equal(row?.amount, 999, 'stale lower-version payload must be ignored');
    assert.equal(row?.invoiceId, 'inv-x');
  });
});
