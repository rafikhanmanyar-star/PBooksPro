/**
 * Regression tests for bill payment aggregation.
 * Run: npx tsx tests/rentalBillPayments.test.ts
 */
import assert from 'node:assert/strict';
import type { Transaction } from '../types';
import { TransactionType } from '../types';
import { sumLinkedExpensePaymentsForBill } from '../utils/rentalBillPayments';
import { ledgerAmountPaidViaTransactionsForBill } from '../utils/vendorLedgerPrepaid';

const txs: Transaction[] = [
  {
    id: 'vendor-cash-payment',
    type: TransactionType.EXPENSE,
    amount: 700,
    date: '2026-05-01',
    description: 'Vendor bill payment',
    accountId: 'bank',
    billId: 'bill-1',
  },
  {
    id: 'security-bill-payment',
    type: TransactionType.INCOME,
    amount: 200,
    date: '2026-05-02',
    description: 'Bill payment (from security deposit)',
    accountId: 'bank',
    billId: 'bill-1',
  },
  {
    id: 'owner-reimbursement',
    type: TransactionType.INCOME,
    amount: 1000,
    date: '2026-05-03',
    description: 'Owner reimbursement - owner-bearer repair bill',
    accountId: 'bank',
    billId: 'bill-1',
  },
];

assert.equal(
  sumLinkedExpensePaymentsForBill(txs, 'bill-1'),
  900,
  'owner reimbursements must not mark vendor bills paid'
);
assert.equal(
  ledgerAmountPaidViaTransactionsForBill(txs, 'bill-1'),
  900,
  'vendor prepaid display must use the same bill-payment definition'
);

console.log('rentalBillPayments aggregation tests passed');
