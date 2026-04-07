import type { JournalLineInput } from './types';

export const MONEY_EPSILON = 0.005;

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function sumDebits(lines: JournalLineInput[]): number {
  return roundMoney(lines.reduce((s, l) => s + roundMoney(l.debitAmount), 0));
}

export function sumCredits(lines: JournalLineInput[]): number {
  return roundMoney(lines.reduce((s, l) => s + roundMoney(l.creditAmount), 0));
}

export function isBalanced(lines: JournalLineInput[]): boolean {
  return Math.abs(sumDebits(lines) - sumCredits(lines)) < MONEY_EPSILON;
}

/**
 * Validates each line has exactly one non-zero side and no negatives.
 */
export function validateLineShapes(lines: JournalLineInput[]): string | null {
  if (!lines || lines.length < 2) {
    return 'A journal entry must have at least two lines.';
  }
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const d = roundMoney(l.debitAmount);
    const c = roundMoney(l.creditAmount);
    if (d < 0 || c < 0) return `Line ${i + 1}: amounts cannot be negative.`;
    if (d > 0 && c > 0) return `Line ${i + 1}: cannot have both debit and credit.`;
    if (d === 0 && c === 0) return `Line ${i + 1}: must have either debit or credit.`;
  }
  return null;
}

export function validateBalanced(lines: JournalLineInput[]): string | null {
  const shape = validateLineShapes(lines);
  if (shape) return shape;
  if (!isBalanced(lines)) {
    return `Debits (${sumDebits(lines).toFixed(2)}) must equal credits (${sumCredits(lines).toFixed(2)}).`;
  }
  return null;
}

/** Swap debit/credit for reversal lines. */
export function swapLinesForReversal(lines: JournalLineInput[]): JournalLineInput[] {
  return lines.map((l) => ({
    accountId: l.accountId,
    debitAmount: roundMoney(l.creditAmount),
    creditAmount: roundMoney(l.debitAmount),
  }));
}
