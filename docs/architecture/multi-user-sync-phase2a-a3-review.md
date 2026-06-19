# Phase 2A — A3: RealtimeDispatchHub Architecture Review

**Date:** 2026-06-18  
**Scope:** Analysis of current socket event handling after Phase 1 and A1. Design for a RealtimeDispatchHub that consolidates subscriber registration without introducing Redis, event replay, or new React providers.  
**Status:** Design only — no code has been modified.

---

## 1. Current Architecture

### 1.1 Backend Socket Infrastructure

**File:** `backend/src/core/realtime.ts`

A single `socket.io` `Server` instance (`io`) manages all connections. On connection, each socket is joined to a tenant-scoped room:

```
tenant:{tenantId}
```

Events are broadcast to the room via `io.to(tenantRoom(tenantId)).emit(...)`. There is no per-user room, no cross-tenant room, and no public channel.

**Backend event names emitted to clients:**

| Event name | Emitter function | Payload type |
|---|---|---|
| `entity_created` | `emitEntityEvent` (action=created) | `RealtimePayload` |
| `entity_updated` | `emitEntityEvent` (action=updated) | `RealtimePayload` |
| `entity_deleted` | `emitEntityEvent` (action=deleted) | `RealtimePayload` |
| `financial.posted` | `emitFinancialPosted` | `RealtimePayload` (type=payment) |
| `lock_acquired` | `emitLockEvent` | `LockSocketPayload` |
| `lock_released` | `emitLockEvent` | `LockSocketPayload` |
| `notification_created` | `emitUserNotification` | `UserNotificationSocketPayload` |
| `chat:message` | `emitInternalChatMessage` | `InternalChatMessagePayload` |
| `whatsapp:message:received` | `emitWhatsAppMessageReceived` | `WhatsAppSocketPayload` |
| `whatsapp:message:sent` | `emitWhatsAppMessageSent` | `WhatsAppSocketPayload` |
| `whatsapp:message:status` | `emitWhatsAppMessageStatus` | `WhatsAppSocketPayload` |
| `approval_requested` | `emitApprovalEvent` | `ApprovalSocketPayload` |
| `approval_approved` | `emitApprovalEvent` | `ApprovalSocketPayload` |
| `approval_rejected` | `emitApprovalEvent` | `ApprovalSocketPayload` |
| `approval_returned` | `emitApprovalEvent` | `ApprovalSocketPayload` |
| `approval_escalated` | `emitApprovalEvent` | `ApprovalSocketPayload` |
| `approval_delegated` | `emitApprovalEvent` | `ApprovalSocketPayload` |

**A1 integration:** `emitEntityEvent` is now the fallback path only. Priority routes use `queueEntityEvent` → flushed by `withTransaction` post-COMMIT → `flushEntityEventQueue` → `emitEntityEvent`. The event payload and socket routing are identical to pre-A1; only the timing (post-COMMIT instead of post-route-handler) changed.

### 1.2 Client Socket Infrastructure

**File:** `core/socket.ts`

A single module-level `socket` variable holds the `Socket.IO` client. `connectRealtimeSocket(token)` creates it once and reuses it for the same token. `getRealtimeSocket()` returns it for any subscriber to call `.on()` / `.off()`.

There is no event bus, no subscription registry, and no deduplication layer. Every caller calls `socket.on(event, handler)` directly. The socket is shared but the listener list is not managed centrally.

---

## 2. Current Event Listener Inventory

### 2.1 AppContext (`context/AppContext.tsx`, lines 1820–2177)

**Mounted at:** app root (wraps entire component tree).  
**Socket events subscribed:**

| Event | Handler | Actions taken |
|---|---|---|
| `entity_created` | `handleEntity` | `invalidateQueriesForEntityEvent`, `maybeMarkDashboardRefreshForEntity`, reducer patch (ADD/UPDATE/DELETE), `scheduleRefresh` |
| `entity_updated` | `handleEntity` | (same) |
| `entity_deleted` | `handleEntity` | (same) |
| `financial.posted` | `handleFinancialPosted` | `invalidateQueriesForFinancialPosted`, `markDashboardRefreshForFinancialPosted`, `scheduleRefresh` |
| `notification_created` | `handleNotificationCreated` | Invalidate `USER_NOTIFICATIONS_QUERY_KEY`, `['mobile-notifications']` |
| `connect` | `handleReconnect` | Debounced `scheduleRefresh` (skip on first connect) |

