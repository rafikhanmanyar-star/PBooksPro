# Payment Disappearing Investigation

**Status**: Root cause identified  
**Symptom**: Payment appears immediately on both User A and User B screens, then disappears ~1 second later. Reappears after logout/login.  
**Implication confirmed**: Database save succeeded; realtime propagation succeeded; a subsequent state replacement removed it from AppContext.

---

## 1. Observed Behaviour Trace

| Time | Event |
|---|---|
| t=0ms | User A opens `RentalPaymentModal`, submits → `dispatch({ type: 'ADD_TRANSACTION' })` |
| t=0ms | Payment appears on User A screen |
| t=0ms | `api.saveTransaction(tx)` POST /transactions starts async |
| t=~200ms | Backend COMMITs, flushes queued `entity_created` socket event, then `emitRecalculatedInvoiceBillEvents` → `entity_updated` for invoice, then sends HTTP 201 |
| t=~200ms | Socket `entity_created` arrives at User A and User B |
| t=~200ms | User A (`isOwnMutation=true`): `scheduleRefresh()` only (no reducer patch) |
| t=~200ms | User B: `handleEntity` → `ADD_TRANSACTION` via `baseDispatch` (payment appears on User B screen) + `scheduleRefresh()` |
| t=~201ms | HTTP 201 arrives at User A → `dispatch(UPDATE_TRANSACTION, { ...tx, version: 1 })` |
| t=~1000–3000ms | `refreshFromApi()` fires (see §3 for exact timing) |
| t=~1000–3000ms | `SET_STATE` dispatched with merged state that **does not contain the payment** |
| t=~1000–3000ms | Payment disappears from both screens |
| logout/login | Fresh full-load fetches payment from DB → reappears |

---

## 2. Payment Creation Flow

### 2a. Client-side dispatch (`RentalPaymentModal.tsx:81`)

```typescript
// RentalPaymentModal.handleSubmit
const mkId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
const grossTx: Transaction = { ...tx, id: mkId() };
dispatch({ type: 'ADD_TRANSACTION', payload: grossTx });
// security deposit (if applicable):
dispatch({ type: 'ADD_TRANSACTION', payload: { ...tx, id: Date.now().toString() + Math.random() } });
```

Client-generated IDs are used. Two `ADD_TRANSACTION` dispatches fire for rent + security deposit.

### 2b. `ADD_TRANSACTION` intercept in AppContext (`AppContext.tsx:522`)

```typescript
if (a.type === 'ADD_TRANSACTION') {
    baseDispatch(action);              // ← payment appears immediately
    api.saveTransaction(tx)
        .then(async (saved) => {
            dispatch(UPDATE_TRANSACTION, { ...tx, version: saved.version }, _isRemote: true);
            // fetch updated invoice → dispatch UPDATE_INVOICE
            // invalidate rentalRollup query cache
        })
        .catch(err => notifyDatabaseError(err));
}
```

`baseDispatch` is synchronous; `api.saveTransaction` is async. The payment appears before the network round-trip.

### 2c. Backend POST /transactions (`transactionsRoutes.ts:143`)

```typescript
const result = await withTransaction(async (client) => {
    // body.id is preserved if provided (client-generated ID kept as DB primary key)
    const r = await upsertTransaction(client, tenantId, body, req.userId);
    queueEntityEvent(tenantId, action, 'transaction', { data: apiRow, sourceUserId: req.userId });
    return r;
});
// after withTransaction returns (post-COMMIT):
memoryCacheDeletePrefix(`rental_balances:${tenantId}:`);
await emitRecalculatedInvoiceBillEvents(tenantId, req.userId, result.affectedInvoiceIds, ...);
sendSuccess(res, apiRow, 201);
```

Event queue is flushed at COMMIT (before HTTP response). Socket events arrive at clients before the HTTP 201 acknowledgement.

---

## 3. `scheduleRefresh` Timing

```typescript
// AppContext.tsx:1843
const scheduleRefresh = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    const sinceLastRefresh = Date.now() - lastApiRefreshAtRef.current;
    if (sinceLastRefresh < COOLDOWN_MS) {                             // COOLDOWN_MS = 3000
        debounceTimer = setTimeout(runRefreshFromApi, COOLDOWN_MS - sinceLastRefresh);
        return;
    }
    debounceTimer = setTimeout(runRefreshFromApi, DEBOUNCE_MS);       // DEBOUNCE_MS = 2000
};
```

