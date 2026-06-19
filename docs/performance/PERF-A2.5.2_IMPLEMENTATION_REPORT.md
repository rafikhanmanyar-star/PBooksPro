# PERF-A2.5.2 — Stable Selector References — Implementation Report

**Task ID:** PERF-A2.5.2  
**Date:** 2026-06-19  
**Spec:** `docs/performance/A2.5_IMPLEMENTATION_SPEC.md` (Task PERF-A2.5.2)  
**Status:** Implementation complete — **awaiting review**

---

## 1. Executive Summary

PERF-A2.5.2 eliminates **58 unstable inline selectors** across the five mandatory hot-path files by introducing module-level `select*` functions in `hooks/appStateSelectors.ts` and migrating call sites to either those stable selectors or existing slice hooks (`useTransactions()`, `useContacts()`, etc.).

**Problem:** `useStateSelector` binds `getSnapshot` to the `selector` function reference. Inline `(s) => s.field` lambdas allocate a new function every parent render, forcing snapshot re-reads even when the underlying slice is unchanged.

**Solution:** Stable module-level selector functions and pre-existing slice hooks share the same referential identity across renders, preserving subscription semantics while reducing redundant `_getAppState()` calls on Header, Global Search, Invoices, lookup maps, and invoice line items.

**Scope compliance:** No synchronization, socket, React Query, reducer, or backend changes. No scope exception required — all work fits the approved mandatory file list.

---

## 2. Files Modified

| File | Action |
|------|--------|
| `hooks/appStateSelectors.ts` | **Created** — 24 stable selector exports |
| `hooks/useSelectiveState.ts` | Re-export `select*` from `appStateSelectors.ts` |
| `components/layout/GlobalSearchBar.tsx` | 13 inline selectors → slice hooks |
| `components/layout/Header.tsx` | 9 inline selectors → 7 slice hooks + 2 stable `select*` |
| `components/invoices/InvoicesPage.tsx` | 12 inline selectors → 11 slice hooks + 1 stable `select*` |
| `components/invoices/InvoiceBillItem.tsx` | 11 inline selectors → 10 slice hooks + 1 stable `select*` |
| `hooks/useLookupMaps.ts` | 13 inline selectors → slice hooks |
| `tests/appStateSelectors.test.ts` | **Created** — selector identity test |

**Not modified (per spec):** `useStateSelector` implementation, RealtimeDispatchHub, socket handlers, entity queue, AppContext reducer, `appStateStore`, React Query config, backend/database.

---

## 3. Selectors Added

**File:** `hooks/appStateSelectors.ts`

| Export | Slice |
|--------|-------|
| `selectAccounts` | `s.accounts` |
| `selectTransactions` | `s.transactions` |
| `selectCategories` | `s.categories` |
| `selectContacts` | `s.contacts` |
| `selectBills` | `s.bills` |
| `selectInvoices` | `s.invoices` |
| `selectVendors` | `s.vendors` |
| `selectProjects` | `s.projects` |
| `selectBuildings` | `s.buildings` |
| `selectProperties` | `s.properties` |
| `selectUnits` | `s.units` |
| `selectContracts` | `s.contracts` |
| `selectRentalAgreements` | `s.rentalAgreements` |
| `selectProjectAgreements` | `s.projectAgreements` |
| `selectCurrentUser` | `s.currentUser` |
| `selectUsers` | `s.users` |
| `selectCurrentPage` | `s.currentPage` |
| `selectInitialTabs` | `s.initialTabs` |
| `selectInstallmentPlans` | `s.installmentPlans` |
| `selectWhatsAppMode` | `s.whatsAppMode` |
| `selectWhatsAppTemplates` | `s.whatsAppTemplates` |
| `selectDefaultProjectId` | `s.defaultProjectId` |
| `selectEnableColorCoding` | `s.enableColorCoding` |
| `selectShowSystemTransactions` | `s.showSystemTransactions` |

All selectors re-exported from `hooks/useSelectiveState.ts` for backward-compatible imports.

---

## 4. Selectors Replaced

### `GlobalSearchBar.tsx` (13 → 0 inline)

| Before | After |
|--------|-------|
| `useStateSelector((s) => s.transactions)` | `useTransactions()` |
| `useStateSelector((s) => s.accounts)` | `useAccounts()` |
| `useStateSelector((s) => s.categories)` | `useCategories()` |
| `useStateSelector((s) => s.contacts)` | `useContacts()` |
| `useStateSelector((s) => s.bills)` | `useBills()` |
| `useStateSelector((s) => s.contracts)` | `useContracts()` |
| `useStateSelector((s) => s.vendors)` | `useVendors()` |
| `useStateSelector((s) => s.projectAgreements)` | `useProjectAgreements()` |
| `useStateSelector((s) => s.rentalAgreements)` | `useRentalAgreements()` |
| `useStateSelector((s) => s.projects)` | `useProjects()` |
| `useStateSelector((s) => s.buildings)` | `useBuildings()` |
| `useStateSelector((s) => s.properties)` | `useProperties()` |
| `useStateSelector((s) => s.units)` | `useUnits()` |