**Cross-cutting:** AppContext holds `lastApiRefreshAtRef` (shared cooldown with reconnect and tab-visibility handlers). `scheduleRefresh` debounces `refreshFromApi` using `API_REFRESH_DEBOUNCE_MS` (2 s) and `API_REFRESH_COOLDOWN_MS` (3 s).

### 2.2 `useRealtimeQuerySync` (`hooks/useRealtimeQuerySync.ts`)

**Mounted at:** Optional — designed for feature modules that need extra invalidation keys beyond the central map.  
**Socket events subscribed:**

| Event | Handler | Actions taken |
|---|---|---|
| `entity_created` | `onEntity` | `invalidateQueriesForEntityEvent`, then optional `onEntityEvent` callback |
| `entity_updated` | `onEntity` | (same) |
| `entity_deleted` | `onEntity` | (same) |
| `financial.posted` | `onFinancialPosted` | `invalidateQueriesForFinancialPosted` |

**Problem:** This hook re-subscribes the same `invalidateQueriesForEntityEvent` and `invalidateQueriesForFinancialPosted` calls that AppContext already makes for every matching event. If mounted alongside AppContext with default options, every entity event triggers `invalidateQueriesForEntityEvent` twice.

### 2.3 `usePurchaseOrders` (`hooks/usePurchaseOrders.ts`)

**Mounted at:** Purchase orders list page (when rendered).  
**Socket events subscribed:**

| Event | Handler | Actions taken |
|---|---|---|
| `entity_created` | `onEntity` | If `type === 'purchase_order'` or `'bill'`: invalidate `['purchase-orders']`, `['purchase-order-report']` |
| `entity_updated` | `onEntity` | (same) |
| `entity_deleted` | `onEntity` | (same) |

**Duplication with AppContext:** `entityQueryInvalidation.ts` already covers `purchase_order` → `['purchase-orders']`, `['procurement-dashboard']`, `['quotation-comparison']`. This hook adds `['purchase-order-report']` and applies on `bill` events too. The `['purchase-orders']` key is invalidated twice for every `purchase_order` event (once by AppContext, once by this hook) when the PO list is mounted.

### 2.4 `useGoodsReceipts` (`hooks/useGoodsReceipts.ts`)

**Mounted at:** Goods receipts list page (when rendered).  
**Socket events subscribed:**

| Event | Handler | Actions taken |
|---|---|---|
| `entity_created` | `onEntity` | If `type === 'goods_receipt'` or `'purchase_order'`: invalidate `['goods-receipts']`, `['goods-receipt-report']`, `['purchase-orders']` |
| `entity_updated` | `onEntity` | (same) |
| `entity_deleted` | `onEntity` | (same) |

**Duplication with AppContext:** `entityQueryInvalidation.ts` covers `goods_receipt` → `['goods-receipts']`, `['goods-receipt-report']`, `['purchase-orders']`, `['procurement-dashboard']`. This hook invalidates `['goods-receipts']`, `['goods-receipt-report']`, `['purchase-orders']` a second time for every `goods_receipt` or `purchase_order` event when the GRN list is mounted.

### 2.5 `useQuotationComparison` (`hooks/useQuotationComparison.ts`)

**Mounted at:** Quotation comparison page (when rendered).  
**Socket events subscribed:**

| Event | Handler | Actions taken |
|---|---|---|
| `entity_created` | `onEntity` | If `type === 'quotation'`, `'vendor'`, or `'purchase_order'`: invalidate `['quotation-comparison']`, `['procurement-dashboard']` |
| `entity_updated` | `onEntity` | (same) |
| `entity_deleted` | `onEntity` | (same) |

**Duplication with AppContext:** `entityQueryInvalidation.ts` covers `vendor` / `quotation` → `['vendors']`, `['quotations']`, `['quotation-comparison']`, `['procurement-dashboard']`; `purchase_order` → `['purchase-orders']`, `['procurement-dashboard']`, `['quotation-comparison']`. Every matching event triggers both handlers.

### 2.6 `useWorkflowSettings` and `useApprovalQueue` (`hooks/useWorkflow.ts`)

