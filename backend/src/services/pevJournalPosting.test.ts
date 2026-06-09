import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildJournalLinesFromPeV,
  shouldSkipPeVJournalMirror,
} from './pevJournalPostingService.js';
import type { ProjectExpenseVoucherRow } from './projectExpenseVoucherService.js';

function baseRow(overrides: Partial<ProjectExpenseVoucherRow>): ProjectExpenseVoucherRow {
  return {
    id: 'pev_1',
    tenant_id: 'default',
    voucher_number: 'PEV-2026-0001',
    voucher_date: new Date('2026-03-01'),
    project_id: 'proj-1',
    expense_category_id: 'pec-1',
    vendor_id: null,
    payment_source_account_id: 'acc-cash',
    amount: '150',
    description: 'Site tea',
    document_id: null,
    status: 'posted',
    journal_entry_id: null,
    submitted_at: null,
    submitted_by: null,
    approved_at: null,
    approved_by: null,
    rejected_at: null,
    rejected_by: null,
    rejection_reason: null,
    posted_at: null,
    posted_by: null,
    created_by: null,
    version: 1,
    deleted_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe('pevJournalPostingService', () => {
  it('skips non-posted and deleted vouchers', () => {
    assert.equal(shouldSkipPeVJournalMirror(baseRow({ status: 'draft' })), true);
    assert.equal(shouldSkipPeVJournalMirror(baseRow({ status: 'approved' })), true);
    assert.equal(shouldSkipPeVJournalMirror(baseRow({ deleted_at: new Date() })), true);
    assert.equal(shouldSkipPeVJournalMirror(baseRow({ status: 'posted' })), false);
  });

  it('builds Dr expense / Cr payment source lines', () => {
    const lines = buildJournalLinesFromPeV(baseRow({ amount: '250.5' }), 'acc-site-expense');
    assert.ok(lines);
    assert.equal(lines!.length, 2);
    assert.equal(lines![0].accountId, 'acc-site-expense');
    assert.equal(lines![0].debitAmount, 250.5);
    assert.equal(lines![0].creditAmount, 0);
    assert.equal(lines![0].projectId, 'proj-1');
    assert.equal(lines![1].accountId, 'acc-cash');
    assert.equal(lines![1].debitAmount, 0);
    assert.equal(lines![1].creditAmount, 250.5);
  });

  it('returns null for draft status', () => {
    const lines = buildJournalLinesFromPeV(baseRow({ status: 'draft' }), 'acc-site-expense');
    assert.equal(lines, null);
  });
});
