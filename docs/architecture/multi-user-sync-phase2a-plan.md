# Phase 2A Implementation Plan — Reliability Core (Partial)

**Date:** June 2026  
**Status:** Plan — no source files modified  
**Scope:** A1 · A3 · A4 only (A2 / B / C / D excluded)  
**Authority:** [multi-user-sync-phase2-review.md](./multi-user-sync-phase2-review.md)  
**Predecessor:** [multi-user-sync-phase1-implementation-notes.md](./multi-user-sync-phase1-implementation-notes.md)

---

## 1. Scope and constraints

### In scope

| Task | Spec ID | Problem addressed |
|------|---------|-------------------|
| A1 | 2-C2 | `emitEntityEvent` not post-commit queued — clients may receive events before COMMIT or miss events on rollback |
| A3 | 2-LIST | Duplicate `entity_*` socket listeners in `usePurchaseOrders`, `useGoodsReceipts`, `useRealtimeQuerySync` — race conditions and redundant invalidation |
| A4 | 2-RC | Reconnect re-hydrates via `scheduleRefresh()` only — missed events during disconnect are not recovered via cache invalidation |

### Explicit exclusions

| Excluded | Reason |
|----------|--------|
| A2 `scheduleTargetedRefresh` | Out of scope for this plan |
| B1–B4 (LWW, dual-state, version audit) | Out of scope |
| C1–C4 / D1–D3 | Out of scope |
| Redis, event bus, replay service, horizontal scaling | Prohibited by requirements |

### Binding constraints

1. `scheduleRefresh()` call site in `AppContext.handleEntity` is preserved exactly — timing semantics (`DEBOUNCE_MS=2000`, `COOLDOWN_MS=3000`) unchanged.
2. `refreshFromApi()` / `loadStateForSyncRefresh()` invocation path unchanged.
3. All Phase 1 behaviors (parallel invalidation, C-5 own-mutation refresh, CORS allowlist, financial stale tiers, notification listener, QI-1) preserved.
4. AppContext reducer patches (`UPDATE_INVOICE`, `UPDATE_TRANSACTION`, `UPDATE_BILL`, etc.) continue to fire as-is.
5. No new timing constants introduced.

---

## 2. Current state (as-built after Phase 1)

### Socket listener inventory

| Location | Events subscribed | Notes |
|----------|-------------------|-------|
| `AppContext.tsx` (line 2160–2163) | `entity_created` · `entity_updated` · `entity_deleted` · `financial.posted` | Central authority; handles invalidation + reducer patch + `scheduleRefresh` |
| `hooks/usePurchaseOrders.ts` (line 34–36) | `entity_created` · `entity_updated` · `entity_deleted` | Duplicate — invalidates `['purchase-orders']` + `['purchase-order-report']` on `purchase_order` or `bill` events; mounted only when hook active |
| `hooks/useGoodsReceipts.ts` (line 35–37) | `entity_created` · `entity_updated` · `entity_deleted` | Duplicate — invalidates `['goods-receipts']` on `goods_receipt` events; mounted only when hook active |
| `hooks/useRealtimeQuerySync.ts` (line 54–57) | `entity_created` · `entity_updated` · `entity_deleted` · `financial.posted` | Broken: `apiMode` in dep array (line 65) is undefined in scope — stale closure; risk of double-invalidation if mounted |

`['purchase-orders']`, `['purchase-order-report']`, and `['goods-receipts']` are already in `entityQueryInvalidation.ts` (lines 193–212). The hook listeners add no coverage; they only introduce race conditions.

### Emit timing (current — C-2 unfixed)

```
POST /transactions
  withTransaction(fn)
    BEGIN
    fn(client)          ← DB writes
    COMMIT              ← changes durable
  flushFinancialPostedQueue()   ← financial.posted emitted correctly
  emitEntityEvent(...)          ← entity_* emitted OUTSIDE withTransaction
                                   → race: client receives event before COMMIT visible
```

