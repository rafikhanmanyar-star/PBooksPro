# Phase 2: Multi-User Synchronization Architecture Specification

**Date:** June 2026  
**Status:** Specification — no code changes in this document  
**Authority:** [multi-user-synchronization-review.md](./multi-user-synchronization-review.md)  
**Predecessor:** [multi-user-sync-phase1-plan-v2.md](./multi-user-sync-phase1-plan-v2.md) · [multi-user-sync-phase1-implementation-notes.md](./multi-user-sync-phase1-implementation-notes.md)

---

## 1. Executive summary

Phase 1 hardened the **client-side reliability layer**: parallel React Query invalidation, financial/operational stale-time tiers, Socket.io CORS allowlist, reconnect debounce with cooldown, centralized notification listeners, WhatsApp socket wiring, C-5 own-mutation refresh, tracing, and dashboard query-key alignment (QI-1).

Phase 2 addresses **remaining synchronization failures** that still produce stale or inconsistent UI in priority business domains — **accounting, invoices, payments, contracts, and procurement** — without introducing Redis, an event bus, a replay service, or horizontal-scaling infrastructure.

The dominant unresolved pattern is **dual, coarse-grained sync**: every remote socket event still schedules a **tenant-wide incremental AppContext reload** (`scheduleRefresh` → `refreshFromApi`) while only ~10 of 37 entity types receive immediate reducer patches. Priority-domain screens that mix AppContext and React Query therefore update at **inconsistent speeds** (50–200 ms patch vs 2–5 s full sync vs hook-only invalidation).

Phase 2 replaces blunt full reloads with **entity-scoped refresh**, **transaction-safe emits**, and **a single invalidation authority** — all within the existing single-process Socket.io + PostgreSQL architecture.

---

## 2. Phase 1 closure summary

| Review ID | Issue | Phase 1 status |
|-----------|--------|----------------|
| C-4 | Sequential `await` invalidation chains | **Resolved** — `Promise.all` per block |
| C-5 | Own mutation skips `scheduleRefresh()` | **Resolved** — refresh runs; reducer patch still skipped |
| H-1 | Selling analytics silent `catch {}` | **Partial** — warn + trace; dynamic import gap remains |
| H-2 | No notification / WhatsApp listeners | **Resolved** — AppContext + real socket in Header/panels |
| H-3 | Uniform 5-minute stale time | **Partial** — financial (30s) + operational (2m) tiers; reference/static unchanged |
| H-4 | No reconnect re-hydration | **Partial** — reconnect triggers debounced `scheduleRefresh`; no missed-event catch-up |
| H-5 | Socket.io `cors: '*'` | **Resolved** — `corsOrigins.ts` allowlist |
| — | Tracing pipeline | **Resolved** — server + client gated logs |
| QI-1 | Dashboard metrics key prefix drift | **Resolved** — `DASHBOARD_METRICS_FINANCIAL_QUERY_PREFIX` + dev assertion |

**Explicitly deferred from Phase 1 (remain Phase 2+ or out of scope):** C-1 (Redis adapter), C-2 (transactional entity queue), C-3 (targeted refresh), M-3/M-4 (listener consolidation / patch coverage), Express CORS, replay API, SyncEngine, event batching.

---

## 3. Phase 2 objectives

1. **Eliminate missed or premature entity events** for financial and procurement mutations by extending the post-commit emission pattern used for `financial.posted`.
2. **Replace tenant-wide `scheduleRefresh()` on every socket event** with entity-type-scoped refresh so accounting, invoice, payment, contract, and procurement screens update without waiting for unrelated AppState entities.
3. **Establish one socket invalidation path** — remove duplicate listeners in feature hooks that re-invalidate the same keys AppContext already handles.
4. **Close invalidation gaps** for contractor bills/advances, recurring invoice templates, budgets, and procurement report keys.
5. **Improve reconnect recovery** (without replay service) via a deterministic **critical-key invalidation bundle** + one targeted incremental sync.
6. **Align dual-state reads** (AppContext vs React Query) for priority domains so list/detail views cannot diverge after remote mutations.
7. **Apply LWW version guards** to remote patches for invoices, transactions, and bills (already present on contracts/vendors/contacts/projects).

---

## 4. Remaining failure scenarios and root causes

