# Payment Disappearing — Trace v2

**Status**: Root cause confirmed (v2 — post-remediation)  
**Symptom**: Payment disappears ~1–3 seconds after creation from both screens. Reappears after logout/login.  
**Context**: Fix 1 (stateRef.current at merge time) and Fix 2 (mergeTransactionsWithServerBaseline) were applied to `refreshFromApi`. Bug still reproduces.  
**Conclusion**: The implemented fixes do not cover `handleBidirDownstreamComplete` (AppContext.tsx:2305), which uses `initialState` (not `stateRef.current`) as the merge base and has no transaction-preservation logic.

---

## 1. Every Action Dispatched After Payment Creation

### 1a. User A (payment creator)

| # | Time (relative) | Action | Dispatch site |
|---|---|---|---|
| 1 | t=0ms | `ADD_TRANSACTION` (rent payment, client-gen id) | AppContext.tsx:522 via `baseDispatch` |
| 2 | t=0ms | `ADD_TRANSACTION` (security deposit if amount>0, client-gen id) | AppContext.tsx:522 via `baseDispatch` |
| 3 | t=~200ms | `UPDATE_TRANSACTION` (server-assigned version on 201 response) | AppContext.tsx:533 |
| 4 | t=~200ms | `UPDATE_INVOICE` (linked invoice fetched after save) | AppContext.tsx:539 |
| 5 | t=~2000–3000ms | `SET_STATE` (from `refreshFromApi` — see §3) | AppContext.tsx:1828 |

### 1b. User B (remote observer)

| # | Time (relative) | Action | Dispatch site |
|---|---|---|---|
| 1 | t=~200ms | `ADD_TRANSACTION` (from socket `entity_created`) | AppContext.tsx ~2160 via `baseDispatch` |
| 2 | t=~2000–3000ms | `SET_STATE` (from `refreshFromApi` triggered by `scheduleRefresh`) | AppContext.tsx:1828 |

If `sync:bidir-downstream-complete` fires (desktop sync path):

| # | Time | Action | Dispatch site |
|---|---|---|---|
| 3 | t=variable | `SET_STATE` (from `handleBidirDownstreamComplete`) | AppContext.tsx:2323 |

---

## 2. Every SET_STATE Within 10 Seconds of Payment Creation

Four distinct `SET_STATE` dispatch sites exist in AppContext:

| Site | Line | Trigger | Base used |
|---|---|---|---|
| A | 1699 | Tenant switch | `initialState` |
| B | 1828 | `refreshFromApi` (post-fix) | `stateRef.current` at merge time ✓ |
| C | 2323 | `handleBidirDownstreamComplete` | **`initialState`** ✗ |
| D | 2547 | `BATCH_UPSERT_ENTITIES` via `sync:chunk-applied` | N/A (reducer upsert, not replace) |

Site B is fixed. Site C is **not fixed**. Site D is untraced.

---

## 3. Every refreshFromApi Invocation

### 3a. Post-auth (initial login)

Triggered by `useEffect` (AppContext.tsx ~1808) when `isInitializing` transitions `false → true`. Calls `void refreshFromApi()` directly — does NOT go through `runRefreshFromApi()`, so `lastApiRefreshAtRef` is NOT set.

**At this call, `stateRef.current = initialState` (empty)** because:
- The initialization effect (AppContext.tsx:~340) calls `setStoredState(mergedInit)` — this updates `storedState` but NOT the `state` reducer.
- `state` still equals `initialState` (from `useReducer`).
- `stateRef.current = state` is set via `useEffect` — async, reflects `state` not `storedState`.

Consequence: `baselineHasCoreData = false` → always takes **full refresh path**.

### 3b. Socket-triggered (scheduleRefresh)

Fires after every `entity_created` / `entity_updated` / `entity_deleted` / `financial.posted` socket event. Two timing modes:

```
lastApiRefreshAtRef = 0 (initial):
  sinceLastRefresh is huge → DEBOUNCE path → fires after 2000ms

lastApiRefreshAtRef = T_prev (after first socket refresh):
  if new event arrives within 3000ms of T_prev →
    COOLDOWN path → fires at (3000 - sinceLastRefresh)ms → can fire in ~0–1000ms
```