`financial.posted` uses `financialPostedEmissions.ts` (AsyncLocalStorage queue — correct).  
All `emitEntityEvent` calls on priority routes are called **after** `withTransaction` returns but as plain synchronous calls — not queued, not guaranteed post-COMMIT.

### Reconnect handler (current)

```typescript
// AppContext.tsx ~line 2141
const handleReconnect = () => {
    if (shouldSkipInitialSocketConnect(isFirstConnect)) { isFirstConnect = false; return; }
    const now = Date.now();
    if (isWithinRefreshCooldown(now, lastApiRefreshAtRef.current, COOLDOWN_MS)) return;
    setTimeout(() => scheduleRefresh(), RECONNECT_DEBOUNCE_MS); // 500ms → 2000ms debounce
};
```

React Query caches are not proactively invalidated on reconnect. Financial and procurement data stays stale until `refreshFromApi()` merges AppContext state, which only updates AppContext-owned slices — not React Query caches for unmounted hooks.

---

## 3. A1 — Transactional entity event queue

### Design

Mirror the `financialPostedEmissions.ts` pattern for all `emitEntityEvent` calls inside `withTransaction` on priority routes. The queue is stored in AsyncLocalStorage scoped to the transaction's async context. On COMMIT: flush. On ROLLBACK: discard. Outside a transaction: emit immediately (fallback matches current behavior for routes that do not use `withTransaction`).

```
withTransaction(fn)
  runWithEntityEventQueue([])         ← new: wraps existing runWithFinancialPostedQueue
    BEGIN
    fn(client)                         ← route calls queueEntityEvent()
    COMMIT
    flushFinancialPostedQueue()         ← unchanged
    flushEntityEventQueue()             ← new: emits all queued entity events
  ROLLBACK → clearEntityEventQueue()   ← new: discards queued events
```

### New file: `backend/src/core/entityEventEmissions.ts`

```typescript
import { AsyncLocalStorage } from 'node:async_hooks';
import { emitEntityEvent, type RealtimeEntityType, type RealtimeAction } from './realtime.js';

type QueuedEntityEvent = {
  tenantId: string;
  action: RealtimeAction;
  type: RealtimeEntityType;
  opts: { data?: unknown; id?: string; sourceUserId?: string; version?: number };
};

const entityEventQueueStorage = new AsyncLocalStorage<QueuedEntityEvent[]>();

export function queueEntityEvent(
  tenantId: string,
  action: RealtimeAction,
  type: RealtimeEntityType,
  opts: { data?: unknown; id?: string; sourceUserId?: string; version?: number }
): void {
  const queue = entityEventQueueStorage.getStore();
  if (queue) {
    queue.push({ tenantId, action, type, opts });
    return;
  }
  emitEntityEvent(tenantId, action, type, opts);
}

export function flushEntityEventQueue(): void {
  const queue = entityEventQueueStorage.getStore();
  if (!queue?.length) return;
  for (const item of queue) {
    emitEntityEvent(item.tenantId, item.action, item.type, item.opts);
  }
  queue.length = 0;
}

export function clearEntityEventQueue(): void {
  const queue = entityEventQueueStorage.getStore();
  if (queue) queue.length = 0;
}

export function runWithEntityEventQueue<T>(queue: QueuedEntityEvent[], fn: () => Promise<T>): Promise<T> {
  return entityEventQueueStorage.run(queue, fn);
}
```

### Change: `backend/src/db/pool.ts` — `withTransaction`

Add the entity event queue alongside the existing financial posted queue. Both queues wrap the same async context. Flush order: `flushFinancialPostedQueue()` first (preserves Phase 1 behavior), then `flushEntityEventQueue()`.

