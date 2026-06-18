import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { initialState } from '../context/appInitialState';
import {
  mergeBillsWithServerBaseline,
  mergeInvoicesWithServerBaseline,
  mergePartialStateIntoBaseline,
  mergeTransactionsWithServerBaseline,
} from '../context/reducers/appStateMerge';
import { InvoiceStatus, InvoiceType, TransactionType, type AppState, type Bill, type Invoice, type Transaction } from '../types';

function tx(id: string, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id,
    type: TransactionType.INCOME,
    amount: 100,
    date: '2026-06-18',
    accountId: 'acc-1',
    ...overrides,
  };
}

function appStateWithTransactions(transactions: Transaction[]): AppState {
  return { ...initialState, transactions };
}

describe('mergeTransactionsWithServerBaseline', () => {
  it('1: keeps optimistic tx (no version) missing from server', () => {
    const optimistic = tx('opt-1');
    const merged = mergeTransactionsWithServerBaseline([optimistic], [tx('srv-1')]);
    assert.deepEqual(
      merged.map((t) => t.id).sort(),
      ['opt-1', 'srv-1']
    );
  });

  it('2: keeps optimistic tx (version 0) missing from server', () => {
    const optimistic = tx('opt-0', { version: 0 });
    const merged = mergeTransactionsWithServerBaseline([optimistic], []);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].id, 'opt-0');
  });

  it('3: keeps versioned tx missing from stale server partial', () => {
    const payment = tx('pay-stale', { version: 1, amount: 5000 });
    const merged = mergeTransactionsWithServerBaseline([payment], [tx('other')]);
    assert.equal(merged.filter((t) => t.id === 'pay-stale').length, 1);
  });

  it('4: server row wins on same id', () => {
    const baseline = tx('same', { amount: 100, description: 'client' });
    const server = tx('same', { amount: 200, description: 'server', version: 2 });
    const merged = mergeTransactionsWithServerBaseline([baseline], [server]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].amount, 200);
    assert.equal(merged[0].description, 'server');
  });

  it('5: includes server-only tx', () => {
    const merged = mergeTransactionsWithServerBaseline([], [tx('srv-only', { version: 1 })]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].id, 'srv-only');
  });

  it('9: empty baseline and empty server', () => {
    assert.deepEqual(mergeTransactionsWithServerBaseline([], []), []);
  });
});

