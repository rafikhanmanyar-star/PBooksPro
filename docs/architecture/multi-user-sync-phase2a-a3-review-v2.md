# Phase 2A — A3: RealtimeDispatchHub Architecture Review v2

**Date:** 2026-06-19  
**Scope:** Full analysis of the realtime event architecture after Phase 1, A1 (transactional entity queue), payment-disappearing fix (changeLogMerge partial-payload preservation), and latestStateRef merge baseline improvements. Design for a RealtimeDispatchHub that consolidates all socket subscriptions without Redis, event replay, or new React providers.  
**Status:** Design only — no code modified.

---

## 1. Backend Socket Infrastructure (Unchanged Since v1)

**File:** `backend/src/core/realtime.ts`

A single `socket.io` `Server` instance. Every socket joins `tenant:{tenantId}` on connect. All events are broadcast to the room via `io.to(tenantRoom(tenantId)).emit(...)`. No per-user room, no cross-tenant channel.

### 1.1 Full Event Inventory (Backend → Client)

| Event name | Emitter | Payload type | Notes |
|---|---|---|---|
| `entity_created` | `emitEntityEvent` | `RealtimePayload` | Post-COMMIT via A1 queue |
| `entity_updated` | `emitEntityEvent` | `RealtimePayload` | Post-COMMIT via A1 queue |
| `entity_deleted` | `emitEntityEvent` | `RealtimePayload` | Post-COMMIT via A1 queue |
| `financial.posted` | `emitFinancialPosted` | `RealtimePayload` (type=payment) | GL journal posted |
| `lock_acquired` | `emitLockEvent` | `LockSocketPayload` | Record edit lock |
| `lock_released` | `emitLockEvent` | `LockSocketPayload` | Record edit lock |
| `notification_created` | `emitUserNotification` | `UserNotificationSocketPayload` | User-targeted |
| `chat:message` | `emitInternalChatMessage` | `InternalChatMessagePayload` | Internal chat |
| `whatsapp:message:sent` | `emitWhatsAppEvent` | `WhatsAppSocketPayload` | WhatsApp channel |
| `whatsapp:message:received` | `emitWhatsAppEvent` | `WhatsAppSocketPayload` | WhatsApp channel |
| `whatsapp:message:status` | `emitWhatsAppEvent` | `WhatsAppSocketPayload` | WhatsApp channel |
| `approval_requested` | `emitApprovalEvent` | `ApprovalSocketPayload` | Workflow |
| `approval_approved` | `emitApprovalEvent` | `ApprovalSocketPayload` | Workflow |
| `approval_rejected` | `emitApprovalEvent` | `ApprovalSocketPayload` | Workflow |
| `approval_returned` | `emitApprovalEvent` | `ApprovalSocketPayload` | Workflow |
| `approval_escalated` | `emitApprovalEvent` | `ApprovalSocketPayload` | Workflow |
| `approval_delegated` | `emitApprovalEvent` | `ApprovalSocketPayload` | Workflow |

**A1 queue integration:** `queueEntityEvent` (in route handlers) → flushed by `withTransaction` post-COMMIT → `flushEntityEventQueue` → `emitEntityEvent`. The socket payload and room targeting are identical to pre-A1. Only timing changed (post-COMMIT instead of post-handler, preventing premature delivery before DB write lands).

### 1.2 Dead Events (Never Emitted by Server)

The following event names appear only in client-side listeners. The server never emits them:

| Dead event name | Client location |
|---|---|
| `entity_event` | `useMobileCommandCenter.ts:42` |
| `financial_posted` (no dot) | `useMobileCommandCenter.ts:42` |
| `project_expense_voucher_updated` | `useMobileCommandCenter.ts:42` |
| `installment_plan_updated` | `useMobileCommandCenter.ts:42` |

`useMobileCommandCenter` subscribes to these four events exclusively. Because the server never emits them, this hook's socket subscription never fires. The hook falls back to its 90-second `refetchInterval` for updates.

---

## 2. Complete Client-Side Socket Listener Inventory

### 2.1 AppContext (`context/AppContext.tsx`, socket useEffect ~lines 1940–2290)

All five listeners registered here are cleaned up by the useEffect return:

| Listener | Event | Responsibilities |
|---|---|---|
| `handleEntity` | `entity_created`, `entity_updated`, `entity_deleted` | (1) Trace via `rtTrace`. (2) `invalidateQueriesForEntityEvent` (full central map). (3) `maybeMarkDashboardRefreshForEntity`. (4) Tenant scope guard. (5) `settings.bulkRefresh` → `runRefreshFromApi()`. (6) Own-mutation guard → `scheduleRefresh()` only. (7) Immediate reducer patches for remote mutations (12 entity types, see §3). (8) `scheduleRefresh()`. |
| `handleFinancialPosted` | `financial.posted` | (1) `invalidateQueriesForFinancialPosted`. (2) `markDashboardRefreshForFinancialPosted`. (3) `scheduleRefresh()`. |
| `handleNotificationCreated` | `notification_created` | Tenant + user guard → `invalidate(['user-notifications'])` + `invalidate(['mobile-notifications'])`. |
| `handleReconnect` | `connect` | On reconnect (after first connect): debounce 500ms → `scheduleRefresh()` unless within cooldown. |