```typescript
import {
  clearEntityEventQueue,
  flushEntityEventQueue,
  runWithEntityEventQueue,
} from '../core/entityEventEmissions.js';

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const pendingFinancialPosted: ...[] = [];
  const pendingEntityEvents: QueuedEntityEvent[] = [];   // ← new
  return runWithFinancialPostedQueue(pendingFinancialPosted, () =>
    runWithEntityEventQueue(pendingEntityEvents, async () => {
      const p = getPool();
      const client = await p.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        flushFinancialPostedQueue();      // unchanged
        flushEntityEventQueue();          // ← new
        return result;
      } catch (e) {
        await client.query('ROLLBACK');
        clearFinancialPostedQueue();      // unchanged
        clearEntityEventQueue();          // ← new
        throw e;
      } finally {
        client.release();
      }
    })
  );
}
```

### Route migration — priority routes only

Replace `emitEntityEvent(...)` with `queueEntityEvent(...)` in the following files. Calls **outside** `withTransaction` (e.g. `emitRecalculatedInvoiceBillEvents` which opens its own pool connection) are replaced with `queueEntityEvent` — they will emit immediately since no transaction queue is active in that async context, preserving current behavior.

| File | `emitEntityEvent` call sites | Notes |
|------|------------------------------|-------|
| `backend/src/modules/accounting/routes/transactionsRoutes.ts` | Lines 177, 225, 264, 288, 348 + `emitRecalculatedInvoiceBillEvents` (lines 43, 53, 63) | All inside or called from `withTransaction` routes |
| `backend/src/modules/customers/routes/invoicesRoutes.ts` | All invoice create/update/delete emit calls | Audit required |
| `backend/src/modules/vendors/routes/billsRoutes.ts` | All bill create/update/delete emit calls | Audit required |
| `backend/src/modules/purchase-orders/routes/purchaseOrdersRoutes.ts` | All PO emit calls | Audit required |
| `backend/src/modules/goods-receipts/routes/goodsReceiptsRoutes.ts` | All GRN emit calls | Audit required |
| `backend/src/modules/project-selling/routes/contractsRoutes.ts` | All contract emit calls | Audit required |

Routes that do **not** use `withTransaction` (e.g. read-only or fire-and-forget operations) may keep `emitEntityEvent` — `queueEntityEvent` falls back to immediate emit anyway.

The `backend/src/core/realtime.ts` `emitEntityEvent` export is **not removed** — it remains the underlying implementation and is still used by non-priority routes and by `flushEntityEventQueue`.

---

## 4. A3 — RealtimeDispatchHub

### Design

The hub is the **single `entity_*` and `financial.posted` subscriber** per connected client session. It runs inside AppContext's socket effect (preserving access to `baseDispatch`, `latestStateRef`, `scheduleRefresh`, and the auth/tenant closure) as a named extracted function rather than a new React mount point — this avoids a second socket subscription and prevents timing changes.

The three duplicate-listener hooks (`usePurchaseOrders`, `useGoodsReceipts`, `useRealtimeQuerySync`) have their socket subscriptions removed. Their query keys are already covered by the central invalidation map in `entityQueryInvalidation.ts`.

### New file: `services/realtime/realtimeDispatchHub.ts`

Extracts the dispatch logic from AppContext's `handleEntity` closure into a typed, testable function. AppContext constructs the hub with its closure dependencies and passes it as the socket event handler.

```typescript
export type RealtimeDispatchHubDeps = {
  queryClient: QueryClient;
  currentTenantId: string | null | undefined;
  currentUserId: string | null | undefined;
  baseDispatch: (action: AppAction) => void;
  latestStateRef: React.RefObject<AppState>;
  scheduleRefresh: () => void;
  runRefreshFromApi: () => void;
};

export type RealtimeDispatchHub = {
  handleEntity: (payload: RealtimeEntityPayload) => void;
  handleFinancialPosted: () => void;
};

export function createRealtimeDispatchHub(deps: RealtimeDispatchHubDeps): RealtimeDispatchHub {
  // Extracted verbatim from AppContext handleEntity and handleFinancialPosted.
  // All timing behavior (scheduleRefresh, bulkRefresh path, isOwnMutation guard,
  // reducer patch dispatch, invalidation) preserved exactly.
}
```