**Mounted at:** Each independently when its consuming component mounts (both can mount simultaneously).  
**Socket events subscribed (each):**

| Event | Handler | Actions taken |
|---|---|---|
| `approval_requested` | `onApproval` | Invalidate `['workflow']`, `['purchase-orders']`, `['notifications']`, `dashboardMetricsQueryKeys.root`, `['contracts']`, `['bills']`, `['transactions']`, `['vendors']` |
| `approval_approved` | `onApproval` | (same) |
| `approval_rejected` | `onApproval` | (same) |
| `approval_returned` | `onApproval` | (same) |
| `approval_escalated` | `onApproval` | (same) |
| `approval_delegated` | `onApproval` | (same) |

**Duplication between `useWorkflowSettings` and `useApprovalQueue`:** Both hooks register identical handlers for all 6 `approval_*` events. When both are mounted (common on the workflow screen), every approval event triggers `invalidateApprovalQueries` twice.

### 2.7 `useMobileCommandCenter` (`modules/executive-mobile/hooks/useMobileCommandCenter.ts`)

**Mounted at:** Executive mobile view (when active).  
**Socket events subscribed:**

| Event | Handler | Actions taken |
|---|---|---|
| `entity_event` | `invalidate` | Invalidate `MOBILE_COMMAND_CENTER_KEY`, `['mobile-dashboard']`, `['mobile-approvals']`, `['mobile-notifications']` |
| `financial_posted` | `invalidate` | (same) |
| `notification_created` | `invalidate` | (same) |
| `project_expense_voucher_updated` | `invalidate` | (same) |
| `installment_plan_updated` | `invalidate` | (same) |

**Problem:** Subscribes to `entity_event` and `financial_posted` — these event names do not match the actual events emitted by the backend (`entity_created` / `entity_updated` / `entity_deleted` and `financial.posted`). These handlers will **never fire**. The mobile dashboard relies on `refetchInterval: 90_000` as actual refresh mechanism, not the socket.

### 2.8 `useMobileNotifications` (`modules/executive-mobile/hooks/useMobileNotifications.ts`)

**Mounted at:** Executive mobile view (when active).  
**Socket events subscribed (same 6 `approval_*` events as workflow hooks):**

- Invalidates `['mobile-notifications']`, `['workflow']`, `['user-notifications']`, `['mobile-approvals']`.

**Duplication:** When both `useMobileNotifications` and `useWorkflowSettings` / `useApprovalQueue` are mounted, the 6 approval events fire 3 separate handlers each.

### 2.9 `useRecordLock` (`hooks/useRecordLock.ts`)

**Mounted at:** Any record editing form that enables locking (bill edit, invoice edit, etc.).  
**Socket events subscribed:**

| Event | Handler | Actions taken |
|---|---|---|
| `lock_acquired` | `onAcquired` | Update local lock state if `recordType + recordId` match |
| `lock_released` | `onReleased` | Poll `getRecordLockStatus` and update local lock state |

**Design:** Instance-scoped filter (`recordType + recordId`). This is the correct design for lock events — no duplication concern since each instance filters to its own record.

### 2.10 `Header.tsx` (chat)

Subscribes to `whatsapp:message:received` for WhatsApp notification badge.

### 2.11 `Sidebar.tsx`

Subscribes to `chat:message` for internal chat badge.

---

## 3. Duplicate Invalidation Paths

### 3.1 Exact Duplications (same query keys invalidated multiple times per event)

| Entity event | Query key | Invalidated by |
|---|---|---|
| `purchase_order` created/updated/deleted | `['purchase-orders']` | AppContext (`entityQueryInvalidation`) + `usePurchaseOrders` (if mounted) |
| `purchase_order` created/updated/deleted | `['procurement-dashboard']` | AppContext + `useQuotationComparison` (if mounted) |
| `purchase_order` created/updated/deleted | `['quotation-comparison']` | AppContext + `useQuotationComparison` (if mounted) |
| `goods_receipt` created/updated/deleted | `['goods-receipts']` | AppContext + `useGoodsReceipts` (if mounted) |
| `goods_receipt` created/updated/deleted | `['goods-receipt-report']` | AppContext + `useGoodsReceipts` (if mounted) |
| `goods_receipt` created/updated/deleted | `['purchase-orders']` | AppContext + `useGoodsReceipts` (if mounted) |
| `vendor` / `quotation` created/updated/deleted | `['quotation-comparison']` | AppContext + `useQuotationComparison` (if mounted) |
| `vendor` / `quotation` created/updated/deleted | `['procurement-dashboard']` | AppContext + `useQuotationComparison` (if mounted) |
| Any `approval_*` event | `['workflow']`, `['purchase-orders']`, etc. | `useWorkflowSettings` + `useApprovalQueue` (both commonly mounted) |
| Any `approval_*` event | `['mobile-notifications']`, etc. | `useMobileNotifications` + `useWorkflowSettings` / `useApprovalQueue` (when mobile + workflow screens both active) |