### 4.1 Accounting & GL

| Failure scenario | User-visible symptom | Root cause |
|------------------|---------------------|------------|
| User B on ledger after User A posts payment | Ledger totals lag 2–5 s or until manual refresh | `scheduleRefresh()` debounce; dashboard indicator is manual-only |
| Socket disconnect during batch posting | Stale trial balance until tab switch or 30s financial stale | Reconnect only schedules full sync; no financial-key invalidation burst |
| Complex bill settlement emits multiple events | UI flicker, duplicate refetches, out-of-order totals | Multiple `emitEntityEvent` per operation + AppContext patch + RQ invalidation + `scheduleRefresh` each |
| `financial.posted` arrives before `entity_updated` transaction | Brief incorrect balance | Event ordering not guaranteed; no merge/coalesce on client |
| Report screens open during mutation | Cached report output stale | `reports.all` invalidated but heavy queries may not refetch if unmounted; no snapshot bump |

### 4.2 Invoices

| Failure scenario | User-visible symptom | Root cause |
|------------------|---------------------|------------|
| User B on invoice list (AppContext-driven view) | New invoice appears after 2–5 s | No immediate patch for all invoice list consumers; relies on `scheduleRefresh` |
| User B on invoice list (React Query hook) | Faster update, but payment status may disagree with AppContext | Dual state: `ADD_INVOICE` patch vs `invoices.all` refetch timing |
| Linked invoice recalc after transaction | Invoice paid amount wrong until refresh | `emitRecalculatedInvoiceBillEvents` is separate emit; client may apply transaction patch before invoice patch |
| Remote edit while User B edits same invoice | Stale overwrite or 409 only on save | Invoice/bill/transaction patches lack `shouldApplyRemoteEntityPatch` LWW guard |

### 4.3 Payments (transactions)

| Failure scenario | User-visible symptom | Root cause |
|------------------|---------------------|------------|
| Payment approval workflow completes | Approver sees update; accountant on ledger does not | Workflow invalidates `['workflow']`; ledger depends on separate `transaction` / `financial.posted` events |
| Own rapid payment entry | AppContext may drift from server | C-5 fixed refresh scheduling, but reducer still skipped for own mutations; optimistic local state only |
| Payment delete | Peer still sees payment briefly | `DELETE_TRANSACTION` patch exists; linked invoice/bill emits may arrive out of order |
| Entity emit after `withTransaction` but before HTTP response | Rare phantom row on rollback path | C-2 class: `emitEntityEvent` not queued inside transaction scope (only `financial.posted` is) |

### 4.4 Contracts

| Failure scenario | User-visible symptom | Root cause |
|------------------|---------------------|------------|
| Contract value updated from linked bill/transaction | Contract screen stale | Contract has AppContext patch + `['contracts']` invalidation, but linked financial emits may not include full contract payload |
| User on contract list (RQ-only screen) | 2-minute operational stale if socket missed | Operational tier stale time; no contract-specific reconnect bundle |
| Version conflict on contract | Handled on save (409) | Remote patch respects LWW — **good**; invoice/transaction do not |

### 4.5 Procurement

| Failure scenario | User-visible symptom | Root cause |
|------------------|---------------------|------------|
| PO status change (submit/approve) | Peer sees change only when `usePurchaseOrders` mounted | No AppContext patch; relies on hook socket listener + central invalidation |
| PO screen not mounted | No update until `scheduleRefresh` (2–5 s) | M-4: procurement entities excluded from immediate patches |
| Goods receipt posted | GRN list stale on AppContext screens | Same as PO — hook listeners only when mounted |
| Bill created from PO | Procurement dashboard stale | `bill` invalidates invoices + financial keys; `purchase-order-report` key not in central map |
| Quotation comparison | Triple invalidation when comparison page open | `useQuotationComparison` + AppContext + `entityQueryInvalidation` |

### 4.6 Cross-cutting (still unresolved, in scope)

| Failure scenario | Root cause |
|------------------|------------|
| Duplicate invalidation per event | AppContext `handleEntity` + `usePurchaseOrders` / `useGoodsReceipts` / `useQuotationComparison` each register `entity_*` listeners |
| `useRealtimeQuerySync` latent double-listener | Hook exists and duplicates AppContext if ever mounted (`apiMode` reference bug in deps) |
| Selling analytics never invalidates until module visited | Dynamic `import()` of `useSellingAnalytics` — warn only, still no static key registration |
| Express REST `cors: '*'` | Phase 1 scoped Socket.io only; HTTP API still wildcard |
| Record lock polling every 10 s | Redundant when socket lock events work; adds load under multi-user edit |