`lastApiRefreshAtRef.current` starts at **0**. It is set to `Date.now()` only in `runRefreshFromApi()`, which is called only by socket-triggered refreshes — not by the initial post-auth load (line 1817 calls `void refreshFromApi()` directly, bypassing `runRefreshFromApi`).

This means:
- After login, `lastApiRefreshAtRef = 0` → `sinceLastRefresh` is huge → **not within cooldown** → debounce fires after `DEBOUNCE_MS = 2000ms`.
- After the first socket-triggered refresh, if a second socket event arrives within 3 seconds, the cooldown path fires: `COOLDOWN_MS - sinceLastRefresh` → can fire as early as `~0–1000ms`.

**The ~1 second disappearance** matches the cooldown path: user creates payment ~2 seconds after login, first socket-triggered refresh completes, a second event (e.g., the `entity_updated` for the linked invoice) fires, cooldown fires at `3000 - 2000 = 1000ms`.

---

## 4. `refreshFromApi` Flow

```typescript
// AppContext.tsx:1662
const refreshFromApi = useCallback(async () => {
    const base = stateRef.current;                         // ← snapshot at START of this call
    const lastSync = sessionStorage.getItem('pbooks_api_last_sync_at');

    const baselineHasCoreData =
        (base.projects?.length > 0) || (base.contacts?.length > 0) || ...
        || (base.transactions?.length > 0);

    if (lastSync && cursorMatchesTenant && baselineHasCoreData) {
        // INCREMENTAL PATH
        const { merged: inc } = await loadStateViaIncrementalSync(lastSync, base);
        merged = { ...base, ...inc };
        nextSyncCursor = response.updatedAt;
    } else {
        // FULL REFRESH PATH
        const partial = await loadStateForSyncRefresh();   // → loadStateBulkChunked
        merged = mergePartialStateIntoBaseline(base, partial);
        nextSyncCursor = await getServerTimeIso();         // ← called AFTER the bulk load
    }
    sessionStorage.setItem('pbooks_api_last_sync_at', nextSyncCursor);
    dispatch({ type: 'SET_STATE', payload: merged });
}, [...]);
```

Two paths exist. Both have a defect described in §5.

---

## 5. Root Cause: Race Condition Between `ADD_TRANSACTION` and `refreshFromApi`

### 5a. Full Refresh Path — Snapshot Race

The full-refresh path is taken when `lastSync` is absent or `baselineHasCoreData` is false. This includes:
- **Initial login** (no `lastSync` in sessionStorage)
- **Concurrent refresh** started before data existed

**Race scenario:**

```
t=0ms     : refreshFromApi() starts (e.g., initial login effect)
              base = stateRef.current          ← state has NO payment (user hasn't acted)

t=50ms    : loadStateBulkChunked first chunk request sent to server

t=400ms   : User creates payment → ADD_TRANSACTION → payment in React state

t=450ms   : api.saveTransaction() POST in flight

t=600ms   : Backend COMMITs; payment now in DB with updated_at = T_600

t=600ms   : Socket entity_created fires → scheduleRefresh() → debounce 2000ms

t=800ms   : loadStateBulkChunked completes; all DB data at T=50–700ms
              partial.transactions does NOT include payment
              (DB query ran before payment was committed at T_600)

t=810ms   : normalizeLoadedStateOffThread → mergePartialStateIntoBaseline(base, partial)
              base.transactions   = []          (captured at t=0, before ADD_TRANSACTION)
              partial.transactions = [...]      (from DB, no payment)
              merged.transactions = partial.transactions → NO payment

t=820ms   : getServerTimeIso() → T_820 (> T_600 = payment's updated_at)
t=820ms   : sessionStorage('lastSync') = T_820

t=830ms   : dispatch SET_STATE → PAYMENT DISAPPEARS from both screens

t=2600ms  : Socket-triggered refreshFromApi() starts (debounce 2000ms)
              base = stateRef.current at t=2600ms → payment GONE (SET_STATE removed it at t=830ms)
              lastSync = T_820 > T_600 = payment's updated_at

t=2600ms  : INCREMENTAL path: GET /state/changes?since=T_820
              listTransactionsChangedSince returns tx WHERE updated_at > T_820
              payment has updated_at = T_600 < T_820 → NOT returned

t=2800ms  : inc.transactions merged with base (which has no payment) → still no payment
t=2800ms  : dispatch SET_STATE → payment still absent

RESULT: Payment is gone until next full reload (logout/login).
```