**Window event listeners (same useEffect scope):**

| Listener | Event | Responsibility |
|---|---|---|
| `onVisibility` | `visibilitychange` | Tab becomes visible after >30s → `scheduleRefresh()`. |
| `onRequestApiRefresh` | `pbooks:request-api-refresh` | External trigger → `runRefreshFromApi()`. |

**Separate useEffects in AppContext:**

| Listener | Event | Responsibility |
|---|---|---|
| `handleBidirDownstreamComplete` | `sync:bidir-downstream-complete` | Full `loadStateForSyncRefresh` → `mergePartialStateIntoBaseline(latestStateRef.current, partial)` → `SET_STATE` + `setStoredState`. Note: now uses `latestStateRef.current` (v3 fix applied). |
| `handleCloudSettingsLoaded` | `load-cloud-settings` | Merge settings from Electron IPC into state. |
| `handleSaveStateBeforeLogout` | `save-state-before-logout` | Persist state before logout via `saveNow()`. |
| `handleChunkApplied` | `sync:chunk-applied` | Accumulate incremental chunk entities → `BATCH_UPSERT_ENTITIES` via requestIdleCallback(300ms)/setTimeout(150ms). No known dispatcher in current codebase. |

### 2.2 `useRealtimeQuerySync` (`hooks/useRealtimeQuerySync.ts`)

Optional hook, mounted in `App.tsx`. Calls `invalidateQueriesForEntityEvent` (same function as AppContext) + optional `onEntityEvent` callback.

**Duplicate path:** If enabled alongside AppContext, every `entity_created/updated/deleted` and `financial.posted` event calls `invalidateQueriesForEntityEvent` **twice** — once in AppContext and once in `useRealtimeQuerySync`. This is the primary identified duplicate.

| Listener | Event | Responsibility |
|---|---|---|
| `onEntity` | `entity_created`, `entity_updated`, `entity_deleted` | `invalidateQueriesForEntityEvent` + optional `onEntityEvent` |
| `onFinancialPosted` | `financial.posted` | `invalidateQueriesForFinancialPosted` |

### 2.3 Procurement Hooks

**`usePurchaseOrders` (`hooks/usePurchaseOrders.ts`):**

| Listener | Event | Entity filter | Keys invalidated |
|---|---|---|---|
| `onEntity` | `entity_created/updated/deleted` | `purchase_order` OR `bill` | `['purchase-orders']`, `['purchase-order-report']` |

**Duplicate:** `entityQueryInvalidation.ts` already invalidates `['purchase-orders']` and `['procurement-dashboard']` on `purchase_order` events (line 193–198). `usePurchaseOrders` re-invalidates `['purchase-orders']` on the same events. The `['purchase-order-report']` key is additional (not in central map).

**`useGoodsReceipts` (`hooks/useGoodsReceipts.ts`):**

| Listener | Event | Entity filter | Keys invalidated |
|---|---|---|---|
| `onEntity` | `entity_created/updated/deleted` | `goods_receipt` OR `purchase_order` | `['goods-receipts']`, `['goods-receipt-report']`, `['purchase-orders']` |

**Duplicate:** `entityQueryInvalidation.ts` already invalidates `['goods-receipts']`, `['goods-receipt-report']`, `['purchase-orders']`, `['procurement-dashboard']` on `goods_receipt` events (lines 201–210). Full overlap with the central map.

**`useQuotationComparison` (`hooks/useQuotationComparison.ts`):**

| Listener | Event | Entity filter | Keys invalidated |
|---|---|---|---|
| `onEntity` | `entity_created/updated/deleted` | `quotation`, `vendor`, `purchase_order` | `['quotation-comparison']`, `['procurement-dashboard']` |

**Duplicate:** `entityQueryInvalidation.ts` already invalidates `['vendors']`, `['quotations']`, `['quotation-comparison']`, `['procurement-dashboard']` on `vendor/quotation` events (lines 185–191). Partial overlap.

### 2.4 Approval / Workflow Hooks

**`useWorkflowSettings` and `useApprovalQueue` (`hooks/useWorkflow.ts`):**

Each registers the same `onApproval` handler on all 6 `approval_*` events independently. When both hooks are mounted, approval events fire `onApproval` twice (two separate `invalidateApprovalQueries` calls).

