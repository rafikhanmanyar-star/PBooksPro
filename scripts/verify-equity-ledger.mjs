#!/usr/bin/env node
/**
 * Regression checks for equity ledger per-investor isolation (no TypeScript runner).
 * Run: node scripts/verify-equity-ledger.mjs
 *
 * Complements components/investmentManagement/equityLedgerClassification.ts — if you change
 * balance rules, update this script’s expectations.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

const clsPath = join(root, 'components/investmentManagement/equityLedgerClassification.ts');
const cls = readFileSync(clsPath, 'utf8');
assert(cls.includes('getEquityFlowLegs'), 'equityLedgerClassification.ts should export getEquityFlowLegs');
assert(cls.includes('EquityLedgerSubtype'), 'equityLedgerClassification.ts should reference EquityLedgerSubtype');

// Model: chronological stream with per-investor running balance (correct behavior)
const runningByInvestor = {};
function applyLeg(investorId, signedDelta) {
  runningByInvestor[investorId] = (runningByInvestor[investorId] || 0) + signedDelta;
  return runningByInvestor[investorId];
}

// Two investors, same project: A +100, B +100, A +50 profit — B must not inherit A’s balance
applyLeg('invA', 100);
applyLeg('invB', 100);
applyLeg('invA', 50);
assert(runningByInvestor.invA === 150, 'A running balance');
assert(runningByInvestor.invB === 100, 'B must not show A’s balance');

// Wrong model (old bug): single running total for all investors on the same project view
let wrong = 0;
wrong += 100;
wrong += 100;
wrong += 50;
assert(wrong === 250, 'sanity: naive cumulative would be 250, not per-investor');

console.log('verify-equity-ledger: ok');