### 5b. Why `mergePartialStateIntoBaseline` Doesn't Save It

`mergePartialStateIntoBaseline` has optimistic-merge protection for **invoices** and **bills**:

```typescript
// appStateMerge.ts:44
export function mergeInvoicesWithServerBaseline(base: Invoice[], server: Invoice[]): Invoice[] {
    const serverIds = new Set(server.map(i => i.id));
    const out = [...server];
    for (const inv of base) {
        if (!inv.id || serverIds.has(inv.id)) continue;
        const hadServerVersion = typeof inv.version === 'number' && inv.version >= 1;
        if (hadServerVersion) continue;   // was on server, now missing = deleted; skip
        out.push(inv);                     // optimistic: no server version yet → keep
    }
    return out;
}
```

For **transactions** there is no equivalent function:

```typescript
// appStateMerge.ts:105
return {
    ...base,
    ...partial,              // ← partial.transactions REPLACES base.transactions entirely
    invoices: mergeInvoicesWithServerBaseline(base.invoices, partial.invoices),
    bills: mergeBillsWithServerBaseline(base.bills, partial.bills),
    // ...
} as AppState;
```

The `{ ...base, ...partial }` spread overwrites `base.transactions` with `partial.transactions`. If `partial.transactions` was loaded before the payment was committed, the payment is gone.

Note: even if `mergeTransactionsWithServerBaseline` were added with the same version-based logic, it **would not help in this race** because `base.transactions` was captured at t=0 (before `ADD_TRANSACTION`), so the payment is absent from `base` too — there is nothing to rescue.

### 5c. Why `getServerTimeIso()` Seals the Fate

After the full refresh, `lastSync` is set to the server clock **at the time the bulk load completed**, not at the time the data was actually queried. Because `getServerTimeIso()` is called AFTER `loadStateBulkChunked` completes, `lastSync` is always slightly **ahead of** the DB snapshot. Any transaction committed between when the first DB query ran and when `getServerTimeIso()` returns will be in a "gap":

```
DB query time ──────────────────► getServerTimeIso()
                ↑
         payment committed here (updated_at inside the gap)
```

`updated_at` is **inside the gap** → too old for the next incremental sync → permanently missed.

### 5d. Why Both Screens Are Affected

**User A**: Payment created optimistically, then removed by the concurrent full-refresh SET_STATE.

**User B**: 
- Receives `entity_created` socket → `ADD_TRANSACTION` via `baseDispatch` → payment appears.
- If User B **also just logged in**, the same initial-load race applies to their session.
- If User B's initial load completed before the payment was created:
  - `lastSync_B` was set **before** `updated_at_of_payment`
  - Incremental sync returns the payment → it stays
  - **User B should NOT see the disappearance in this case**
- If User B's initial load completed **after** the payment was created but the bulk query ran before commit:
  - Same gap scenario → payment missed → `lastSync_B > updated_at_of_payment`
  - Subsequent incremental sync misses the payment → disappears

The simultaneous disappearance on both screens strongly suggests both users had the initial-load race active (both logged in around the same time, both running `loadStateBulkChunked` while the payment was being committed).

---

## 6. All Caches and Queries Involved

| Cache/Query | Invalidated? | Role |
|---|---|---|
| `state.transactions` (AppContext) | Yes — `SET_STATE` replaces it | **Primary cause of disappearance** |
| `queryKeys.ledger.all` (React Query) | Yes — `invalidateQueriesForEntityEvent` | Ledger/reports; refetched from server |
| `queryKeys.reports.all` (React Query) | Yes | Reports |
| `dashboardMetricsQueryKeys.root` | Yes | Dashboard KPIs |
| `queryKeys.invoices.all` | Yes (via `entity_updated` for invoice) | Invoice list |
| `queryKeys.rental.invoicesList()` | Yes | Rental invoice list |
| `rentalRollupQueryKeys.root` | Yes (from ADD_TRANSACTION success handler) | Rental rollup summary |

None of the React Query caches cause the disappearance — they refetch from server and would show the payment correctly. The disappearance is entirely in the AppContext `state.transactions` array.

