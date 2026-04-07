/**
 * Personal categories API (tenant-scoped; Settings tab in Personal transactions).
 */

import { apiClient } from '../client';
import type { PersonalCategoryEntry } from '../../../types';

export function normalizePersonalCategoryFromApi(raw: Record<string, unknown>): PersonalCategoryEntry {
  const t = raw.type === 'Expense' ? 'Expense' : 'Income';
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    type: t,
    sortOrder:
      typeof raw.sortOrder === 'number'
        ? raw.sortOrder
        : typeof raw.sort_order === 'number'
          ? raw.sort_order
          : 0,
    version: typeof raw.version === 'number' ? raw.version : undefined,
    deletedAt:
      raw.deletedAt != null
        ? String(raw.deletedAt)
        : raw.deleted_at != null
          ? String(raw.deleted_at)
          : undefined,
  };
}

export class PersonalCategoriesApiRepository {
  async findAll(): Promise<PersonalCategoryEntry[]> {
    const rows = await apiClient.get<Record<string, unknown>[]>('/personal-categories');
    return Array.isArray(rows) ? rows.map((r) => normalizePersonalCategoryFromApi(r)) : [];
  }

  async create(body: Partial<PersonalCategoryEntry> & { type: 'Income' | 'Expense'; name: string }): Promise<PersonalCategoryEntry> {
    const raw = await apiClient.post<Record<string, unknown>>('/personal-categories', body);
    return normalizePersonalCategoryFromApi(raw);
  }

  async update(id: string, body: Partial<PersonalCategoryEntry>): Promise<PersonalCategoryEntry> {
    const raw = await apiClient.put<Record<string, unknown>>(`/personal-categories/${id}`, body);
    return normalizePersonalCategoryFromApi(raw);
  }

  async delete(id: string, version?: number): Promise<void> {
    const qs = version != null && Number.isFinite(version) ? `?version=${version}` : '';
    await apiClient.delete(`/personal-categories/${id}${qs}`);
  }
}
