/**
 * Personal transactions API (admin personal cashbook).
 */

import { apiClient } from '../client';
import type { PersonalTransactionEntry } from '../../../types';

export function normalizePersonalTransactionFromApi(raw: Record<string, unknown>): PersonalTransactionEntry {
  const t = raw.type === 'Expense' ? 'Expense' : 'Income';
  const amount = typeof raw.amount === 'number' ? raw.amount : parseFloat(String(raw.amount ?? '0'));
  const td = String(raw.transactionDate ?? raw.transaction_date ?? '').slice(0, 10);
  return {
    id: String(raw.id ?? ''),
    tenantId: raw.tenantId != null ? String(raw.tenantId) : raw.tenant_id != null ? String(raw.tenant_id) : undefined,
    accountId: String(raw.accountId ?? raw.account_id ?? ''),
    personalCategoryId: String(raw.personalCategoryId ?? raw.personal_category_id ?? ''),
    type: t,
    amount,
    transactionDate: td,
    description: raw.description != null ? String(raw.description) : undefined,
    createdAt: raw.createdAt != null ? String(raw.createdAt) : raw.created_at != null ? String(raw.created_at) : undefined,
    updatedAt: raw.updatedAt != null ? String(raw.updatedAt) : raw.updated_at != null ? String(raw.updated_at) : undefined,
    version: typeof raw.version === 'number' ? raw.version : undefined,
    deletedAt:
      raw.deletedAt != null
        ? String(raw.deletedAt)
        : raw.deleted_at != null
          ? String(raw.deleted_at)
          : undefined,
  };
}

export class PersonalTransactionsApiRepository {
  async findAll(): Promise<PersonalTransactionEntry[]> {
    const rows = await apiClient.get<Record<string, unknown>[]>('/personal-transactions');
    return Array.isArray(rows) ? rows.map((r) => normalizePersonalTransactionFromApi(r)) : [];
  }

  async create(
    body: Partial<PersonalTransactionEntry> & {
      accountId: string;
      personalCategoryId: string;
      type: 'Income' | 'Expense';
      amount: number;
      transactionDate: string;
    }
  ): Promise<PersonalTransactionEntry> {
    const raw = await apiClient.post<Record<string, unknown>>('/personal-transactions', body);
    return normalizePersonalTransactionFromApi(raw);
  }

  async bulkCreate(
    transactions: Array<{
      accountId: string;
      personalCategoryId: string;
      type: 'Income' | 'Expense';
      amount: number;
      transactionDate: string;
      description?: string;
    }>
  ): Promise<{ imported: number }> {
    return apiClient.post<{ imported: number }>('/personal-transactions/bulk', { transactions });
  }

  async update(id: string, body: Partial<PersonalTransactionEntry>): Promise<PersonalTransactionEntry> {
    const raw = await apiClient.put<Record<string, unknown>>(`/personal-transactions/${id}`, body);
    return normalizePersonalTransactionFromApi(raw);
  }

  async delete(id: string, version?: number): Promise<void> {
    const qs = version != null && Number.isFinite(version) ? `?version=${version}` : '';
    await apiClient.delete(`/personal-transactions/${id}${qs}`);
  }
}
