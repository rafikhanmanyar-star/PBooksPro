# PBooksPro React Rendering Performance Audit (V1)

**Date:** 2026-06-19  
**Scope:** Frontend (`components/`, `hooks/`, `modules/`, `context/`, `stores/`, `App.tsx`)  
**Stack:** React · TypeScript · Vite · Zustand · React Query · Socket.IO · Electron  
**Method:** Static analysis only — no code changes.

---

## 1. Executive Summary

PBooksPro has already undergone meaningful performance work: `useAppContext()` is fully migrated to `appStateStore` + `useSyncExternalStore` selectors, major financial grids use `react-window`, and React Query has tiered cache defaults. The remaining risk is not “React is slow” in the abstract — it is **scale + architecture coupling**:

| Area | Status | Primary risk |
|------|--------|--------------|
| Global state | Migrated to selective subscriptions | Wide composite hooks still mirror old monolithic context |
| Context | 23 nested providers | Auth (~85), Notification (~115), KPI (accounts/categories coupling) |
| Zustand | Mostly correct selectors | 3 full-store subscriptions |
| Tables | Mixed | **7 CRITICAL** surfaces render 100–5000 DOM rows without virtualization |
| React Query | ~61 queries, 0 infinite queries | Full-list fetches (PO/GRN), 7× AppState-derived query recomputes |
| App shell | Persistent page groups | Up to 4 hidden page trees stay mounted with live subscriptions |

**Overall assessment:** Medium–high performance debt for large tenants (10k+ transactions, 500+ contacts/vendors). Acceptable for small datasets. Biggest wins are table virtualization gaps, narrowing hot-path subscriptions, and fixing misleading “pagination” on the ledger.

---

## 2. Critical Findings

### C1 — Full transaction array in memory + filter on every keystroke

| | |
|---|---|
| **File** | `hooks/usePaginatedTransactions.ts`, `components/transactions/EnhancedLedgerPage.tsx` |
| **Component** | `EnhancedLedgerPage` |
| **Root cause** | `usePaginatedTransactions` returns **all** `state.transactions`; `loadMore` is a no-op, `hasMore: false`. In API mode, `isUsingNative` is always false → ledger always uses `transactionsFromStore`. |
| **Impact** | **CRITICAL** for 5k–50k tx tenants: O(n) filter/sort/group on every debounced search, filter change, and socket patch. |
| **Fix** | Server-side paginated `/transactions` query + virtual scroll window; keep full scan only for explicit export. |

### C2 — Payroll employee ledger renders up to 5,000 DOM rows

| | |
|---|---|
| **File** | `components/payroll/PayrollHub.tsx` |
| **Component** | Employee ledger tab |
| **Root cause** | API fetch `limit: 5000`; full `<tbody>` `.map()` with no virtualization |
| **Impact** | **CRITICAL** — multi-second paint, scroll jank, high memory |
| **Fix** | `react-window` or SmartTable; server pagination with virtual window |

### C3 — ContactsPage & BillsPage render 200 rows without virtualization

| | |
|---|---|
| **Files** | `components/contacts/ContactsPage.tsx`, `components/bills/BillsPage.tsx` |
| **Root cause** | `displayLimit=200` initial cap, full `<table>` `.map()`, “load more” +200 |
| **Impact** | **CRITICAL** — 200+ DOM rows × many columns; rerenders on any subscribed slice change |
| **Fix** | SmartTable (auto-virtualizes >60) or dedicated virtual table; reduce initial cap to 50 |

### C4 — Per-row components subscribe to 10+ global slices

| | |
|---|---|
| **File** | `components/invoices/InvoiceBillItem.tsx` |
| **Component** | `InvoiceBillItem` (memoized export, but self-subscribes) |
| **Root cause** | 11× `useStateSelector` per row + `useLookupMaps()` (13 more subscriptions). `React.memo` does not block hook-driven rerenders. |
| **Impact** | **CRITICAL** in list/card views — any invoice/contact/category mutation rerenders **every** visible item |
| **Fix** | Container/presenter split: parent passes resolved display props; row is pure + memo |

### C5 — AppProvider + socket sync notifies all selective subscribers

