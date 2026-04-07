/**
 * Parse pasted spreadsheet text (tab / comma / multi-space) and helpers for personal tx import.
 */

import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';

dayjs.extend(customParseFormat);

export type PasteColumnKey = 'date' | 'account' | 'category' | 'note' | 'amount' | 'type';

export const PASTE_COLUMN_KEYS: PasteColumnKey[] = [
  'date',
  'account',
  'category',
  'note',
  'amount',
  'type',
];

export const FIXED_COLUMN_ORDER: PasteColumnKey[] = [
  'date',
  'account',
  'category',
  'note',
  'amount',
  'type',
];

const DATE_HEADER = new Set(['date', 'txn date', 'transaction date']);
const ACCOUNT_HEADER = new Set(['account', 'bank', 'wallet', 'payment account']);
const CATEGORY_HEADER = new Set(['category', 'cat']);
const NOTE_HEADER = new Set(['note', 'description', 'desc', 'memo', 'details']);
const AMOUNT_HEADER = new Set(['pkr', 'amount', 'value', 'sum', 'amt']);
const TYPE_HEADER = new Set(['type', 'income/expense', 'income or expense', 'dr/cr']);

function normalizeHeaderCell(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Split one line into cells: tab (Excel), else comma, else 2+ spaces. */
export function splitPasteLine(line: string): string[] {
  const t = line.replace(/\u00a0/g, ' ');
  if (t.includes('\t')) {
    return t.split(/\t/).map((c) => c.trim());
  }
  const commaParts = t.split(',');
  if (commaParts.length >= 2) {
    return commaParts.map((c) => c.trim());
  }
  const multi = t.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean);
  if (multi.length >= 2) return multi;
  return t.trim() ? [t.trim()] : [];
}

function scoreHeaderCell(lower: string): Partial<Record<PasteColumnKey, number>> {
  const out: Partial<Record<PasteColumnKey, number>> = {};
  if (DATE_HEADER.has(lower) || lower === 'date') out.date = 10;
  if (ACCOUNT_HEADER.has(lower) || lower.includes('account')) out.account = 10;
  if (CATEGORY_HEADER.has(lower) || lower.includes('categor')) out.category = 10;
  if (NOTE_HEADER.has(lower)) out.note = 10;
  if (AMOUNT_HEADER.has(lower) || lower.endsWith(' pkr')) out.amount = 10;
  if (TYPE_HEADER.has(lower) || lower === 'income' || lower === 'expense') out.type = 10;
  return out;
}

function mapHeaderRow(cells: string[]): Partial<Record<number, PasteColumnKey>> | null {
  if (cells.length < 3) return null;
  const colScores: { col: number; key: PasteColumnKey; score: number }[] = [];
  cells.forEach((cell, col) => {
    const lower = normalizeHeaderCell(cell);
    const partial = scoreHeaderCell(lower);
    (Object.keys(partial) as PasteColumnKey[]).forEach((key) => {
      const sc = partial[key];
      if (sc != null) colScores.push({ col, key, score: sc });
    });
  });
  const bestByKey = new Map<PasteColumnKey, { col: number; score: number }>();
  colScores.forEach(({ col, key, score }) => {
    const prev = bestByKey.get(key);
    if (!prev || score > prev.score) bestByKey.set(key, { col, score });
  });
  if (bestByKey.size < 3) return null;
  const indexToKey: Partial<Record<number, PasteColumnKey>> = {};
  bestByKey.forEach((v, key) => {
    indexToKey[v.col] = key;
  });
  return indexToKey;
}

function rowToKeyedObject(
  cells: string[],
  indexToKey: Partial<Record<number, PasteColumnKey>>
): Record<PasteColumnKey, string> {
  const row: Record<PasteColumnKey, string> = {
    date: '',
    account: '',
    category: '',
    note: '',
    amount: '',
    type: '',
  };
  cells.forEach((val, col) => {
    const key = indexToKey[col];
    if (key) row[key] = val.trim();
  });
  return row;
}

function rowToFixedOrder(cells: string[]): Record<PasteColumnKey, string> {
  const row: Record<PasteColumnKey, string> = {
    date: '',
    account: '',
    category: '',
    note: '',
    amount: '',
    type: '',
  };
  FIXED_COLUMN_ORDER.forEach((key, i) => {
    if (i < cells.length) row[key] = cells[i]?.trim() ?? '';
  });
  return row;
}

