import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildJournalLinesFromTransaction,
} from '../modules/accounting/services/transactionJournalPostingService.js';
import { buildJournalLinesFromInvoice } from '../modules/accounting/services/invoiceJournalPostingService.js';
import { buildJournalLinesFromBill } from '../modules/accounting/services/billJournalPostingService.js';
import { normalBalanceDirection } from '../financial/trialBalanceCore.js';
import type { TransactionRow } from '../modules/accounting/services/transactionsService.js';
import type { InvoiceRow } from '../modules/customers/services/invoicesService.js';
import type { BillRow } from '../modules/vendors/services/billsService.js';

function txRow(overrides: Partial<TransactionRow>): TransactionRow {
  return {
    id: 'tx_1', tenant_id: 'taj-builders', user_id: null, type: 'Income', subtype: null,
    amount: '100', date: new Date('2026-01-15'), description: null, reference: null,
    account_id: 'acc-cash', from_account_id: null, to_account_id: null, category_id: null,
    contact_id: null, vendor_id: null, project_id: null, building_id: null, property_id: null,
    unit_id: null, invoice_id: null, bill_id: null, payslip_id: null, contract_id: null,
    agreement_id: null, batch_id: null, project_asset_id: null, owner_id: null, is_system: false,
    approval_status: 'Approved', submitted_at: null, submitted_by: null, approved_at: null,
    approved_by: null, version: 1, deleted_at: null, created_at: new Date(), updated_at: new Date(),
    ...overrides,
  } as TransactionRow;
}

describe('P0 normalBalanceDirection (new P&L types)', () => {
  it('revenue and other income are credit-normal', () => {
    assert.equal(normalBalanceDirection('Revenue'), -1);
    assert.equal(normalBalanceDirection('Other Income'), -1);
  });
  it('expense, cogs and other expense are debit-normal', () => {
    assert.equal(normalBalanceDirection('Expense'), 1);
    assert.equal(normalBalanceDirection('COGS'), 1);
    assert.equal(normalBalanceDirection('Other Expense'), 1);
  });
});

describe('P0-C transaction builder — legacy vs GL-native', () => {
  it('legacy: income credits Income Summary', () => {
    const lines = buildJournalLinesFromTransaction(txRow({ type: 'Income' }));
    assert.equal(lines![1].accountId, 'sys-acc-income-summary');
  });
  it('GL-native: income credits resolved revenue account + stamps category, balanced', () => {
    const lines = buildJournalLinesFromTransaction(
      txRow({ type: 'Income', category_id: 'sys-cat-rent-inc' }),
      { incomeAccountId: 'sys-acc-rev-rental', categoryId: 'sys-cat-rent-inc' }
    )!;
    assert.equal(lines[1].accountId, 'sys-acc-rev-rental');
    assert.equal(lines[1].categoryId, 'sys-cat-rent-inc');
    assert.equal(lines[0].debitAmount, lines[1].creditAmount); // balanced
  });
  it('GL-native: expense debits resolved expense account', () => {
    const lines = buildJournalLinesFromTransaction(
      txRow({ type: 'Expense', category_id: 'sys-cat-bld-util' }),
      { expenseAccountId: 'sys-acc-exp-utility', categoryId: 'sys-cat-bld-util' }
    )!;
    assert.equal(lines[0].accountId, 'sys-acc-exp-utility');
    assert.equal(lines[0].categoryId, 'sys-cat-bld-util');
  });
  it('GL-native: invoice-linked income still settles AR (revenue recognized at invoice)', () => {
    const lines = buildJournalLinesFromTransaction(
      txRow({ type: 'Income', invoice_id: 'inv-1' }),
      { incomeAccountId: 'sys-acc-rev-rental' }
    )!;
    assert.equal(lines[1].accountId, 'sys-acc-ar');
  });
});

describe('P0-C invoice & bill builders — GL-native override', () => {
  function invRow(o: Partial<InvoiceRow>): InvoiceRow {
    return { id: 'inv-1', tenant_id: 'taj-builders', invoice_number: 'I-1', invoice_type: 'Rental',
      amount: '500', issue_date: new Date('2026-01-10'), status: 'Unpaid', description: null,
      user_id: null, deleted_at: null } as unknown as InvoiceRow;
  }
  it('invoice: GL-native credits resolved revenue account', () => {
    const lines = buildJournalLinesFromInvoice(invRow({}), { revenueAccountId: 'sys-acc-rev-rental' })!;
    assert.equal(lines[0].accountId, 'sys-acc-ar');
    assert.equal(lines[1].accountId, 'sys-acc-rev-rental');
  });
  it('invoice: legacy credits Income Summary', () => {
    const lines = buildJournalLinesFromInvoice(invRow({}))!;
    assert.equal(lines[1].accountId, 'sys-acc-income-summary');
  });

  function billRow(o: Partial<BillRow>): BillRow {
    return { id: 'b-1', tenant_id: 'taj-builders', bill_number: 'B-1', amount: '300',
      issue_date: new Date('2026-01-12'), status: 'Unpaid', description: null, user_id: null,
      category_id: 'sys-cat-bld-maint', deleted_at: null, approval_status: 'Approved' } as unknown as BillRow;
  }
  it('bill: GL-native debits resolved expense account + stamps category', () => {
    const lines = buildJournalLinesFromBill(billRow({}), { expenseAccountId: 'sys-acc-exp-maintenance', categoryId: 'sys-cat-bld-maint' })!;
    assert.equal(lines[0].accountId, 'sys-acc-exp-maintenance');
    assert.equal(lines[0].categoryId, 'sys-cat-bld-maint');
    assert.equal(lines[1].accountId, 'sys-acc-ap');
  });
});