AppContext's socket effect becomes:

```typescript
const hub = createRealtimeDispatchHub({ queryClient: getQueryClient(), ... });

s.on('entity_created', hub.handleEntity);
s.on('entity_updated', hub.handleEntity);
s.on('entity_deleted', hub.handleEntity);
s.on('financial.posted', hub.handleFinancialPosted);
```

The hub is **not exported as a React hook** — it is a plain object factory. This keeps it synchronous and testable without React.

### Change: `hooks/usePurchaseOrders.ts`

Remove the `useEffect` socket subscription block (lines 24–42 in current file). The `useQuery` and `useMutation` exports are unchanged. `['purchase-orders']` and `['purchase-order-report']` invalidation is already handled by `entityQueryInvalidation.ts` (purchase_order and bill branches, lines 193–213).

### Change: `hooks/useGoodsReceipts.ts`

Remove the `useEffect` socket subscription block. `['goods-receipts']` is already handled by `entityQueryInvalidation.ts` (goods_receipt branch, lines 201–212).

### Change: `hooks/useRealtimeQuerySync.ts`

Hard-disable by changing the default: `enabled = false`. The `apiMode` reference bug on line 65 (undefined variable in dep array) creates a stale closure that can cause double-invalidation. Since AppContext now handles all central invalidation via the hub, this hook's default behavior provides no additional value. Feature teams that need extra invalidation can still pass `onEntityEvent` with `enabled: true` explicitly — but the hook will no longer subscribe to entity events by default.

No deletion of the file — the hook API is preserved for explicit opt-in use.

---

## 5. A4 — Reconnect recovery bundle

### Design

On socket reconnect (non-initial connect), in addition to the existing `scheduleRefresh()` call, immediately invalidate the critical financial and procurement React Query keys in parallel. This ensures that React Query caches for **currently mounted** hooks refetch without waiting for the AppContext sync cycle.

`scheduleRefresh()` is preserved — it continues to re-hydrate AppContext state exactly as before. The critical key invalidation is **additive**, firing before the debounce window begins.

### New file: `services/realtime/reconnectCriticalKeys.ts`

```typescript
import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../hooks/queries/queryKeys';
import { dashboardMetricsQueryKeys } from '../../hooks/useDashboardMetrics';
import { rtTrace } from './realtimeTrace';

/** React Query keys guaranteed to be invalidated on every non-initial socket reconnect. */
export const RECONNECT_CRITICAL_KEYS: readonly (readonly unknown[])[] = [
  queryKeys.ledger.all,
  queryKeys.invoices.all,
  ['transactions'],
  dashboardMetricsQueryKeys.root,
  ['purchase-orders'],
  ['goods-receipts'],
  ['contracts'],
];

export async function invalidateReconnectCriticalKeys(queryClient: QueryClient): Promise<void> {
  const start = Date.now();
  await Promise.all(
    RECONNECT_CRITICAL_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey }))
  );
  rtTrace('reconnect.critical_keys_invalidated', {
    keyCount: RECONNECT_CRITICAL_KEYS.length,
    durationMs: Date.now() - start,
  });
}
```

### Change: `context/AppContext.tsx` — `handleReconnect`

```typescript
const handleReconnect = () => {
    if (shouldSkipInitialSocketConnect(isFirstConnect)) { isFirstConnect = false; return; }
    const now = Date.now();
    if (isWithinRefreshCooldown(now, lastApiRefreshAtRef.current, COOLDOWN_MS)) return;
    // NEW: parallel cache bust for critical keys — fires immediately, no debounce
    void invalidateReconnectCriticalKeys(getQueryClient());
    // PRESERVED: existing debounced AppContext sync
    setTimeout(() => scheduleRefresh(), RECONNECT_DEBOUNCE_MS);
};
```

