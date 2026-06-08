import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildJournalLinesFromInvoice,
  isSecurityDepositInvoice,
  shouldSkipInvoiceJournalMirror,
} from './invoiceJournalPostingService.js';
import type { InvoiceRow } from './invoicesService.js';

function baseInvoice(overrides: Partial<InvoiceRow>): InvoiceRow {
  return {
    id: 'inv-1',
    tenant_id: 't1',
    invoice_number: 'INV-001',
    contact_id: 'c1',
    amount: '1000',
    paid_amount: '0',
    status: 'Unpaid',
    issue_date: new Date('2026-01-15'),
    due_date: new Date('2026-02-15'),
    invoice_type: 'Installment',
    description: 'Installment 1',
    project_id: 'proj-1',
    building_id: null,
    property_id: null,
    unit_id: null,
    category_id: null,
    agreement_id: null,
    security_deposit_charge: null,
    service_charges: null,
    rental_month: null,
    user_id: null,
    version: 1,
    deleted_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe('invoiceJournalPostingService', () => {
  it('skips draft and voided invoices', () => {
    assert.equal(shouldSkipInvoiceJournalMirror(baseInvoice({ status: 'Draft' })), true);
    assert.equal(shouldSkipInvoiceJournalMirror(baseInvoice({ description: 'VOIDED invoice' })), true);
  });

  it('builds Dr AR / Cr income summary for installment invoice', () => {
    const lines = buildJournalLinesFromInvoice(baseInvoice({}));
    assert.ok(lines);
    assert.equal(lines![0].accountId, 'sys-acc-ar');
    assert.equal(lines![0].debitAmount, 1000);
    assert.equal(lines![1].accountId, 'sys-acc-income-summary');
    assert.equal(lines![1].creditAmount, 1000);
  });

  it('builds Dr AR / Cr security liability for security deposit invoice', () => {
    assert.ok(isSecurityDepositInvoice(baseInvoice({ invoice_type: 'Security Deposit' })));
    const lines = buildJournalLinesFromInvoice(
      baseInvoice({ invoice_type: 'Security Deposit', description: 'Security Deposit [Security]' })
    );
    assert.equal(lines![1].accountId, 'sys-acc-sec-liability');
  });
});
