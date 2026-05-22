/**
 * Rental bill payment helpers: owner reimbursements must not settle vendor bills.
 * Run: npx tsx tests/rentalBillPayments.test.ts
 */
import type { Bill, Category, Property, Transaction } from '../types';
import { AccountType, InvoiceStatus, TransactionType } from '../types';
import {
  getPaymentTransactionsForRentalBill,
  sumLinkedExpensePaymentsForBill,
} from '../utils/rentalBillPayments';

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

const bill: Bill = {
  id: 'bill-1',
  billNumber: 'B-001',
  contactId: 'vendor-1',
  amount: 500,
  paidAmount: 0,
  status: InvoiceStatus.UNPAID,
  issueDate: '2026-05-01',
  dueDate: '2026-05-31',
  categoryId: 'cat-repair',
  propertyId: 'property-1',
};

const categories: Category[] = [
  { id: 'cat-repair', name: 'Repairs', type: TransactionType.EXPENSE },
  { id: 'cat-rental-income', name: 'Rental Income', type: TransactionType.INCOME },
  { id: 'cat-security-deposit', name: 'Security Deposit', type: TransactionType.INCOME },
];

const properties: Property[] = [
  {
    id: 'property-1',
    name: 'Unit 1',
    buildingId: 'building-1',
    ownerId: 'owner-1',
    rent: 0,
    status: 'Vacant',
  },
];

function tx(p: Partial<Transaction> & Pick<Transaction, 'id' | 'type' | 'amount' | 'date'>): Transaction {
  return {
    accountId: 'bank-1',
    ...p,
  } as Transaction;
}

{
  const ownerReimbursement = tx({
    id: 'owner-reimbursement-1',
    type: TransactionType.INCOME,
    amount: 500,
    date: '2026-05-10',
    categoryId: 'cat-rental-income',
    contactId: 'owner-1',
    billId: bill.id,
    description: 'Owner reimbursement - Unit 1 repair',
  });

  assertEqual(
    sumLinkedExpensePaymentsForBill([ownerReimbursement], bill.id),
    0,
    'owner reimbursement income should not count as vendor bill payment'
  );

  const paymentRows = getPaymentTransactionsForRentalBill([ownerReimbursement], bill, categories, properties);
  assertEqual(paymentRows.length, 0, 'owner reimbursement income should not appear as bill payment');
}

{
  const vendorPayment = tx({
    id: 'vendor-payment-1',
    type: TransactionType.EXPENSE,
    amount: 500,
    date: '2026-05-11',
    categoryId: 'cat-repair',
    contactId: 'vendor-1',
    billId: bill.id,
    description: 'Payment for Bill B-001',
  });
  const securityDepositBillPayment = tx({
    id: 'security-payment-1',
    type: TransactionType.INCOME,
    amount: 200,
    date: '2026-05-12',
    categoryId: 'cat-security-deposit',
    contactId: 'tenant-1',
    billId: bill.id,
    description: 'Bill payment (from security deposit)',
  });

  assertEqual(
    sumLinkedExpensePaymentsForBill([vendorPayment, securityDepositBillPayment], bill.id),
    700,
    'vendor expense and security-deposit bill income should count as bill payments'
  );

  const paymentRows = getPaymentTransactionsForRentalBill(
    [vendorPayment, securityDepositBillPayment],
    bill,
    categories,
    properties
  );
  assertEqual(paymentRows.length, 2, 'valid bill settlement rows should appear as bill payments');
}

{
  const securityDepositBillPayment = tx({
    id: 'security-payment-2',
    type: TransactionType.INCOME,
    amount: 200,
    date: '2026-05-12',
    categoryId: 'cat-security-deposit',
    contactId: 'tenant-1',
    billId: bill.id,
    description: 'Bill payment (from security deposit) - B-001',
  });
  const liabilityReleaseExpense = tx({
    id: 'security-liability-release-1',
    type: TransactionType.EXPENSE,
    amount: 200,
    date: '2026-05-12',
    categoryId: 'cat-security-deposit',
    contactId: 'tenant-1',
    billId: bill.id,
    description: 'Security deposit applied - Bill B-001',
  });

  assertEqual(
    sumLinkedExpensePaymentsForBill([securityDepositBillPayment, liabilityReleaseExpense], bill.id),
    200,
    'security-deposit bill settlement should count once, not once per paired ledger row'
  );

  const paymentRows = getPaymentTransactionsForRentalBill(
    [securityDepositBillPayment, liabilityReleaseExpense],
    bill,
    categories,
    properties
  );
  assertEqual(paymentRows.length, 1, 'security-deposit liability release should not appear as bill payment');
  assertEqual(paymentRows[0]?.id, securityDepositBillPayment.id, 'security-deposit income is the bill payment row');
}

{
  const orphanLiabilityReleaseExpense = tx({
    id: 'orphan-security-liability-release-1',
    type: TransactionType.EXPENSE,
    amount: 200,
    date: '2026-05-12',
    categoryId: 'cat-repair',
    contactId: 'tenant-1',
    propertyId: bill.propertyId,
    description: 'Security deposit applied - Bill B-001',
  });

  const paymentRows = getPaymentTransactionsForRentalBill(
    [orphanLiabilityReleaseExpense],
    bill,
    categories,
    properties
  );
  assertEqual(
    paymentRows.length,
    0,
    'orphan security-deposit liability release should not be matched as a bill payment'
  );
}

console.log('rentalBillPayments tests passed');
