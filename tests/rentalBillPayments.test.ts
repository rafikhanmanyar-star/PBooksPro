import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getEffectiveBillPaymentDisplay, getPaymentTransactionsForRentalBill, sumLinkedExpensePaymentsForBill } from '../utils/rentalBillPayments';
import { InvoiceStatus, TransactionType, type Bill, type Transaction } from '../types';

const bill: Bill = {
  id: 'bill-1',
  billNumber: 'B-001',
  amount: 1_000,
  paidAmount: 0,
  status: InvoiceStatus.UNPAID,
  issueDate: '2026-05-01',
  propertyId: 'prop-1',
  categoryId: 'cat-maint',
};

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: overrides.id ?? 'tx-1',
    type: overrides.type ?? TransactionType.EXPENSE,
    amount: overrides.amount ?? 0,
    date: overrides.date ?? '2026-05-02',
    accountId: overrides.accountId ?? 'bank-1',
    description: overrides.description,
    categoryId: overrides.categoryId,
    billId: overrides.billId,
    propertyId: overrides.propertyId,
    buildingId: overrides.buildingId,
    contactId: overrides.contactId,
    ownerId: overrides.ownerId,
  };
}

describe('rental bill payment helpers', () => {
  it('does not treat owner bill reimbursement income as vendor bill payment', () => {
    const ownerReimbursement = tx({
      id: 'owner-reimbursement',
      type: TransactionType.INCOME,
      amount: 1_000,
      billId: bill.id,
      categoryId: 'cat-rental-income',
      contactId: 'owner-1',
      ownerId: 'owner-1',
      propertyId: 'prop-1',
      description: 'Owner reimbursement - Maintenance bill (Ref: owner receive 2026-05-02)',
    });

    assert.equal(sumLinkedExpensePaymentsForBill([ownerReimbursement], bill.id), 0);
    assert.deepEqual(getEffectiveBillPaymentDisplay(bill, [ownerReimbursement]), {
      paidAmount: 0,
      balance: 1_000,
      status: 'Unpaid',
    });
    assert.deepEqual(
      getPaymentTransactionsForRentalBill([ownerReimbursement], bill, [{ id: 'cat-maint', name: 'Maintenance', type: TransactionType.EXPENSE }], []),
      []
    );
  });

  it('still counts expense bill payments and security-deposit income bill settlements', () => {
    const expensePayment = tx({
      id: 'vendor-payment',
      type: TransactionType.EXPENSE,
      amount: 400,
      billId: bill.id,
      categoryId: 'cat-maint',
      propertyId: 'prop-1',
      description: 'Bill payment',
    });
    const securitySettlement = tx({
      id: 'security-settlement',
      type: TransactionType.INCOME,
      amount: 250,
      billId: bill.id,
      propertyId: 'prop-1',
      description: 'Bill payment (from security deposit)',
    });

    const transactions = [expensePayment, securitySettlement];

    assert.equal(sumLinkedExpensePaymentsForBill(transactions, bill.id), 650);
    assert.deepEqual(getEffectiveBillPaymentDisplay(bill, transactions), {
      paidAmount: 650,
      balance: 350,
      status: 'Partially Paid',
    });
    assert.deepEqual(
      getPaymentTransactionsForRentalBill(transactions, bill, [{ id: 'cat-maint', name: 'Maintenance', type: TransactionType.EXPENSE }], []).map((t) => t.id),
      ['vendor-payment', 'security-settlement']
    );
  });
});
