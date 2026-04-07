#!/usr/bin/env node
/**
 * Self-test for financial engine validation (no DB).
 * Run: node scripts/verify-financial-engine.mjs
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadValidation() {
  const path = join(root, 'services/financialEngine/validation.ts');
  const src = readFileSync(path, 'utf8');
  if (!src.includes('export function validateBalanced')) {
    throw new Error('validation.ts missing exports');
  }
}

// Inline copies of pure functions (keep in sync with validation.ts) for CI without TS runner
function roundMoney(n) {
  return Math.round(n * 100) / 100;
}

function sumDebits(lines) {
  return roundMoney(lines.reduce((s, l) => s + roundMoney(l.debitAmount), 0));
}

function sumCredits(lines) {
  return roundMoney(lines.reduce((s, l) => s + roundMoney(l.creditAmount), 0));
}

function validateBalanced(lines) {
  if (!lines || lines.length < 2) return 'A journal entry must have at least two lines.';
  let td = 0;
  let tc = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const d = roundMoney(l.debitAmount);
    const c = roundMoney(l.creditAmount);
    if (d < 0 || c < 0) return `Line ${i + 1}: amounts cannot be negative.`;
    if (d > 0 && c > 0) return `Line ${i + 1}: cannot have both debit and credit.`;
    if (d === 0 && c === 0) return `Line ${i + 1}: must have either debit or credit.`;
    td += d;
    tc += c;
  }
  td = roundMoney(td);
  tc = roundMoney(tc);
  if (Math.abs(td - tc) >= 0.005) {
    return `Unbalanced: debits ${td} vs credits ${tc}`;
  }
  return null;
}

function swapLinesForReversal(lines) {
  return lines.map((l) => ({
    accountId: l.accountId,
    debitAmount: roundMoney(l.creditAmount),
    creditAmount: roundMoney(l.debitAmount),
  }));
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

loadValidation();

console.log('Financial engine self-test (validation only)…');

// Balanced → success
assert(
  validateBalanced([
    { accountId: 'a1', debitAmount: 100, creditAmount: 0 },
    { accountId: 'a2', debitAmount: 0, creditAmount: 100 },
  ]) === null,
  'balanced pair should pass'
);

// Unbalanced → fail
assert(
  validateBalanced([
    { accountId: 'a1', debitAmount: 100, creditAmount: 0 },
    { accountId: 'a2', debitAmount: 0, creditAmount: 99 },
  ]) !== null,
  'unbalanced should fail'
);

// Reversal swap preserves balance
const orig = [
  { accountId: 'cash', debitAmount: 500, creditAmount: 0 },
  { accountId: 'inc', debitAmount: 0, creditAmount: 500 },
];
const rev = swapLinesForReversal(orig);
assert(validateBalanced(rev) === null, 'swapped reversal should balance');
assert(sumDebits(rev) === sumCredits(orig), 'reversal debits match original credits');

// Single line → fail
assert(validateBalanced([{ accountId: 'x', debitAmount: 1, creditAmount: 0 }]) !== null, 'single line should fail');

console.log('OK: all validation checks passed.');