`lastApiRefreshAtRef` is set ONLY inside `runRefreshFromApi()`. The post-auth `void refreshFromApi()` call does NOT set it. This means:
- `entity_created` socket event fires (t=~200ms) → `scheduleRefresh()` → debounce 2000ms
- `entity_updated` socket (linked invoice) fires (t=~201ms) → resets debounce → fires at t=~2201ms
- Payment disappears at t=~2200ms

---

## 4. Every Socket Event Received After Payment Creation

| Time | Event | Handler | Result |
|---|---|---|---|
| t=~200ms | `entity_created` (transaction) | `handleEntity` | User A: `shouldSkipRemoteReducerPatch=true` (own mutation) → skip reducer, call `scheduleRefresh`. User B: `ADD_TRANSACTION` + `scheduleRefresh` |
| t=~201ms | `entity_updated` (linked invoice) | `handleEntity` | Both users: `UPDATE_INVOICE` + `scheduleRefresh` (resets debounce) |
| t=~201ms | `entity_updated` (linked bill, if applicable) | `handleEntity` | Both users: `UPDATE_BILL` + `scheduleRefresh` |

The invoice `entity_updated` resets the debounce timer. The final `scheduleRefresh` (from the last socket event) is the one that ultimately fires `refreshFromApi`.

**Note**: `entity_event` and `financial_posted` (no dot) used in `useMobileCommandCenter` are dead events — the server never emits them. They play no role.

---

## 5. Every React Query Invalidation

| Trigger | Keys invalidated | Effect |
|---|---|---|
| `entity_created` (transaction) | `queryKeys.ledger.all`, `queryKeys.reports.all`, `dashboardMetricsQueryKeys.root` | Ledger and reports refetch. Does NOT affect `state.transactions`. |
| `UPDATE_TRANSACTION` success (ADD_TRANSACTION handler) | `rentalRollupQueryKeys.root`, `queryKeys.invoices.all`, `queryKeys.rental.invoicesList()` | Invoice lists and rental rollup refetch. Does NOT affect `state.transactions`. |
| `financial.posted` | `queryKeys.ledger.all`, `queryKeys.reports.all`, `dashboardMetricsQueryKeys.root` | Same as entity_created. |

React Query invalidations do not cause the disappearance. The payment lives only in `state.transactions` (the useReducer store). All React Query keys are for separate query caches that fetch from the server independently.

---

## 6. Exact Action That Removes the Payment

**Action type**: `SET_STATE`  
**Dispatch site**: AppContext.tsx:2323 (`handleBidirDownstreamComplete`) or AppContext.tsx:1828 (`refreshFromApi`)  
**Payload**: `loadedState` where `loadedState.transactions` does not contain the payment

The payment is removed when `SET_STATE.payload.transactions` is dispatched without the payment ID.

---

## 7. Exact Reducer Path That Removes the Payment

**File**: `context/reducers/appReducer.ts`, `case 'SET_STATE'`

```typescript
case 'SET_STATE': {
    const payload = action.payload as Partial<AppState>;
    const next = {
        ...state,
        ...payload,   // ← payload.transactions REPLACES state.transactions entirely
    };
    // logPaymentTraceTransition fires here (console.warn if removedTransactionIds.length > 0)
    return next;
}
```

`{ ...state, ...payload }` means `payload.transactions` (which lacks the payment) overwrites `state.transactions` (which contains it). There is no merge protection inside the `SET_STATE` reducer case itself — the protection was placed at the `mergePartialStateIntoBaseline` call site.

**For `handleBidirDownstreamComplete`**: the protection in `mergePartialStateIntoBaseline` is bypassed because the base passed is `initialState` (empty transactions), so `mergeTransactionsWithServerBaseline([], partial.transactions)` returns only `partial.transactions` — nothing to preserve from base.

---

## 8. Why the Implemented Fix Did Not Stop the Disappearance

### Fix 1 + Fix 2 applied to `refreshFromApi` (AppContext.tsx:1828)

```typescript
// Full refresh path — FIXED
const mergeBaseline = stateRef.current;           // ← captured AFTER await (Fix 1)
const safeBase = cursorMatchesTenant ? mergeBaseline : initialState;
merged = mergePartialStateIntoBaseline(safeBase, partial, ...);
// mergeTransactionsWithServerBaseline(safeBase.transactions, partial.transactions)
//   → safeBase.transactions CONTAINS payment (stateRef is current after React rendered ADD_TRANSACTION)
//   → payment absent from partial → pushed to out array → payment PRESERVED ✓
```

Fix 1 + Fix 2 together close the `refreshFromApi` path. If `refreshFromApi` is the only SET_STATE site, the bug would be gone.

