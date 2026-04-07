/**
 * Build validated preview rows for personal transaction paste import.
 */

import type { PersonalTransactionEntry } from '../../../types';
import {
  findClosestMatches,
  normalizeDate,
  normalizeIncomeExpense,
  parseAmountRaw,
  type ParsedPasteLine,
  type NamedItem,
} from './personalTransactionImportPaste';

export type ImportRowStatus = 'valid' | 'warning' | 'error';

export interface ImportPreviewRow {
  lineIndex: number;
  dateRaw: string;
  normalizedDate: string | null;
  accountRaw: string;
  categoryRaw: string;
  note: string;
  amountRaw: string;
  amountParsed: number | null;
  typeNormalized: 'Income' | 'Expense' | null;
  accountId: string;
  personalCategoryId: string;
  accountSuggestions: { id: string; name: string; score: number }[];
  categorySuggestions: { id: string; name: string; score: number }[];
  messages: { level: 'error' | 'warning'; text: string }[];
  status: ImportRowStatus;
  duplicateOfExisting: boolean;
}

export interface ValidateImportContext {
  bankCashAccounts: NamedItem[];
  incomeCategories: NamedItem[];
  expenseCategories: NamedItem[];
  existingTransactions: Pick<PersonalTransactionEntry, 'transactionDate' | 'amount' | 'description'>[];
}

const ACCOUNT_AUTO_SCORE = 0.42;
const CATEGORY_AUTO_SCORE = 0.38;

function matchAccount(
  raw: string,
  accounts: NamedItem[]
): {
  id: string | null;
  suggestions: { id: string; name: string; score: number }[];
  exactOrContains: boolean;
} {
  const q = raw.trim();
  if (!q) return { id: null, suggestions: [], exactOrContains: false };
  const lower = q.toLowerCase();
  const exact = accounts.find((a) => a.name.toLowerCase() === lower);
  if (exact) return { id: exact.id, suggestions: [], exactOrContains: true };
  const contains = accounts.find(
    (a) => a.name.toLowerCase().includes(lower) || lower.includes(a.name.toLowerCase())
  );
  if (contains) return { id: contains.id, suggestions: [], exactOrContains: true };
  const sug = findClosestMatches(q, accounts, 5).map((s) => ({
    id: s.item.id,
    name: s.item.name,
    score: s.score,
  }));
  const best = sug[0];
  if (best && best.score >= ACCOUNT_AUTO_SCORE) {
    return { id: best.id, suggestions: sug, exactOrContains: false };
  }
  return { id: null, suggestions: sug, exactOrContains: false };
}

function matchCategory(
  raw: string,
  categories: NamedItem[]
): {
  id: string | null;
  suggestions: { id: string; name: string; score: number }[];
  exactOrContains: boolean;
} {
  const q = raw.trim();
  if (!q) return { id: null, suggestions: [], exactOrContains: false };
  const lower = q.toLowerCase();
  const exact = categories.find((c) => c.name.toLowerCase() === lower);
  if (exact) return { id: exact.id, suggestions: [], exactOrContains: true };
  const contains = categories.find(
    (c) => c.name.toLowerCase().includes(lower) || lower.includes(c.name.toLowerCase())
  );
  if (contains) return { id: contains.id, suggestions: [], exactOrContains: true };
  const sug = findClosestMatches(q, categories, 5).map((s) => ({
    id: s.item.id,
    name: s.item.name,
    score: s.score,
  }));
  const best = sug[0];
  if (best && best.score >= CATEGORY_AUTO_SCORE) {
    return { id: best.id, suggestions: sug, exactOrContains: false };
  }
  return { id: null, suggestions: sug, exactOrContains: false };
}

function duplicateKey(
  dateYmd: string,
  signedAmount: number,
  note: string
): string {
  const n = (note || '').trim().toLowerCase();
  const amt = Math.round(signedAmount * 100) / 100;
  return `${dateYmd}|${amt}|${n}`;
}

function buildDuplicateSet(
  existing: Pick<PersonalTransactionEntry, 'transactionDate' | 'amount' | 'description'>[]
): Set<string> {
  const s = new Set<string>();
  existing.forEach((t) => {
    const d = (t.transactionDate || '').slice(0, 10);
    s.add(duplicateKey(d, t.amount, t.description ?? ''));
  });
  return s;
}