### 3.2 Near-Miss Duplications (overlapping but not identical keys)

- `useRealtimeQuerySync`: calls `invalidateQueriesForEntityEvent` and `invalidateQueriesForFinancialPosted`, which are the same functions AppContext calls. No app-level consumer uses `onEntityEvent` callback (the only differentiation point).
- `usePurchaseOrders`: invalidates `['purchase-orders']` on `bill` events; AppContext does not. This is additive, not duplicate — but the `purchase_order` → `['purchase-orders']` path is still a duplicate.

### 3.3 Broken / Dead Subscriptions

- `useMobileCommandCenter` subscribes to `entity_event` and `financial_posted` — neither event name is emitted by the backend. Handlers are dead. Mobile command center refreshes only via `refetchInterval`.

---

## 4. AppContext Responsibilities That Should Move to RealtimeDispatchHub

AppContext currently owns the entire socket lifecycle because it is the only component that:
- Holds `lastApiRefreshAtRef` (cooldown/debounce shared across reconnect and visibility)
- Calls `refreshFromApi` (full server state merge)
- Calls `baseDispatch` with reducer patches (ADD/UPDATE/DELETE entity actions)

These are **core responsibilities that must stay in AppContext**:
- `refreshFromApi` — depends on `isAuthenticated`, `dispatch`, `setStoredState`, `currentTenantId`, `auth.user.role`
- `scheduleRefresh` / `runRefreshFromApi` — debounce/cooldown timers owned by the AppContext effect
- `baseDispatch` reducer patches — entity state management belongs to AppContext
- `handleReconnect` — reconnect must trigger a full refresh via `refreshFromApi`

**Responsibilities that belong outside AppContext** (currently duplicated in feature hooks):

| Responsibility | Current location | Should move to |
|---|---|---|
| Query invalidation on `entity_*` events | AppContext + 3 procurement hooks | RealtimeDispatchHub (central map) |
| Query invalidation on `financial.posted` | AppContext + `useRealtimeQuerySync` | RealtimeDispatchHub |
| Query invalidation on `approval_*` events | `useWorkflowSettings` + `useApprovalQueue` + `useMobileNotifications` | RealtimeDispatchHub |
| Dashboard refresh marker | AppContext (integrated into `handleEntity`) | RealtimeDispatchHub |
| `notification_created` invalidation | AppContext | RealtimeDispatchHub |
| Procurement-specific extra keys | `usePurchaseOrders`, `useGoodsReceipts`, `useQuotationComparison` | RealtimeDispatchHub (extend central map) |
| Mobile approval invalidation | `useMobileNotifications` | RealtimeDispatchHub |

**Responsibilities that must remain in AppContext:**
- Socket lifecycle (`connectRealtimeSocket`, `disconnectRealtimeSocket`)
- `handleReconnect` (triggers `scheduleRefresh` → `refreshFromApi`)
- Reducer patches (`baseDispatch` with `_isRemote: true`)
- `scheduleRefresh` / debounce / cooldown

The goal is to separate:
1. **Central query invalidation** (stateless, queryClient-only) → RealtimeDispatchHub
2. **State management** (reducer patches, full refresh) → AppContext

---

## 5. Procurement-Specific Listeners

These 3 hooks each register 3 socket event handlers (`entity_created/updated/deleted`) with entity-type guards and query key invalidation:

### `usePurchaseOrders`
- Fires on `purchase_order` or `bill` events
- Invalidates: `['purchase-orders']`, `['purchase-order-report']`
- **Unique key not in AppContext:** `['purchase-order-report']` (for `bill` events specifically)
- Redundant: `['purchase-orders']` on `purchase_order` events (already covered)