The `invalidateReconnectCriticalKeys` call is fire-and-forget (`void`) — it does not block `scheduleRefresh` and does not change the 500ms debounce timing.

---

## 6. Files affected

### New files

| File | Task | Purpose |
|------|------|---------|
| `backend/src/core/entityEventEmissions.ts` | A1 | AsyncLocalStorage queue for entity events |
| `services/realtime/realtimeDispatchHub.ts` | A3 | Extracted dispatch logic; single event-handler factory |
| `services/realtime/reconnectCriticalKeys.ts` | A4 | Critical key list + parallel invalidation function |

### Modified files

| File | Task | Change summary |
|------|------|----------------|
| `backend/src/db/pool.ts` | A1 | `withTransaction` wraps `runWithEntityEventQueue`; calls `flushEntityEventQueue` on commit, `clearEntityEventQueue` on rollback |
| `backend/src/modules/accounting/routes/transactionsRoutes.ts` | A1 | `emitEntityEvent` → `queueEntityEvent` (5 call sites + `emitRecalculatedInvoiceBillEvents`) |
| `backend/src/modules/customers/routes/invoicesRoutes.ts` | A1 | `emitEntityEvent` → `queueEntityEvent` |
| `backend/src/modules/vendors/routes/billsRoutes.ts` | A1 | `emitEntityEvent` → `queueEntityEvent` |
| `backend/src/modules/purchase-orders/routes/purchaseOrdersRoutes.ts` | A1 | `emitEntityEvent` → `queueEntityEvent` |
| `backend/src/modules/goods-receipts/routes/goodsReceiptsRoutes.ts` | A1 | `emitEntityEvent` → `queueEntityEvent` |
| `backend/src/modules/project-selling/routes/contractsRoutes.ts` | A1 | `emitEntityEvent` → `queueEntityEvent` |
| `context/AppContext.tsx` | A3 · A4 | Delegate to `createRealtimeDispatchHub`; add `invalidateReconnectCriticalKeys` in `handleReconnect` |
| `hooks/usePurchaseOrders.ts` | A3 | Remove `useEffect` socket subscription block |
| `hooks/useGoodsReceipts.ts` | A3 | Remove `useEffect` socket subscription block |
| `hooks/useRealtimeQuerySync.ts` | A3 | Change default `enabled` to `false` |

### Unchanged files (explicitly preserved)

| File | Why unchanged |
|------|---------------|
| `backend/src/core/realtime.ts` | `emitEntityEvent` remains the implementation; `RealtimePayload` type unchanged |
| `backend/src/core/financialPostedEmissions.ts` | No modifications; A1 mirrors this file's pattern |
| `services/realtime/entityQueryInvalidation.ts` | No changes in Phase 2A (invalidation map extension is B2, out of scope) |
| `services/realtime/entityEventRefreshPolicy.ts` | Constants and helpers unchanged |
| `config/queryClient.ts` | Query defaults unchanged |
| All other routes not listed above | `emitEntityEvent` calls preserved as-is |

---

## 7. Risks

### A1 risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| `emitRecalculatedInvoiceBillEvents` in `transactionsRoutes.ts` opens a new pool connection outside the original transaction scope — `queueEntityEvent` will find no active queue and emit immediately | Low | This is correct behavior: the secondary emits happen after the transaction has already committed and the invoice/bill rows have been re-read. No change in semantics. Document explicitly. |
| Routes using `withSavepoint` — if a savepoint rolls back but the outer transaction commits, queued events accumulated inside the savepoint will still flush | Medium | Audit all `withSavepoint` callsites; for savepoints that produce entity mutations, verify they re-emit after savepoint success. If a savepoint rolls back, the emitted event may describe a state the savepoint partially undid — but the outer commit is valid, so the client will reconcile on the next sync. Acceptable in Phase 2A. |
| Route that calls `withTransaction` twice for one HTTP request (rare) — second call creates a new queue, events flush twice | Low | Grep for `withTransaction` called more than once per route handler before shipping. If found, the second call's events are still post-commit; no phantom events. |
| Missing import — developer forgets to replace `emitEntityEvent` with `queueEntityEvent` in a new route | Medium | TypeScript build will succeed (both functions exist). Mitigation: add a lint rule or grep gate in CI: `emitEntityEvent` inside `withTransaction` callsite = warning. |