| | |
|---|---|
| **File** | `context/AppContext.tsx`, `context/appStateStore.ts` |
| **Root cause** | Every dispatch updates `_appState` and `_notifyStateListeners()` runs after **every** provider render. Multi-user socket events patch entities frequently. |
| **Impact** | **CRITICAL** at scale — fan-out to ~200+ hook subscriptions per entity event |
| **Fix** | Structural sharing / slice-level notify; batch socket patches; debounce (partially exists) |

### C6 — Persistent hidden page groups stay mounted

| | |
|---|---|
| **File** | `App.tsx` (`MAX_PERSISTENT_PAGES = 3`, RENTAL pinned) |
| **Root cause** | Visited page groups stay mounted (`opacity-0`, `pointer-events-none`) to preserve UI state |
| **Impact** | **CRITICAL** — inactive Ledger/Invoices/Vendors pages keep subscriptions, effects, and React Query polling alive |
| **Fix** | Unmount after idle timeout; or suspend subscriptions when `!isActive` via `usePageActive()` gate |

### C7 — Owner balances rollup: 12,000-row query

| | |
|---|---|
| **File** | `hooks/queries/useRentalRollupQueries.ts` |
| **Root cause** | `GET /rental/owner-balances?limit=12000` cached 120s |
| **Impact** | **CRITICAL** payload + JSON parse + downstream renders |
| **Fix** | Paginated API + incremental rollup; or compute server-side with summary-only client cache |

---

## 3. High Findings

### H1 — Header subscribes to 9 AppState slices + always mounted

| | |
|---|---|
| **File** | `components/layout/Header.tsx` |
| **Root cause** | Subscribes to contacts, users, projects, units, installmentPlans, etc.; polls tasks/notifications; Socket listeners |
| **Impact** | **HIGH** — rerenders on unrelated entity changes across the whole app chrome |
| **Fix** | Narrow to `currentPage`, `currentUser`; lazy-load notification data; split chrome into memoized islands |

### H2 — GlobalSearchBar: 13 slice subscriptions when search open

| | |
|---|---|
| **File** | `components/layout/GlobalSearchBar.tsx` |
| **Root cause** | Subscribes to transactions, accounts, categories, contacts, bills, contracts, vendors, agreements, projects, buildings, properties, units |
| **Impact** | **HIGH** — any mutation in any entity rebuilds search index via `buildSearchRows` |
| **Fix** | Mount search index builder only when focused; Web Worker for index; server-side search API |

### H3 — `useLookupMaps()` — 13 subscriptions, full map rebuild

| | |
|---|---|
| **File** | `hooks/useLookupMaps.ts` |
| **Consumers** | `EnhancedLedgerPage`, `InvoiceBillItem`, many reports |
| **Root cause** | Rebuilds 13 Maps in `useMemo` when **any** underlying slice changes |
| **Impact** | **HIGH** — O(n) per entity type on every tx/invoice/bill patch |
| **Fix** | Per-entity memoized maps at store level; or pass maps from parent once per page |

### H4 — KPIContext rebuilds on every accounts/categories change

| | |
|---|---|
| **File** | `context/KPIContext.tsx` |
| **Root cause** | `useAccounts()` + `useCategories()` → rebuilds `allKpis` (dynamic KPI per bank account + every category) even when panel closed |
| **Impact** | **HIGH** — 8 consumers rerender on chart-of-accounts edits |
| **Fix** | Lazy-build `allKpis` when panel opens; cache KPI definitions by fingerprint |

### H5 — `useFinancialReportAppState` / `useFullAppState` (~90+ consumers)

| | |
|---|---|
| **File** | `hooks/useSelectiveState.ts` |
| **Root cause** | Composite hooks subscribe to 10–40 slices; return full `_getAppState()` |
| **Impact** | **HIGH** — report modals/pages rerender on any financial entity change |
| **Fix** | Report-specific narrow hooks; compute in `shared/report-engines` with memoized inputs |

### H6 — AuthContext (~85 consumers)

| | |
|---|---|
| **File** | `context/AuthContext.tsx` |
| **Root cause** | Single context for session + loading + MFA + company selection |
| **Impact** | **HIGH** — `isLoading` / `isInitializing` toggles rerender large subtree |
| **Fix** | Split session vs actions; selector pattern like Zustand |

### H7 — Full-list React Query fetches