### `useGoodsReceipts`
- Fires on `goods_receipt` or `purchase_order` events
- Invalidates: `['goods-receipts']`, `['goods-receipt-report']`, `['purchase-orders']`
- **Unique key not in AppContext:** `['goods-receipt-report']` (included; `entityQueryInvalidation` also has `['goods-receipt-report']` — fully duplicated)
- Redundant: All 3 keys already covered by `entityQueryInvalidation`

### `useQuotationComparison`
- Fires on `quotation`, `vendor`, or `purchase_order` events
- Invalidates: `['quotation-comparison']`, `['procurement-dashboard']`
- Fully redundant — both keys are covered by `entityQueryInvalidation`

**Conclusion:** All procurement-specific invalidation logic is either already in `entityQueryInvalidation.ts` or should be added there. The module-level socket subscriptions can be removed once the central map is confirmed to cover all their keys.

---

## 6. Accounting-Specific Listeners

There are no separate accounting-specific socket hooks. Accounting entity invalidation (`bill`, `invoice`, `transaction`, `account`, `category`, `journal_entry`, `ledger`, `reports`) is handled entirely inside `entityQueryInvalidation.ts` under the `FINANCIAL_ENTITY_TYPES` set and the `invoice/bill` branch.

The AppContext `handleFinancialPosted` handler calls `invalidateQueriesForFinancialPosted` (ledger, reports, dashboard) and then `scheduleRefresh`. This is the only subscriber to `financial.posted`.

The `useRealtimeQuerySync` hook also calls `invalidateQueriesForFinancialPosted` on `financial.posted`, making it a second subscriber when the hook is enabled. No component currently uses `useRealtimeQuerySync` with `onEntityEvent` — it appears unused or mounted with a no-op.

---

## 7. RealtimeDispatchHub Architecture Design

### 7.1 Design Goals

1. **Single registration point** for all query-invalidation subscribers to `entity_*`, `financial.posted`, `approval_*`, and `notification_created` events.
2. **No duplicate invalidation** — each query key is invalidated at most once per event cycle regardless of which feature pages are mounted.
3. **Preserve AppContext responsibilities** — reducer patches, `scheduleRefresh`, and `refreshFromApi` remain in AppContext and are triggered via a callback from the hub.
4. **No new React providers** — the hub is a module-level singleton (not a Context), initialized after socket connect.
5. **No Redis, no replay** — events are fire-and-forget; socket disconnect means missed events; full refresh on reconnect is the recovery path.
6. **Preserve Phase 1 behavior** — `scheduleRefresh`, `shouldSkipRemoteReducerPatch`, `isWithinRefreshCooldown` semantics unchanged.
7. **Preserve A1 behavior** — events arrive post-COMMIT from `flushEntityEventQueue`; the hub receives them identically to pre-A1; no change to flush ordering or queue semantics.
8. **Preserve multi-tenant isolation** — `tenantId` check (`payload.tenantId !== currentTenantId`) stays in the dispatch path.

### 7.2 Module Location

```
services/realtime/RealtimeDispatchHub.ts
```

This is a pure TypeScript module (no React import). It does not export a React component or hook. It exports:
- `initRealtimeDispatchHub(socket, queryClient, ctx)` — called once by AppContext after `connectRealtimeSocket`
- `teardownRealtimeDispatchHub(socket)` — called by AppContext cleanup
- `RealtimeDispatchHubCallbacks` type

### 7.3 Hub Responsibilities

The hub registers **one handler per event name** on the socket, replacing the current scattered registrations. It:

1. Validates tenant scope (`payload.tenantId !== ctx.currentTenantId → return`)
2. Calls `invalidateQueriesForEntityEvent` (already does all module invalidation)
3. Calls additional invalidation for keys missing from the central map:
   - `['purchase-order-report']` on `bill` events (gap from `usePurchaseOrders`)
4. Calls `markDashboardRefreshIndicator` where appropriate
5. Calls provided callbacks: `onEntityEvent(payload)`, `onFinancialPosted()`, `onNotification(payload)`, `onApproval(payload)`