### `handleBidirDownstreamComplete` — Fix 1 NOT applied (AppContext.tsx:2305–2323)

```typescript
const handleBidirDownstreamComplete = async () => {
    const partial = await getAppStateApiService().loadStateForSyncRefresh();
    const loadedState = mergePartialStateIntoBaseline(
        initialState,   // ← ALWAYS initialState, NOT stateRef.current
        partial,
        pickTenantSettingsPartial(partial)
    );
    // mergeTransactionsWithServerBaseline(initialState.transactions, partial.transactions)
    //   → initialState.transactions = []
    //   → base is empty → nothing to preserve
    //   → loadedState.transactions = partial.transactions only
    //   → if payment absent from partial → payment REMOVED
    dispatch({ type: 'SET_STATE', payload: loadedState, _isRemote: true });
    setStoredState(loadedState as AppState);
};
```

**Result**: When `sync:bidir-downstream-complete` fires, a full DB load replaces `state.transactions` with whatever is in the server snapshot. If the payment was not yet committed when `loadStateForSyncRefresh()` ran, or if the server cursor skips it, the payment is gone.

There is no trace log at the `handleBidirDownstreamComplete` dispatch site. The only trace coverage is the `SET_STATE reducer applied` trace in appReducer.ts — which will fire a `console.warn` if `removedTransactionIds.length > 0`, but only if the trace key is enabled in localStorage.

### The cursor gap (Fix 3 not applied)

In `refreshFromApi` full path:

```typescript
nextSyncCursor = await getServerTimeIso();   // called AFTER loadStateForSyncRefresh()
```

DB query runs at T_query. `getServerTimeIso()` is called at T_cursor (> T_query). Any payment committed between T_query and T_cursor has:
- `updated_at` in the gap [T_query, T_cursor]
- `lastSync` set to T_cursor > `updated_at`
- Next incremental query: `WHERE updated_at > T_cursor` → payment NOT returned

With Fix 1 + Fix 2, this cursor gap no longer causes the disappearance via `refreshFromApi` because `stateRef.current` at merge time has the payment and `mergeTransactionsWithServerBaseline` preserves it. But if `handleBidirDownstreamComplete` fires next, it reloads with `initialState` as base, and the cursor-gap payment is again at risk.

---

## 9. Trace Coverage Gaps

| Path | logPaymentTrace coverage |
|---|---|
| `mergePartialStateIntoBaseline` enter/exit | ✓ logged |
| `refreshFromApi` start, before/after merge | ✓ logged |
| `loadStateViaIncrementalSync` start/complete | ✓ logged |
| `loadStateForSyncRefresh` start/complete | ✓ logged |
| `SET_STATE reducer applied` (warn if removed) | ✓ logged |
| `handleBidirDownstreamComplete` dispatch | ✗ NOT logged at dispatch level (only caught by SET_STATE reducer trace) |
| `BATCH_UPSERT_ENTITIES` (sync:chunk-applied) | ✗ NOT logged at all |
| `ADD_TRANSACTION` reducer | ✗ NOT logged |

The `console.warn` in the `SET_STATE reducer` trace will fire if the payment is removed via `handleBidirDownstreamComplete`, but only if `pbooks_payment_disappear_trace=1` is set before reproduction.

---

## 10. BATCH_UPSERT_ENTITIES (Secondary Risk)

The `sync:chunk-applied` window event listener (AppContext.tsx:2561–2579) accumulates entity chunks and dispatches `BATCH_UPSERT_ENTITIES` via `requestIdleCallback(timeout:300)` or `setTimeout(150)`.

```typescript
// appReducer.ts:104
items.forEach((item: any) => {
    const isSoftDeleted = item.deletedAt || item.deleted_at;
    if (isSoftDeleted) {
        if (itemMap.has(item.id)) {
            itemMap.delete(item.id);   // ← deletes transaction from state
```

If a `sync:chunk-applied` event fires with a transaction item where `deletedAt` is set (e.g., from a background bidirectional sync that replays a soft-delete), the payment will be removed from `state.transactions`.

**However**: `sync:chunk-applied` is fired by nothing in the current codebase — `grep` finds it only in AppContext.tsx as a listener, with no dispatcher. It is a dead code path unless an external process (Electron IPC, background worker) fires it. This path is inactive in the current reproduction.

---

## 11. Complete Post-Payment Timeline (Confirmed Execution Path)

