/**
 * Personal categories (income/expense) for Personal transactions — PostgreSQL via API.
 */

import { _getAppState } from '../../context/AppContext';
import { PersonalCategoriesApiRepository } from '../../services/api/repositories/personalCategoriesApi';
import { refreshPersonalStateFromApi } from './personalFinanceSync';

export type PersonalCategory = { id: string; name: string };

const apiRepo = () => new PersonalCategoriesApiRepository();

export function getPersonalIncomeCategories(): PersonalCategory[] {
  const s = _getAppState();
  return (s.personalCategories || [])
    .filter((c) => c.type === 'Income' && !c.deletedAt)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((c) => ({ id: c.id, name: c.name }));
}

export function getPersonalExpenseCategories(): PersonalCategory[] {
  const s = _getAppState();
  return (s.personalCategories || [])
    .filter((c) => c.type === 'Expense' && !c.deletedAt)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((c) => ({ id: c.id, name: c.name }));
}

/** @deprecated Offline SQLite removed — use replacePersonalCategoriesApi. */
export function setPersonalIncomeCategories(_categories: PersonalCategory[]): void {}

/** @deprecated Offline SQLite removed — use replacePersonalCategoriesApi. */
export function setPersonalExpenseCategories(_categories: PersonalCategory[]): void {}

/**
 * Replace all categories of one type on the server (Settings modal save).
 */
export async function replacePersonalCategoriesApi(type: 'Income' | 'Expense', next: PersonalCategory[]): Promise<void> {
  const r = apiRepo();
  const s = _getAppState();
  const prev = (s.personalCategories || []).filter((c) => c.type === type);
  const prevById = new Map(prev.map((c) => [c.id, c]));
  const nextIds = new Set(next.map((c) => c.id));
  for (const p of prev) {
    if (!nextIds.has(p.id)) {
      await r.delete(p.id, p.version);
    }
  }
  let sortOrder = 0;
  for (const c of next) {
    const existing = prevById.get(c.id);
    if (!existing) {
      await r.create({ id: c.id, name: c.name, type, sortOrder });
    } else if (existing.name !== c.name || (existing.sortOrder ?? 0) !== sortOrder) {
      await r.update(c.id, { name: c.name, version: existing.version, sortOrder });
    }
    sortOrder++;
  }
  await refreshPersonalStateFromApi();
}

/** Add a single category on the fly; returns the new category (id, name). */
export async function addPersonalCategory(type: 'Income' | 'Expense', name: string): Promise<PersonalCategory> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Category name is required.');
  const s = _getAppState();
  const existing = (s.personalCategories || []).filter((c) => c.type === type && !c.deletedAt);
  const match = existing.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
  if (match) return { id: match.id, name: match.name };
  const prefix = type === 'Income' ? 'personal-inc' : 'personal-exp';
  const id = `${prefix}-${Date.now()}-${trimmed.replace(/\s+/g, '-').toLowerCase().slice(0, 20)}`;
  const sortOrder = existing.length;
  await apiRepo().create({ id, name: trimmed, type, sortOrder });
  await refreshPersonalStateFromApi();
  return { id, name: trimmed };
}

/** @deprecated Offline SQLite removed — categories come from API on login. */
export function seedPersonalCategoriesIfEmpty(): void {}