| | |
|---|---|
| **Files** | `hooks/usePurchaseOrders.ts`, `hooks/useGoodsReceipts.ts`, `hooks/useWorkflow.ts` |
| **Root cause** | No server pagination; 30s–2m stale + refetch |
| **Impact** | **HIGH** — large JSON payloads; `GoodsReceiptsPage` runs PO + GRN lists together |
| **Fix** | Paginated API + `useInfiniteQuery`; summary widgets separate from detail lists |

### H8 — Investor Fund Availability: 7 parallel AppState-derived queries

| | |
|---|---|
| **File** | `modules/investor-fund-availability/hooks/useInvestorFundAvailability.ts` |
| **Root cause** | Each query keys on `getPersistableStateFingerprint(state)`; full recompute on any sync |
| **Impact** | **HIGH** — 7× CPU-heavy passes over all projects/transactions |
| **Fix** | Single derived query + selector output; or server-side analytics endpoint |

### H9 — BrokerLedger & VendorLedger: no virtualization

| | |
|---|---|
| **Files** | `components/payouts/BrokerLedger.tsx`, `components/vendors/VendorLedger.tsx` |
| **Impact** | **HIGH** — full ledger `.map()` (contrast: `OwnerLedger` uses react-window) |
| **Fix** | Reuse `OwnerLedger` virtual pattern |

### H10 — Unstable inline selectors in `useStateSelector`

| | |
|---|---|
| **Pattern** | `useStateSelector((s) => s.transactions)` — ~130+ call sites |
| **Root cause** | Selector function identity changes every render → `useCallback` in hook recreates `getSnapshot` |
| **Impact** | **HIGH** (CPU) — extra snapshot reads on parent rerenders; mitigated by reference-stable slice arrays |
| **Fix** | Stable selector refs: `const selectTx = (s: AppState) => s.transactions` at module scope, or `useStateSelector(useCallback(...))` |

---

## 4. Medium Findings

### M1 — NotificationContext imported in ~115 files

Wide coupling; value stable during toasts but `enableBeepOnSave` pref change recreates all callbacks. Consider toast API via ref/imperative module.

### M2 — WhatsAppContext (~37 consumers, no `useMemo` on value)

New object each render; most only call `openChat`. Add value memoization.

### M3 — ProgressContext (5 consumers, no value memo)

Progress ticks during import/export rerender all 5 consumers. Split actions vs state.

### M4 — ViewportContext resize events

Window resize rerenders layout consumers. Acceptable but consider CSS-only breakpoints where possible.

### M5 — PrintContext (~45 consumers)

Rare updates; many imports for `print()` only. Low frequency but wide tree.

### M6 — Inline arrow handlers in list rows (widespread)

Examples: `InvoiceBillItem` `onClick={(e) => stopPropagationAndDo(e, ...)}`, `RentalFinancialGrid` (25 inline patterns). Breaks memoization of child buttons.

### M7 — Inline `style={{}}` objects

`App.tsx` persistent pages, virtual tables, charts — new object references each render. Minor unless inside large lists.

### M8 — `InvoicesPage` heavy derived state

Large `useMemo` chains for tree building, payment maps, filtered records — recalculates on many slice changes. Grid is virtualized; tree sidebar is not.

### M9 — Duplicate `/users` React Query keys

`['reports','orgUsers']` vs `['orgUsersForShare']` — duplicate network/cache.

### M10 — Analytics modules: 120s polling each

7 analytics modules with `refetchInterval: 120s` — multiplied if user opens multiple analytics tabs.

### M11 — SmartTable virtualizes only above 60 rows

45–99 row tables (AllBillsTable threshold 45) still full DOM. Threshold gap.

### M12 — `useInvoicesApiListQuery` defined but never used

Dead code path suggesting incomplete migration to query-based invoice lists.

---

## 5. Low Findings

| Finding | Location | Notes |
|---------|----------|-------|
| ThemeContext | 5 consumers | Rare updates, outermost — fine |
| LicenseContext | 4 consumers | Session-scoped |
| SystemContext | ~6 consumers | Once per login |
| SpellCheckerContext | 0 consumers | Provider overhead only |
| OfflineContext | 2 consumers | Mostly stubs in API mode |
| PWAContext | 2 consumers | Event-driven, infrequent |
| PayrollContext | 3 consumers | Scoped subtree |
| KeyboardContext | 2 consumers | Low churn |
| Domain hooks unused | `context/domains/*.ts` | Good pattern, ~1 adopter |
| React.memo adoption | ~45 files | Good on `TransactionItem`, grids, layout chrome; inconsistent on list rows |
| Lazy routes + Suspense | `App.tsx` | Good code-splitting |
| `useTransition` for nav/filter | `App.tsx`, `GlobalSearchBar`, `EnhancedLedgerPage` | Good INP pattern |
| `useDevRenderCount` | Ledger | Dev profiling hook exists |

