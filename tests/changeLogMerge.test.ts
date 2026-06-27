import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyChangeLogToMergedState, type ChangeLogEntry } from '../services/api/changeLogMerge';
import { TransactionType, type AppState, type Transaction } from '../types';

function fullTx(id: string, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id,
    type: TransactionType.INCOME,
    amount: 5000,
    date: '2026-06-27',
    accountId: 'acc-1',
    invoiceId: 'inv-1',
    categoryId: 'cat-rental',
    contactId: 'contact-1',
    version: 1,
    ...overrides,
  };
}

/** Mirrors the partial payload backend writes to change_log for a transaction create. */
function partialTxChangeLog(id: string, version: number): ChangeLogEntry {
  return {
    id: `cl-${id}`,
    entityType: 'transaction',
    entityId: id,
    action: 'create',
    version,
    changedAt: '2026-06-27T13:00:00.000Z',
    payload: {
      id,
      type: 'Income',
      amount: 5000,
      date: '2026-06-27',
      accountId: 'acc-1',
      approvalStatus: 'Approved',
    },
  };
}

describe('applyChangeLogToMergedState — partial transaction payload', () => {
  it('preserves invoiceId when a partial change_log payload overlays the full entity row', () => {
    const merged: Partial<AppState> = { transactions: [fullTx('tx-1', { version: 1 })] };
    applyChangeLogToMergedState(merged, [partialTxChangeLog('tx-1', 1)]);

    const tx = merged.transactions!.find((t) => t.id === 'tx-1')!;
    assert.equal(tx.invoiceId, 'inv-1', 'invoiceId must survive the change_log merge');
    assert.equal(tx.categoryId, 'cat-rental');
    assert.equal(tx.contactId, 'contact-1');
    assert.equal(tx.amount, 5000);
  });

  it('keeps the payment visible in an invoice payment-history filter after merge', () => {
    const merged: Partial<AppState> = { transactions: [fullTx('pay-1', { version: 1 })] };
    applyChangeLogToMergedState(merged, [partialTxChangeLog('pay-1', 1)]);

    const invoicePayments = merged.transactions!.filter((t) => t.invoiceId === 'inv-1');
    assert.equal(invoicePayments.length, 1);
  });

  it('still applies partial payload when no existing row is present', () => {
    const merged: Partial<AppState> = { transactions: [] };
    applyChangeLogToMergedState(merged, [partialTxChangeLog('tx-new', 1)]);
    assert.equal(merged.transactions!.length, 1);
    assert.equal(merged.transactions![0].id, 'tx-new');
  });

  it('honors delete actions', () => {
    const merged: Partial<AppState> = { transactions: [fullTx('tx-del', { version: 1 })] };
    applyChangeLogToMergedState(merged, [
      { id: 'cl-del', entityType: 'transaction', entityId: 'tx-del', action: 'delete', version: 2, changedAt: '2026-06-27T13:01:00.000Z' },
    ]);
    assert.equal(merged.transactions!.length, 0);
  });

  it('skips stale change_log entries (older version than baseline)', () => {
    const merged: Partial<AppState> = { transactions: [fullTx('tx-1', { version: 5, amount: 9999 })] };
    applyChangeLogToMergedState(merged, [partialTxChangeLog('tx-1', 2)]);
    const tx = merged.transactions!.find((t) => t.id === 'tx-1')!;
    assert.equal(tx.amount, 9999, 'stale change_log must not overwrite newer baseline');
    assert.equal(tx.invoiceId, 'inv-1');
  });
});