Keys invalidated by `invalidateApprovalQueries`:
- `['workflow']`, `['purchase-orders']`, `['notifications']`, `dashboardMetricsQueryKeys.root`, `['contracts']`, `['bills']`, `['transactions']`, `['vendors']`

**`useMobileNotifications` (`modules/executive-mobile/hooks/useMobileNotifications.ts`):**

Registers `onApprovalEvent` on all 6 `approval_*` events. Invalidates:
- `['mobile-notifications']`, `['workflow']`, `['user-notifications']`, `['mobile-approvals']`

These keys are also partially covered by `useWorkflow`. The user filter (`payload.userId !== user.id`) is unique to this hook.

### 2.5 Notification (AppContext + `useMobileNotifications`)

`AppContext.handleNotificationCreated` (`notification_created`) invalidates `['user-notifications']` and `['mobile-notifications']`.

`useMobileNotifications` invalidates `['mobile-notifications']` on `approval_*` events (different trigger, overlapping key).

No duplicate on `notification_created` specifically — only AppContext handles it.

### 2.6 WhatsApp Handlers

| File | Event | Responsibility |
|---|---|---|
| `Header.tsx:595` | `whatsapp:message:received` | `loadWhatsAppUnreadData()` + `addWhatsAppNotification()` |
| `WhatsAppSidePanel.tsx:182–184` | `whatsapp:message:sent/received/status` | Update side-panel message list |
| `WhatsAppChatWindow.tsx:247–249` | `whatsapp:message:sent/received/status` | Update chat window |

No cross-component duplicates — each component manages its own local display state. These are UI-only with no query invalidation. No overlap with entity events.

### 2.7 Chat Handlers

| File | Event | Responsibility |
|---|---|---|
| `ChatModal.tsx:72` | `chat:message` | Append to modal message list |
| `Sidebar.tsx:178` | `chat:message` | Show sidebar badge / notification |

Both listen on `chat:message`. These are independent UI concerns (modal content vs sidebar badge). Not duplicates of each other. No query invalidation.

### 2.8 Record Lock Handlers

**`useRecordLock` (`hooks/useRecordLock.ts`):**

| Listener | Event | Responsibility |
|---|---|---|
| `onAcquired` | `lock_acquired` | Check if lock belongs to this record type+id → update lock state |
| `onReleased` | `lock_released` | Same check → clear lock state |

Per-component hook; each mounted instance handles its own record. No duplicates by design. No query invalidation.

### 2.9 `useMobileCommandCenter` — Dead Subscriptions

As noted in §1.2, all four events this hook listens to (`entity_event`, `financial_posted`, `project_expense_voucher_updated`, `installment_plan_updated`) are never emitted by the server. This hook's socket block is entirely inactive at runtime.

---

## 3. AppContext `handleEntity` — Entity Patch Dispatch Map

When an event is **not** from the current user (`shouldSkipRemoteReducerPatch = false`), `handleEntity` applies immediate reducer patches. Existence check uses `latestStateRef.current` (updated synchronously in render body, not via useEffect — ensuring no stale-render lag).

| Entity type | Action | Reducer action dispatched | Version guard |
|---|---|---|---|
| `unit` | `deleted` | `DELETE_UNIT` | No |
| `contract` | `deleted` | `DELETE_CONTRACT` | No |
| `vendor` | `deleted` | `DELETE_VENDOR` | No |
| `contact` | `deleted` | `DELETE_CONTACT` | No |
| `project` | `deleted` | `DELETE_PROJECT` | No |
| `bill` | `deleted` | `DELETE_BILL` | No |
| `transaction` | `deleted` | `DELETE_TRANSACTION` | No |
| `invoice` | `deleted` | `DELETE_INVOICE` | No |
| `installment_plan` | `deleted` | `DELETE_INSTALLMENT_PLAN` | No |
| `plan_amenity` | `deleted` | `DELETE_PLAN_AMENITY` | No |
| `bill` | `created/updated` | `UPDATE_BILL` | No |
| `invoice` | `created/updated` | `ADD_INVOICE` or `UPDATE_INVOICE` | No (existence check only) |
| `transaction` | `created/updated` | `ADD_TRANSACTION` or `UPDATE_TRANSACTION` | No (existence check only) |
| `unit` | `created/updated` | `ADD_UNIT` or `UPDATE_UNIT` | No (existence check only) |
| `installment_plan` | `created/updated` | `ADD_INSTALLMENT_PLAN` or `UPDATE_INSTALLMENT_PLAN` | No (existence check only) |
| `plan_amenity` | `created/updated` | `ADD_PLAN_AMENITY` or `UPDATE_PLAN_AMENITY` | No (existence check only) |
| `contract` | `created/updated` | `ADD_CONTRACT` or `UPDATE_CONTRACT` | Yes — `shouldApplyRemoteEntityPatch(existing, version)` |
| `vendor` | `created/updated` | `ADD_VENDOR` or `UPDATE_VENDOR` | Yes |
| `contact` | `created/updated` | `ADD_CONTACT` or `UPDATE_CONTACT` | Yes |
| `project` | `created/updated` | `ADD_PROJECT` or `UPDATE_PROJECT` | Yes |