---

## 5. Ranked remaining issues

Scoring: **Business impact** (1–5), **Risk if unfixed** (1–5), **Implementation effort** (S/M/L).  
**Priority score** = (Impact × Risk) ÷ Effort weight, where S=1, M=2, L=3.

| Rank | ID | Issue | Domains | Impact | Risk | Effort | Priority |
|------|-----|-------|---------|--------|------|--------|----------|
| **P0** | **2-C3** | Tenant-wide `scheduleRefresh()` on every remote `entity_*` event | All priority | 5 | 5 | M | **12.5** |
| **P0** | **2-C2** | `emitEntityEvent` not post-commit queued (unlike `financial.posted`) | Accounting, Invoices, Payments | 5 | 4 | M | **10** |
| **P0** | **2-DUAL** | AppContext + React Query dual state without reconciliation | Invoices, Payments, Accounting | 5 | 4 | M | **10** |
| **P1** | **2-LWW** | No LWW guard on invoice/transaction/bill remote patches | Invoices, Payments | 4 | 4 | S | **16** |
| **P1** | **2-LIST** | Fragmented socket listeners (AppContext + feature hooks) | Procurement, Accounting | 4 | 3 | M | **6** |
| **P1** | **2-INV** | Incomplete invalidation map (contractor, recurring, budget, PO report keys) | Procurement, Invoices | 4 | 3 | S | **12** |
| **P1** | **2-RC** | Reconnect recovery without critical-key invalidation burst | All priority | 4 | 4 | S | **16** |
| **P2** | **2-PO** | No AppContext patch for `purchase_order` / `goods_receipt` | Procurement | 3 | 3 | M | **4.5** |
| **P2** | **2-DASH** | Dashboard indicator manual-only; financial KPIs lag | Accounting | 3 | 2 | S | **6** |
| **P2** | **2-ORDER** | Multi-emit operations (settlement) cause client event storms | Payments, Invoices | 3 | 3 | M | **4.5** |
| **P2** | **2-EXPR** | Express CORS still `origin: '*'` | Security / sync edge cases | 2 | 3 | S | **6** |
| **P3** | **2-LOCK** | Lock polling despite socket lock events | Contracts, Procurement edits | 2 | 2 | M | **2** |
| **P3** | **2-SELL** | Selling analytics dynamic import invalidation | Property sales (adjacent) | 2 | 2 | S | **4** |
| **P3** | **2-RTQS** | `useRealtimeQuerySync` duplicate-listener hazard | Cross-cutting | 2 | 2 | S | **4** |

**Out of scope for Phase 2 (per requirements):**

| ID | Issue | Reason excluded |
|----|--------|-----------------|
| C-1 | Single-process Socket.io | Requires Redis adapter / horizontal scaling |
| — | Event bus / Redis pub-sub | Explicitly excluded |
| — | Replay service / `realtime_event_log` | Explicitly excluded |
| — | Server-side event batching (100 ms window) | Event-bus pattern |
| — | Full SyncEngine replacement | Deferred; Phase 2 uses incremental targeted refresh instead |
| — | Materialized views for ledger | Performance scaling; separate initiative |

---

## 6. Architecture changes (Phase 2)

All changes stay within Architecture V2.1: PostgreSQL single source of truth, `emitEntityEvent` after commit, module routes, `TenantRepository`, no Redis.

### 6.1 Target architecture (single-server)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  FRONTEND                                                                │
│                                                                          │
│  Socket (shared) ──► RealtimeDispatchHub (new, replaces scattered      │
│                       listeners in AppContext + feature hooks)           │
│         │                                                                │
│         ├──► invalidateQueriesForEntityEvent (central map, extended)    │
│         ├──► applyAppContextPatch (typed, LWW-aware, priority domains)   │
│         ├──► scheduleTargetedRefresh(entityType)  ◄── replaces scheduleRefresh
│         │         (incremental sync scoped to entity family, debounced)    │
│         └──► onReconnect: invalidateCriticalKeys() + one targeted sync   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  BACKEND                                                                 │
│                                                                          │
│  withTransaction ──► COMMIT ──► flushEntityEventQueue()  (new)          │
│              │                      │                                    │
│              │                      ├── emitEntityEvent (batched per route) │
│              │                      └── flushFinancialPostedQueue (existing)│
│              └── ROLLBACK ──► clearEntityEventQueue()                   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Backend: transactional entity event queue (2-C2)