---

## Phase 1 — Component Render Audit (Representative Findings)

| File | Component | Root cause | Impact | Recommended fix |
|------|-----------|------------|--------|-----------------|
| `InvoiceBillItem.tsx` | `InvoiceBillItem` | 11 hooks + lookup maps per row | CRITICAL | Presentational row + container |
| `EnhancedLedgerPage.tsx` | `EnhancedLedgerPage` | Full tx array + lookup maps + filter memo | CRITICAL | True pagination + narrow deps |
| `Header.tsx` | `Header` | 9 slices + polling + socket | HIGH | Slice isolation |
| `GlobalSearchBar.tsx` | `GlobalSearchBar` | 13 slices, index rebuild | HIGH | Lazy mount / worker |
| `InvoicesPage.tsx` | `InvoicesPage` | Tree build + 12 selectors | HIGH | Memoize tree; virtualize sidebar |
| `ContactsPage.tsx` | Contacts table | 200 rows, no virtual | CRITICAL | SmartTable |
| `BillsPage.tsx` | Bills table | 200 rows, no virtual | CRITICAL | SmartTable |
| `PayrollHub.tsx` | Employee ledger | 5000 row map | CRITICAL | Virtualize |
| `BrokerLedger.tsx` | `BrokerLedger` | Full map | HIGH | react-window |
| `VendorDirectoryPage.tsx` | Vendor list | Full ul map | HIGH | Virtual list |
| `EmployeeList.tsx` | `EmployeeList` | Full employee map | HIGH | Virtual list |
| `KPIPanel.tsx` | via `useKPIAppState` | Wide state subscription | MEDIUM | Narrow KPI inputs |
| `DashboardPage.tsx` | Widgets | Filters store + metrics polling | MEDIUM | Already reasonable |
| `RentalBillsDashboard.tsx` | Multiple panels | 39 inline handlers | MEDIUM | Stabilize callbacks |
| `ProjectFinancialGrid.tsx` | Grid rows | Inline handlers in virtual rows | LOW–MED | Stable row renderer component |

**Inline functions / object literals:** Present in most interactive components (1000+ `onClick={()` patterns in `components/`). Highest impact where combined with large lists and missing memo.

**Missing React.memo (notable):** `EmployeeList`, `BrokerLedger`, `VendorLedger`, `ContactsPage` row renderer, `BillsPage` row renderer, many report table rows.

---

## Phase 2 — Context Audit

| Context | Consumers | Update frequency | Risk | Recommendation |
|---------|-----------|------------------|------|----------------|
| **AppContext** | 0 (`useAppContext`) | Every dispatch | **CRITICAL** (provider) | Slice-level notify |
| **AuthContext** | ~85 | Login, MFA, loading | **HIGH** | Split session/actions |
| **NotificationContext** | ~115 | Toast pref changes | **HIGH** (breadth) | Imperative toast API |
| **KPIContext** | 8 | Accounts/categories edits | **HIGH** | Lazy KPI build |
| **PrintContext** | ~45 | Print open/close | **MEDIUM** | Stable print ref |
| **WhatsAppContext** | ~37 | Chat open/close | **MEDIUM** | Add useMemo |
| **ProgressContext** | 5 | Import progress ticks | **MEDIUM** | Split contexts |
| **ViewportContext** | ~6 | Resize | **MEDIUM** | CSS breakpoints |
| **CompanyContext** | ~11 | Company gate | **MEDIUM** | OK for gate scope |
| **ExecutiveModeContext** | ~16 | Nav/mode | **MEDIUM** | OK |
| **ThemeContext** | 5 | Rare | **LOW** | OK |
| **LicenseContext** | 4 | Session | **LOW** | OK |
| **Others** | 0–3 each | Infrequent | **LOW** | OK |

**Provider nesting (outer → inner):**

