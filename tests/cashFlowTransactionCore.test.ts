/**
 * Transaction-based cash flow (fallback when journal bank/cash lines are missing).
 */
import type { AppState, Account, Transaction } from '../types';
import { TransactionType, AccountType } from '../types';
import { buildCashFlowReportFromTransactions } from '../components/reports/cashFlowTransactionCore';

function bank(id: string): Account {
  return { id, name: 'Main Bank', type: AccountType.BANK, balance: 0, isPermanent: false };
}

function tx(p: Partial<Transaction> & Pick<Transaction, 'id' | 'amount' | 'date' | 'type' | 'accountId'>): Transaction {
  return { ...p } as Transaction;
}

const base: Pick<AppState, 'accounts' | 'categories' | 'invoices' | 'bills' | 'projectAgreements' | 'properties'> = {
  accounts: [bank('bank-1')],
  categories: [],
  invoices: [],
  bills: [],
  projectAgreements: [],
  properties: [],
};

{
  const state = {
    ...base,
    transactions: [
      tx({
        id: 'inc-1',
        amount: 500_000,
        date: '2025-06-10',
        type: TransactionType.INCOME,
        accountId: 'bank-1',
        projectId: 'proj-fmc',
      }),
      tx({
        id: 'exp-1',
        amount: 120_000,
        date: '2025-06-15',
        type: TransactionType.EXPENSE,
        accountId: 'bank-1',
        projectId: 'proj-fmc',
      }),
      tx({
        id: 'other-proj',
        amount: 999_999,
        date: '2025-06-20',
        type: TransactionType.INCOME,
        accountId: 'bank-1',
        projectId: 'proj-other',
      }),
    ],
  };

  const r = buildCashFlowReportFromTransactions({
    from: '2025-06-01',
    to: '2025-06-30',
    state: state as never,
    selectedProjectId: 'proj-fmc',
  });

  if (Math.abs(r.operating.total - 380_000) > 0.02) {
    throw new Error(`Expected operating 380000, got ${r.operating.total}`);
  }
  if (r.flags.source !== 'transactions') {
    throw new Error('Expected transactions source flag');
  }
  if (Math.abs(r.summary.net_change - 380_000) > 0.02) {
    throw new Error(`Expected net change 380000, got ${r.summary.net_change}`);
  }
}

console.log('cashFlowTransactionCore.test.ts: OK');