### A3 risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Removing hook listeners breaks PO/GRN screen if `entityQueryInvalidation.ts` has a coverage gap | Medium | Before removing hook listeners, confirm `purchase_order`, `goods_receipt`, `bill` all invalidate `['purchase-orders']`, `['goods-receipts']`, `['purchase-order-report']` in the central map. Current audit: purchase_order (line 193–199) ✅; goods_receipt (line 201–212) ✅; bill-linked PO (lines 185–190 invalidates `['purchase-orders']` for `vendor`/`quotation` — but not for `bill` entity type explicitly). **Action required:** verify bill events reach `['purchase-orders']` through the hub before removing `usePurchaseOrders` listener. |
| `useRealtimeQuerySync` with `enabled: false` — any existing call site that omits `enabled` and relies on the hook's central invalidation | Low | Grep for `useRealtimeQuerySync()` mount sites across the codebase. If any site relies on the hook for primary invalidation and does not pass `onEntityEvent`, it can be removed entirely (AppContext hub handles it). |
| `createRealtimeDispatchHub` extraction — subtle closure bug if a dependency is missed | High | The hub factory must receive all AppContext closure values as explicit parameters. Unit test the factory with mock deps to verify all branches fire as before (own mutation skip, bulk refresh, reducer patch, scheduleRefresh). |

### A4 risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Reconnect during active editing — critical key invalidation triggers a refetch while user has unsaved form state | Low | React Query `invalidateQueries` marks as stale but does not forcibly unmount or replace active form state. Only background refetches or stale-while-revalidate are affected. |
| `invalidateReconnectCriticalKeys` throws — `void` discard means silent failure | Low | Wrap in `.catch(e => rtTrace('reconnect.critical_keys_failed', { error }))`. |
| Reconnect fires multiple times rapidly (mobile network) — multiple parallel critical-key invalidations | Low | Existing `isWithinRefreshCooldown` guard (line 2 of `handleReconnect`) prevents rapid firing. Cooldown check runs before the new invalidation call. |

---

## 8. Migration strategy

### Phase 2A sequence

```
Step 1  Create entityEventEmissions.ts (A1 new file)
Step 2  Modify pool.ts withTransaction (A1 — backend only, no client impact)
Step 3  Migrate transactionsRoutes.ts to queueEntityEvent (A1 — highest risk route, test first)
Step 4  Migrate remaining 5 priority routes (A1)
Step 5  Create reconnectCriticalKeys.ts (A4 new file)
Step 6  Modify AppContext.tsx handleReconnect to add critical key invalidation (A4)
Step 7  Create realtimeDispatchHub.ts (A3 new file — implement, test, do not wire yet)
Step 8  Verify entityQueryInvalidation.ts coverage for PO/bill → ['purchase-orders'] (A3 pre-check)
Step 9  Wire AppContext to hub + remove usePurchaseOrders/useGoodsReceipts listeners (A3 — atomic)
Step 10 Disable useRealtimeQuerySync default (A3)
```

Steps 1–6 (A1 + A4) are **backend-first, independently deployable** and carry no frontend risk. Steps 7–10 (A3) are **frontend-only** and can be staged separately.

A1 and A4 have no dependency on each other and may be developed in parallel. A3 must follow the A1 pre-check (Step 8).

### No feature flags required