export function validateImportRows(
  parsed: ParsedPasteLine[],
  ctx: ValidateImportContext,
  overrides?: Map<number, Partial<Pick<ImportPreviewRow, 'accountId' | 'personalCategoryId'>>>
): ImportPreviewRow[] {
  const dupSet = buildDuplicateSet(ctx.existingTransactions);
  return parsed.map((line) => {
    const { cells, lineIndex } = line;
    const ov = overrides?.get(lineIndex);
    const messages: { level: 'error' | 'warning'; text: string }[] = [];

    const dateRaw = cells.date || '';
    const dateRes = normalizeDate(dateRaw);
    const normalizedDate = dateRes.ok ? dateRes.ymd : null;
    if (!dateRes.ok) {
      messages.push({ level: 'error', text: dateRes.error });
    }

    const typeNormalized = normalizeIncomeExpense(cells.type || '');
    if (!typeNormalized) {
      messages.push({ level: 'error', text: 'Type must be Income or Expense' });
    }

    const amtRes = parseAmountRaw(cells.amount || '');
    const amountParsed = amtRes.ok ? amtRes.value : null;
    if (!amtRes.ok || amountParsed === null || amountParsed <= 0) {
      messages.push({ level: 'error', text: 'Invalid amount' });
    }

    const note = (cells.note || '').trim();
    const accountRaw = cells.account || '';
    const categoryRaw = cells.category || '';

    const accounts = ctx.bankCashAccounts;
    const catList =
      typeNormalized === 'Income'
        ? ctx.incomeCategories
        : typeNormalized === 'Expense'
          ? ctx.expenseCategories
          : [];

    let accountId = ov?.accountId ?? '';
    let accountSuggestions: { id: string; name: string; score: number }[] = [];
    if (!accountId) {
      const am = matchAccount(accountRaw, accounts);
      accountId = am.id ?? '';
      accountSuggestions = am.suggestions;
      if (!accountId && accountRaw.trim()) {
        messages.push({ level: 'error', text: 'Account not found' });
      } else if (!accountId && !accountRaw.trim()) {
        messages.push({ level: 'error', text: 'Account is required' });
      } else if (accountId && !am.exactOrContains && accountSuggestions.length > 0) {
        messages.push({ level: 'warning', text: 'Account matched by similarity; verify' });
      }
    }

    let personalCategoryId = ov?.personalCategoryId ?? '';
    let categorySuggestions: { id: string; name: string; score: number }[] = [];
    if (typeNormalized) {
      if (!personalCategoryId) {
        const cm = matchCategory(categoryRaw, catList);
        personalCategoryId = cm.id ?? '';
        categorySuggestions = cm.suggestions;
        if (!personalCategoryId && categoryRaw.trim()) {
          messages.push({ level: 'error', text: 'Category not found for this income/expense type' });
        } else if (!personalCategoryId && !categoryRaw.trim()) {
          messages.push({ level: 'error', text: 'Category is required' });
        } else if (personalCategoryId && !cm.exactOrContains) {
          messages.push({ level: 'warning', text: 'Category matched by similarity; verify' });
        }
      }
    }

    if (personalCategoryId && typeNormalized) {
      const allowed = catList.some((c) => c.id === personalCategoryId);
      if (!allowed) {
        messages.push({ level: 'error', text: 'Category does not match income/expense type' });
      }
    }

    let duplicateOfExisting = false;
    if (
      normalizedDate &&
      amountParsed != null &&
      typeNormalized &&
      !messages.some((m) => m.level === 'error')
    ) {
      const signed =
        typeNormalized === 'Expense' ? -Math.abs(amountParsed) : Math.abs(amountParsed);
      const key = duplicateKey(normalizedDate, signed, note);
      if (dupSet.has(key)) {
        duplicateOfExisting = true;
        messages.push({ level: 'warning', text: 'Possible duplicate of existing transaction' });
      }
    }

    const hasError = messages.some((m) => m.level === 'error');
    const hasWarning = messages.some((m) => m.level === 'warning');
    let status: ImportRowStatus = 'valid';
    if (hasError) status = 'error';
    else if (hasWarning) status = 'warning';

    return {
      lineIndex,
      dateRaw,
      normalizedDate,
      accountRaw,
      categoryRaw,
      note,
      amountRaw: cells.amount || '',
      amountParsed,
      typeNormalized,
      accountId,
      personalCategoryId,
      accountSuggestions,
      categorySuggestions,
      messages,
      status,
      duplicateOfExisting,
    };
  });
}

export function rowImportable(r: ImportPreviewRow): boolean {
  return (
    r.status !== 'error' &&
    !!r.normalizedDate &&
    !!r.accountId &&
    !!r.personalCategoryId &&
    r.amountParsed != null &&
    r.amountParsed > 0 &&
    !!r.typeNormalized
  );
}
