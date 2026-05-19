/**
 * Regression tests for investor withdrawal liquidity validation.
 * Run: npx tsx tests/fundAvailabilityValidation.test.ts
 */
import assert from 'node:assert/strict';
import type { AppState } from '../types';
import { AccountType, EquityLedgerSubtype, TransactionType } from '../types';
import { validateWithdrawal } from '../modules/investor-fund-availability/utils/validateWithdrawal';

const state = {
  accounts: [
    { id: 'bank', name: 'Bank', type: AccountType.BANK, balance: 200 },
    { id: 'investor', name: 'Investor A', type: AccountType.EQUITY, balance: 0 },
  ],
  transactions: [
    {
      id: 'capital-in',
      type: TransactionType.TRANSFER,
      subtype: EquityLedgerSubtype.INVESTMENT,
      amount: 1000,
      date: '2026-05-01',
      description: 'Investment',
      fromAccountId: 'investor',
      toAccountId: 'bank',
      accountId: 'investor',
      projectId: 'project-1',
    },
    {
      id: 'existing-withdrawal',
      type: TransactionType.TRANSFER,
      subtype: EquityLedgerSubtype.WITHDRAWAL,
      amount: 800,
      date: '2026-05-02',
      description: 'Withdrawal',
      fromAccountId: 'bank',
      toAccountId: 'investor',
      accountId: 'bank',
      projectId: 'project-1',
    },
  ],
  bills: [],
  invoices: [],
  projects: [],
  units: [],
} as unknown as AppState;

const result = validateWithdrawal(
  state,
  'project-1',
  500,
  '2026-05-03',
  { mode: 'percent', percent: 0 },
  { excludeTransactionId: 'existing-withdrawal' }
);

assert.equal(result.ok, true, 'editing an existing withdrawal downward should validate against cash before that withdrawal');
assert.equal(result.distributableFunds, 1000);

console.log('fund availability validation tests passed');
