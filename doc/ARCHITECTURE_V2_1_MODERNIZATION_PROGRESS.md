# PBooksPro Architecture v2.1 Modernization & Agent Compliance — Progress

**Last updated:** 2026-06-15  
**Production release:** `v1.2.391` (SQLite removal + staging regressions through Phase 6)  
**Canonical rules:** [`ARCHITECTURE_V2_AGENT_RULES.md`](ARCHITECTURE_V2_AGENT_RULES.md) · [`ARCHITECTURE.md`](ARCHITECTURE.md)

---

## Summary

| Track | Scope | Status |
|-------|--------|--------|
| **A — Documentation & agent compliance** | Phases 1–8 from modernization brief | ✅ Complete |
| **B — Client SQLite removal** | Code Phases 1–6 (`SQLITE_REMOVAL.md`) | ✅ Complete |
| **C — Staging desktop hardening** | Smoke-test regressions | ✅ Fixed |
| **D — Post-removal verification** | Automated + staging smoke test | ✅ Complete (2026-06-15) |
| **E — Strangler & real-time** | Flat-service retirement, emit audit gaps | 🔄 **E.2 active** — E.1 ✅ E.3 ✅; multi-user spot tests while staging |
| **F — Post-launch deferred** | RLS, BullMQ, esbuild bundle retirement | 📋 Deferred |

---

## Track A — Documentation & Agent Compliance (Phases 1–8)

Original modernization brief deliverables:

| Phase | Deliverable | Status | Evidence |
|-------|-------------|--------|----------|
| 1 | Remove SQLite as active runtime mode from architecture docs | ✅ | `doc/ARCHITECTURE.md` § Runtime Architecture |
| 2 | PostgreSQL-only database standard | ✅ | `ARCHITECTURE.md` § Database Standard |
| 3 | Architecture enforcement rules for agents | ✅ | `ARCHITECTURE_V2_AGENT_RULES.md` §1, `.cursor/rules/architecture-v2-agent-compliance.mdc` |
| 4 | Financial reporting protection rules | ✅ | `ARCHITECTURE.md` § Financial Reporting Rules |
| 5 | Construction & real estate domain rules | ✅ | `ARCHITECTURE.md` § Core Business Domains |
| 6 | Architecture compliance checklist | ✅ | `ARCHITECTURE.md` + agent rules §14 (32 items incl. Real-Time First) |
| 7 | Approved runtime architecture (Desktop + Cloud + Backend) | ✅ | `ARCHITECTURE.md` §1, `architecture-overview.mdc` |
| 8 | Mark legacy SQLite components `@deprecated` | ✅ | Electron gates, `config/apiUrl.ts`, `doc/SQLITE_REMOVAL.md` |

**Also completed:** Real-Time First mandatory rules (mutation → audit → `emitEntityEvent()` → socket → React Query invalidation).

---

## Track B — Client SQLite Removal (Code Phases 1–6)

Detail: [`SQLITE_REMOVAL.md`](SQLITE_REMOVAL.md)

| Phase | Summary | Status |
|-------|---------|--------|
| 1 | API client default; Electron SQLite gated | ✅ |
| 2 | `services/database/` → legacy path; shared constants extracted | ✅ |
| 3 | Legacy npm scripts → `tools/legacy/`; session context for API | ✅ |
| 4 | Delete `services/legacy-sqlite/`; stubs + `isLocalOnlyMode()` always false | ✅ |
| 5 | Collapse offline branches (~140 files); remove `better-sqlite3` | ✅ |
| 6 | Delete `importService.ts`, stubs, Vite alias/plugin, loader | ✅ |

**Client bundle:** No `databaseService`, `vendor-db`, or `sql.js` chunks in API-mode Vite build.

**Intentionally retained (not in client bundle):**

- `tools/legacy/*` — one-off migration scripts (`sql.js` in dev only)
- `importSchemas.ts` + `importValidator.ts` — client Excel validation (API import wizard persists via backend)
- Deprecated no-ops: `isLocalOnlyMode()`, `setSessionDataSource()` in `config/apiUrl.ts`