**Pattern:** Mirror `financialPostedEmissions.ts` for all `emitEntityEvent` calls inside `withTransaction`.

| Component | File (proposed) | Behavior |
|-----------|-----------------|----------|
| `queueEntityEvent()` | `backend/src/core/entityEventEmissions.ts` | Push to AsyncLocalStorage queue when transaction active; emit immediately when not |
| `flushEntityEventQueue()` | same | Called from `withTransaction` after `COMMIT` (alongside `flushFinancialPostedQueue`) |
| `clearEntityEventQueue()` | same | Called on `ROLLBACK` |
| Route audit | priority routes first | `transactionsRoutes`, `billsRoutes`, `invoicesRoutes`, `purchaseOrdersRoutes`, `goodsReceiptsRoutes`, `contractsRoutes` |

**Root cause addressed:** Clients may receive events before commit completes, or miss events if handler throws between commit and emit.

**Not in scope:** Persistent event log or replay API.

### 6.3 Frontend: targeted refresh instead of full tenant sync (2-C3)

**Replace:** `scheduleRefresh()` → unconditional `refreshFromApi()` for every remote event.

**With:** `scheduleTargetedRefresh(entityType)` that:

1. Maps `entityType` → **entity family** (financial, procurement, contract, rental, etc.).
2. Debounces per family (reuse `API_REFRESH_DEBOUNCE_MS` / `API_REFRESH_COOLDOWN_MS`).
3. Calls a **narrow incremental API** (new or existing partial loaders) for that family only — not full `loadStateForSyncRefresh()`.
4. Falls back to full `refreshFromApi()` only on: reconnect (once), `settings.bulkRefresh`, 409 conflict recovery, manual user action.

**Priority domain mapping (minimum):**

| Entity types | Targeted refresh scope |
|--------------|------------------------|
| `transaction`, `payment`, `journal_entry`, `account`, `category`, `accounting_period` | Accounting slice: transactions, accounts, categories |
| `invoice`, `bill`, `recurring_invoice_template` | Invoice/bill slice |
| `contract`, `contractor_bill`, `contractor_advance` | Contracts + vendor bills slice |
| `purchase_order`, `goods_receipt`, `quotation`, `vendor` | Procurement slice |
| All others | Existing behavior or family TBD in Phase 2b |

**Root cause addressed:** Unrelated entities re-fetched on every event; 2–5 s minimum latency for procurement and accounting list views.

### 6.4 Frontend: RealtimeDispatchHub — single listener authority (2-LIST)

**Consolidate** all `entity_*` / `financial.posted` socket subscriptions into one module (e.g. `services/realtime/realtimeDispatchHub.ts`).

| Remove listeners from | Keep |
|----------------------|------|
| `hooks/usePurchaseOrders.ts` | Central invalidation only |
| `hooks/useGoodsReceipts.ts` | Central invalidation only |
| `hooks/useQuotationComparison.ts` | Central invalidation only |
| `hooks/useRealtimeQuerySync.ts` | Deprecate or hard-disable default |

AppContext `handleEntity` becomes a thin delegate to the hub (or hub runs inside AppContext effect).

**Root cause addressed:** Duplicate invalidation, race ordering, and unpredictable refetch timing.

### 6.5 Extended invalidation map (2-INV)

Add to `entityQueryInvalidation.ts`:

| Entity type | Additional query keys |
|-------------|----------------------|
| `contractor_bill`, `contractor_advance` | `['contractor-bills']`, `['contractor-advances']` (or existing module keys) |
| `recurring_invoice_template` | `['recurring-invoice-templates']` |
| `budget` | `['budgets']`, `['project-budgets']` |
| `purchase_order` | `['purchase-order-report']` |
| `bill` (procurement-linked) | `['purchase-orders']` when `data.purchaseOrderId` present |