---

## 7. `TransactionRepository` Sort Order

```sql
-- list() used by loadStateBulkChunked
ORDER BY t.date DESC, t.id DESC LIMIT $N OFFSET $M

-- listChangedSince() used by incremental sync
WHERE t.updated_at > $since
ORDER BY t.updated_at ASC
```

Sort order is not itself the issue, but confirms: chunked pagination returns most-recent first, and the new payment (created right now) would be in the first chunk **if it exists in DB when the query runs**. If the query runs before the commit, no chunk contains it.

---

## 8. Summary: Root Cause

| Factor | Detail |
|---|---|
| **Trigger** | `refreshFromApi()` started before `ADD_TRANSACTION` or before `api.saveTransaction` committed |
| **Mechanism** | Full-refresh DB snapshot misses the payment; `mergePartialStateIntoBaseline` uses `{ ...base, ...partial }` which overwrites `transactions` with the stale server list |
| **Amplifier** | `getServerTimeIso()` is called AFTER the bulk load, advancing `lastSync` past the payment's `updated_at` |
| **Consequence** | Subsequent incremental syncs query `updated_at > lastSync` and miss the payment; state never self-heals |
| **Scope** | Both User A (optimistic) and User B (via socket ADD_TRANSACTION) affected if both had initial-load races |
| **Why logout/login fixes it** | `lastSync` is cleared; fresh full-load re-queries DB which now has the payment |

---

## 9. Missing Protections

1. **No `mergeTransactionsWithServerBaseline` function** — `mergePartialStateIntoBaseline` protects invoices and bills but not transactions. A transaction-specific merge would need to operate on the **current** `stateRef.current` (not the stale `base` captured at refresh start) to be effective.

2. **`base` snapshot is stale** — `const base = stateRef.current` is captured at the start of `refreshFromApi`. By the time `SET_STATE` is dispatched (500ms–3s later), `stateRef.current` has been updated with optimistic writes. The final merge should use `stateRef.current` at dispatch time, not at start of refresh.

3. **`getServerTimeIso()` advances the cursor past unqueried data** — The sync cursor should be the server clock **at DB query time** (or the server can return it as `updatedAt` in the response), not at the time `refreshFromApi` completes normalization.

4. **No concurrency guard on `refreshFromApi`** — Two concurrent calls (initial load + socket-triggered) can both dispatch `SET_STATE`; the second to complete wins and may overwrite the first's work.

---

## 10. Recommended Fix Direction

The minimal fix that addresses the root cause without restructuring the sync architecture:

**Fix 1 (highest impact):** In `refreshFromApi`, replace the stale `base` snapshot with `stateRef.current` immediately before dispatching `SET_STATE`. This ensures optimistic writes applied between start and end of the refresh are preserved:

```typescript
// Instead of:
merged = mergePartialStateIntoBaseline(base, partial, ...);
// Use the CURRENT state as the merge baseline:
merged = mergePartialStateIntoBaseline(stateRef.current, partial, ...);
```

This works for both paths (full and incremental) and ensures any `ADD_TRANSACTION` dispatched during the refresh is preserved in the merge.

**Fix 2 (complementary):** Add `mergeTransactionsWithServerBaseline` in `appStateMerge.ts` with the same semantics as `mergeInvoicesWithServerBaseline` — keep optimistic transactions (version === undefined or version < 1) that are missing from the server list:

```typescript
export function mergeTransactionsWithServerBaseline(base: Transaction[], server: Transaction[]): Transaction[] {
    const serverIds = new Set(server.map(t => t.id));
    const out = [...server];
    for (const tx of base) {
        if (!tx.id || serverIds.has(tx.id)) continue;
        const hadServerVersion = typeof tx.version === 'number' && tx.version >= 1;
        if (hadServerVersion) continue;
        out.push(tx);
    }
    return out;
}
```

Note: Fix 2 alone is insufficient when `base` was captured before `ADD_TRANSACTION`. Fix 1 + Fix 2 together close both angles of the race.

**Fix 3 (for cursor gap):** Use the server-returned `updatedAt` from the bulk-chunked response as the sync cursor instead of calling `getServerTimeIso()` separately. The bulk endpoint can return its DB query time, ensuring `lastSync` is not ahead of the queried data.