A1 changes emit timing only — clients receive events at the same point they did before (post-handler return), now guaranteed post-COMMIT. There is no observable difference to well-behaved clients.

A3 removes duplicate listeners — clients receive the same invalidation, just from one source. No opt-out path is needed.

A4 adds cache invalidation on reconnect — additive only, no behavior removed.

---

## 9. Rollback strategy

### A1 rollback

`entityEventEmissions.ts` and the `pool.ts` change are isolated. To roll back:
1. Revert `pool.ts` to the Phase 1 version (remove the `runWithEntityEventQueue` wrapper).
2. Revert all priority routes from `queueEntityEvent` back to `emitEntityEvent`.
3. Delete `entityEventEmissions.ts`.

The `financialPostedEmissions.ts` and its integration in `pool.ts` are **not touched** by A1 and are unaffected by a rollback.

### A3 rollback

`realtimeDispatchHub.ts` extraction is additive. To roll back:
1. Revert `AppContext.tsx` to inline `handleEntity` / `handleFinancialPosted` (restore from Phase 1 implementation notes or git).
2. Restore `usePurchaseOrders.ts` and `useGoodsReceipts.ts` socket subscription blocks.
3. Restore `useRealtimeQuerySync.ts` default `enabled: true`.

The query invalidation behavior is unchanged regardless — rollback restores the duplicate listeners but does not break anything.

### A4 rollback

Remove the `void invalidateReconnectCriticalKeys(getQueryClient())` line from `handleReconnect`. Delete `reconnectCriticalKeys.ts`. The `scheduleRefresh` path is entirely unaffected.

---

## 10. Test plan

### A1 — Entity event queue

**Unit tests (`tests/entityEventEmissions.test.ts`)**

| Test | Assertion |
|------|-----------|
| `queueEntityEvent` outside transaction emits immediately | `emitEntityEvent` called synchronously |
| `queueEntityEvent` inside `runWithEntityEventQueue` context queues | `emitEntityEvent` not called until `flushEntityEventQueue()` |
| `flushEntityEventQueue` emits all queued events in order | Ordered list of emitted payloads matches queue insertion order |
| `clearEntityEventQueue` discards all queued events | `emitEntityEvent` never called after clear |
| Two sequential transactions each flush their own queue | No cross-contamination across async contexts |

**Integration tests (`tests/entityEventEmissionsIntegration.test.ts`)**

| Test | Assertion |
|------|-----------|
| `withTransaction` commits → entity event emitted once after commit | Spy on `emitEntityEvent` in `realtime.ts` |
| `withTransaction` throws → entity event never emitted | Rollback path discards queue |
| `withTransaction` + `queueFinancialPosted` together → both flush after commit | financial.posted fires before entity event (flush order) |
| Route handler calls `queueEntityEvent` + then throwable code path → no phantom emit | Rollback scenario |

### A3 — RealtimeDispatchHub

**Unit tests (`tests/realtimeDispatchHub.test.ts`)**

| Test | Assertion |
|------|-----------|
| `createRealtimeDispatchHub` returns `handleEntity` and `handleFinancialPosted` | Type contract |
| `handleEntity` with own-mutation payload → calls `scheduleRefresh`, skips `baseDispatch` | `shouldSkipRemoteReducerPatch` path |
| `handleEntity` with `settings.bulkRefresh` → calls `runRefreshFromApi`, skips `scheduleRefresh` | Bulk refresh path |
| `handleEntity` with remote `invoice` payload → dispatches `UPDATE_INVOICE` or `ADD_INVOICE`, calls `scheduleRefresh` | Reducer patch + refresh |
| `handleEntity` with cross-tenant payload → no dispatch, no scheduleRefresh | Tenant filter |
| `handleFinancialPosted` → calls `invalidateQueriesForFinancialPosted`, calls `scheduleRefresh` | Preserved behavior |
| All Phase 1 reducer patch types fire as before | Regression: bill, transaction, invoice, unit, contract, vendor, contact, project, installment_plan |