Register `sellingAnalyticsQueryKeys.root` statically (remove dynamic import) or add constant re-export to avoid H-1 residual failure.

### 6.6 LWW on financial entity patches (2-LWW)

Apply `shouldApplyRemoteEntityPatch(existing, payload.version)` before:

- `UPDATE_INVOICE` / `ADD_INVOICE`
- `UPDATE_TRANSACTION` / `ADD_TRANSACTION`
- `UPDATE_BILL`

Ensure `emitEntityEvent` payloads include `version` from PostgreSQL for these entities (audit priority routes).

### 6.7 Reconnect recovery without replay (2-RC)

On socket `connect` (non-initial), after Phase 1 cooldown:

```typescript
await Promise.all([
  invalidateQueries({ queryKey: queryKeys.ledger.all }),
  invalidateQueries({ queryKey: queryKeys.invoices.all }),
  invalidateQueries({ queryKey: ['transactions'] }),
  invalidateQueries({ queryKey: dashboardMetricsQueryKeys.root }),
  invalidateQueries({ queryKey: ['purchase-orders'] }),
  invalidateQueries({ queryKey: ['goods-receipts'] }),
  invalidateQueries({ queryKey: ['contracts'] }),
]);
scheduleTargetedRefresh('transaction'); // one debounced accounting sync
```

**Root cause addressed:** Missed events during disconnect with no server replay — client forces fresh financial/procurement caches.

### 6.8 Dual-state reconciliation (2-DUAL)

**Policy:** For priority domains, pick **one read path per screen**:

| Screen category | Primary source | Rule |
|-----------------|----------------|------|
| Invoice/transaction lists migrating to RQ | React Query | Remove AppContext list reads; keep patch for legacy screens until migrated |
| Legacy AppContext ledger views | AppContext | Invalidate RQ but do not rely on RQ for display until migrated |
| Procurement PO/GRN | React Query (already) | Remove AppContext dependency; ensure targeted refresh not needed for RQ screens |

Phase 2 delivers an **inventory + migration table** per route; minimum viable fix is consistent invalidation + targeted refresh so both sources converge within one debounce window.

### 6.9 Dashboard auto-refresh option (2-DASH)

When `maybeMarkDashboardRefreshForEntity` fires for remote financial events:

- If dashboard queries are **mounted** (`useDashboardMetrics` active), call `refetchDashboardQueries` automatically (respecting existing debounce).
- If not mounted, keep indicator badge only.

### 6.10 Express CORS alignment (2-EXPR)

Reuse `backend/src/config/corsOrigins.ts` for Express `cors()` in `backend/src/index.ts` (Phase 1 follow-up).

---

## 7. Phase 2 work packages

### Package A — Reliability core (P0)

| Task | Delivers |
|------|----------|
| A1. Entity event emission queue | 2-C2 |
| A2. `scheduleTargetedRefresh` + entity-family map | 2-C3 |
| A3. RealtimeDispatchHub; remove duplicate hook listeners | 2-LIST |
| A4. Reconnect critical-key bundle | 2-RC |

### Package B — Priority domain correctness (P1)

| Task | Delivers |
|------|----------|
| B1. LWW patches for invoice/transaction/bill | 2-LWW |
| B2. Extended invalidation map | 2-INV |
| B3. Dual-state reconciliation checklist + top-screen fixes | 2-DUAL |
| B4. Version field audit on priority `emitEntityEvent` payloads | Supports B1 |

### Package C — UX polish (P2)

| Task | Delivers |
|------|----------|
| C1. Dashboard auto-refetch when mounted | 2-DASH |
| C2. Client-side coalesce for multi-emit settlement bursts | 2-ORDER |
| C3. Express CORS allowlist | 2-EXPR |
| C4. Optional AppContext patches for PO/GRN (if any screen still AppContext-only) | 2-PO |

### Package D — Cleanup (P3)

| Task | Delivers |
|------|----------|
| D1. Reduce lock polling when socket connected | 2-LOCK |
| D2. Static selling-analytics query key | 2-SELL |
| D3. Disable or fix `useRealtimeQuerySync` | 2-RTQS |

**Recommended sequence:** A1 → A3 → A2 → B2 → B1 → A4 → B3 → C1 → C3 → remainder.

---