export interface ParsedPasteLine {
  lineIndex: number;
  cells: Record<PasteColumnKey, string>;
}

export function parseExcelPaste(text: string): {
  lines: ParsedPasteLine[];
  hasHeader: boolean;
} {
  const rawLines = text.split(/\r?\n/).map((l, i) => ({ line: l, lineIndex: i }));
  const nonEmpty = rawLines.filter(({ line }) => line.trim().length > 0);
  if (nonEmpty.length === 0) return { lines: [], hasHeader: false };

  const firstCells = splitPasteLine(nonEmpty[0].line);
  const headerMap = mapHeaderRow(firstCells);
  let hasHeader = false;
  let dataStart = 0;

  if (headerMap && Object.keys(headerMap).length >= 3) {
    hasHeader = true;
    dataStart = 1;
  }

  const lines: ParsedPasteLine[] = [];
  const slice = nonEmpty.slice(dataStart);
  for (let i = 0; i < slice.length; i++) {
    const { line, lineIndex } = slice[i];
    const cells = splitPasteLine(line);
    if (cells.length === 0) continue;
    const keyed =
      hasHeader && headerMap
        ? rowToKeyedObject(cells, headerMap)
        : rowToFixedOrder(cells);
    lines.push({ lineIndex, cells: keyed });
  }

  return { lines, hasHeader };
}

const DATE_FORMATS = [
  'YYYY-MM-DD',
  'MM/DD/YYYY',
  'M/D/YYYY',
  'DD/MM/YYYY',
  'D/M/YYYY',
  'YYYY/MM/DD',
];

export function normalizeDate(raw: string): { ok: true; ymd: string } | { ok: false; error: string } {
  const s = raw.trim();
  if (!s) return { ok: false, error: 'Invalid date format' };
  for (const f of DATE_FORMATS) {
    const d = dayjs(s, f, true);
    if (d.isValid()) return { ok: true, ymd: d.format('YYYY-MM-DD') };
  }
  return { ok: false, error: 'Invalid date format' };
}

/** Strip thousand separators; parse numeric amount. */
export function parseAmountRaw(raw: string): { ok: true; value: number } | { ok: false } {
  const s = raw.replace(/,/g, '').trim();
  if (s === '') return { ok: false };
  const n = parseFloat(s);
  if (Number.isNaN(n)) return { ok: false };
  return { ok: true, value: n };
}

export function normalizeIncomeExpense(raw: string): 'Income' | 'Expense' | null {
  const t = raw.trim().toLowerCase();
  if (!t) return null;
  if (t === 'income' || t === 'inc' || t === 'i' || t.startsWith('inc')) return 'Income';
  if (t === 'expense' || t === 'exp' || t === 'e' || t.startsWith('exp')) return 'Expense';
  const cap = t.charAt(0).toUpperCase() + t.slice(1);
  if (cap === 'Income' || cap === 'Expense') return cap as 'Income' | 'Expense';
  return null;
}

/** String similarity 0..1 (Dice coefficient on bigrams + exact boost). */
export function similarity(a: string, b: string): number {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.88;

  const bigrams = (s: string) => {
    const g: string[] = [];
    for (let i = 0; i < s.length - 1; i++) g.push(s.slice(i, i + 2));
    return g;
  };
  const bx = bigrams(x);
  const by = bigrams(y);
  if (bx.length === 0 || by.length === 0) return 0;
  const sety = new Map<string, number>();
  by.forEach((g) => sety.set(g, (sety.get(g) ?? 0) + 1));
  let inter = 0;
  bx.forEach((g) => {
    const c = sety.get(g);
    if (c && c > 0) {
      inter++;
      sety.set(g, c - 1);
    }
  });
  return (2 * inter) / (bx.length + by.length);
}

export interface NamedItem {
  id: string;
  name: string;
}

export function findClosestMatches<T extends NamedItem>(
  input: string,
  list: T[],
  limit = 3
): { item: T; score: number }[] {
  if (!input.trim() || list.length === 0) return [];
  return list
    .map((item) => ({
      item,
      score: similarity(input, item.name),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .filter((x) => x.score > 0.12);
}

export function findClosestMatch<T extends NamedItem>(
  input: string,
  list: T[]
): { item: T; score: number } | null {
  const top = findClosestMatches(input, list, 1)[0];
  return top ?? null;
}