### `Header.tsx` (9 → 0 inline)

| Before | After |
|--------|-------|
| `useStateSelector(s => s.currentUser)` | `useCurrentUser()` |
| `useStateSelector(s => s.contacts)` | `useContacts()` |
| `useStateSelector(s => s.users)` | `useUsers()` |
| `useStateSelector(s => s.installmentPlans)` | `useInstallmentPlans()` |
| `useStateSelector(s => s.projects)` | `useProjects()` |
| `useStateSelector(s => s.units)` | `useUnits()` |
| `useStateSelector(s => s.whatsAppMode)` | `useWhatsAppMode()` |
| `useStateSelector(s => s.currentPage)` | `useStateSelector(selectCurrentPage)` |
| `useStateSelector(s => s.initialTabs)` | `useStateSelector(selectInitialTabs)` |

### `InvoicesPage.tsx` (12 → 0 inline)

| Before | After |
|--------|-------|
| `useStateSelector(s => s.invoices)` | `useInvoices()` |
| `useStateSelector(s => s.contacts)` | `useContacts()` |
| `useStateSelector(s => s.accounts)` | `useAccounts()` |
| `useStateSelector(s => s.transactions)` | `useTransactions()` |
| `useStateSelector(s => s.properties)` | `useProperties()` |
| `useStateSelector(s => s.units)` | `useUnits()` |
| `useStateSelector(s => s.buildings)` | `useBuildings()` |
| `useStateSelector(s => s.projects)` | `useProjects()` |
| `useStateSelector(s => s.projectAgreements)` | `useProjectAgreements()` |
| `useStateSelector(s => s.rentalAgreements)` | `useRentalAgreements()` |
| `useStateSelector(s => s.categories)` | `useCategories()` |
| `useStateSelector(s => s.defaultProjectId)` | `useStateSelector(selectDefaultProjectId)` |

### `InvoiceBillItem.tsx` (11 → 0 inline)

| Before | After |
|--------|-------|
| `useStateSelector(s => s.contacts)` | `useContacts()` |
| `useStateSelector(s => s.projectAgreements)` | `useProjectAgreements()` |
| `useStateSelector(s => s.rentalAgreements)` | `useRentalAgreements()` |
| `useStateSelector(s => s.units)` | `useUnits()` |
| `useStateSelector(s => s.properties)` | `useProperties()` |
| `useStateSelector(s => s.buildings)` | `useBuildings()` |
| `useStateSelector(s => s.projects)` | `useProjects()` |
| `useStateSelector(s => s.whatsAppMode)` | `useWhatsAppMode()` |
| `useStateSelector(s => s.enableColorCoding)` | `useStateSelector(selectEnableColorCoding)` |
| `useStateSelector(s => s.whatsAppTemplates)` | `useWhatsAppTemplates()` |
| `useStateSelector(s => s.invoices)` | `useInvoices()` |

### `useLookupMaps.ts` (13 → 0 inline)

All 13 entity slices migrated to slice hooks: `useAccounts`, `useCategories`, `useContacts`, `useVendors`, `useProjects`, `useBuildings`, `useProperties`, `useInvoices`, `useBills`, `useUnits`, `useContracts`, `useRentalAgreements`, `useProjectAgreements`, `useUsers`.

**Total inline selectors removed:** 58

---

## 5. Remaining Deferred Selectors

Intentionally **not** migrated in A2.5.2 (Tier 2 / separate tasks per spec):

| File | Inline selectors | Reason |
|------|------------------|--------|
| `components/invoices/RentalFinancialGrid.tsx` | 4 | Optional scope — deferred |
| `components/invoices/ProjectFinancialGrid.tsx` | 4 | Optional scope — deferred |
| `components/payouts/BrokerLedger.tsx` | ~4 | Optional scope — deferred |
| `App.tsx` | 2–3 | Optional scope — deferred |
| `components/layout/Footer.tsx` | 1 (`currentPage`) | Outside mandatory list |
| `components/layout/Sidebar.tsx` | 1 (`currentUser`) | Outside mandatory list |
| `components/invoices/InvoiceBillForm.tsx` | Full-state `s => s` | Separate wide-subscription task |
| `components/invoices/InvoiceDetailView.tsx` | Full-state `s => s` | Separate wide-subscription task |
| `components/invoices/ProjectInvoiceDetailView.tsx` | Full-state `s => s` | Separate wide-subscription task |
| `components/bills/BillsPage.tsx` | Full-state `s => s` | Separate wide-subscription task |
| `hooks/useSelectiveState.ts` (internals) | Inline in composite hooks | Out of scope — hook implementation layer |

**Documented exceptions in mandatory files:** Header, InvoicesPage, and InvoiceBillItem retain `useStateSelector(select*)` for fields without dedicated slice hooks (`currentPage`, `initialTabs`, `defaultProjectId`, `enableColorCoding`). These use **stable module-level** selectors, not inline lambdas.