AppContext passes its own callbacks:
- `onEntityEvent` → AppContext reducer patch logic + `scheduleRefresh`
- `onFinancialPosted` → `scheduleRefresh`
- `onNotification` → already handled by `invalidateQueriesForEntityEvent` (notification_created → USER_NOTIFICATIONS_QUERY_KEY)
- `onApproval` → approval-specific invalidation (currently in `useWorkflow`)
- `onReconnect` → AppContext `handleReconnect`

### 7.4 Hub Interface

```typescript
// services/realtime/RealtimeDispatchHub.ts

export type RealtimeDispatchHubContext = {
  currentUserId: string | undefined;
  currentTenantId: string | undefined;
};

export type RealtimeDispatchHubCallbacks = {
  /** Called after query invalidation for entity events. AppContext uses for reducer patches + scheduleRefresh. */
  onEntityEvent: (payload: RealtimeEntityPayload) => void;
  /** Called after query invalidation for financial.posted. AppContext uses for scheduleRefresh. */
  onFinancialPosted: () => void;
  /** Called for notification_created. Invalidation already done by hub. AppContext may add nothing here. */
  onNotification?: (payload: { userId?: string; tenantId?: string }) => void;
  /** Called for each approval_* event. Hub handles query invalidation; AppContext may pass null. */
  onApproval?: (event: string, payload: { tenantId?: string }) => void;
  /** Called on socket reconnect (after first connect). AppContext triggers scheduleRefresh here. */
  onReconnect: () => void;
};

export function initRealtimeDispatchHub(
  socket: Socket,
  queryClient: QueryClient,
  ctx: RealtimeDispatchHubContext,
  callbacks: RealtimeDispatchHubCallbacks
): () => void; // returns teardown function
```

### 7.5 Hub Event Handler Map

```
socket.on('entity_created')     → handleEntity
socket.on('entity_updated')     → handleEntity
socket.on('entity_deleted')     → handleEntity
socket.on('financial.posted')   → handleFinancialPosted
socket.on('notification_created') → handleNotification
socket.on('approval_requested') → handleApproval
socket.on('approval_approved')  → handleApproval
socket.on('approval_rejected')  → handleApproval
socket.on('approval_returned')  → handleApproval
socket.on('approval_escalated') → handleApproval
socket.on('approval_delegated') → handleApproval
socket.on('connect')            → handleReconnect
```

Events **not** managed by the hub (remain in their consuming components):
- `lock_acquired`, `lock_released` → `useRecordLock` (instance-scoped, must stay)
- `chat:message` → Sidebar (UI-local badge)
- `whatsapp:message:received` → Header (UI-local badge)

### 7.6 `handleEntity` Flow

```
handleEntity(payload):
  1. if payload.tenantId && payload.tenantId !== ctx.currentTenantId → return
  2. await invalidateQueriesForEntityEvent(queryClient, payload, ctx)
  3. if payload.type === 'bill' → invalidate ['purchase-order-report']  // gap fill
  4. maybeMarkDashboardRefreshForEntity(payload, ctx)
  5. callbacks.onEntityEvent(payload)
```

AppContext `onEntityEvent` implementation (moved from current `handleEntity` inline code):
```
  - if bulkRefresh settings event → runRefreshFromApi(); return
  - if isOwnMutation → scheduleRefresh(); return
  - baseDispatch reducer patch (existing switch logic)
  - scheduleRefresh()
```

### 7.7 `handleApproval` Flow (replaces `useWorkflow` + `useMobileNotifications` subscription)

```
handleApproval(event, payload):
  1. if payload.tenantId && payload.tenantId !== ctx.currentTenantId → return
  2. invalidate ['workflow'], ['purchase-orders'], ['notifications'],
             dashboardMetricsQueryKeys.root, ['contracts'], ['bills'],
             ['transactions'], ['vendors']
  3. invalidate ['mobile-notifications'], ['mobile-approvals']
  4. callbacks.onApproval?.(event, payload)
```

### 7.8 `handleNotification` Flow

```
handleNotification(payload):
  1. if payload.tenantId && payload.tenantId !== ctx.currentTenantId → return
  2. if payload.userId && ctx.currentUserId && payload.userId !== ctx.currentUserId → return
  3. invalidate USER_NOTIFICATIONS_QUERY_KEY
  4. invalidate ['mobile-notifications']
  5. callbacks.onNotification?.(payload)
```

### 7.9 AppContext Integration Points

After the hub is introduced:

**`connectRealtimeSocket` call site (AppContext, line ~2156):**
```typescript
const s = connectRealtimeSocket(token);
const teardownHub = initRealtimeDispatchHub(s, queryClient, ctx, callbacks);
// Remove: s.on('entity_created', handleEntity); s.on('entity_updated', ...); etc.
// Keep: nothing at this level except the return cleanup
return () => {
  teardownHub();
  if (debounceTimer) clearTimeout(debounceTimer);
  if (reconnectDebounceTimer) clearTimeout(reconnectDebounceTimer);
};
```

**`useRealtimeQuerySync` (`hooks/useRealtimeQuerySync.ts`):**
- Can be retired. All its functionality is now in the hub.
- If callers need `onEntityEvent` callbacks, they should pass module-specific callbacks to the hub via a registration API (see Section 7.10 below).

**`usePurchaseOrders`, `useGoodsReceipts`, `useQuotationComparison`:**
- Remove the `useEffect` socket subscription blocks entirely.
- Query invalidation for their keys is covered by the hub's central call to `invalidateQueriesForEntityEvent` plus the `['purchase-order-report']` gap fill.
- Verify `entityQueryInvalidation.ts` covers `['goods-receipt-report']` (it does — line 207).

**`useWorkflowSettings`, `useApprovalQueue`:**
- Remove the `useEffect` socket subscription blocks entirely.
- Approval invalidation is handled by the hub's `handleApproval`.

**`useMobileNotifications`:**
- Remove the `useEffect` socket subscription block.
- Approval invalidation and `['mobile-notifications']` are handled by the hub.

**`useMobileCommandCenter`:**
- Remove the `useEffect` socket subscription block (it subscribes to wrong event names anyway).
- Add `['mobile-command-center']`, `['mobile-dashboard']` to the hub's `handleApproval` or add a dedicated `handleMobileInvalidation` that runs on `entity_*` events for relevant entity types.

### 7.10 Optional: Module-Specific Callback Registration

For feature modules that need to react to events beyond query invalidation (e.g., local UI state, sounds, toasts), a lightweight callback registration API can be added:

```typescript
// Minimal — do not over-engineer
type EntityEventSubscriber = (payload: RealtimeEntityPayload) => void;
const subscribers = new Set<EntityEventSubscriber>();

export function subscribeToEntityEvents(fn: EntityEventSubscriber): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}
```

This is the escape hatch that replaces `useRealtimeQuerySync`'s `onEntityEvent` option. It does NOT re-register socket handlers — it simply adds to a Set that `handleEntity` iterates after central invalidation.

---

## 8. Gaps in Current `entityQueryInvalidation.ts`

Based on the hook analysis, the following query keys are invalidated by feature hooks but **not** by the central map:

| Query key | Triggered by | Hook | Should add to central map? |
|---|---|---|---|
| `['purchase-order-report']` | `bill` events | `usePurchaseOrders` | Yes — add to `bill` branch |
| `['purchase-order-report']` | `purchase_order` events | `usePurchaseOrders` | Yes — add to `purchase_order` branch |
| `['mobile-notifications']` | `approval_*` events | `useMobileNotifications` | Move to hub `handleApproval` |
| `['mobile-approvals']` | `approval_*` events | `useMobileNotifications` | Move to hub `handleApproval` |
| `['mobile-command-center']`, `['mobile-dashboard']` | any entity/financial event | `useMobileCommandCenter` | Add to hub (dead currently) |

The following keys are handled by **both** the central map and feature hooks (confirmed duplicates):

| Query key | `entityQueryInvalidation.ts` | Feature hook |
|---|---|---|
| `['purchase-orders']` | `purchase_order` → yes | `usePurchaseOrders` + `useGoodsReceipts` + `useQuotationComparison` |
| `['procurement-dashboard']` | `purchase_order` / `vendor` / `quotation` → yes | `usePurchaseOrders` + `useGoodsReceipts` + `useQuotationComparison` |
| `['quotation-comparison']` | `purchase_order` / `vendor` / `quotation` → yes | `useQuotationComparison` |
| `['goods-receipts']` | `goods_receipt` → yes | `useGoodsReceipts` |
| `['goods-receipt-report']` | `goods_receipt` → yes | `useGoodsReceipts` |
| `['workflow']` | `approval_request` / `settings` → yes | `useWorkflowSettings` + `useApprovalQueue` |