---

## Track C — Staging Desktop Regressions (fixed)

Found during `npm run test:staging` (2026-06-15):

| Issue | Fix |
|-------|-----|
| `ReferenceError: logger is not defined` in `AppContext` on API load | Restored `import { logger } from '../services/logger'` |
| Project P&L report crash (`reading 'issues'`) | `report = serverReport ?? clientReport`; safe `validation?.issues` |
| Import wizard copy still said “local database” | Updated to PostgreSQL/API wording |

---

## Track D — Post-removal verification ✅ (2026-06-15)

### Automated (`scripts/verify-api-client-phase6.ps1`)

```powershell
npm run verify:api-client:phase6
```

| Check | Result |
|-------|--------|
| `npm run build:backend` | Pass |
| `npm run build` | Pass |
| `npm run test:date-only` | 4/4 pass |
| No `legacy-sqlite` / sql.js stub strings in `dist/assets` | Pass |
| Phase 6 deleted files absent | Pass |
| `AppContext` `logger` import | Pass |
| `ProjectProfitLossReport` report assignment | Pass |
| `MarketingPage` `usersForApproval` + API org users | Pass (restored from pre–Phase 5) |

### Staging desktop smoke test (`npm run test:staging`)

| Check | Result |
|-------|--------|
| Stack starts (API :3001, Electron client) | Pass |
| No `logger is not defined` on API load | Pass (after fix) |
| `usersForApproval is not defined` (Marketing / Project Selling) | Fixed — `MarketingPage.tsx` restored |

### Regressions fixed during Track D

1. **`AppContext.tsx`** — missing `logger` import
2. **`ProjectProfitLossReport.tsx`** — `report = !clientReport` typo
3. **`MarketingPage.tsx`** — Phase 5 bulk pass removed approval/org-user logic; restored from `650274d3`, API-only

### Manual spot-check (recommended after push)

- [ ] Reports → Project Profit & Loss
- [ ] Settings → Import/Export wizard
- [ ] Project Selling → Marketing (installment plan approval flow)

---

## Track E — Strangler & real-time (in progress)

### E.1 — Real-time emit gaps & client sync ✅ (2026-06-15)

| Item | Change |
|------|--------|
| **P2 — `dataManagementRoutes` emit** | `emitEntityEvent('settings', { bulkRefresh })` after clear-transactions and factory-reset |
| **Client bulk refresh** | `AppContext` + `entityQueryInvalidation` — immediate full API reload + broad React Query invalidation on `bulkRefresh` (all sessions/tabs) |
| **Marketing multi-user** | Remote patches for `installment_plan` and `plan_amenity` in `AppContext` (server already emitted) |
| **Selling analytics** | `installment_plan` / `plan_amenity` added to `SELLING_ANALYTICS_ENTITY_TYPES` |

**Files:** `dataManagementRoutes.ts`, `context/AppContext.tsx`, `services/realtime/entityQueryInvalidation.ts`, `doc/REALTIME_EMIT_AUDIT.md`

### E.2 — Multi-user spot tests ← **current step**

Run after push to `staging` and `npm run test:staging` (API :3001 + Staging Client). Use **two sessions** (two Electron windows, or Electron + browser with `VITE_LOCAL_ONLY=false`) logged into the **same tenant** as different users.

**Preflight (automated):**

```powershell
npm run verify:realtime:track-e
npm run test:staging
```

| # | Domain | User A | User B (no manual refresh) | Pass? |
|---|--------|--------|----------------------------|-------|
| 1 | Project Selling → Marketing | Edit or approve an installment plan | Plan list / detail updates | [ ] |
| 2 | Settings → Data management | Clear transactions (or factory reset on test tenant) | Dashboard + lists reload via `settings` bulkRefresh | [ ] |
| 3 | Vendors → Bills | Post payment or vendor bill advance settlement | Bill list / balance updates | [ ] |
| 4 | Customers → Invoices | Record invoice payment | Invoice list updates | [ ] |
| 5 | **Batch 12 regression** | Accounting → Close accounting period | Period status visible on B | [ ] |
| 6 | **Batch 12 regression** | Vendors → Contractor advance + bill | Contractor bill appears for B | [ ] |
| 7 | **Track D carry-over** | Reports → Project P&L | N/A (single user) — no crash | [ ] |
| 8 | **Track D carry-over** | Settings → Import/Export wizard | Opens; copy references API/PostgreSQL | [ ] |