```
t=0ms     ADD_TRANSACTION dispatched (x2 for rent + deposit)
           → state.transactions now has payment

t=~200ms  api.saveTransaction() 201 received
           → UPDATE_TRANSACTION dispatched (version=1 confirmed)

t=~200ms  entity_created socket arrives
           → User A: shouldSkipRemoteReducerPatch=true → only scheduleRefresh()
           → User B: ADD_TRANSACTION + scheduleRefresh()

t=~201ms  entity_updated (invoice) socket arrives
           → UPDATE_INVOICE + scheduleRefresh() [resets debounce on both users]

t=~2201ms refreshFromApi() fires (2000ms debounce from last scheduleRefresh)
           → stateRef.current HAS payment (Fix 1 + Fix 2 applied) ✓
           → full refresh: mergeTransactionsWithServerBaseline preserves payment ✓
           → SET_STATE dispatched WITH payment
           → payment survives refreshFromApi path

t=variable sync:bidir-downstream-complete fires (IF desktop sync active)
           → handleBidirDownstreamComplete runs
           → loadStateForSyncRefresh() called
           → mergePartialStateIntoBaseline(initialState, partial, ...)  ← base = []
           → if payment missing from partial.transactions:
               loadedState.transactions has NO payment
           → SET_STATE dispatched WITHOUT payment ← BUG FIRES HERE
           → payment DISAPPEARS
```

**The bug fires at AppContext.tsx:2323** when `sync:bidir-downstream-complete` fires after payment creation and the DB snapshot loaded by `loadStateForSyncRefresh()` does not include the payment.

---

## 12. Why the DB Snapshot May Still Miss the Payment

`loadStateForSyncRefresh()` calls the bulk-chunked state loader. If:

1. Desktop sync triggers `sync:bidir-downstream-complete` very shortly after the payment was created (within the DB replication / write propagation window), or
2. The DB query runs before the transaction is committed (concurrent write), or
3. The server snapshot uses a read replica with replication lag

— then `partial.transactions` will not include the new payment. Since `handleBidirDownstreamComplete` uses `initialState` as the merge base, `mergeTransactionsWithServerBaseline([], partial.transactions)` returns only `partial.transactions`. Payment is gone.

---

## 13. Summary

| Question | Answer |
|---|---|
| **What exact action removes the payment?** | `SET_STATE` dispatched at AppContext.tsx:2323 |
| **What exact reducer path removes it?** | `appReducer.ts case 'SET_STATE': { ...state, ...payload }` — `payload.transactions` replaces `state.transactions` |
| **Why did Fix 1 + Fix 2 not stop it?** | Fix 1 + Fix 2 were applied only to `refreshFromApi` (line 1828). `handleBidirDownstreamComplete` (line 2305) was not fixed — it still passes `initialState` as the merge base, discarding all client-side transactions. |
| **What is the remaining unfixed path?** | `handleBidirDownstreamComplete` — AppContext.tsx:2310: `mergePartialStateIntoBaseline(initialState, partial, ...)` |
| **Required fix** | Replace `initialState` with `stateRef.current` in `handleBidirDownstreamComplete`, matching the same Fix 1 pattern applied to `refreshFromApi` |

---

## 14. Minimal Remaining Fix

```typescript
// AppContext.tsx:2310 — CURRENT (unfixed)
const loadedState = mergePartialStateIntoBaseline(
    initialState,
    partial,
    pickTenantSettingsPartial(partial)
);

// REQUIRED FIX — apply same Fix 1 pattern as refreshFromApi
const mergeBase = cursorMatchesTenant ? stateRef.current : initialState;
const loadedState = mergePartialStateIntoBaseline(
    mergeBase,
    partial,
    pickTenantSettingsPartial(partial)
);
```

With `stateRef.current` as base:
- `mergeTransactionsWithServerBaseline(stateRef.current.transactions, partial.transactions)` runs
- `stateRef.current.transactions` contains the payment (React has rendered `ADD_TRANSACTION`)
- Payment is absent from `partial.transactions` (DB snapshot missed it)
- `mergeTransactionsWithServerBaseline` finds payment in base, not in server IDs → pushes it to output
- Payment preserved in `loadedState.transactions`
- `SET_STATE` dispatched WITH payment — payment survives

No other changes required. Fix 2 (`mergeTransactionsWithServerBaseline`) is already in place and will do the right thing once given a non-empty base.