**Entities that route through `scheduleRefresh` only (no immediate patch):**

All types not in the above table, including: `settings`, `rental_agreement`, `agreement`, `property`, `building`, `account`, `category`, `journal_entry`, `recurring_invoice_template`, `project_received_asset`, `sales_return`, `payroll_*`, `document`, `personal_*`, `pm_cycle_allocation`, `budget`, `quotation`, `purchase_order`, `goods_receipt`, `approval_request`, `accounting_period`.

---

## 4. Duplicate Invalidation Paths

### 4.1 Critical Duplicates (Same function called twice per event)

| Event | Duplicate calls | Cause |
|---|---|---|
| `entity_created/updated/deleted` | `invalidateQueriesForEntityEvent` called twice | AppContext `handleEntity` + `useRealtimeQuerySync` (if enabled) |
| `financial.posted` | `invalidateQueriesForFinancialPosted` called twice | AppContext `handleFinancialPosted` + `useRealtimeQuerySync.onFinancialPosted` |

React Query's `invalidateQueries` is idempotent, so double-calling causes two refetches but not data corruption. Performance cost only.

### 4.2 Module-Level Duplicates (Central map + local hook)

| Query key | Central map (entityQueryInvalidation.ts) | Local hook |
|---|---|---|
| `['purchase-orders']` | ✓ on `purchase_order` | `usePurchaseOrders` on `purchase_order` OR `bill` |
| `['procurement-dashboard']` | ✓ on `purchase_order`, `goods_receipt`, `vendor/quotation` | `useQuotationComparison`, `usePurchaseOrders` (missing) |
| `['goods-receipts']` | ✓ on `goods_receipt` | `useGoodsReceipts` on `goods_receipt` |
| `['goods-receipt-report']` | ✓ on `goods_receipt` | `useGoodsReceipts` (redundant) |
| `['quotation-comparison']` | ✓ on `vendor`, `quotation` | `useQuotationComparison` (redundant) |
| `['vendors']` | ✓ on `vendor`, `quotation` | `useWorkflow.invalidateApprovalQueries` (on approval events — different trigger, not a true duplicate) |

### 4.3 Approval Duplicate Subscriptions

`useWorkflowSettings` and `useApprovalQueue` both mount their own `onApproval` handler on all 6 `approval_*` events. When a screen mounts both hooks (the workflow settings page), approval events fire `invalidateApprovalQueries` twice.

---

## 5. Duplicate Query Refresh Paths

Two mechanisms independently trigger a debounced API refresh on the same socket event:

1. **AppContext `scheduleRefresh()`** — always fires at end of `handleEntity` (except `settings.bulkRefresh` which calls `runRefreshFromApi()` directly and own-mutation which only calls `scheduleRefresh()`). Fires `refreshFromApi` which calls `mergePartialStateIntoBaseline` → `dispatch(SET_STATE)`.

2. **React Query invalidation** — `invalidateQueriesForEntityEvent` in `handleEntity` (line 1988) fires concurrently with the reducer path. React Query refetches from the API independently, providing a second read path to the same DB data.

These are intentionally complementary: React Query covers displayed server-query data; `scheduleRefresh` covers AppContext state. They do not conflict.

**Intra-hook duplicates (same React Query key refetched N times):**

For a `purchase_order` event with both AppContext and `usePurchaseOrders` mounted:
- `invalidateQueriesForEntityEvent` (AppContext, line 1988) → invalidates `['purchase-orders']`
- `usePurchaseOrders.onEntity` → also invalidates `['purchase-orders']`
- React Query deduplicates concurrent invalidations of the same key, so only one actual refetch fires

---

## 6. AppContext Responsibilities That Should Move to RealtimeDispatchHub

### 6.1 Move: Query Invalidation

`invalidateQueriesForEntityEvent` and `invalidateQueriesForFinancialPosted` are already extracted to `services/realtime/entityQueryInvalidation.ts`. They are called from `handleEntity` inside AppContext. Moving these calls into the hub eliminates the `useRealtimeQuerySync` duplicate without changing any logic.

### 6.2 Move: Dashboard Refresh Marking

`maybeMarkDashboardRefreshForEntity` and `markDashboardRefreshForFinancialPosted` are pure side-effects with no AppContext state dependency. They can move to the hub.

### 6.3 Move: scheduleRefresh Invocation (Conditional)

