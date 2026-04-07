/**
 * Personal categories (income/expense) for Personal transactions.
 * Stored in personal_categories (SQLite) or PostgreSQL via API.
 */

import {
  PersonalCategoriesRepository,
  PersonalCategoryRow,
} from '../../services/database/repositories';
import { getDatabaseService } from '../../services/database/databaseService';
import { AppSettingsRepository } from '../../services/database/repositories';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { _getAppState } from '../../context/AppContext';
import { PersonalCategoriesApiRepository } from '../../services/api/repositories/personalCategoriesApi';
import { refreshPersonalStateFromApi } from './personalFinanceSync';

export type PersonalCategory = { id: string; name: string };

const DEFAULT_EXPENSE_NAMES = [
  'Food', 'Fuel', 'Rent', 'School Fees', 'Medical', 'Travel',
  'Utilities', 'Entertainment', 'Miscellaneous',
];
const DEFAULT_INCOME_NAMES = [
  'Salary', 'Business Income', 'Rental Income', 'Freelance',
  'Investment Income', 'Other Income',
];

function toRows(names: string[], type: 'Income' | 'Expense', prefix: string): PersonalCategoryRow[] {
  return names.map((name, i) => ({
    id: `${prefix}-${i}-${name.replace(/\s+/g, '-').toLowerCase()}`,
    tenantId: '',
    name,
    type,
    sortOrder: i,
  }));
}

function rowToCategory(r: PersonalCategoryRow): PersonalCategory {
  return { id: r.id, name: r.name };
}

const repo = () => new PersonalCategoriesRepository();
const db = () => getDatabaseService();
const apiRepo = () => new PersonalCategoriesApiRepository();

export function getPersonalIncomeCategories(): PersonalCategory[] {
  if (!isLocalOnlyMode()) {
    const s = _getAppState();
    return (s.personalCategories || [])
      .filter((c) => c.type === 'Income' && !c.deletedAt)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((c) => ({ id: c.id, name: c.name }));
  }
  if (!db().isReady()) return [];
  return repo().findByType('Income').map(rowToCategory);
}

export function getPersonalExpenseCategories(): PersonalCategory[] {
  if (!isLocalOnlyMode()) {
    const s = _getAppState();
    return (s.personalCategories || [])
      .filter((c) => c.type === 'Expense' && !c.deletedAt)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((c) => ({ id: c.id, name: c.name }));
  }
  if (!db().isReady()) return [];
  return repo().findByType('Expense').map(rowToCategory);
}

export function setPersonalIncomeCategories(categories: PersonalCategory[]): void {
  if (!isLocalOnlyMode()) return;
  const r = repo();
  const existing = r.findByType('Income');
  existing.forEach((row) => r.delete(row.id));
  categories.forEach((cat, i) => {
    r.insert({
      id: cat.id,
      tenantId: '',
      name: cat.name,
      type: 'Income',
      sortOrder: i,
    });
  });
}

export function setPersonalExpenseCategories(categories: PersonalCategory[]): void {
  if (!isLocalOnlyMode()) return;
  const r = repo();
  const existing = r.findByType('Expense');
  existing.forEach((row) => r.delete(row.id));
  categories.forEach((cat, i) => {
    r.insert({
      id: cat.id,
      tenantId: '',
      name: cat.name,
      type: 'Expense',
      sortOrder: i,
    });
  });
}

/**
 * Replace all categories of one type on the server (Settings modal save in API mode).
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
  if (!isLocalOnlyMode()) {
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
  const r = repo();
  const existing = r.findByType(type);
  const match = existing.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
  if (match) return { id: match.id, name: match.name };
  const prefix = type === 'Income' ? 'personal-inc' : 'personal-exp';
  const id = `${prefix}-${Date.now()}-${trimmed.replace(/\s+/g, '-').toLowerCase().slice(0, 20)}`;
  const sortOrder = existing.length;
  r.insert({ id, tenantId: '', name: trimmed, type, sortOrder });
  return { id, name: trimmed };
}

/** Seed default categories into personal_categories table. Migrate from app_settings if present. */
export function seedPersonalCategoriesIfEmpty(): void {
  const database = db();
  if (!database.isReady()) return;

  const count = database.query<{ n: number }>(
    'SELECT COUNT(*) as n FROM personal_categories',
    []
  )[0]?.n ?? 0;
  if (count > 0) return;

  const appSettings = new AppSettingsRepository();
  const incomeFromSettings = appSettings.getSetting('personal_income_categories');
  const expenseFromSettings = appSettings.getSetting('personal_expense_categories');

  const incomeRows: PersonalCategoryRow[] = Array.isArray(incomeFromSettings) && incomeFromSettings.length > 0
    ? (incomeFromSettings as PersonalCategory[]).map((c, i) => ({
        id: c.id,
        tenantId: '',
        name: c.name,
        type: 'Income' as const,
        sortOrder: i,
      }))
    : toRows(DEFAULT_INCOME_NAMES, 'Income', 'personal-inc');

  const expenseRows: PersonalCategoryRow[] = Array.isArray(expenseFromSettings) && expenseFromSettings.length > 0
    ? (expenseFromSettings as PersonalCategory[]).map((c, i) => ({
        id: c.id,
        tenantId: '',
        name: c.name,
        type: 'Expense' as const,
        sortOrder: i,
      }))
    : toRows(DEFAULT_EXPENSE_NAMES, 'Expense', 'personal-exp');

  const r = repo();
  incomeRows.forEach((row) => r.insert(row));
  expenseRows.forEach((row) => r.insert(row));
}
