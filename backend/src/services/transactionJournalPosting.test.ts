import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildJournalLinesFromTransaction,
  shouldSkipTransactionJournalMirror,
} from './transactionJournalPostingService.js';
import type { TransactionRow } from './transactionsService.js';

function baseRow(overrides: Partial<TransactionRow>): TransactionRow {
  return {
    id: 'tx_1',
    tenant_id: 'default',
    user_id: null,
    type: 'Income',
    subtype: null,
    amount: '100',
    date: new Date('2026-01-15'),
    description: null,
    reference: null,
    account_id: 'acc-cash',
    from_account_id: null,
    to_account_id: null,
    category_id: null,
    contact_id: null,
    vendor_id: null,
    project_id: 'proj-1',
    building_id: null,
    property_id: null,
    unit_id: null,
    invoice_id: null,
    bill_id: null,
    payslip_id: null,
    contract_id: null,
    agreement_id: null,
    batch_id: null,
    project_asset_id: null,
    owner_id: null,
    is_system: false,
    version: 1,
    deleted_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe('transactionJournalPostingService', () => {
  it('skips vendor settlement and investor mirror rows', () => {
    assert.equal(
      shouldSkipTransactionJournalMirror(
        baseRow({ reference: 'VSET:je-123', id: 'tx_v' })
      ),
      true
    );
    assert.equal(shouldSkipTransactionJournalMirror(baseRow({ id: 'invj_tx_abc' })), true);
  });

  it('builds income lines with income summary credit when no invoice linked', () => {
    const lines = buildJournalLinesFromTransaction(baseRow({ type: 'Income', amount: '100' }));
    assert.ok(lines);
    assert.equal(lines![1].accountId, 'sys-acc-income-summary');
  });

  it('builds income lines with AR credit when invoice linked', () => {
    const lines = buildJournalLinesFromTransaction(
      baseRow({ type: 'Income', invoice_id: 'inv-1', amount: '250.5' })
    );
    assert.ok(lines);
    assert.equal(lines!.length, 2);
    assert.equal(lines![0].accountId, 'acc-cash');
    assert.equal(lines![0].debitAmount, 250.5);
    assert.equal(lines![1].accountId, 'sys-acc-ar');
    assert.equal(lines![1].creditAmount, 250.5);
  });

  it('builds expense lines with AP debit when bill linked', () => {
    const lines = buildJournalLinesFromTransaction(
      baseRow({ type: 'Expense', bill_id: 'bill-1', amount: '80' })
    );
    assert.ok(lines);
    assert.equal(lines![0].accountId, 'sys-acc-ap');
    assert.equal(lines![1].accountId, 'acc-cash');
  });

  it('builds transfer lines from from/to accounts', () => {
    const lines = buildJournalLinesFromTransaction(
      baseRow({
        type: 'Transfer',
        account_id: 'acc-cash',
        from_account_id: 'acc-a',
        to_account_id: 'acc-b',
        amount: '50',
      })
    );
    assert.ok(lines);
    assert.equal(lines![0].accountId, 'acc-b');
    assert.equal(lines![1].accountId, 'acc-a');
  });

  it('propagates project_id and building_id to all journal lines', () => {
    const lines = buildJournalLinesFromTransaction(
      baseRow({
        type: 'Income',
        amount: '100',
        project_id: 'proj-a',
        building_id: 'bld-a',
      })
    );
    assert.ok(lines);
    for (const line of lines!) {
      assert.equal(line.projectId, 'proj-a');
      assert.equal(line.buildingId, 'bld-a');
    }
  });
});