```
ThemeProvider
  └─ CompanyProvider
       └─ ViewportProvider
            └─ CompanyGate
                 └─ AuthProvider
                      └─ ExecutiveModeProvider
                           └─ SystemProvider
                                └─ OnboardingProvider
                                     └─ AppProvider (AppContext)
                                          └─ PrintProvider
                                               └─ PWAProvider
                                                    └─ UpdateProvider
                                                         └─ LicenseProvider
                                                              └─ ProgressProvider
                                                                   └─ KeyboardProvider
                                                                        └─ KPIProvider
                                                                             └─ ProductTourProvider
                                                                                  └─ NotificationProvider
                                                                                       └─ WhatsAppProvider
                                                                                            └─ PayrollProvider
                                                                                                 └─ SpellCheckerProvider
                                                                                                      └─ App
```

`OfflineProvider` is mounted inside `App.tsx` (not in root `index.tsx`).

**Provider depth:** 23 levels at root — acceptable if inner values are stable; problematic when Auth/KPI/Notification propagate loading states.

---

## Phase 3 — Zustand Subscription Audit

| File | Store | Selector usage | Rerender risk |
|------|-------|----------------|---------------|
| `modules/investor-fund-availability/components/FundAvailabilityPage.tsx` | `useFundAvailabilityFiltersStore` | **Full store** `()` | **HIGH** |
| `modules/investor-fund-availability/components/FundAvailabilityFilterBar.tsx` | Same | **Full store** | **HIGH** |
| `modules/project-profitability/components/ProfitabilityFilterBar.tsx` | `useProfitabilityFiltersStore` | **Full store** | **MEDIUM** |
| All analytics filter stores | `useXxxFiltersStore((s) => s.filters)` | Correct | **LOW** |
| `stores/dashboardFiltersStore.ts` | Multiple granular selectors | Correct | **LOW** |
| `stores/dashboardPreferencesStore.ts` | Used in KPIContext with selectors | Correct | **LOW** |
| `stores/dashboardRefreshIndicatorStore.ts` | Selector in hooks | Correct | **LOW** |

**No `useAppStore()` / bare `useStore()` anti-patterns found** — Zustand usage is generally disciplined. Missing `shallow` is acceptable because selectors return primitives or stable filter objects.

**Derived state in components:** Fund availability and profitability pages derive heavy analytics client-side keyed on AppState fingerprint — overlaps React Query anti-pattern (Phase 5).

---

## Phase 4 — Table Performance Audit

| Surface | Pagination | Virtualization | Search | Sort | >100 rows | Flag |
|---------|------------|----------------|--------|------|-----------|------|
| **Enhanced Ledger** | Fake (all in memory) | Yes (>20 rows)* | Debounced + filters | Client | If virtual off | **CRITICAL** |
| **ContactsPage** | Load-more 200 | None | Text + tabs | Client | Yes (200) | **CRITICAL** |
| **BillsPage** | Load-more 200 | None | Text + tree | Client | Yes (200) | **CRITICAL** |
| **PayrollHub ledger** | None (limit 5000) | None | Filters | Chronological | Yes (5000) | **CRITICAL** |
| **EmployeeList** | None | None | Text | None | Yes | **CRITICAL** |
| **BrokerLedger** | None | None | Scope | Client | Yes | **CRITICAL** |
| **VendorLedger** | None | None | Scope | Client | Yes | **CRITICAL** |
| **VendorDirectory list** | None | None | Text | Client | Yes | **CRITICAL** |
| **ProjectFinancialGrid** | None | Always react-window | Type/date | Client | No | OK |
| **RentalFinancialGrid** | None | Always react-window | Type/date | Client | No | OK |
| **VirtualizedInvoiceTable** | None | Always | Debounced | Client | No | OK |
| **OwnerLedger** | None | Always | Scope | Client | No | OK |
| **AllBillsTable** | None | ≥45 rows | Debounced | Client | 45–99 DOM | MEDIUM |
| **SmartTable** (generic) | None | >60 default | Built-in | Client | If ≤60 | MEDIUM |
| **InvoicesPage tree** | None | None | Debounced | Client | Tree nodes | MEDIUM |
| **Payroll cycle tables** | 10/page | None | Filters | Client | No | OK |
| **Reporting tabs** (rental/construction/customer) | Server page | SmartTable | Server | Server | No | OK |
| **UnpostedTransactionsQueue** | None | None | None | None | Possible | **CRITICAL** |