`scheduleRefresh` is a closure inside AppContext that calls `runRefreshFromApi`. The hub cannot hold this closure directly; AppContext must expose it as a registered callback. The hub calls `scheduleRefresh()` on behalf of AppContext after entity events. This is safe only if the hub has a single registered slot for it (not a subscriber list), to preserve the single-debounce semantics.

### 6.4 Move: Immediate Reducer Patch Dispatch

All 20 entity-type dispatch branches in `handleEntity` can move to the hub as a registered `onEntityReducerPatch` callback. AppContext provides a stable callback ref (`latestStateRef` + `baseDispatch`). The hub calls this callback with the payload; AppContext decides which action to dispatch.

### 6.5 Keep in AppContext: `scheduleRefresh` Definition

The debounce timer and `lastApiRefreshAtRef` must remain in AppContext. The hub calls a registered callback, not the implementation.

### 6.6 Keep in AppContext: `handleBidirDownstreamComplete`, `handleChunkApplied`, Window Events

These handlers reference AppContext closures (`dispatch`, `setStoredState`, `latestStateRef`, `saveNow`) and are not socket events. They belong in AppContext window-event useEffects as they are now.

### 6.7 Keep in AppContext: `handleNotificationCreated`

This handler does only query invalidation (no reducer). Could theoretically move, but it references `auth.user?.id` for user filtering — the hub would need the user context passed in. Low value move.

---

## 7. Accounting-Specific Event Handlers

All accounting-specific routing lives in `entityQueryInvalidation.ts`:

| Entity types | Classified as | Keys invalidated |
|---|---|---|
| `bill`, `invoice`, `transaction`, `payment`, `account`, `category`, `journal_entry`, `contractor_bill`, `contractor_advance`, `project_expense_voucher`, `sales_return`, `budget`, `recurring_invoice_template`, `accounting_period` | `FINANCIAL_ENTITY_TYPES` | `queryKeys.ledger.all`, `queryKeys.reports.all`, `dashboardMetricsQueryKeys.root` |
| `invoice`, `bill` | additional | `queryKeys.invoices.all`, `queryKeys.rental.invoicesList()` |
| `financial.posted` | GL post | `queryKeys.ledger.all`, `queryKeys.reports.all`, `dashboardMetricsQueryKeys.root` |

AppContext `handleEntity` reducer patches for accounting types:
- `bill` created/updated → `UPDATE_BILL` (no ADD_BILL; always upserted)
- `invoice` created/updated → `ADD_INVOICE` or `UPDATE_INVOICE`
- `transaction` created/updated → `ADD_TRANSACTION` or `UPDATE_TRANSACTION`
- All three deleted → corresponding `DELETE_*`

**`handleFinancialPosted`** is pure accounting: invalidates ledger/reports/dashboard + marks dashboard refresh + schedules AppContext refresh. No reducer patch.

**A1 queue effect on accounting:** `queueEntityEvent` ensures `entity_created/updated/deleted` for `transaction`, `invoice`, `bill` fire after DB commit. Combined with `applyChangeLogToMergedState` shallow-merge (the v4 fix), incremental sync no longer drops `invoiceId`/`billId` from transaction rows.

---

## 8. Procurement-Specific Event Handlers

### 8.1 Central map (entityQueryInvalidation.ts)

| Trigger | Keys invalidated |
|---|---|
| `vendor` OR `quotation` event | `['vendors']`, `['quotations']`, `['quotation-comparison']`, `['procurement-dashboard']` |
| `purchase_order` event | `['purchase-orders']`, `['procurement-dashboard']`, `['quotation-comparison']` |
| `goods_receipt` event | `['goods-receipts']`, `['goods-receipt-report']`, `['purchase-orders']`, `['procurement-dashboard']` |

### 8.2 Local hooks (redundant)

- `usePurchaseOrders`: `['purchase-orders']`, `['purchase-order-report']` on `purchase_order` or `bill` (the `bill` trigger is not in the central map → genuine addition; `['purchase-order-report']` key also not in central map → genuine addition)
- `useGoodsReceipts`: full overlap with central map
- `useQuotationComparison`: full overlap with central map for `quotation` and `vendor`; `purchase_order` trigger maps to `['quotation-comparison']` + `['procurement-dashboard']` which are already in central map

### 8.3 No reducer patches for procurement

No `handleEntity` branch dispatches reducer actions for `purchase_order`, `goods_receipt`, or `quotation`. These entity types route through `scheduleRefresh` only (query-cache driven, not AppContext-state driven).

---

## 9. Notification-Specific Event Handlers

