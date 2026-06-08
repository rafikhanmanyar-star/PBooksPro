# Ledger Unification Migration Plan

**Project:** PBooksPro — Single Source of Truth (`journal_lines` / `journal_entries`)  
**Date:** June 2026  
**Status:** Phase 1 + reconciliation certification implemented; Phases 2–5 pending

---

## Problem Statement

Financial reports used different data sources:

| Report | Before | After (Phase 1) |
|--------|--------|-----------------|
| Trial Balance | `journal_lines` | `journal_lines` (unchanged) |
| General Ledger | `journal_lines` | `journal_lines` (unchanged) |
| Account Balances | Journal + transaction fallback | **Journal only** |
| Profit & Loss | `transactions` + bills | **Journal-filtered transactions** when `journalLedger` loaded |
| Balance Sheet | `transactions` roll-forward | **Journal balances** when `journalLedger` loaded |

This caused Trial Balance, P&L, and Balance Sheet to never reconcile.

---

## Phase 0 — Prerequisites (REQUIRED before production)

### 0.1 Backfill journal mirrors

```bash
npm run backfill-transaction-journal --prefix backend
```

### 0.2 Verify journal immutability

Migration `062_journal_immutability_triggers.sql` must be applied.

### 0.3 Opening balances

Migration `038_accounts_opening_balance.sql` — set opening balances on Bank/Cash accounts.

---

## Phase 1 — Core Statement Unification (IMPLEMENTED)

See `services/financialEngine/journalLedgerCore.ts`, `services/financialEngine/financialReconciliationEngine.ts`, and reconciliation tests in `tests/ledgerReconciliation.test.ts` + `tests/financialReconciliationEngine.test.ts`.

**Reconciliation Dashboard:** Project Management → Reports → Reconciliation  
**API:** `GET /api/reports/reconciliation/certification`

---

## Phase 2 — Posting Improvements (NEXT)

- Category-aware journal posting (replace clearing account)
- Bill accrual journals at issue date
- Payroll → journal posting

---

## Phase 3 — Remove Legacy Paths

- Remove `trialBalanceFromTransactions.ts` fallback
- Deprecate transaction-based BS engine path

---

## Verification Checklist

- [ ] Trial Balance balanced
- [ ] Balance Sheet `isBalanced === true`
- [ ] `npm run test:trial-balance` passes
- [ ] `npx tsx tests/ledgerReconciliation.test.ts` passes
- [ ] `npm test --prefix backend` passes
