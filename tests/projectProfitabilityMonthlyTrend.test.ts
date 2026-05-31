/**
 * Run: npx tsx tests/projectProfitabilityMonthlyTrend.test.ts
 */
import type { Account, AppState, Category, Project, Transaction } from '../types';
import { AccountType, TransactionType } from '../types';
import { portfolioMonthlyTrendForProjectIds } from '../modules/project-profitability/services/projectProfitability.service';

function assertClose(actual: number, expected: number, label: string): void {
  if (Math.abs(actual - expected) > 0.02) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function tx(p: Pick<Transaction, 'id' | 'amount' | 'date' | 'type' | 'accountId' | 'categoryId' | 'projectId'>): Transaction {
  return p as Transaction;
}

const incomeCat: Category = {
  id: 'cat-income',
  name: 'Sales',
  type: TransactionType.INCOME,
  plSubType: 'revenue',
};
const expenseCat: Category = {
  id: 'cat-expense',
  name: 'Materials',
  type: TransactionType.EXPENSE,
  plSubType: 'cost_of_sales',
};
const bank: Account = { id: 'acc-bank', name: 'Bank', type: AccountType.BANK, balance: 0 };
const projects: Project[] = [
  { id: 'project-a', name: 'Project A', description: '', color: '#111', status: 'Active' },
  { id: 'project-b', name: 'Project B', description: '', color: '#222', status: 'Active' },
];

const state = {
  accounts: [bank],
  categories: [incomeCat, expenseCat],
  projects,
  transactions: [
    tx({
      id: 'a-jan-income',
      amount: 100,
      date: '2025-01-10',
      type: TransactionType.INCOME,
      accountId: bank.id,
      categoryId: incomeCat.id,
      projectId: 'project-a',
    }),
    tx({
      id: 'b-jan-income',
      amount: 900,
      date: '2025-01-11',
      type: TransactionType.INCOME,
      accountId: bank.id,
      categoryId: incomeCat.id,
      projectId: 'project-b',
    }),
    tx({
      id: 'a-feb-expense',
      amount: 30,
      date: '2025-02-10',
      type: TransactionType.EXPENSE,
      accountId: bank.id,
      categoryId: expenseCat.id,
      projectId: 'project-a',
    }),
    tx({
      id: 'b-feb-expense',
      amount: 300,
      date: '2025-02-11',
      type: TransactionType.EXPENSE,
      accountId: bank.id,
      categoryId: expenseCat.id,
      projectId: 'project-b',
    }),
  ],
  invoices: [],
  bills: [],
  rentalAgreements: [],
  projectAgreements: [],
  vendors: [],
  contacts: [],
} as unknown as AppState;

{
  const trend = portfolioMonthlyTrendForProjectIds(state, '2025-02-28', ['project-a'], 2);

  assertClose(trend[0].revenue, 100, 'filtered January revenue');
  assertClose(trend[0].expense, 0, 'filtered January expense');
  assertClose(trend[0].netProfit, 100, 'filtered January net profit');
  assertClose(trend[1].revenue, 0, 'filtered February revenue');
  assertClose(trend[1].expense, 30, 'filtered February expense');
  assertClose(trend[1].netProfit, -30, 'filtered February net profit');
}

console.log('projectProfitabilityMonthlyTrend.test.ts: OK');