describe('mergePartialStateIntoBaseline', () => {
  it('6: retains optimistic tx when partial overwrites transactions array', () => {
    const optimistic = tx('opt-partial', { version: undefined });
    const base = appStateWithTransactions([optimistic, tx('keep-me', { version: 1 })]);
    const merged = mergePartialStateIntoBaseline(base, {
      transactions: [tx('from-server', { version: 1 })],
    });
    assert.ok(merged.transactions.some((t) => t.id === 'opt-partial'));
    assert.ok(merged.transactions.some((t) => t.id === 'from-server'));
    assert.ok(merged.transactions.some((t) => t.id === 'keep-me'));
  });

  it('7: invoice merge unchanged — drops versioned invoice missing from server', () => {
    const inv: Invoice = {
      id: 'inv-del',
      invoiceNumber: 'INV-1',
      amount: 1000,
      paidAmount: 0,
      status: InvoiceStatus.UNPAID,
      issueDate: '2026-06-01',
      dueDate: '2026-06-30',
      invoiceType: InvoiceType.RENTAL,
      version: 2,
    };
    const merged = mergeInvoicesWithServerBaseline([inv], []);
    assert.equal(merged.length, 0);
  });

  it('8: bill merge unchanged — drops versioned bill missing from server', () => {
    const bill: Bill = {
      id: 'bill-del',
      billNumber: 'BILL-1',
      amount: 500,
      paidAmount: 0,
      status: InvoiceStatus.UNPAID,
      issueDate: '2026-06-01',
      dueDate: '2026-06-30',
      version: 2,
    };
    const merged = mergeBillsWithServerBaseline([bill], []);
    assert.equal(merged.length, 0);
  });

  it('11: socket payment survives stale full refresh, then server catch-up without duplicates', () => {
    const paymentId = 'pay-case-11';
    const otherId = 'tx-other';

    // User A: realtime ADD_TRANSACTION(version=1) applied to client state
    const socketPayment = tx(paymentId, { version: 1, amount: 5000, description: 'socket' });
    const clientState = appStateWithTransactions([socketPayment]);

    // Full refresh: stale partial without payment
    const afterStaleRefresh = mergePartialStateIntoBaseline(clientState, {
      transactions: [tx(otherId, { version: 1 })],
    });
    assert.equal(afterStaleRefresh.transactions.filter((t) => t.id === paymentId).length, 1);
    assert.equal(afterStaleRefresh.transactions.find((t) => t.id === paymentId)?.description, 'socket');

    // Later refresh: server now includes the payment
    const serverPayment = tx(paymentId, { version: 1, amount: 5000, description: 'from server' });
    const afterCatchUp = mergePartialStateIntoBaseline(afterStaleRefresh, {
      transactions: [serverPayment, tx(otherId, { version: 1 })],
    });

    const payments = afterCatchUp.transactions.filter((t) => t.id === paymentId);
    assert.equal(payments.length, 1);
    assert.equal(payments[0].description, 'from server');
    assert.equal(afterCatchUp.transactions.filter((t) => t.id === otherId).length, 1);
  });

  it('production regression: payment race — create, ack, realtime, stale refresh, server catch-up (steps 1–7)', () => {
    const paymentId = 'pay-prod-regression';
    const otherId = 'tx-existing';

    // Step 1 — payment created (optimistic ADD_TRANSACTION, no server version yet)
    let transactions: Transaction[] = [
      tx(otherId, { version: 1 }),
      tx(paymentId, { amount: 5000, description: 'optimistic' }),
    ];
    assert.equal(transactions.find((t) => t.id === paymentId)?.version, undefined);

    // Step 2 — payment acknowledged (HTTP 201 → UPDATE_TRANSACTION version >= 1)
    transactions = transactions.map((t) =>
      t.id === paymentId ? { ...t, version: 1, description: 'acknowledged' } : t
    );
    assert.ok((transactions.find((t) => t.id === paymentId)?.version ?? 0) >= 1);

    // Step 3 — realtime entity_created → ADD_TRANSACTION (User B / socket path)
    const socketRow = tx(paymentId, { version: 1, amount: 5000, description: 'socket' });
    const socketExists = transactions.some((t) => t.id === paymentId);
    transactions = socketExists
      ? transactions.map((t) => (t.id === paymentId ? socketRow : t))
      : [...transactions, socketRow];
    let clientState = appStateWithTransactions(transactions);
    assert.equal(clientState.transactions.filter((t) => t.id === paymentId).length, 1);

    // Step 4 — concurrent full refresh: stale partial (bulk load started before DB commit)
    const stalePartial = { transactions: [tx(otherId, { version: 1 })] };

    // Step 5 — payment must remain visible after SET_STATE merge
    const afterStaleRefresh = mergePartialStateIntoBaseline(clientState, stalePartial);
    assert.equal(afterStaleRefresh.transactions.filter((t) => t.id === paymentId).length, 1);
    assert.equal(afterStaleRefresh.transactions.find((t) => t.id === paymentId)?.description, 'socket');

    // Step 6 — later refresh returns payment from server
    const serverPayment = tx(paymentId, {
      version: 1,
      amount: 5000,
      description: 'from server',
    });
    const afterCatchUp = mergePartialStateIntoBaseline(afterStaleRefresh, {
      transactions: [serverPayment, tx(otherId, { version: 1 })],
    });

    // Step 7 — exactly one payment row; server authoritative fields win
    const payments = afterCatchUp.transactions.filter((t) => t.id === paymentId);
    assert.equal(payments.length, 1);
    assert.equal(payments[0].description, 'from server');
    assert.equal(new Set(afterCatchUp.transactions.map((t) => t.id)).size, afterCatchUp.transactions.length);
  });
});