| Hook | Event | Handler | Keys invalidated | User filter |
|---|---|---|---|---|
| AppContext `handleNotificationCreated` | `notification_created` | Tenant + userId guard | `['user-notifications']`, `['mobile-notifications']` | Yes |
| `useMobileNotifications` | `approval_requested/approved/rejected/returned/escalated/delegated` | `onApprovalEvent` | `['mobile-notifications']`, `['workflow']`, `['user-notifications']`, `['mobile-approvals']` | Yes (userId) |
| `useWorkflowSettings` | `approval_*` | `onApproval` | `['workflow']`, `['purchase-orders']`, `['notifications']`, dashboardMetrics, `['contracts']`, `['bills']`, `['transactions']`, `['vendors']` | Tenant only |
| `useApprovalQueue` | `approval_*` | `onApproval` (same fn as useWorkflowSettings) | Same as above | Tenant only |

`['user-notifications']` is invalidated by both `handleNotificationCreated` (on `notification_created`) and `useMobileNotifications` (on `approval_*`). These are different triggers so not a duplicate.

`['mobile-notifications']` is also invalidated by `handleNotificationCreated` on `notification_created` (AppContext). When `useMobileNotifications` is mounted, it additionally invalidates `['mobile-notifications']` on `approval_*`. Different triggers, not a conflict.

---

## 10. Event Handlers Made Obsolete by A1

A1 (transactional entity queue) changed **when** events fire (post-COMMIT instead of post-handler) but did not change **which** events fire or **how** the client handles them. No client-side handler was made obsolete by A1.

**However, A1 interacts with the following in a way that changes their correctness profile:**

1. **`scheduleRefresh` on own-mutation events:** Pre-A1, the `entity_created` socket event could arrive before the DB write committed, causing `refreshFromApi` to load stale data. Post-A1, the event is post-COMMIT, so `scheduleRefresh` now fires after data is guaranteed in DB. The refresh path's correctness improved; the code path is identical.

2. **`ADD_TRANSACTION` reducer patch on remote events:** Pre-A1, a remote user's transaction might arrive via socket before it was committed. The A1 queue ensures the socket event arrives only after commit, so the reducer patch applied by `handleEntity` for `transaction` events now always has a DB-consistent row.

3. **`handleBidirDownstreamComplete`:** Triggered by `sync:bidir-downstream-complete` (not a socket event, a window event). A1 has no impact on this path.

**No handlers to remove.** The obsolete-candidate is `useMobileCommandCenter`'s socket block, which never fires due to dead event names — but this is a pre-A1 bug, not introduced by A1.

---

## 11. RealtimeDispatchHub Design

### 11.1 Objectives