---

## 9. Multi-Tenant Isolation Verification

All current handlers perform one of two tenant checks:

**AppContext (`handleEntity`):**
```typescript
if (payload?.tenantId && currentTenantId && payload.tenantId !== currentTenantId) return;
```

**Feature hooks:**
```typescript
if (payload.tenantId && payload.tenantId !== tenantId) return;
```

Both are correct. The hub must implement the same guard as the first form (using `ctx.currentTenantId` passed at init). The guard applies before any invalidation or callback.

**Lock events:** `useRecordLock` does not check `tenantId` on `lock_acquired`/`lock_released` — it filters by `recordType + recordId` only. This is acceptable because lock events are emitted to the tenant room on the backend (`emitLockEvent` → `io.to(tenantRoom(tenantId))`), so only same-tenant clients receive them. The hub does not manage lock events.

---

## 10. Phase 1 and A1 Preservation Checklist

| Requirement | Status after hub |
|---|---|
| `scheduleRefresh` debounce/cooldown (Phase 1 C-4/C-5) | Preserved — stays in AppContext callbacks |
| `shouldSkipRemoteReducerPatch` (own mutation skip) | Preserved — evaluated in `onEntityEvent` callback (AppContext) |
| `isWithinRefreshCooldown` (reconnect cooldown) | Preserved — evaluated in `onReconnect` callback (AppContext) |
| `shouldSkipInitialSocketConnect` (first connect skip) | Preserved — `isFirstConnect` flag in AppContext, consulted in `onReconnect` |
| `lastApiRefreshAtRef` shared across reconnect/visibility/socket | Preserved — ref owned by AppContext, `runRefreshFromApi` sets it |
| `invalidateQueriesForEntityEvent` called once per event | **Improved** — hub calls it once; feature hooks no longer duplicate |
| `invalidateQueriesForFinancialPosted` called once per event | **Improved** — hub calls it once; `useRealtimeQuerySync` no longer duplicates |
| A1 transactional queue flush order (financial before entity) | Unaffected — hub receives already-flushed events from backend socket |
| A1 post-COMMIT timing | Unaffected — hub receives events identically to current AppContext handlers |
| Tenant room isolation on backend | Unaffected — `io.to(tenantRoom(tenantId))` unchanged |
| `maybeMarkDashboardRefreshForEntity` | Preserved — called in hub `handleEntity` |

---

## 11. Implementation Sequence

The hub should be introduced in three stages to minimize regression risk:

**Stage 1 — Create hub, wire into AppContext only**  
Create `services/realtime/RealtimeDispatchHub.ts`. Move `entity_*`, `financial.posted`, `notification_created`, and `connect` handling from AppContext into the hub. AppContext passes callbacks for reducer patches and `scheduleRefresh`. Behavior identical to current.

**Stage 2 — Add approval handling to hub**  
Move approval invalidation logic from `useWorkflowSettings` / `useApprovalQueue` / `useMobileNotifications` into the hub `handleApproval`. Remove socket subscriptions from those hooks.

**Stage 3 — Remove procurement hooks' socket subscriptions**  
Remove `useEffect` socket blocks from `usePurchaseOrders`, `useGoodsReceipts`, `useQuotationComparison`. Add `['purchase-order-report']` gap to `entityQueryInvalidation.ts`. Fix `useMobileCommandCenter` (wrong event names; add mobile keys to hub).

**Stage 4 (optional) — Retire `useRealtimeQuerySync`**  
No current consumer uses `onEntityEvent`. If confirmed unused, delete the hook. If needed, replace with `subscribeToEntityEvents()`.

---

## 12. What A3 Does NOT Change

- `core/socket.ts` — socket creation, token management, reconnection config
- `backend/src/core/realtime.ts` — event names, tenant rooms, payload shapes
- `backend/src/core/entityEventEmissions.ts` — A1 queue, flush, restore
- `backend/src/db/pool.ts` — withTransaction, withSavepoint
- `services/realtime/entityQueryInvalidation.ts` — the central map (extended, not replaced)
- `context/AppContext.tsx` — socket lifecycle, reducer, refreshFromApi (hub is initialized from AppContext, not a replacement)
- Any non-`entity_*` socket events (`chat:message`, `whatsapp:*`, `lock_*`)