---

## 6. Build Verification

| Check | Command | Result |
|-------|---------|--------|
| Production build | `npm run build` | **PASS** (vite build completed in ~26s) |
| Selector unit test | `npx tsx --test tests/appStateSelectors.test.ts` | **PASS** (1 test, 1 suite) |
| IDE lint (modified files) | Cursor diagnostics | **PASS** — no new linter errors |

**Note:** The project has no standalone `npm run lint` script. TypeScript compilation is validated via the Vite production build.

---

## 7. Functional Verification

Static and structural verification performed (no live browser session in this implementation pass):

| Area | Verification |
|------|--------------|
| **Header** | Imports resolve; `currentUser`, navigation tabs, WhatsApp mode, and notification dependencies unchanged in data source |
| **Global Search** | All 13 entity slices still subscribed via equivalent slice hooks; search index build logic untouched |
| **Invoices page** | All 12 slices + `defaultProjectId` preserved; `activeInvoices` filter unchanged |
| **Lookup maps** | Map construction logic and dependency array unchanged; only subscription source stabilized |
| **Invoice line items** | WhatsApp, color coding, and entity resolution paths unchanged |
| **Navigation** | `selectCurrentPage` / `selectInitialTabs` return same fields as prior inline selectors |

**Recommended manual smoke (reviewer):** Global search navigation, Header notifications, Invoices tree/grid/filter, ledger transaction display.

---

## 8. Synchronization Safety Verification

| System | Changed? | Verification |
|--------|----------|--------------|
| Socket.IO handlers | **No** | No files in socket/realtime paths modified |
| `RealtimeDispatchHub` | **No** | Not touched |
| Entity queue / reducer | **No** | `AppContext` / `appStateStore` unchanged |
| React Query invalidation | **No** | No query key or hook changes |
| `emitEntityEvent` / invalidation paths | **No** | Backend and sync policy files untouched |
| Subscription semantics | **Unchanged** | Same slice fields read; only selector function identity stabilized |

**Conclusion:** Multi-user sync behavior is unchanged. Components still re-render when their subscribed slice reference changes via the existing `useSyncExternalStore` path.

---

## 9. Risk Assessment

| Dimension | Level | Notes |
|-----------|-------|-------|
| Functional regression | **Low** | Same slice access; TypeScript enforces field names |
| Sync / realtime impact | **None** | Read-only subscription path |
| Scope creep | **Low** | Strict adherence to 5 mandatory files + selectors module + test |
| Performance regression | **None expected** | Strictly reduces redundant snapshot reads |

---

## 10. Rollback Procedure

1. Revert commits touching the 8 files listed in Section 2.
2. `hooks/appStateSelectors.ts` can remain without harm if partially reverted.
3. No database migration, API, or env changes to undo.
4. **Estimated rollback time:** < 30 minutes.

---

## 11. Expected Performance Gain

| Metric | Estimate (per spec) |
|--------|---------------------|
| CPU on Header / Search / Invoices parent rerenders | **5–15%** reduction |
| Rerender count | Unchanged (correctness preserved) |
| User-perceived latency | Most noticeable during Global Search typing at large tenant scale |
| Snapshot rebinds per parent render (mandatory files) | **−58** unstable selector allocations eliminated |

**Mechanism:** Each migrated hook instance no longer recreates `getSnapshot` on unrelated parent rerenders, avoiding redundant `_getAppState()` invocations when slice references are stable.

---

## 12. Follow-up Recommendations

1. **A2.5.3 / A2.5.4** — Proceed only after A2.5.2 review approval (per program gate).
2. **Tier 2 selector migration** — Optional files: `RentalFinancialGrid`, `ProjectFinancialGrid`, `BrokerLedger`, `App.tsx`, `Footer`, `Sidebar`.
3. **Full-state selector removal** — `useStateSelector(s => s)` in `BillsPage`, `InvoiceBillForm`, detail views (separate A2.2/A2.4 task).
4. **Optional:** Add `useCurrentPage()` / `useDefaultProjectId()` slice hooks to eliminate remaining `useStateSelector(select*)` in Header and InvoicesPage.
5. **Profiler capture** — Record before/after React Profiler snapshot on Global Search keystrokes at large tenant for quantitative confirmation (T-A2.5.2-06).

---

## Pre-Implementation Scope Confirmation

| Gate | Result |
|------|--------|
| Mandatory file list matches spec | **Yes** — 5 files + `appStateSelectors.ts` + test |
| Top 20 hot selectors addressed in Tier 1 files | **Yes** — transactions, contacts, invoices, bills, accounts, categories, projects, units, buildings, properties, vendors, agreements, contracts, currentUser, users, currentPage, installmentPlans, whatsAppMode covered |
| Additional files required? | **No** — `PERF-A2.5.2_SCOPE_EXCEPTION.md` not needed |

---

**STOP:** A2.5.3, A2.5.4, A2.1, A2.2, A2.3, A2.4 not started. Awaiting review and approval.