1. One place where the socket is subscribed (remove AppContext's inline `s.on` block)
2. Eliminate `useRealtimeQuerySync` duplicate calls to `invalidateQueriesForEntityEvent`
3. Consolidate procurement module socket subscriptions
4. Remove dead socket subscriptions in `useMobileCommandCenter`
5. Preserve all current behavior exactly: multi-tenant isolation, A1 event timing, changeLog merge, `latestStateRef` merge strategy, debounce/cooldown semantics

### 11.2 Architecture

```
core/RealtimeDispatchHub.ts
├── subscribes to socket once (entity_created/updated/deleted, financial.posted,
│   notification_created, connect)
├── tenant isolation: rejects events where payload.tenantId ≠ currentTenantId
├── registered callbacks:
│   ├── onEntityReducerPatch(payload) → AppContext dispatches reducer action
│   ├── scheduleRefresh()             → AppContext's existing debounce closure
│   ├── runRefreshFromApi()           → for settings.bulkRefresh path
│   └── queryClient                   → invalidateQueriesForEntityEvent
└── static dispatch decisions (no React state):
    ├── query invalidation (always)
    ├── dashboard refresh marking (always, remote events only)
    └── scheduleRefresh call
```

The hub is **not a React component or context**. It is a plain TypeScript module initialized once per session by AppContext via `initRealtimeDispatchHub(config)`. AppContext passes stable callback refs (not closures that capture stale state).

### 11.3 Interface

```typescript
// core/RealtimeDispatchHub.ts

export type DispatchHubConfig = {
  /** Called with tenant-validated, remote-only (non-own) entity events for reducer patches. */
  onEntityReducerPatch: (payload: RealtimeEntityPayload) => void;
  /** Debounced AppContext API refresh — called after every entity event. */
  scheduleRefresh: () => void;
  /** Immediate AppContext API refresh — called for settings.bulkRefresh events. */
  runRefreshFromApi: () => void;
  /** React Query client for cache invalidation. */
  queryClient: QueryClient;
  /** Current user and tenant for scope filtering. */
  currentUserId: string | undefined;
  currentTenantId: string | undefined;
};

export function initRealtimeDispatchHub(config: DispatchHubConfig): () => void;
// Returns cleanup function (call in AppContext useEffect cleanup)
```

### 11.4 Event Routing in the Hub

```
entity_created / entity_updated / entity_deleted → handleEntityEvent(payload)
  ├── rtTrace(...)
  ├── invalidateQueriesForEntityEvent(queryClient, payload, ctx)
  ├── maybeMarkDashboardRefreshForEntity(payload, ctx)
  ├── if payload.tenantId ≠ currentTenantId → return   [tenant isolation]
  ├── if settings.bulkRefresh → runRefreshFromApi(); return
  ├── if isOwnMutation → scheduleRefresh(); return
  ├── config.onEntityReducerPatch(payload)              [AppContext handles dispatch]
  └── scheduleRefresh()

financial.posted → handleFinancialPosted()
  ├── invalidateQueriesForFinancialPosted(queryClient)
  ├── markDashboardRefreshForFinancialPosted()
  └── scheduleRefresh()

notification_created → handleNotificationCreated(payload)
  ├── if payload.tenantId ≠ currentTenantId → return
  ├── if payload.userId ≠ currentUserId → return
  ├── queryClient.invalidateQueries(['user-notifications'])
  └── queryClient.invalidateQueries(['mobile-notifications'])

connect → handleReconnect()
  ├── if isFirstConnect → isFirstConnect = false; return
  └── debounce(500ms) → if !isWithinCooldown → scheduleRefresh()
```

### 11.5 AppContext Changes (Minimal)

Replace the inline `s.on(...)` block in the socket useEffect with:

```typescript
const cleanup = initRealtimeDispatchHub({
  onEntityReducerPatch: handleEntityReducerPatch,  // extracted from handleEntity
  scheduleRefresh,
  runRefreshFromApi,
  queryClient: getQueryClient(),
  currentUserId: auth.user?.id,
  currentTenantId: currentTenantId ?? undefined,
});
return () => { cleanup(); };
```

`handleEntityReducerPatch` is the extracted entity-type dispatch switch (the 20-branch block currently inside `handleEntity`). It uses `latestStateRef.current` for existence checks and `baseDispatch` for dispatch — both remain in AppContext closure. The extracted function is passed as a stable callback ref.

### 11.6 Module Hook Changes

**`useRealtimeQuerySync`:** Remove its socket subscriptions. It should become a pure optional-callback hook with no socket wiring (hub handles global invalidation).

**`usePurchaseOrders`:** Remove socket block. Keep only the `useQuery`. The central map covers all needed invalidations except `['purchase-order-report']` — add that key to `entityQueryInvalidation.ts` under `purchase_order`.

**`useGoodsReceipts`:** Remove socket block. Full overlap with central map.

**`useQuotationComparison`:** Remove socket block. Full overlap with central map.

**`useMobileCommandCenter`:** Remove dead socket block entirely. The hook's `refetchInterval: 90_000` provides the fallback polling it was relying on anyway.

**`useWorkflowSettings` and `useApprovalQueue`:** Consolidate into a single shared `useApprovalEventSync` hook that registers once. Or move approval event invalidation to the hub's `approval_*` handling path.

**Approval routing addition to hub:**

```
approval_requested/approved/rejected/returned/escalated/delegated → handleApprovalEvent(payload)
  ├── if payload.tenantId ≠ currentTenantId → return
  ├── invalidate ['workflow'], ['purchase-orders'], dashboardMetrics, ['contracts'], ['bills'], ['vendors']
  └── if payload.userId matches currentUserId:
       invalidate ['mobile-notifications'], ['mobile-approvals'], ['user-notifications']
```

This replaces three separate hook registrations with one hub handler.

---

## 12. Query Invalidation Strategy

### 12.1 Layers (Priority Order)

| Layer | Owner | Purpose |
|---|---|---|
| 1. Immediate hub invalidation | `RealtimeDispatchHub` → `entityQueryInvalidation.ts` | All standard entity type → key mappings |
| 2. Module additions | `entityQueryInvalidation.ts` (extend map) | Add `['purchase-order-report']` for `purchase_order` |
| 3. Hub approval invalidation | `RealtimeDispatchHub` | Approval workflow keys consolidated |
| 4. AppContext `scheduleRefresh` | AppContext (unchanged) | Full state refresh 2–3s after events |

### 12.2 Keys Missing from Central Map (Need Adding)

| Missing key | Relevant entity types | Currently handled by |
|---|---|---|
| `['purchase-order-report']` | `purchase_order`, `bill` | `usePurchaseOrders` local hook |

All other local-hook keys are already covered by the central map.

---

## 13. Migration Plan

**Phase 1 — Extract without behavior change:**
1. Create `core/RealtimeDispatchHub.ts` with `initRealtimeDispatchHub`.
2. Extract `handleEntityReducerPatch` from AppContext's `handleEntity` into a standalone function in `services/realtime/entityReducerPatch.ts`. Unit-testable.
3. Wire AppContext to call `initRealtimeDispatchHub` in its socket useEffect instead of direct `s.on` calls.
4. Verify: socket listener count on the live socket drops from N to exactly 5 (entity_created, entity_updated, entity_deleted, financial.posted, notification_created, connect) — all via hub.

**Phase 2 — Remove module-level duplicate subscriptions:**
5. Add `['purchase-order-report']` to `entityQueryInvalidation.ts` under `purchase_order`.
6. Remove socket blocks from `usePurchaseOrders`, `useGoodsReceipts`, `useQuotationComparison`.
7. Remove dead socket block from `useMobileCommandCenter`.
8. Verify: procurement pages still receive live updates (now via hub's invalidation path).

**Phase 3 — Approval consolidation:**
9. Add approval event routing to the hub (§11.6 approval path).
10. Remove `approval_*` subscriptions from `useWorkflowSettings`, `useApprovalQueue`, `useMobileNotifications`.
11. Verify: approval events correctly invalidate all keys; user-targeted keys only invalidate for the correct user.

**Phase 4 — useRealtimeQuerySync cleanup:**
12. Remove socket subscriptions from `useRealtimeQuerySync`. Retain the optional `onEntityEvent` callback structure for future per-feature hooks, but hub handles the `invalidateQueriesForEntityEvent` call.
13. Audit `App.tsx` call site for `useRealtimeQuerySync` — verify `enabled: false` or remove.

---

## 14. Testing Plan

### 14.1 Unit Tests

| Test | Assert |
|---|---|
| `entityReducerPatch`: own-mutation event → no dispatch | `baseDispatch` not called |
| `entityReducerPatch`: foreign tenant event → filtered before dispatch | `baseDispatch` not called |
| `entityReducerPatch`: `transaction.created` → `ADD_TRANSACTION` | Correct action type |
| `entityReducerPatch`: `contract.updated` with stale version → skipped | Version guard working |
| `applyChangeLogToMergedState`: partial payload shallow-merges onto existing row | `invoiceId`/`billId` preserved |
| `mergeTransactionsWithServerBaseline`: base tx absent from server → preserved | Optimistic tx survives |
| Hub approval routing: different tenant → filtered | No invalidation |
| Hub approval routing: userId filter for mobile keys | Only invalidate when userId matches |

### 14.2 Integration Tests

| Scenario | Expected |
|---|---|
| User A creates payment → entity_created arrives → count increases on User B | Transaction appears without reload |
| Own-mutation event → no reducer patch, scheduleRefresh fires once | State stable, refresh deferred |
| settings.bulkRefresh event → `runRefreshFromApi` called immediately | Full reload triggered |
| `purchase_order.created` → `['purchase-orders']` and `['purchase-order-report']` invalidated | Both query keys refetch |
| `goods_receipt.updated` → `['goods-receipts']` invalidated, no duplicate refetch | Single refetch (not two) |
| Two hooks mount (useWorkflowSettings + useApprovalQueue) → approval event fires | `invalidateApprovalQueries` called once, not twice |
| `financial.posted` → ledger/reports/dashboard all invalidated + scheduleRefresh | All three paths hit |
| Payment disappear regression: incremental sync preserves invoiceId/billId | `applyChangeLogToMergedState` shallow-merge test |

### 14.3 Multi-User Smoke Test

Same as pre-migration:
1. User A creates invoice.
2. User A receives payment.
3. Payment appears on User A without reload.
4. Payment appears on User B within 500ms.
5. Wait 5 seconds — payment still present on both screens (no disappearance).
6. Check console trace: no `REMOVED_IDS` warn in payment-disappear-trace output.

---

## 15. Invariants to Preserve

| Invariant | Mechanism |
|---|---|
| Multi-tenant isolation | Hub checks `payload.tenantId !== currentTenantId` before every action |
| A1 post-COMMIT ordering | Hub is passive (receives events after `withTransaction` flush); no change needed |
| changeLog shallow-merge | `applyChangeLogToMergedState` in `loadStateViaIncrementalSync`; hub does not touch this path |
| latestStateRef merge strategy | `latestStateRef.current` used in `refreshFromApi` and `handleBidirDownstreamComplete`; hub passes payload to AppContext callback, AppContext reads the ref |
| Debounce/cooldown semantics | `scheduleRefresh` closure stays in AppContext; hub calls it as an opaque callback |
| Own-mutation skip | `shouldSkipRemoteReducerPatch` checked in hub before calling `onEntityReducerPatch`; `scheduleRefresh` still called (C-5 requirement) |
| LWW version guard | `shouldApplyRemoteEntityPatch` called inside `onEntityReducerPatch` for versioned entities |
| No Redis | Hub is in-process module; no external broker |
| No Event Replay | Hub has no event store; no `play()` or `rehydrate()` method |
| No new React providers | Hub is not a React component; initialized in AppContext useEffect |