**What to watch:** Browser/Electron devtools console — no WebSocket errors; no stale lists after ~2s.

**When all rows pass:** mark Track E ✅ in this doc and proceed to release (`npm run release:staging` already done if pushed) or production merge when ready.

| Domain | Test | Automated check |
|--------|------|-----------------|
| Project Selling → Marketing | User A approves/edits installment plan → User B sees update without refresh | `npm run verify:realtime:track-e` (static) |
| Settings → Clear transactions | User A clears → User B dashboard/lists reload | Same script + manual two-client test |
| Bills / Invoices | User A posts payment → User B list updates (existing patch path) | Manual |

```powershell
npm run verify:realtime:track-e
```

### E.3 — Strangler shim retirement ✅ (2026-06-15)

| Item | Change |
|------|--------|
| **Project-selling services** | `installmentPlansService` + `planAmenitiesService` moved to `modules/project-selling/services/` |
| **Record locks** | `recordLocksService` moved to `modules/accounting/services/` |
| **Accounting CRUD** | `accountsService` + `categoriesService` moved to `modules/accounting/services/` |
| **Project-selling CRUD** | `budgetsService`, `pmCycleAllocationsService`, `projectAgreementsService` → `modules/project-selling/services/` |
| **Vendors** | `contractsService` → `modules/vendors/services/` (routes in project-selling import cross-module) |
| **Accounting periods** | `accountingPeriodService` → `modules/accounting/services/` (`FinancialPostingService`, `JournalRepository` use module path) |
| **Financial core (batch 4)** | `billsService` → vendors; `invoicesService` → customers; `transactionsService` → accounting |
| **Journal posting (batch 5)** | `billJournalPostingService`, `invoiceJournalPostingService`, `transactionJournalPostingService` → `modules/accounting/services/` |
| **Journal core + backfill (batch 6)** | `journalService`, `pevJournalPostingService`, `billJournalBackfillService`, `invoiceJournalBackfillService`, `transactionJournalBackfillService` → `modules/accounting/services/` |
| **Ledger load + state sync (batch 7)** | `journalLedgerLoadService`, `journalDimensionsBackfillService` → accounting; `stateChangesService`, `appStateBulkService` → `modules/app-settings/services/` |
| **Reports + bulk mutation (batch 8)** | Core GL reports → accounting; lease ledger reports → leases; vendor/client ledgers → vendors/customers; `pevReportService` → project-expense; `appStateBulkMutationService` → app-settings |
| **Domain CRUD (batch 9)** | `contactsService` → crm; `buildingsService`/`propertiesService`/`unitsService` → properties; `vendorsService`/`quotationsService` → vendors; `rentalAgreementsService` → leases; `projectsService`/`projectReceivedAssetsService`/`salesReturnsService` → project-selling; `financialReconciliationService` → accounting |
| **Settings, sync, payroll (batch 10)** | `appSettingsService` → app-settings; `changeLogService` → organization; `transactionLogService` → accounting; personal finance services → personal-finance; `payrollService` (+ payroll subfolder) → payroll; `recurringInvoiceTemplatesService` → customers; `reportScheduleScheduler` → reporting |
| **Infra + domain (batch 11)** | `payrollLedgerService` → payroll; `personalTasksService` → personal-finance; `projectExpenseVoucherService`/`projectExpenseCategoryService` → project-expense; `tenantBootstrap`/`tenantDataManagementService`/`syncQueueService`/`presenceService` → organization; backup services → backup module |
| **Vendor billing + fiscal (batch 12 — final domain batch)** | Contractor billing + vendor bill advance settlement stack, `contractRetentionService`, quotation intelligence/validation → vendors; `fiscalPeriodCloseService` + `investorJournalPostingService` → accounting; `enterpriseAuditService` + `systemFeatureService` → organization; `ownerRentalSummaryService` + `rentalBillsDashboardService` → leases; `services/backup/*` → `modules/backup/services/backup/`; `services/dr/*` → `modules/dr/services/dr/` |
| **Flat shims** | Corresponding `backend/src/services/*.ts` files re-export only |
| **Module imports** | Routes and repositories import from module `services/` layer |