**Listener deduplication gate (CI grep)**

```
# Must find exactly zero entity_* listener registrations outside AppContext after A3
grep -r "socket\.on\('entity_" --include="*.ts" --include="*.tsx" \
  hooks/ modules/ components/ services/realtime/ \
  | grep -v "AppContext\|realtimeDispatchHub"
# Expected: 0 matches
```

### A4 — Reconnect recovery bundle

**Unit tests (`tests/reconnectCriticalKeys.test.ts`)**

| Test | Assertion |
|------|-----------|
| `invalidateReconnectCriticalKeys` calls `invalidateQueries` for all 7 keys in parallel | `Promise.all` mock; all keys present |
| All keys in `RECONNECT_CRITICAL_KEYS` are valid query key arrays (non-empty, first element is string) | Structural assertion |
| `dashboardMetricsQueryKeys.root` in the list matches `dashboardMetricsQueryKeys.root[0] === 'dashboardMetrics'` | QI-1 regression guard |

**AppContext integration check**

| Scenario | Expected behavior |
|----------|-------------------|
| Socket reconnects after 60s disconnect | `invalidateReconnectCriticalKeys` fires immediately; `scheduleRefresh` fires 500ms later |
| Socket reconnects within cooldown window | Neither fires (cooldown guard runs first — unchanged) |
| Initial connect | Neither fires (`shouldSkipInitialSocketConnect` guard — unchanged) |

### Regression checklist (all phases)

| Check | Verified by |
|-------|-------------|
| Phase 1 test suite (`tests/queryClientPhase1.test.ts`) passes | Existing test run |
| `financial.posted` still fires correctly via `financialPostedEmissions.ts` | A1 integration test |
| Notification listener (`notification_created`) unaffected | AppContext grep — not in hub |
| `approval_*` listeners in `useMobileNotifications.ts` unaffected | Grep — not in hub |
| WhatsApp listeners (`whatsapp:message:*`) unaffected | Grep — not in hub |
| `lock_acquired` / `lock_released` listeners unaffected | Grep — not in hub |
| Own-mutation path: `scheduleRefresh()` still called, `baseDispatch` still skipped | Hub unit test |
| `bulkRefresh` settings event: `runRefreshFromApi()` still called directly | Hub unit test |
| Financial stale-time tiers preserved | `queryClientPhase1.test.ts` QI-1 test |

---

## 11. Success criteria

| Scenario | Phase 2A target |
|----------|----------------|
| Route ROLLBACK | No socket event reaches any client for that mutation |
| Route COMMIT | Exactly one `entity_*` event per entity per commit; emitted after COMMIT is durable |
| Socket reconnect | Critical financial + procurement React Query caches invalidated within 50ms of reconnect; AppContext sync within 2.5s |
| PO list screen mounted | Receives `['purchase-orders']` invalidation from central hub on `purchase_order` event — with or without the hook's own listener mounted |
| Duplicate invalidation | Zero duplicate `invalidateQueries` calls for `['purchase-orders']` when both hub and hook would have fired |
| `useRealtimeQuerySync()` mounted with no args | No socket listeners registered |

---

## 12. Document references

| Document | Role |
|----------|------|
| [multi-user-sync-phase2-review.md](./multi-user-sync-phase2-review.md) | Phase 2 specification and ranked issues |
| [multi-user-synchronization-review.md](./multi-user-synchronization-review.md) | Original findings |
| [multi-user-sync-phase1-implementation-notes.md](./multi-user-sync-phase1-implementation-notes.md) | Phase 1 as-built (AppContext line references) |
| [multi-user-sync-phase1-test-plan.md](./multi-user-sync-phase1-test-plan.md) | Phase 1 test baseline to extend |

---

*End of Phase 2A plan. No source files were modified.*