## 8. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Targeted refresh API does not exist yet | High | Start with entity-family filters on existing incremental sync endpoint; add route params `?entities=transactions,invoices` |
| Removing hook listeners breaks screen if central map incomplete | High | Package B2 before A3; integration tests per entity type |
| Entity event queue changes emit timing | Medium | Integration tests: rollback emits nothing; commit emits once |
| Targeted refresh leaves edge entities stale | Medium | Keep full `refreshFromApi` on reconnect + bulk settings + 409 |
| LWW on patches surfaces more 409 UX | Low | Expected; aligns with architecture |
| Reduced `scheduleRefresh` breaks screens still AppContext-only | Medium | Inventory before A2; migrate or add patches in Package C4 |
| Express CORS breaks LAN clients | Medium | Reuse `CORS_ALLOW_ALL` escape hatch |

---

## 9. Success criteria

### 9.1 Quantitative (two-browser manual + staging)

| Scenario | Target |
|----------|--------|
| User A creates transaction → User B ledger | **< 500 ms** RQ update; AppContext converges within **< 2 s** without full tenant sync |
| User A approves PO → User B PO list | **< 500 ms** without mounting hook-specific listener |
| User A posts vendor bill settlement → User B invoice/bill/ledger | Consistent totals within **< 1 s**; no phantom rows on rollback |
| Socket disconnect 60 s → reconnect | Financial + procurement queries refetch; **no manual F5** |
| User A edits invoice while User B has same invoice open | Remote patch respects version; no silent overwrite |
| Bulk settings reset | Full tenant sweep still works |

### 9.2 Architectural gates

- [ ] All `emitEntityEvent` calls inside `withTransaction` use `queueEntityEvent` (priority routes verified by grep/audit script).
- [ ] Exactly **one** `entity_*` listener set per connected client (grep gate).
- [ ] `scheduleRefresh` / full `refreshFromApi` not called for unrelated entity types (trace log proof).
- [ ] Priority invalidation keys covered in unit tests (extends Phase 1 test suite).
- [ ] No Redis, event bus, or replay endpoint introduced.

### 9.3 Regression

- Phase 1 behaviors preserved: parallel invalidation, C-5 own-mutation refresh, notification atomic listener, Socket.io CORS, financial stale tiers, QI-1 dashboard prefix.
- RBAC and accounting posting via `FinancialPostingService` unchanged.

---

## 10. Testing strategy (Phase 2)

| Layer | Tests |
|-------|-------|
| Backend | Entity queue flush/clear; priority route emit-after-commit integration tests |
| Frontend unit | Targeted refresh family map; hub single-dispatch; extended invalidation map; LWW patch guard |
| Frontend integration | Mock socket burst → assert one targeted sync per family |
| Manual | Review §9.1 scenarios across accounting, invoices, payments, contracts, procurement |
| Trace | `DEBUG_REALTIME` / `VITE_DEBUG_REALTIME`: `socket.emitted` → `socket.received` → `query.invalidated` → `targeted.refresh` (new) |

---

## 11. Relationship to enterprise v2 (deferred)

The original review §10 proposed Redis adapter, event log, replay API, SyncEngine, and server-side batching. Phase 2 delivers **most user-visible reliability gains** without that infrastructure by fixing:

- **Emit correctness** (transaction queue)
- **Client fan-in** (single dispatch hub)
- **Refresh precision** (targeted sync)
- **Cache key completeness** (invalidation map)

When horizontal scaling is required later, the entity event queue and hub design become the insertion point for Redis pub/sub and replay — but Phase 2 does not implement them.

---

## 12. Document references

| Document | Role |
|----------|------|
| [multi-user-synchronization-review.md](./multi-user-synchronization-review.md) | Original findings (C-1–C-5, H-1–H-5, M-1–M-4) |
| [multi-user-sync-phase1-plan-v2.md](./multi-user-sync-phase1-plan-v2.md) | Completed Phase 1 scope |
| [multi-user-sync-phase1-implementation-notes.md](./multi-user-sync-phase1-implementation-notes.md) | As-built Phase 1 |
| [multi-user-sync-phase1-test-plan.md](./multi-user-sync-phase1-test-plan.md) | Phase 1 test baseline to extend |

---

*End of Phase 2 specification. No source files were modified.*
