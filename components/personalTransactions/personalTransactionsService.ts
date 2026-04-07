/**
 * Personal transactions: CRUD and listing.
 * Local SQLite (Electron) or PostgreSQL API (LAN) via AppState + REST.
 */

import { PersonalTransactionsRepository, PersonalTransactionRow } from '../../services/database/repositories';
import { getDatabaseService } from '../../services/database/databaseService';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { PersonalTransactionsApiRepository } from '../../services/api/repositories/personalTransactionsApi';
import { refreshPersonalStateFromApi } from './personalFinanceSync';
import type { PersonalTransactionEntry } from '../../types';

const repo = () => new PersonalTransactionsRepository();
const db = () => getDatabaseService();
const apiRepo = () => new PersonalTransactionsApiRepository();

export type { PersonalTransactionRow };

function listFromState(
  filters: {
    dateFrom?: string;
    dateTo?: string;
    categoryId?: string;
    accountId?: string;
  },
  rows: PersonalTransactionEntry[]
): PersonalTransactionRow[] {
  let out = rows.map((r) => ({
    id: r.id,
    tenantId: r.tenantId,
    accountId: r.accountId,
    personalCategoryId: r.personalCategoryId,
    type: r.type,
    amount: r.amount,
    transactionDate: r.transactionDate,
    description: r.description,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    version: r.version,
    deletedAt: r.deletedAt,
  }));
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
  /** When API mode, pass state.personalTransactions from useAppContext. */
  stateRows?: PersonalTransactionEntry[]
): PersonalTransactionRow[] {
  if (!isLocalOnlyMode() && stateRows) {
    const { limit = 1000, offset = 0, ...filters } = options;
    const sliced = listFromState(filters, stateRows);
    return sliced.slice(offset, offset + limit);
  }
  if (!db().isReady()) return [];
  const conditions: string[] = [];
  const params: any[] = [];
  if (options.dateFrom) {
    conditions.push('transaction_date >= ?');
    params.push(options.dateFrom);
  }
  if (options.dateTo) {
    conditions.push('transaction_date <= ?');
    params.push(options.dateTo);
  }
  if (options.categoryId) {
    conditions.push('personal_category_id = ?');
    params.push(options.categoryId);
  }
  if (options.accountId) {
    conditions.push('account_id = ?');
    params.push(options.accountId);
  }
  const condition = conditions.length > 0 ? conditions.join(' AND ') : undefined;
  return repo().findAllOrderByDate({
    limit: options.limit ?? 1000,
    offset: options.offset ?? 0,
    condition,
    params,
  });
}

export async function addPersonalTransaction(data: {
  accountId: string;
  personalCategoryId: string;
  type: 'Income' | 'Expense';
  amount: number;
  transactionDate: string;
  description?: string;
}): Promise<PersonalTransactionRow | PersonalTransactionEntry> {
  if (isLocalOnlyMode()) {
    const id = `personal-tx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const row: PersonalTransactionRow = {
      id,
      tenantId: '',
      accountId: data.accountId,
      personalCategoryId: data.personalCategoryId,
      type: data.type,
      amount: data.type === 'Expense' ? -Math.abs(data.amount) : Math.abs(data.amount),
      transactionDate: data.transactionDate,
      description: data.description ?? null,
    };
    repo().insert(row);
    return row;
  }
  const created = await apiRepo().create({
    accountId: data.accountId,
    personalCategoryId: data.personalCategoryId,
    type: data.type,
    amount: data.type === 'Expense' ? Math.abs(data.amount) : Math.abs(data.amount),
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
  if (isLocalOnlyMode()) {
    const base = Date.now();
    const operations = items.map((data, i) => () => {
      const id = `personal-tx-${base}-${i}-${Math.random().toString(36).slice(2, 11)}`;
      const row: PersonalTransactionRow = {
        id,
        tenantId: '',
        accountId: data.accountId,
        personalCategoryId: data.personalCategoryId,
        type: data.type,
        amount: data.type === 'Expense' ? -Math.abs(data.amount) : Math.abs(data.amount),
        transactionDate: data.transactionDate,
        description: data.description ?? null,
      };
      repo().insert(row);
    });
    db().transaction(operations);
    return { imported: items.length };
  }
  const out = await apiRepo().bulkCreate(
    items.map((x) => ({
      ...x,
      amount: x.type === 'Expense' ? Math.abs(x.amount) : Math.abs(x.amount),
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
  if (isLocalOnlyMode()) {
    const existing = repo().findById(id);
    if (!existing) return;
    const amount =
      data.amount !== undefined
        ? (data.type ?? existing.type) === 'Expense'
          ? -Math.abs(data.amount)
          : Math.abs(data.amount)
        : undefined;
    repo().update(id, { ...data, amount } as Partial<PersonalTransactionRow>);
    return;
  }
  await apiRepo().update(id, { ...data, version });
  await refreshPersonalStateFromApi();
}

export async function deletePersonalTransaction(id: string, version?: number): Promise<void> {
  if (isLocalOnlyMode()) {
    repo().delete(id);
    return;
  }
  await apiRepo().delete(id, version);
  await refreshPersonalStateFromApi();
}

/** Balance per account from personal transactions only (sum of amount by account_id). */
export function getPersonalBalancesByAccount(stateRows?: PersonalTransactionEntry[]): { accountId: string; balance: number }[] {
  if (!isLocalOnlyMode() && stateRows) {
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
  if (!db().isReady()) return [];
  const rows = db().query<{ account_id: string; balance: number }>(
    `SELECT account_id, SUM(amount) as balance
     FROM personal_transactions
     GROUP BY account_id
     ORDER BY account_id`
  );
  return rows.map((r) => ({ accountId: r.account_id, balance: Number(r.balance) || 0 }));
}
