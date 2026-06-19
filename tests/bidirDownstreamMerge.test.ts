/**
 * Regression tests for handleBidirDownstreamComplete merge strategy (AppContext).
 * Mirrors safeBase / cursorMatchesTenant logic from refreshFromApi full path.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { initialState } from '../context/appInitialState';
import { mergePartialStateIntoBaseline } from '../context/reducers/appStateMerge';
import { TransactionType, type AppState, type Transaction } from '../types';

function tx(id: string, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id,
    type: TransactionType.INCOME,
    amount: 5000,
    date: '2026-06-18',
    accountId: 'acc-1',
    ...overrides,
  };
}

function appStateWithTransactions(transactions: Transaction[]): AppState {
  return { ...initialState, transactions };
}

/** Same safeBase resolution as handleBidirDownstreamComplete / refreshFromApi full path. */
function resolveBidirSafeBase(
  mergeBaseline: AppState,
  currentTenantId: string | null,
  lastSync: string | null,
  syncTenant: string | null
): AppState {
  const cursorMatchesTenant = !lastSync || syncTenant === currentTenantId;
  return cursorMatchesTenant ? mergeBaseline : initialState;
}

/** Simulates post-await merge in handleBidirDownstreamComplete after loadStateForSyncRefresh. */
function mergeBidirDownstreamLoadedState(
  mergeBaseline: AppState,
  partial: Partial<AppState>,
  currentTenantId: string | null,
  lastSync: string | null,
  syncTenant: string | null
): AppState {
  const safeBase = resolveBidirSafeBase(mergeBaseline, currentTenantId, lastSync, syncTenant);
  return mergePartialStateIntoBaseline(safeBase, partial);
}

describe('bidir downstream merge (handleBidirDownstreamComplete)', () => {
  const paymentId = 'pay-bidir-regression';
  const otherId = 'tx-existing';

  it('preserves payment when client baseline has it and stale partial omits it (cursor matches tenant)', () => {
    const mergeBaseline = appStateWithTransactions([tx(paymentId, { version: 1 }), tx(otherId, { version: 1 })]);
    const stalePartial = { transactions: [tx(otherId, { version: 1 })] };

    const loadedState = mergeBidirDownstreamLoadedState(
      mergeBaseline,
      stalePartial,
      'tenant-a',
      '2026-06-18T12:00:00.000Z',
      'tenant-a'
    );

    assert.equal(loadedState.transactions.filter((t) => t.id === paymentId).length, 1);
    assert.equal(loadedState.transactions.filter((t) => t.id === otherId).length, 1);
  });

  it('documents unfixed initialState base would drop payment from stale partial', () => {
    const mergeBaseline = appStateWithTransactions([tx(paymentId, { version: 1 })]);
    const stalePartial = { transactions: [tx(otherId, { version: 1 })] };

    const unfixed = mergePartialStateIntoBaseline(initialState, stalePartial);
    assert.equal(unfixed.transactions.some((t) => t.id === paymentId), false);

    const fixed = mergeBidirDownstreamLoadedState(
      mergeBaseline,
      stalePartial,
      'tenant-a',
      null,
      null
    );
    assert.equal(fixed.transactions.some((t) => t.id === paymentId), true);
  });

  it('sync:bidir-downstream-complete path: event handler merge contract keeps payment visible', () => {
    // Step 1 — payment on client (post ADD_TRANSACTION + ack)
    const clientBaseline = appStateWithTransactions([tx(paymentId, { version: 1, description: 'acknowledged' })]);

    // Step 2 — stale partial from loadStateForSyncRefresh (no payment)
    const partialFromServer = {
      transactions: [tx(otherId, { version: 1 })],
      contacts: [{ id: 'c1', name: 'Contact', type: 'tenant' as const }],
    };

    // Step 3 — handler body after await (same tenant cursor)
    const loadedState = mergeBidirDownstreamLoadedState(
      clientBaseline,
      partialFromServer,
      'test-company',
      '2026-06-18T12:05:00.000Z',
      'test-company'
    );

    assert.ok(loadedState.contacts?.length);
    assert.equal(loadedState.transactions.filter((t) => t.id === paymentId).length, 1);
    assert.equal(loadedState.transactions.find((t) => t.id === paymentId)?.description, 'acknowledged');
  });

  it('tenant mismatch uses initialState and does not preserve prior-tenant client rows', () => {
    const priorTenantPayment = tx('pay-tenant-a', { version: 1 });
    const mergeBaseline = appStateWithTransactions([priorTenantPayment]);
    const partial = { transactions: [tx(otherId, { version: 1 })] };

    const loadedState = mergeBidirDownstreamLoadedState(
      mergeBaseline,
      partial,
      'tenant-b',
      '2026-06-18T12:00:00.000Z',
      'tenant-a'
    );

    assert.equal(loadedState.transactions.some((t) => t.id === 'pay-tenant-a'), false);
    assert.equal(loadedState.transactions.some((t) => t.id === otherId), true);
  });

  it('no lastSync uses mergeBaseline even when syncTenant differs (cursorMatchesTenant true)', () => {
    const payment = tx(paymentId, { version: 1 });
    const mergeBaseline = appStateWithTransactions([payment]);
    const partial = { transactions: [] as Transaction[] };

    const loadedState = mergeBidirDownstreamLoadedState(mergeBaseline, partial, 'tenant-b', null, 'tenant-a');

    assert.equal(loadedState.transactions.filter((t) => t.id === paymentId).length, 1);
  });
});
