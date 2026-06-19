# PBooksPro — Multi-User Synchronization Architecture Review

**Date:** June 2026  
**Status:** Analysis only — no code modified  
**Scope:** Real-time synchronization across multi-user, multi-company, multi-tenant, Electron, Cloud, and LAN deployments

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Real-Time Synchronization Mechanisms](#2-real-time-synchronization-mechanisms)
3. [WebSocket / Socket.io Implementation](#3-websocket--socketio-implementation)
4. [React Query Cache Invalidation](#4-react-query-cache-invalidation)
5. [Zustand & Global State Management](#5-zustand--global-state-management)
6. [Module-by-Module Live Update Coverage](#6-module-by-module-live-update-coverage)
7. [End-to-End Synchronization Flow](#7-end-to-end-synchronization-flow)
8. [Architectural Flaws](#8-architectural-flaws)
9. [Scalability Issues](#9-scalability-issues)
10. [Enterprise-Grade Synchronization Architecture (v2)](#10-enterprise-grade-synchronization-architecture-v2)

---

## 1. Executive Summary

PBooksPro implements a **"Real-Time First"** architecture: every backend mutation emits a Socket.io event to all connected clients in the same tenant room. Clients respond by (a) immediately dispatching AppContext reducer patches for fast collaborative UI, (b) invalidating the relevant React Query caches, and (c) scheduling a debounced full server-state refresh. An incremental cursor-based sync reduces bandwidth after initial load. Record locks prevent concurrent edit conflicts.

The architecture is well-designed for a single-server, moderate-load deployment. However, it contains critical structural flaws — a process-local Socket.io instance, an in-memory broadcast model, a monolithic AppContext debounced full reload on every event, and a 5-minute React Query stale time — that cause the inconsistent UI updates reported. These problems are not bugs in individual modules; they are systemic consequences of the current single-process architecture hitting its natural limits.

---

## 2. Real-Time Synchronization Mechanisms

The system uses four parallel mechanisms, all active simultaneously:

| Mechanism | File | Trigger | Scope |
|---|---|---|---|
| Socket.io tenant-room broadcast | `backend/src/core/realtime.ts` | Every CRUD mutation on backend | All connected sessions in same tenant |
| React Query cache invalidation | `services/realtime/entityQueryInvalidation.ts` | Socket event received | Per-entity-type query key sets |
| AppContext reducer patch | `context/AppContext.tsx:1874–2101` | Socket event (non-own-mutation) | In-memory React state for AppContext entities |
| Debounced full server reload | `context/AppContext.tsx:1824–1839` | Socket event + tab visibility change | All AppContext state (incremental or full) |

Additionally, two fallback mechanisms operate independently:

| Fallback | Trigger | Interval |
|---|---|---|
| Record lock polling | `hooks/useRecordLock.ts` | Every 10 s |
| Lock heartbeat refresh | `hooks/useRecordLock.ts` | Every 30 s |
| Tab visibility refresh | `context/AppContext.tsx:2127–2143` | 1.2 s after tab becomes visible |

---

## 3. WebSocket / Socket.io Implementation

### 3.1 Server Initialization

**File:** `backend/src/core/realtime.ts:87–122`  
**Mounted at:** `backend/src/index.ts:202` — attached to the same HTTP server as Express

```typescript
export function initRealtime(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: { origin: '*' },           // ← wildcard CORS
    transports: ['websocket', 'polling'],
  });
  // JWT middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers.authorization...
    const payload = verifyAccessToken(token);
    socket.data.userId  = payload.sub;
    socket.data.tenantId = payload.tenantId;
    next();
  });
  // Auto-join tenant room
  io.on('connection', (socket) => {
    socket.data.connectedAt = new Date().toISOString();
    if (tid) void socket.join(`tenant:${tenantId}`);
  });
}
```

**Key design decisions:**
- One global `io` singleton — module-level `let io: Server | null = null`
- Authentication happens in a Socket.io middleware, not per-message
- Each socket auto-joins `tenant:{tenantId}` immediately on connect
- No per-user rooms, no per-company sub-rooms — only tenant-level

### 3.2 Event Types

**14 distinct socket event names emitted by the backend:**

| Event | Emitter Function | File |
|---|---|---|
| `entity_created` | `emitEntityEvent()` | `realtime.ts:234` |
| `entity_updated` | `emitEntityEvent()` | `realtime.ts:234` |
| `entity_deleted` | `emitEntityEvent()` | `realtime.ts:234` |
| `financial.posted` | `emitFinancialPosted()` | `realtime.ts:224` |
| `lock_acquired` | `emitLockEvent()` | `realtime.ts:275` |
| `lock_released` | `emitLockEvent()` | `realtime.ts:275` |
| `approval_requested` | `emitApprovalEvent()` | `realtime.ts:373` |
| `approval_approved` | `emitApprovalEvent()` | `realtime.ts:373` |
| `approval_rejected` | `emitApprovalEvent()` | `realtime.ts:373` |
| `approval_returned` | `emitApprovalEvent()` | `realtime.ts:373` |
| `approval_escalated` | `emitApprovalEvent()` | `realtime.ts:373` |
| `approval_delegated` | `emitApprovalEvent()` | `realtime.ts:373` |
| `chat:message` | `emitInternalChatMessage()` | `realtime.ts:307` |
| `notification_created` | `emitUserNotification()` | `realtime.ts:320` |
| `whatsapp:message:sent/received/status` | `emitWhatsAppEvent()` | `realtime.ts:333` |

**Entity types covered** (37 types in `RealtimeEntityType`):

```
invoice, agreement, contract, rental_agreement, unit, project, payment, contact, user,
vendor, quotation, purchase_order, document, building, property, settings, account,
transaction, journal_entry, category, bill, recurring_invoice_template,
project_received_asset, sales_return, payroll_*, budget, personal_*, pm_cycle_allocation,
plan_amenity, installment_plan, contractor_advance, contractor_bill,
project_expense_voucher, project_expense_category, accounting_period,
personal_task, report_definition, custom_report_template, approval_request,
goods_receipt, rbac_role
```

### 3.3 Payload Structure

**File:** `backend/src/core/realtime.ts:60–71`

```typescript
type RealtimePayload = {
  type: RealtimeEntityType;   // 'invoice', 'transaction', etc.
  action: RealtimeAction;     // 'created' | 'updated' | 'deleted'
  data?: unknown;             // Full entity body or minimal { id }
  id?: string;                // Entity ID
  tenantId: string;           // For client-side tenant scope check
  sourceUserId?: string;      // Who triggered the mutation
  ts: string;                 // ISO 8601 timestamp
  version?: number;           // LWW conflict detection
};
```

### 3.4 Transactional Emission Guard

**File:** `backend/src/core/financialPostedEmissions.ts`

Financial events use `AsyncLocalStorage` to prevent premature emission before `COMMIT`:

```
DB transaction opens
  → runWithFinancialPostedQueue(queue, fn)
  → mutations run
  → queueFinancialPosted() → pushed to queue (not emitted)
COMMIT succeeds
  → flushFinancialPostedQueue() → emitFinancialPosted() for each item
ROLLBACK
  → clearFinancialPostedQueue() → nothing emitted
```

This ensures financial events are **never** broadcast for transactions that rolled back. However, the same transactional guard does **not** exist for `emitEntityEvent()` — entity events are emitted synchronously from route handlers, **before** verifying the full transaction committed (see §8.2).

### 3.5 Client Socket Connection

**File:** `core/socket.ts`

```typescript
let socket: Socket | null = null;   // Process-global singleton

export function connectRealtimeSocket(token: string): Socket {
  if (isSameToken(token) && socket?.connected) return socket;   // reuse
  // disconnect old, create new
  socket = io(getWsServerUrl(), {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelayMax: 10000,
  });
  return socket;
}
```

One socket is shared across AppContext, ChatModal, and any hook that calls `getRealtimeSocket()`.

---

## 4. React Query Cache Invalidation

### 4.1 QueryClient Configuration

**File:** `config/queryClient.ts`

```typescript
staleTime: 5 * 60 * 1000   // 5 minutes — data is "fresh" for 5 min after fetch
gcTime:   10 * 60 * 1000   // 10 minutes — cache entry kept 10 min after last use
refetchOnWindowFocus: false  // no automatic refetch on tab focus
retry: 1                     // one retry on failure
```

**Impact:** Without socket events, a component showing invoices will display up to **5-minute-old data** before re-fetching. `refetchOnWindowFocus: false` means switching browser tabs never triggers an automatic update.

### 4.2 Central Invalidation Map

**File:** `services/realtime/entityQueryInvalidation.ts`

The entire invalidation logic is a single `if/else` chain mapping `entityType` to query key sets:

```
entity_type         → query keys invalidated
─────────────────────────────────────────────────────────
FINANCIAL_ENTITY_TYPES →  ledger.all, reports.all, dashboardMetrics.root
invoice / bill      →  invoices.all, rental.invoicesList()
RENTAL_ENTITY_TYPES →  rental.invoicesList(), ['rental']
contact             →  ['contacts'], reports.orgUsers()
vendor / quotation  →  ['vendors'], ['quotations'], ['quotation-comparison'], ['procurement-dashboard']
purchase_order      →  ['purchase-orders'], ['procurement-dashboard'], ['quotation-comparison']
goods_receipt       →  ['goods-receipts'], ['goods-receipt-report'], ['purchase-orders'], ['procurement-dashboard']
contract            →  ['contracts']
project             →  projects.all
user                →  reports.orgUsers()
PAYROLL_ENTITY_TYPES →  ['payroll']
document            →  ['documents']
personal_*          →  ['personal']
report_definition   →  reports.all, ['reports','designer'], ['reports','custom']
approval_request    →  ['workflow']
settings (bulk)     →  ALL query keys (full sweep)
```

**Execution:** Called from `AppContext.tsx:1843` on every `entity_*` event, **including own mutations** (the `isOwnMutation` check comes after the invalidation call).

### 4.3 Invalidation Order (Sequential vs Parallel)

The invalidation function in `entityQueryInvalidation.ts` uses sequential `await` calls:

```typescript
await queryClient.invalidateQueries({ queryKey: queryKeys.ledger.all });
await queryClient.invalidateQueries({ queryKey: queryKeys.reports.all });
await queryClient.invalidateQueries({ queryKey: dashboardMetricsQueryKeys.root });
```

For `FINANCIAL_ENTITY_TYPES`, this means **3 sequential async operations** per socket event. Under load (many events), these pile up.

### 4.4 No Per-Query Stale Time Override

There is no per-query `staleTime` configuration. Every query uses the global 5-minute default. A transaction created 4 minutes ago would appear stale to React Query but not be re-fetched because the 5-minute timer has not expired — the socket event is the only driver.

### 4.5 No `refetchOnWindowFocus`

`refetchOnWindowFocus: false` means:
- User leaves tab open for 30 minutes
- Returns to tab
- Data is served from cache (up to 10 minutes old if socket reconnect failed)
- Tab visibility listener in AppContext provides a 1.2-second debounced manual refresh as the fallback (`AppContext.tsx:2127–2143`)

---

## 5. Zustand & Global State Management

### 5.1 Store Inventory

Three Zustand stores are present:

| Store File | State Held | Socket Awareness |
|---|---|---|
| `stores/dashboardRefreshIndicatorStore.ts` | `pending: boolean` — whether new financial activity arrived | Indirectly via AppContext calling `markDashboardRefreshPending()` |
| `stores/dashboardFiltersStore.ts` | Dashboard filter selections (persisted) | None |
| `stores/dashboardPreferencesStore.ts` | Dashboard layout preferences (persisted) | None |

### 5.2 `dashboardRefreshIndicatorStore`

```typescript
// Set by AppContext when a financial socket event arrives from another user
markDashboardRefreshPending()   // pending = true

// Cleared by dashboard component after user refreshes
clearDashboardRefreshPending()  // pending = false
```

This powers a UI indicator ("new data available — click to refresh") on the dashboard but does **not** automatically refresh it. The user must click.

### 5.3 AppContext as the Real State Container

The dominant global state container is **not** Zustand — it is `AppContext` (a `useReducer` + `Context` pattern with 22 nested providers). AppContext holds:
- All tenant entities: invoices, transactions, contracts, vendors, contacts, units, projects, etc.
- Sync state: `lastSyncCursor`, `isInitializing`, `apiStateLoadFailed`
- Auth state (delegated to `AuthContext`)

The Zustand stores are supplementary. The core synchronization path is: socket event → AppContext reducer dispatch → React re-render.

---

## 6. Module-by-Module Live Update Coverage

### Modules with Full Socket-Driven Live Updates

These modules receive entity events, get React Query cache invalidated, and may receive immediate AppContext reducer patches:

| Module | Entity Type | React Query Keys Invalidated | AppContext Patch |
|---|---|---|---|
| **Invoices** | `invoice`, `bill` | `invoices.all`, `rental.invoicesList()`, `ledger.all`, `reports.all` | Yes — `ADD_INVOICE` / `UPDATE_INVOICE` |
| **Transactions** | `transaction`, `payment`, `journal_entry` | `ledger.all`, `reports.all`, `dashboardMetrics.root` | Yes — `ADD_TRANSACTION` / `UPDATE_TRANSACTION` |
| **Contracts** | `contract` | `['contracts']` | Yes — `ADD_CONTRACT` / `UPDATE_CONTRACT` |
| **Purchase Orders** | `purchase_order` | `['purchase-orders']`, `['procurement-dashboard']`, `['quotation-comparison']` | No direct patch |
| **Goods Receipt** | `goods_receipt` | `['goods-receipts']`, `['goods-receipt-report']`, `['purchase-orders']`, `['procurement-dashboard']` | No direct patch |
| **Vendors / Quotations** | `vendor`, `quotation` | `['vendors']`, `['quotations']`, `['quotation-comparison']`, `['procurement-dashboard']` | Yes — `ADD_VENDOR` / `UPDATE_VENDOR` |
| **Properties / Units** | `unit`, `property`, `building`, `rental_agreement` | `queryKeys.rental.*`, `['rental']` | Yes — `DELETE_UNIT`, `ADD_UNIT`, etc. |
| **Projects** | `project` | `queryKeys.projects.all` | Yes — `ADD_PROJECT` / `UPDATE_PROJECT` |
| **Payroll** | `payroll_*` | `['payroll']` | No direct patch |
| **GL / Dashboard** | `financial.posted` | `ledger.all`, `reports.all`, `dashboardMetrics.root` | No direct patch — indicator set |
| **Approvals** | `approval_request` | `['workflow']` | No direct patch |
| **Documents** | `document` | `['documents']` | No direct patch |
| **RBAC** | `rbac_role` | `['workflow']` (via approval_request check) | No direct patch |

### Modules That Require Manual Refresh

These modules are **not** included in `entityQueryInvalidation.ts` and receive no dedicated AppContext patches:

| Module | Reason | Current Behavior |
|---|---|---|
| **Selling Analytics** | Dynamic import in `invalidateSellingAnalytics()` — silently skipped if module not loaded | No live update unless module has been visited |
| **Custom Reports / Report Designer** | Only invalidated on `report_definition` events — not on underlying data changes | Stale report output until manual refresh |
| **Personal Finance** | Only invalidated on `personal_*` events — no cascade from transaction changes | Changes by admin to linked accounts not reflected |
| **Budgets** | `budget` is in `FINANCIAL_ENTITY_TYPES` → ledger invalidated, but no budget-specific key | Budget vs. actuals comparison may be stale |
| **PM Cycle Allocations** | `pm_cycle_allocation` is in `RENTAL_ENTITY_TYPES` → `rental.invoicesList()` invalidated, but no specific allocation key | Allocation details stale |
| **Contractor Advances / Bills** | In `FINANCIAL_ENTITY_TYPES` → ledger invalidated, but no module-specific query keys | Contractor module list views not updated |
| **Recurring Invoice Templates** | In `FINANCIAL_ENTITY_TYPES` → only financial keys invalidated, no template-list key | Template list requires manual refresh |
| **WhatsApp Conversations** | Socket events emitted (`whatsapp:*`) but **no listener in AppContext or hooks** | No live update — WhatsApp panel requires manual refresh |
| **Internal Notifications Bell** | `notification_created` emitted but **no listener wired in AppContext** | Notification count not updated until next polling cycle or page reload |

---

## 7. End-to-End Synchronization Flow

### 7.1 Complete Trace: User A Creates a Transaction → User B Sees It

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  USER A — Browser Tab                                                           │
│                                                                                 │
│  1. Fills in transaction form                                                   │
│  2. Submits: POST /api/v1/transactions                                          │
└───────────────────────────────┬─────────────────────────────────────────────────┘
                                │  HTTP request
                                ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  BACKEND (Express + PostgreSQL)                                                 │
│                                                                                 │
│  3. authMiddleware — JWT verified, resolvedPermissions populated                │
│  4. requirePermission('financial.write') — passes                               │
│  5. transactionsRoutes.ts: POST handler                                         │
│     a. withTransaction(pool, async (client) => {                                │
│          b. INSERT INTO transactions ... → result row                           │
│          c. UPDATE invoice payment_aggregates (linked invoices)                 │
│          d. INSERT INTO journal_entries + journal_lines (GL posting)            │
│          e. queueFinancialPosted(...) → queued (not yet emitted)                │
│     }) → COMMIT                                                                 │
│     f. flushFinancialPostedQueue() → emitFinancialPosted() now fires            │
│     g. emitEntityEvent(tenantId, 'created', 'transaction', { data, userId })   │
│     h. emitRecalculatedInvoiceBillEvents(...)                                   │
│        → emitEntityEvent(..., 'updated', 'invoice', ...) for each linked inv.  │
│     i. HTTP 200 response → User A                                               │
└───────────────────────────────┬─────────────────────────────────────────────────┘
                                │  Socket.io broadcast
                                │  io.to('tenant:org-123').emit('entity_created', payload)
                                │  io.to('tenant:org-123').emit('financial.posted', payload)
                                │  io.to('tenant:org-123').emit('entity_updated', invoicePayload)
                                ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  SOCKET.IO SERVER (in-process with Express)                                     │
│                                                                                 │
│  10. tenantRoom('org-123') fans out to ALL sockets in room                      │
│      → User A's socket (same tenant)                                            │
│      → User B's socket (same tenant)                                            │
│      → User C's socket (same tenant, different browser)                         │
└───────────────────┬─────────────────────────────────────────────────────────────┘
                    │
          ┌─────────┴──────────┐
          │                    │
          ▼                    ▼
┌──────────────────┐  ┌──────────────────────────────────────────────────────────┐
│  USER A (self)   │  │  USER B — Browser Tab                                    │
│                  │  │                                                          │
│  handleEntity()  │  │  11. handleEntity(payload) fires in AppContext           │
│  → isOwnMutation │  │      a. invalidateQueriesForEntityEvent(queryClient,     │
│    = true        │  │           payload, ctx)                                  │
│  → returns early │  │         → await invalidateQueries(ledger.all)            │
│  (no patch,      │  │         → await invalidateQueries(reports.all)           │
│   no scheduleR.) │  │         → await invalidateQueries(dashboardMetrics.root) │
│                  │  │      b. maybeMarkDashboardRefreshForEntity(payload, ctx) │
│  React Query     │  │         → dashboardRefreshIndicatorStore.markPending()   │
│  still           │  │      c. isOwnMutation = false (sourceUserId ≠ B's id)   │
│  invalidated     │  │      d. Dispatch immediate patch:                        │
│  (step a always  │  │         dispatch({ type:'ADD_TRANSACTION', payload:tx }) │
│  runs before     │  │         → AppContext reducer merges tx into state        │
│  isOwnMutation   │  │         → React re-render: transaction list updates      │
│  check)          │  │      e. scheduleRefresh()                                │
│                  │  │         → debounce 2s (DEBOUNCE_MS)                      │
│                  │  │         → if last refresh < 3s ago: delay by cooldown    │
│                  │  │         → after timer: refreshFromApi()                  │
│                  │  │                                                          │
│                  │  │  12. React Query refetch (from invalidation at step a):  │
│                  │  │      → GET /api/v1/ledger → fresh data                   │
│                  │  │      → GET /api/v1/reports → fresh data                  │
│                  │  │      → React components re-render with new data          │
│                  │  │                                                          │
│                  │  │  13. handleFinancialPosted() fires                       │
│                  │  │      → invalidateQueries(ledger, reports, dashboard)     │
│                  │  │      → scheduleRefresh() (resets debounce)               │
│                  │  │                                                          │
│                  │  │  14. scheduleRefresh() fires after debounce:             │
│                  │  │      → refreshFromApi() → incremental sync               │
│                  │  │      → GET /api/v1/app-state/sync?cursor=...             │
│                  │  │      → merge into AppContext + localStorage               │
└──────────────────┘  └──────────────────────────────────────────────────────────┘

TOTAL TIME FROM USER A SUBMIT TO USER B SEES CHANGE:
  - Immediate patch (step d): ~50–200 ms (socket RTT + reducer dispatch)
  - React Query refetch (step 12): ~200–800 ms (depends on network + query complexity)
  - Full AppContext sync (step 14): ~2000–5000 ms (debounce + API call)
```

### 7.2 Own-Mutation Path (User A Sees Their Own Change)

```
User A submits → HTTP 200 → local optimistic dispatch (AppContext)
                         ↓
Socket event arrives → isOwnMutation = true → SKIP patch + scheduleRefresh
                                            ↓
React Query IS still invalidated (invalidateQueriesForEntityEvent runs before the check)
→ queries refetch → components re-render
```

**Problem:** User A's own changes cause React Query invalidation (correct) but **also** skip the AppContext state patch (correct for deduplication) and **also** skip `scheduleRefresh()` — meaning the full incremental sync is only triggered by other users' mutations, not the user's own. If User A makes 10 rapid changes, no full sync fires.

### 7.3 Incremental Sync vs Full Reload

**File:** `context/AppContext.tsx:1687–1700`

```typescript
if (lastSync && cursorMatchesTenant && baselineHasCoreData) {
  // Incremental: only fetch entities changed after cursor
  const { merged, serverCursor } = await loadStateViaIncrementalSync(lastSync, base);
} else {
  // Full: fetch all bulk state
  const partial = await loadStateForSyncRefresh();
}
```

Incremental sync fetches only entities modified after `lastSyncCursor`. This is efficient for low-mutation-rate scenarios. Under high mutation rates (e.g. payroll run, bulk import), the debounce (2s) + cooldown (3s) means the incremental sync fires at most once per 3 seconds regardless of how many events arrive.

---

## 8. Architectural Flaws

### CRITICAL

#### C-1: Socket.io Server is a Single-Process In-Memory Singleton
**File:** `backend/src/core/realtime.ts:73`
```typescript
let io: Server | null = null;   // module-level singleton
```

**Problem:** The `io` instance exists only in the Node.js process that called `initRealtime()`. In any multi-process or multi-instance deployment (PM2 cluster mode, Render.com auto-scaling, Docker horizontal scaling), each process has its own isolated `io` singleton. A mutation on Process 1 broadcasts to sockets connected to Process 1 only. Users connected to Process 2 never see the event.

**Impact:** Users on different server instances see no real-time updates from each other. This is the root cause of inconsistent updates in production.

**Solution:** Socket.io Adapter for Redis pub/sub (`@socket.io/redis-adapter`). All instances subscribe to the same Redis channel. Process 1 publishes; Redis delivers to all other instances.

---

#### C-2: `emitEntityEvent` Called Outside Transaction Boundary
**File:** `backend/src/modules/accounting/routes/transactionsRoutes.ts` (example)

The `financialPostedEmissions.ts` properly queues emissions inside transactions. However, `emitEntityEvent()` is called directly from route handlers **after** the `withTransaction()` block returns but without verifying whether the commit actually succeeded:

```typescript
const result = await withTransaction(pool, async (client) => {
  // ... DB operations
  return apiRow;
});
// ← socket emit happens here, outside the transaction
emitEntityEvent(tenantId, 'created', 'transaction', { data: result });
```

**Problem:** If the HTTP response sends before the socket emit (due to async scheduling), and any unhandled rejection occurs, the DB row exists but no event fires. More critically, if a route error handler catches and re-throws after the transaction committed, the emit is skipped and connected users never see the new entity.

**Impact:** Silent missed updates — User B does not see User A's change. No error is shown.

---

#### C-3: AppContext Full Reload on Every Socket Event
**File:** `context/AppContext.tsx:1824–1839`

Every socket event from another user triggers `scheduleRefresh()`:
```typescript
const DEBOUNCE_MS = 2000;
const COOLDOWN_MS = 3000;

const scheduleRefresh = () => {
  // fires refreshFromApi() after debounce
};
```

`refreshFromApi()` calls the incremental sync API, which fetches vendors, contacts, rental agreements, invoices, bills, accounts, transactions, categories — **for every socket event**, regardless of whether those entity types are related to the event received.

**Example:** A `goods_receipt` event from User B triggers a full incremental sync on User A's machine that re-fetches invoices, vendors, contacts, and all other types — none of which changed.

**Impact:** Unnecessary API load, network traffic, and re-renders. On high-mutation tenants (bulk imports, batch payroll), the server is hammered with incremental sync requests every 3 seconds from every connected user.

---

#### C-4: `invalidateQueriesForEntityEvent` Runs Sequentially, Not in Parallel
**File:** `services/realtime/entityQueryInvalidation.ts:131–134`

```typescript
await queryClient.invalidateQueries({ queryKey: queryKeys.ledger.all });
await queryClient.invalidateQueries({ queryKey: queryKeys.reports.all });
await queryClient.invalidateQueries({ queryKey: dashboardMetricsQueryKeys.root });
```

Three sequential `await` calls for every financial entity event. Under burst conditions (10 events in 200ms), 30 sequential async operations queue up. This serializes re-fetches and delays UI updates.

**Fix:** `await Promise.all([...])`.

---

#### C-5: Own-Mutation Invalidation Inconsistency
**File:** `context/AppContext.tsx:1843–1872`

```typescript
const handleEntity = (payload) => {
  void invalidateQueriesForEntityEvent(...);  // ← runs for ALL events, including own
  // ...
  const isOwnMutation = payload.sourceUserId === auth.user.id;
  if (isOwnMutation) return;                  // ← returns AFTER invalidation already fired
  // ...
  scheduleRefresh();
};
```

User A's own mutations:
- ✅ React Query is invalidated (query refetches)
- ❌ AppContext reducer patch is skipped (correct)
- ❌ `scheduleRefresh()` is skipped (side effect: no full sync after own mutations)

If User A makes many edits, their AppContext state can drift from the server because `refreshFromApi()` is only triggered by other users' events. The tab visibility listener (1.2s debounce on focus) provides partial recovery.

---

### HIGH

#### H-1: Selling Analytics Module — Silent Invalidation Failure
**File:** `services/realtime/entityQueryInvalidation.ts:98–106`

```typescript
async function invalidateSellingAnalytics(queryClient): Promise<void> {
  try {
    const { sellingAnalyticsQueryKeys } = await import(
      '../../modules/selling-analytics/hooks/useSellingAnalytics'
    );
    await queryClient.invalidateQueries({ queryKey: sellingAnalyticsQueryKeys.root });
  } catch {
    /* module not loaded */   // ← silent failure
  }
}
```

If the selling-analytics module has not been loaded (user hasn't visited the page), the dynamic import fails silently. The `catch {}` swallows all errors. Selling analytics data is never invalidated by real-time events.

**Impact:** Any user who has not navigated to the selling analytics page will see stale data indefinitely, even after socket events for `unit`, `project`, `installment_plan`, etc.

---

#### H-2: Notification Bell and WhatsApp — No Frontend Listeners
**File:** `backend/src/core/realtime.ts:320, 342–350`

The backend emits `notification_created` and `whatsapp:message:*` events. **No listener exists** in:
- `context/AppContext.tsx` socket setup
- `hooks/useRealtimeQuerySync.ts`
- Any component file found during analysis

**Impact:** 
- The notification bell count never updates in real-time — users must refresh the page or wait for polling.
- Incoming WhatsApp messages are not shown in real-time — users see no notification until they re-open the WhatsApp panel.

---

#### H-3: React Query 5-Minute Stale Time — Uniform for All Data
**File:** `config/queryClient.ts:4`

```typescript
export const QUERY_STALE_MS = 5 * 60 * 1000;   // 5 minutes for everything
```

Financial data (invoices, payments, transactions) has the same stale time as static data (role definitions, company settings). If a socket event is missed (disconnect, reconnect window, browser background throttling), financial data will not refresh for up to 5 minutes.

**Examples of incorrect stale times:**
- `invoices`: should be ~30 seconds
- `transactions`: should be ~30 seconds  
- `dashboard metrics`: should be ~60 seconds
- `payroll run status`: should be ~15 seconds
- `report templates`: 5 minutes is fine
- `company settings`: 5 minutes is fine

---

#### H-4: No Reconnect Re-Hydration
**File:** `core/socket.ts:34–40`

Socket.io `reconnection: true` handles the transport layer reconnect. However, there is no listener for the `connect` event that would trigger a full state re-hydration after a reconnect.

**Scenario:**
1. User B's socket disconnects (laptop sleeps, network drop)
2. User A creates 20 invoices during the 5-minute outage
3. User B's socket reconnects
4. No re-hydration triggered — User B sees old data
5. Tab visibility listener fires if user switches tabs, triggering a 1.2s refresh
6. If user never switches tabs: stale data until the 5-minute React Query stale time expires

---

#### H-5: Global `cors: { origin: '*' }` on Socket.io
**File:** `backend/src/core/realtime.ts:89`

```typescript
io = new Server(httpServer, {
  cors: { origin: '*' },   // ← any origin
});
```

The Socket.io server accepts WebSocket connections from any origin. While JWT authentication prevents unauthorized access to data, CORS `*` allows any website to attempt a WebSocket connection, enabling:
- Cross-Site WebSocket Hijacking attempts
- Connection flooding from arbitrary origins
- In combination with a valid stolen JWT, full unauthorized real-time access

**Fix:** Restrict to known origins (same as Express CORS configuration).

---

### MEDIUM

#### M-1: Lock Polling Does Not Scale
**File:** `hooks/useRecordLock.ts`

Every open record view polls the lock status API every **10 seconds**. With 50 users each with 3 open records:
```
50 users × 3 records × 1 request/10s = 15 requests/second constant baseline
```
This baseline grows linearly with connected users and is entirely redundant when Socket.io lock events are working correctly.

#### M-2: Incremental Sync Cursor Stored in Client State
The `lastSyncCursor` is stored in `storedState` (localStorage via the persistence layer). If localStorage is cleared, or the user opens a new browser, the cursor is missing and a full reload is triggered. There is no server-side cursor tracking, so a slow client that misses events cannot request a replay.

#### M-3: `useRealtimeQuerySync` Can Double-Register Listeners
**File:** `hooks/useRealtimeQuerySync.ts:55–65`

The hook registers `entity_created/updated/deleted/financial.posted` listeners. AppContext **also** registers identical listeners. If `useRealtimeQuerySync` is mounted with `enabled: true` while AppContext is also running (the typical case), every socket event triggers the invalidation function **twice**.

#### M-4: AppContext Reducer Patches Cover Only ~10 of 37 Entity Types
Only these entity types receive immediate AppContext reducer patches: `unit`, `invoice`, `transaction`, `contract`, `vendor`, `project`, `contact`. The remaining 27 entity types rely entirely on the 2-second debounced `refreshFromApi()`. Users editing purchase orders, goods receipts, payroll, documents, or any other entity type see a minimum 2-second delay before peers' changes appear.

---

## 9. Scalability Issues

### 9.1 Single-Instance Architecture Ceiling

The current design has a hard ceiling at **one Node.js process**. The moment horizontal scaling is introduced (needed when concurrent socket connections exceed ~10,000 or CPU becomes a bottleneck), all real-time updates silently stop working for cross-process connections.

```
Current maximum:
  ~10,000 concurrent WebSocket connections (single Node.js process)
  ~500 req/s HTTP (before event loop saturation)
  ~200 concurrent users before incremental sync causes noticeable latency
```

### 9.2 Per-Tenant Event Fan-Out at Scale

When a tenant has 500 connected users and one user makes a change:
```
1 DB write → 1 Socket.io room broadcast → 500 socket deliveries
→ 500 × invalidateQueriesForEntityEvent() (async chain)
→ 500 × scheduleRefresh() after 2s
→ 500 × GET /app-state/sync?cursor=... after 3-5s
= 500 concurrent API calls for a single mutation
```

For a SaaS product with 100 active tenants each with 50 users:
```
100 tenants × 50 users × 1 mutation/min = ~83 incremental sync calls/second at steady state
```

### 9.3 Financial Queries Without Materialized Views

Financial entity events invalidate `ledger.all` and `reports.all`. These query keys likely trigger complex SQL aggregation queries (trial balance, P&L, balance sheet) on every invalidation. Without materialized views or incremental snapshot tables, each real-time event that touches a financial entity causes a fresh full aggregation query.

### 9.4 Lock Polling at Scale

15 baseline requests/second (from §M-1) at 50 users. At 500 users:
```
500 users × 3 records × 1/10s = 150 requests/second constant lock polling
```

### 9.5 Electron / LAN Mode: Embedded Socket.io

In Electron mode, the API server runs as an embedded Node.js process. The Socket.io instance is in-process and serves local WebSocket connections. This is fine for LAN use. However, if the Electron server is used as a LAN server for multiple concurrent Electron clients on the same network, all clients must route through the single embedded server, which has the same scaling limits as the cloud single-instance.

### 9.6 No Back-Pressure or Event Throttling

The backend emits events synchronously from every route handler. There is no:
- Rate limiting on event emission per tenant
- Batching of events (10 rapid invoices = 10 socket broadcasts, not 1)
- Circuit breaker if the socket backlog grows

A bulk import of 1,000 invoices generates 1,000 `entity_created` socket events within milliseconds, which fan out to all connected users and trigger 1,000 × N `invalidateQueriesForEntityEvent` chains.

---

## 10. Enterprise-Grade Synchronization Architecture (v2)

### 10.1 Design Principles

1. **Horizontally scalable** — no in-process state; stateless backend nodes
2. **Event-driven with back-pressure** — events batched and throttled before delivery
3. **Tenant-isolated** — no cross-tenant event leakage at any layer
4. **Topology-agnostic** — same design works for Cloud, LAN, and Electron
5. **Resilient** — missed events recoverable via server-side replay log
6. **Targeted invalidation** — only affected query keys refresh, never full sweeps
7. **Per-data-type stale policy** — financial data refreshes in seconds, static data in minutes

---

### 10.2 Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          FRONTEND (React / Electron)                         │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐    │
│  │  SyncEngine (replaces AppContext socket listener)                    │    │
│  │                                                                      │    │
│  │  ┌─────────────────┐   ┌──────────────────┐   ┌──────────────────┐  │    │
│  │  │ Socket.io Client │   │ Targeted Query   │   │ Event Replay     │  │    │
│  │  │ (reconnect-aware)│→  │ Invalidation     │→  │ on Reconnect     │  │    │
│  │  └─────────────────┘   └──────────────────┘   └──────────────────┘  │    │
│  │          ↑                      ↑                       ↑            │    │
│  │  ┌───────────────┐    ┌─────────────────────┐  ┌───────────────┐    │    │
│  │  │ Reconnect     │    │ Per-Type Stale Times │  │ Optimistic    │    │    │
│  │  │ Re-hydration  │    │ (financial: 30s,     │  │ Updates       │    │    │
│  │  │               │    │  static: 5m)         │  │               │    │    │
│  │  └───────────────┘    └─────────────────────┘  └───────────────┘    │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
└────────────────────────────────┬─────────────────────────────────────────────┘
                                 │  WebSocket + HTTP
                                 ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                        BACKEND (Node.js Cluster / Multiple Instances)        │
│                                                                              │
│  ┌────────────────┐    ┌────────────────┐    ┌────────────────┐             │
│  │  API Server 1  │    │  API Server 2  │    │  API Server N  │             │
│  │  (Express +    │    │  (Express +    │    │  (Express +    │             │
│  │   Socket.io)   │    │   Socket.io)   │    │   Socket.io)   │             │
│  └───────┬────────┘    └───────┬────────┘    └───────┬────────┘             │
│          │                     │                     │                       │
│          └─────────────────────┴─────────────────────┘                       │
│                                │                                              │
│                    ┌───────────▼──────────┐                                  │
│                    │  Event Bus           │                                  │
│                    │  (Redis pub/sub      │                                  │
│                    │   + Socket.io        │                                  │
│                    │   Redis Adapter)     │                                  │
│                    └───────────┬──────────┘                                  │
│                                │                                              │
│          ┌─────────────────────┼──────────────────────┐                      │
│          │                     │                      │                       │
│  ┌───────▼──────────┐  ┌───────▼──────────┐  ┌───────▼──────────┐          │
│  │ Event Log        │  │ Batch/Throttle   │  │ Replay API       │          │
│  │ (event_log table │  │ Layer            │  │ GET /events?after│          │
│  │  or Redis stream)│  │ (merge bursts,   │  │ =cursor&tenant=x │          │
│  │                  │  │  cap rate/tenant)│  │                  │          │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘          │
│                                │                                              │
│                    ┌───────────▼──────────┐                                  │
│                    │  PostgreSQL          │                                  │
│                    │  (Primary data store)│                                  │
│                    └──────────────────────┘                                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

### 10.3 Backend: Event Bus with Redis Adapter

#### Replace In-Process Socket.io with Redis-Backed Broadcast

```typescript
// backend/src/core/realtime.ts (v2)
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

export async function initRealtime(httpServer: HttpServer): Promise<Server> {
  io = new Server(httpServer, {
    cors: { origin: allowedOrigins },   // explicit allowlist, not '*'
    transports: ['websocket', 'polling'],
    adapter: createAdapter(pubClient, subClient),   // Redis adapter
  });
  // ... same JWT middleware + room join
}
```

All `io.to(tenantRoom(tid)).emit(...)` calls now publish through Redis, and every instance receives and forwards to its local sockets.

#### Server-Side Event Log

```sql
-- New table: realtime_event_log
CREATE TABLE realtime_event_log (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  event_name    TEXT NOT NULL,
  payload       JSONB NOT NULL,
  emitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_event_log_tenant_time ON realtime_event_log(tenant_id, emitted_at DESC);
-- Retention: auto-delete events older than 15 minutes (pg_cron or TTL worker)
```

Every `emitEvent()` call also inserts a row. This enables server-side replay for reconnecting clients.

#### Transactional Emission for All Entity Events

Extend the `AsyncLocalStorage` pattern from `financialPostedEmissions.ts` to **all** entity events:

```typescript
// All emitEntityEvent() calls inside withTransaction() are queued
// Flushed after COMMIT, cleared on ROLLBACK
// Eliminates the phantom-event problem (C-2)
```

#### Tenant-Scoped Event Batching (Back-Pressure)

```typescript
// Accumulate events for 100ms per tenant before broadcasting
const batchWindow = new Map<string, { timer: NodeJS.Timeout; events: RealtimePayload[] }>();

function queueBatchedEmit(tenantId: string, payload: RealtimePayload): void {
  const batch = batchWindow.get(tenantId) ?? { timer: null, events: [] };
  batch.events.push(payload);
  if (!batch.timer) {
    batch.timer = setTimeout(() => {
      flushBatch(tenantId);
    }, 100); // 100ms batch window
  }
  batchWindow.set(tenantId, batch);
}

function flushBatch(tenantId: string): void {
  const batch = batchWindow.get(tenantId);
  if (!batch) return;
  batchWindow.delete(tenantId);
  io.to(tenantRoom(tenantId)).emit('entity_batch', {
    tenantId,
    events: batch.events,
    ts: new Date().toISOString(),
  });
}
```

A 1,000-invoice bulk import generates 1 batched event instead of 1,000 individual socket broadcasts.

#### Replay API Endpoint

```
GET /api/v1/realtime/replay?tenantId=X&after=ISO8601&limit=200
Authorization: Bearer <token>
→ Returns events from realtime_event_log for the tenant since the given cursor
```

Used by clients on reconnect to catch up on missed events without a full state reload.

---

### 10.4 Frontend: SyncEngine

Replace the socket listener block in `AppContext.tsx` (lines 1807–2124) with a standalone `SyncEngine` class:

#### Responsibilities
1. Manage socket lifecycle (connect/disconnect/reconnect)
2. Track server-side event cursor
3. On reconnect: call replay API to catch up on missed events
4. Deliver events to registered handlers (React Query invalidation, AppContext patches)
5. Handle batched events (`entity_batch` → fan out to individual handlers)
6. No full incremental sync on every event

#### Interface

```typescript
class SyncEngine {
  connect(token: string, tenantId: string): void
  disconnect(): void
  on(eventType: RealtimeEntityType | '*', handler: SyncHandler): Unsubscribe
  getCursor(): string | null   // last received event timestamp
}

type SyncHandler = (payload: RealtimeEntityPayload) => void;
```

#### Reconnect Re-Hydration

```typescript
socket.on('connect', async () => {
  const cursor = syncEngine.getCursor();
  if (cursor) {
    // Fetch missed events since last seen
    const missed = await fetchReplayEvents(tenantId, cursor);
    for (const event of missed) {
      syncEngine.dispatch(event);
    }
  } else {
    // First connect: full state load (existing behavior)
    await refreshFromApi();
  }
});
```

---

### 10.5 React Query: Per-Type Stale Times

Replace the global `staleTime: 5 * 60 * 1000` with per-query-key configurations:

```typescript
// High-frequency financial data: 30 seconds
queryClient.setQueryDefaults(queryKeys.ledger.all, { staleTime: 30_000 });
queryClient.setQueryDefaults(queryKeys.invoices.all, { staleTime: 30_000 });
queryClient.setQueryDefaults(['transactions'], { staleTime: 30_000 });

// Medium-frequency operational data: 2 minutes
queryClient.setQueryDefaults(['contracts'], { staleTime: 2 * 60_000 });
queryClient.setQueryDefaults(['purchase-orders'], { staleTime: 2 * 60_000 });
queryClient.setQueryDefaults(['payroll'], { staleTime: 2 * 60_000 });

// Low-frequency reference data: 10 minutes (keep current)
queryClient.setQueryDefaults(['vendors'], { staleTime: 10 * 60_000 });
queryClient.setQueryDefaults(['contacts'], { staleTime: 10 * 60_000 });

// Static configuration data: 30 minutes
queryClient.setQueryDefaults(['roles'], { staleTime: 30 * 60_000 });
queryClient.setQueryDefaults(['settings'], { staleTime: 30 * 60_000 });

// Enable refetchOnWindowFocus for critical financial data
queryClient.setQueryDefaults(queryKeys.ledger.all, { refetchOnWindowFocus: true });
```

---

### 10.6 Targeted Invalidation (No Full Sweeps)

Replace `scheduleRefresh()` (full incremental sync every 2–3 seconds) with entity-type-specific invalidation:

```typescript
// In SyncEngine handler (v2)
const handleEvent = (payload: RealtimeEntityPayload) => {
  // 1. Targeted React Query invalidation only
  void invalidateQueriesForEntityEvent(queryClient, payload, ctx);

  // 2. Targeted AppContext patch for supported types
  applyAppContextPatch(payload);

  // 3. Dashboard indicator for financial events
  maybeMarkDashboardRefreshForEntity(payload, ctx);

  // NO scheduleRefresh() — no full sync on every event
};
```

Full `refreshFromApi()` is triggered only by:
- Reconnect (with replay gap)
- Tab visibility change after >5 minute absence
- Manual user action
- 409 CONFLICT response

---

### 10.7 Parallel Invalidation

Fix the sequential await chain in `entityQueryInvalidation.ts`:

```typescript
// Before (sequential — blocks on each await):
await queryClient.invalidateQueries({ queryKey: queryKeys.ledger.all });
await queryClient.invalidateQueries({ queryKey: queryKeys.reports.all });
await queryClient.invalidateQueries({ queryKey: dashboardMetricsQueryKeys.root });

// After (parallel):
await Promise.all([
  queryClient.invalidateQueries({ queryKey: queryKeys.ledger.all }),
  queryClient.invalidateQueries({ queryKey: queryKeys.reports.all }),
  queryClient.invalidateQueries({ queryKey: dashboardMetricsQueryKeys.root }),
]);
```

---

### 10.8 Missing Listeners: Notifications and WhatsApp

Add frontend socket listeners for currently unhandled events:

```typescript
// In SyncEngine or dedicated hooks:

socket.on('notification_created', (payload: UserNotificationSocketPayload) => {
  if (payload.userId !== currentUserId) return;   // filter to own notifications
  void queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
  void queryClient.invalidateQueries({ queryKey: ['notifications', 'list'] });
  showNotificationToast(payload.notificationId);
});

socket.on('whatsapp:message:received', (payload) => {
  void queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
  incrementWhatsAppUnreadCount();
});
```

---

### 10.9 Topology-Specific Adaptations

#### Cloud (Multi-Instance)
- Redis Adapter for Socket.io (`@socket.io/redis-adapter`)
- Redis for event log (TTL 15 min) + PostgreSQL for long-term audit
- Load balancer with sticky sessions or IP hash (for Socket.io polling fallback)
- `CORS` restricted to app domain

#### LAN Mode
- Redis not required for single-LAN-server deployments
- Socket.io in-process is acceptable (single node)
- Event log in PostgreSQL (already available)
- Replay API available to LAN clients on reconnect

#### Electron (Desktop)
- Embedded Node.js server: Socket.io in-process (no Redis needed)
- Event log in SQLite (using the existing SQLite bridge)
- Offline mode: events queued in IndexedDB on client; flushed on reconnect to LAN/Cloud
- Reconnect handling: when Electron app wakes from sleep → trigger replay

---

### 10.10 Migration Plan

| Phase | Change | Breaking? | Effort |
|---|---|---|---|
| 1 | Fix parallel `Promise.all` in `entityQueryInvalidation.ts` | No | Low |
| 2 | Add `notification_created` and `whatsapp` frontend listeners | No | Low |
| 3 | Fix `cors: '*'` → explicit origin allowlist | No | Low |
| 4 | Fix own-mutation `scheduleRefresh()` skip (call it always, debounced) | No | Low |
| 5 | Add per-query stale times in `queryClient.ts` | No | Low |
| 6 | Wrap all `emitEntityEvent()` calls in transactional queue | No | Medium |
| 7 | Add reconnect event handler → replay API call | No | Medium |
| 8 | Add `realtime_event_log` table and replay endpoint | No | Medium |
| 9 | Add Redis pub/sub adapter for Socket.io | No (additive) | Medium |
| 10 | Replace `scheduleRefresh()` with SyncEngine targeted dispatch | Yes (refactor) | High |
| 11 | Add tenant-scoped event batching (100ms window) | No | Medium |
| 12 | Extend AppContext patches to remaining 27 entity types | No | High |

Phases 1–5 address the reported UI inconsistency with low risk. Phases 6–9 address scalability. Phases 10–12 constitute the full v2 architecture.

---

### 10.11 Expected Improvements

| Metric | Current | After Phase 1–5 | After Full v2 |
|---|---|---|---|
| Time for User B to see User A's change | 50ms–5s (inconsistent) | 50–500ms (consistent) | 30–150ms (consistent) |
| Events missed on socket reconnect | All (no replay) | All (no replay yet) | 0 (replay from log) |
| Notification bell update latency | Page reload required | Page reload required | <200ms real-time |
| Full sync calls per mutation | 1 per connected user | 1 per connected user | 0 (targeted only) |
| Maximum concurrent users (single server) | ~200–500 | ~200–500 | ~5,000+ (with Redis) |
| Bulk import (1,000 records) socket events | 1,000 broadcasts | 1,000 broadcasts | 1 batched broadcast |

---

*End of review. No source files were modified during this analysis.*
