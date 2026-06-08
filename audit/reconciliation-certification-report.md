# Financial Reconciliation Certification Report

**Generated:** June 2026  
**Scope:** Trial Balance, General Ledger, Profit & Loss, Balance Sheet, Fiscal Close

---

## Report Source Audit

| Report | Primary Source | Unification Status | Notes |
|--------|---------------|-------------------|-------|
| Trial Balance | `journal_lines` | **Unified** | Canonical API: `GET /api/reports/trial-balance` |
| General Ledger | `journal_lines` | **Unified** | Per-account ledger from journal |
| Profit & Loss | Hybrid | **Partial** | Journal-mirrored transactions + category `plSubType` aggregation |
| Balance Sheet | Hybrid | **Partial** | Journal balances; AR/AP from sys accounts; RE from P&L; received assets subledger |
| Fiscal Close | Hybrid | **Partial** | Closing entries from P&L totals |
| Cash Flow | `transactions` | **Legacy** | Not journal-unified |
| Tenant/Client/Vendor Ledgers | Subledger | **Legacy** | Operational AR/AP views — not GL-certified |

---

## Reconciliation Validations

The certification engine (`runFinancialReconciliationCertification`) validates:

1. **Trial Balance Debits = Credits** — from `buildTrialBalanceFromJournal`
2. **Assets = Liabilities + Equity** — from `sumBalanceSheetSectionsFromJournal`
3. **Net Profit = Change in Equity** — period equity delta vs P&L net profit
4. **No missing journal mirrors** — transactions without `journal_entries.source_id`
5. **Balance Sheet engine cross-check** — optional comparison with bundled BS engine

---

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/reports/reconciliation/certification?from=&to=` | Full certification for tenant/period |
| GET | `/api/reports/reconciliation/sources` | Static report source audit |

---

## UI

**Project Management → Reports → Reconciliation** (`ReconciliationDashboard.tsx`)

Displays: status, score, checks, differences, missing journals, report source audit.

---

## Tests

| Suite | Command |
|-------|---------|
| Reconciliation engine (client) | `npm run test:financial-reconciliation` |
| Reconciliation engine (backend) | `npm test --prefix backend` (includes `financialReconciliationEngine.test.ts`) |
| Ledger reconciliation (TB↔BS↔P&L) | `npm run test:ledger-reconciliation` |
| Trial balance core | `npm run test:trial-balance` |

---

## Remaining Gaps

1. **Run journal backfill** — `npm run backfill-transaction-journal --prefix backend` on each tenant before certification passes
2. **Cash Flow** — still transaction-based; not included in certification
3. **P&L category path** — uses mirrored transactions + category aggregation, not pure journal expense/revenue accounts
4. **Balance Sheet received assets** — `project_received_assets` subledger overlay on journal balances
5. **Fiscal close** — closes from P&L engine, not TB tie-out; no pre-close gates
6. **Duplicate TB API** — legacy route on `journalRoutes.ts` should be deprecated
7. **No HTTP integration tests** — certification route not yet covered end-to-end

---

## Certification Workflow

```text
1. Apply migrations 062 (journal immutability), 038 (opening balances)
2. Run backfill-transaction-journal
3. Open Reconciliation Dashboard → select period → Run certification
4. Target: status "reconciled", score ≥ 85, missing journals = 0
```
