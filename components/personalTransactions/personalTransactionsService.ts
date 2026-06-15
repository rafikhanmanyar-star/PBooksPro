/**
 * Personal transactions: CRUD and listing via PostgreSQL API + AppState.
 */

import { PersonalTransactionsApiRepository } from '../../services/api/repositories/personalTransactionsApi';
import { refreshPersonalStateFromApi } from './personalFinanceSync';
import type { PersonalTransactionEntry } from '../../types';

const apiRepo = () => new PersonalTransactionsApiRepository();

export type PersonalTransactionRow = PersonalTransactionEntry;

function listFromState(
  filters: {
    dateFrom?: string;
    dateTo?: string;
    categoryId?: string;
    accountId?: string;
  },
  rows: PersonalTransactionEntry[]
): PersonalTransactionRow[] {
  let out = [...rows];
  if (filters.dateFrom) {
    out = out.filter((t) => t.transactionDate >= filters.dateFrom!);
  }
  if (filters.dateTo) {
    out = out.filter((t) => t.transactionDate <= filters.dateTo!);
  }
  if (filters.categoryId) {
    out = out.filter((t) => t.personalCategoryId === filters.categoryId);
  }
  if (filters.accountId) {
    out = out.filter((t) => t.accountId === filters.accountId);
  }
  out.sort((a, b) => {
    const da = a.transactionDate || '';
    const db_ = b.transactionDate || '';
    if (da !== db_) return db_.localeCompare(da);
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });
  return out;
}

export function listPersonalTransactions(
  options: {
    limit?: number;
    offset?: number;
    dateFrom?: string;
    dateTo?: string;
    categoryId?: string;
    accountId?: string;
  } = {},
  stateRows?: PersonalTransactionEntry[]
): PersonalTransactionRow[] {
  if (!stateRows) return [];
  const { limit = 1000, offset = 0, ...filters } = options;
  const sliced = listFromState(filters, stateRows);
  return sliced.slice(offset, offset + limit);
}

export async function addPersonalTransaction(data: {
  accountId: string;
  personalCategoryId: string;
  type: 'Income' | 'Expense';
  amount: number;
  transactionDate: string;
  description?: string;
}): Promise<PersonalTransactionRow> {
  const created = await apiRepo().create({
    accountId: data.accountId,
    personalCategoryId: data.personalCategoryId,
    type: data.type,
    amount: Math.abs(data.amount),
    transactionDate: data.transactionDate,
    description: data.description,
  });
  await refreshPersonalStateFromApi();
  return created;
}

export async function bulkImportPersonalTransactions(
  items: Array<{
    accountId: string;
    personalCategoryId: string;
    type: 'Income' | 'Expense';
    amount: number;
    transactionDate: string;
    description?: string;
  }>
): Promise<{ imported: number }> {
  if (items.length === 0) return { imported: 0 };
  const out = await apiRepo().bulkCreate(
    items.map((x) => ({
      ...x,
      amount: Math.abs(x.amount),
    }))
  );
  await refreshPersonalStateFromApi();
  return out;
}

export async function updatePersonalTransaction(
  id: string,
  data: Partial<{
    accountId: string;
    personalCategoryId: string;
    type: 'Income' | 'Expense';
    amount: number;
    transactionDate: string;
    description: string;
  }>,
  version?: number
): Promise<void> {
  await apiRepo().update(id, { ...data, version });
  await refreshPersonalStateFromApi();
}

export async function deletePersonalTransaction(id: string, version?: number): Promise<void> {
  await apiRepo().delete(id, version);
  await refreshPersonalStateFromApi();
}

/** Balance per account from personal transactions (sum of amount by account_id). */
export function getPersonalBalancesByAccount(stateRows?: PersonalTransactionEntry[]): { accountId: string; balance: number }[] {
  if (!stateRows) return [];
  const map = new Map<string, number>();
  for (const t of stateRows) {
    if (t.deletedAt) continue;
    const prev = map.get(t.accountId) ?? 0;
    map.set(t.accountId, prev + (typeof t.amount === 'number' ? t.amount : 0));
  }
  return Array.from(map.entries())
    .map(([accountId, balance]) => ({ accountId, balance }))
    .sort((a, b) => a.accountId.localeCompare(b.accountId));
}