\*User can disable via `localStorage useTableVirtualization=false`.

**Virtualization library:** `react-window` only (`List` component). No `@tanstack/react-virtual` usage.

**SmartTable default:** auto-virtualize when row count > 60 (`virtualizeThreshold = 60`), unless `virtualize={false}`.

---

## Phase 5 — React Query Impact Audit

**Global defaults** (`config/queryClient.ts`): `staleTime` 5m · `gcTime` 10m · financial prefix 30s · operational 2m.

| Query key | Endpoint | Est. payload | staleTime | gcTime | keepPreviousData | Flag |
|-----------|----------|--------------|-----------|--------|------------------|------|
| `['purchase-orders', filters]` | GET /purchase-orders | **Large** (all POs) | 30s/2m | 10m | No | Over-fetch |
| `['goods-receipts', filters]` | GET /goods-receipts | **Large** | 30s/2m | 10m | No | Over-fetch |
| `['rentalRollup,'ownerBalances','all']` | owner-balances limit=12k | **Large** | 120s | 10m | No | Over-fetch |
| `['dashboardMetrics', …]` | /dashboard/* | Medium | 60s | 10m | No | 120s polling |
| `['workflow','queue']` | /workflow/queue | Medium–Large | 15s | 10m | No | Full queue |
| `['investor-fund-availability-*']` | Client AppState | **Large CPU** | 45–60s | 10m | No | 7× duplicate work |
| `['project-profitability-*']` | Client AppState | **Large CPU** | 45–60s | 10m | No | 4× duplicate work |
| Rental/construction/customer tab queries | Paginated reports | Medium/page | 60s | 10m | **Yes** (`placeholderData`) | Good pattern |
| `['invoices','api', …]` | GET /invoices | Large | 30s/5m | 10m | No | **Dead hook** |
| `['reports','orgUsers']` + `['orgUsersForShare']` | GET /users | Medium | 5m | 10m | No | Duplicate |
| `['dashboardReportPin', …]` × N | POST generate | Medium × pins | 60s | 10m | No | N+1 on dashboard |

**No `useInfiniteQuery` usage** — all list growth is either full fetch or client-side slicing.

**Summary counts:** ~61 `useQuery` call sites across ~38 files; 0 `useInfiniteQuery`; ~15 mutation + `queryClient` patterns.

---

## Phase 6 — Top 20 Render Hotspots

| Rank | Component | Reason | Rerender frequency | Impact |
|------|-----------|--------|-------------------|--------|
| 1 | **AppProvider** (`AppContext`) | Reducer + hydration + socket merge | Every entity mutation | CRITICAL |
| 2 | **EnhancedLedgerPage** | Full tx array, lookup maps, filter memos | Every tx/category/account change | CRITICAL |
| 3 | **Header** | 9 slices + notifications + socket | High (any entity + polling) | HIGH |
| 4 | **GlobalSearchBar** | 13 slices, index rebuild when open | High when search focused | HIGH |
| 5 | **InvoicesPage** | Tree + grid + wide selectors | Invoice/payment/contact changes | HIGH |
| 6 | **InvoiceBillItem** (×N rows) | 11 subscriptions per instance | Any related slice change | HIGH |
| 7 | **ContactsPage** | 200 DOM rows + 8 selectors | Contact/tx changes | HIGH |
| 8 | **BillsPage** | 200 DOM rows | Bill/vendor changes | HIGH |
| 9 | **KPIContext / KPIPanel** | Dynamic KPI rebuild on COA | Accounts/categories edits | HIGH |
| 10 | **PayrollHub** (ledger tab) | Up to 5000 DOM rows | Tab visible + tx fetch | CRITICAL |
| 11 | **RentalARDashboard** | Multiple grids + filters | Rental entity changes | HIGH |
| 12 | **ProjectManagementPage** | Persistent group + wide state | Project/bill/contract sync | HIGH |
| 13 | **useLookupMaps consumers** | 13-map rebuild | Any of 13 entity types | HIGH |
| 14 | **FundAvailabilityPage** | 7 RQ recomputes on fingerprint | Any AppState sync | HIGH |
| 15 | **Sidebar** | Nav + socket chat | Page changes + messages | MEDIUM |
| 16 | **DashboardPage** | Metrics polling 120s + filters | Timer + filter changes | MEDIUM |
| 17 | **VendorDirectoryPage** | Full vendor list + tabs | Vendor/bill changes | HIGH |
| 18 | **MarketingPage** | `useMarketingPageState` composite | Project/unit/agreement changes | MEDIUM |
| 19 | **Report pages** (~90) | `useFinancialReportAppState` | Broad financial mutations | MEDIUM |
| 20 | **AuthContext subtree** | Session loading flags | Login/MFA/company switch | MEDIUM |

---

## Phase 7 — Quick Wins

### A. Fixes under 1 hour

| Fix | Est. gain |
|-----|-----------|
| Add `useMemo` to `WhatsAppContext` provider value | Eliminate unnecessary 37-consumer snapshot checks |
| Stabilize top 20 `useStateSelector` selectors (module-level functions) | 5–15% less CPU on hot paths |
| Reduce ContactsPage/BillsPage `displayLimit` from 200 → 50 | ~4× fewer DOM nodes on first paint |
| Unify `/users` query key to single `['orgUsers']` | One network fetch, shared cache |
| Gate `GlobalSearchBar` index build behind `isFocused` | Avoid search work when bar idle |
| Remove or wire up dead `useInvoicesApiListQuery` | Less confusion; avoid accidental full fetch |

### B. Fixes under 1 day

| Fix | Est. gain |
|-----|-----------|
| Virtualize BrokerLedger, VendorLedger, EmployeeList (copy OwnerLedger pattern) | Smooth scroll on 500+ row ledgers |
| Refactor `InvoiceBillItem` to presentational + container | 50–80% fewer row rerenders on list pages |
| Lazy-build KPI `allKpis` when panel opens | Stops COA edits from hitting 8 KPI consumers |
| Add `usePageActive()` gate to suspend subscriptions in hidden persistent pages | Major reduction in background work |
| Fix Zustand full-store calls in FundAvailability (3 selectors) | Filter bar stops rerendering on unrelated store fields |
| SmartTable for ContactsPage/BillsPage tables | Auto-virtualize >60 rows |

### C. Fixes under 1 week

| Fix | Est. gain |
|-----|-----------|
| True server-paginated transactions API + ledger integration | Enables 50k+ tx tenants |
| Virtualize PayrollHub ledger + paginate API | Removes 5000-row DOM cliff |
| Split AuthContext (session vs actions) | Cleaner login flow; fewer auth-driven cascades |
| Consolidate investor/profitability client queries into 1 derived query or server endpoint | 7× → 1× recompute on sync |
| Paginate PO/GRN React Query hooks | Large procurement tenants usable |
| Slice-level notify in `appStateStore` (only notify tx subscribers on tx change) | Fundamental multi-user scale fix |

---

## 8. Recommended Remediation Order

1. **Table CRITICAL fixes** — Contacts, Bills, Payroll, Broker/Vendor ledgers
2. **Row subscription refactor** — InvoiceBillItem container/presenter pattern
3. **Ledger truth-in-advertising** — Server pagination OR document all-in-memory
4. **Hidden page subscription gate** — `usePageActive()`
5. **Header / SearchBar narrowing**
6. **KPIContext lazy build**
7. **React Query pagination** — PO, GRN, owner balances
8. **appStateStore slice notify** — architectural
9. **AuthContext split**
10. **Context memo polish** — WhatsApp, Progress

**Priority rationale:** DOM size fixes give immediate user-visible wins. Row subscription and hidden-page gates reduce rerender fan-out without backend changes. Ledger pagination and slice-level notify are structural fixes for large tenants and should follow once quick wins land.

---

## Positive Patterns Already in Place

- `useAppContext()` → `useStateSelector` migration complete
- `useDispatchOnly()` for action-only components (~95 files)
- Financial grids (`ProjectFinancialGrid`, `RentalFinancialGrid`, `VirtualizedLedgerTable`) use `react-window`
- `App.tsx` lazy routes, `useTransition` navigation, persistent pages capped at 3 (+ RENTAL pin)
- React Query tiered defaults and reporting tabs with `placeholderData`
- `useLookupMaps` centralizes O(1) lookups (needs store-level caching next)
- `useDevRenderCount` on ledger for profiling

---

*This document is analysis-only. No source files were modified as part of this audit.*