**E.3 domain service migration:** complete for tenant-facing modules (batches 3–12). **Intentional flat exceptions:** platform subfolders (`services/auth/`, `services/billing/`, `services/dashboard/`, etc.), one-off scripts (`pmCycleResetService`), and middleware that may still import via shims.

---

## Track E — After E.2 (backlog)

| Priority | Item | Notes |
|----------|------|-------|
| — | Mark Track E complete | When E.2 checklist passes |
| P4 | Retire esbuild report `.mjs` bundles → `shared/report-engines` | Track F — `ARCHITECTURE_V2_POST_LAUNCH.md` |
| P5 | PostgreSQL RLS, BullMQ schedulers | Track F — on request only |
| Optional | Platform flat services (`services/billing/*`, `services/auth/*`, …) | Separate strangler pass; not required for v2.1 launch scope |

---

## Track E — Next step (backlog) — superseded by § E.1–E.3 above

<details>
<summary>Original backlog table (archived)</summary>

| Priority | Item | Doc / owner |
|----------|------|-------------|
| P1 | Multi-user real-time spot tests per domain | `REALTIME_EMIT_AUDIT.md` |
| P2 | Remaining emit gaps (e.g. bulk import completion event) | `REALTIME_EMIT_AUDIT.md` § Gaps |
| P3 | Retire flat `backend/src/services/*` delegation shims where module services are complete | `ARCHITECTURE.md` § Strangler |
| P4 | Retire esbuild report `.mjs` bundles → direct `shared/report-engines` imports | `ARCHITECTURE_V2_POST_LAUNCH.md` |
| P5 | PostgreSQL RLS, BullMQ schedulers | `ARCHITECTURE_V2_POST_LAUNCH.md` |

</details>

---

## Track F — Post-launch (explicitly deferred)

See [`ARCHITECTURE_V2_POST_LAUNCH.md`](ARCHITECTURE_V2_POST_LAUNCH.md). Implement only when requested.

---

## Agent compliance — current state

Agents **must**:

- Use `backend/src/modules/<domain>/` for new backend features
- Route GL writes through `FinancialPostingService`
- Use `/api/v1` only (no `/api` alias)
- Emit `emitEntityEvent()` after tenant mutations
- Keep calculations in `shared/financial-core/` and `shared/report-engines/`
- **Reject** new SQLite, flat routes/services, or duplicate report math

Agents **must not** reintroduce:

- `services/legacy-sqlite*` or Vite stub aliases (removed Phase 6)
- `services/importService.ts` local SQLite import path (deleted Phase 6)
- Offline `isLocalOnlyMode()` branches (collapsed Phase 5)

---

## Related documents

| Document | Purpose |
|----------|---------|
| [`SQLITE_REMOVAL.md`](SQLITE_REMOVAL.md) | Code removal phases 1–6 log |
| [`LOCAL_ONLY_IMPORTS.md`](LOCAL_ONLY_IMPORTS.md) | Post–Phase 6 import/data paths |
| [`REALTIME_EMIT_AUDIT.md`](REALTIME_EMIT_AUDIT.md) | Socket emit coverage |
| [`ARCHITECTURE_V2_POST_LAUNCH.md`](ARCHITECTURE_V2_POST_LAUNCH.md) | Deferred hardening |
| [`.cursor/plans/architecture_v2_migration_fc203718.plan.md`](../.cursor/plans/architecture_v2_migration_fc203718.plan.md) | v2.0 strangler migration (launch scope ✅) |
