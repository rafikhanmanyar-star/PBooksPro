# Phase 2A — A1 Corrected Architecture Specification
## Transactional Entity Event Queue

**Date:** June 2026  
**Status:** Corrected specification — no source files modified  
**Supersedes:** A1 section of [multi-user-sync-phase2a-plan.md](./multi-user-sync-phase2a-plan.md)  
**Authority:** [multi-user-sync-phase2-review.md](./multi-user-sync-phase2-review.md)

---

## 1. Why the original plan was wrong

The original plan stated:

> *"Replace `emitEntityEvent(...)` with `queueEntityEvent(...)` in the following files."*

This is incorrect because the queue mechanism only activates when called **inside** the `fn(client)` callback passed to `withTransaction`. The AsyncLocalStorage context established by `runWithEntityEventQueue` exits before the `await withTransaction(...)` promise returns to the caller.

Across all six priority routes, every existing `emitEntityEvent` call is located in the route handler body **after** `withTransaction` has already returned. At that call site:

```
const result = await withTransaction(fn);   // ← AsyncLocalStorage context exits here
                                            //   COMMIT and flush already completed
emitEntityEvent(...);                       // ← no active queue; emits immediately
```

Calling `queueEntityEvent` at this position finds no active queue and falls through to `emitEntityEvent` immediately — **identical to current behavior**. No transactional guarantee is achieved.

The fix requires **relocating** the emit call to inside `fn(client)` — not renaming it at its current position.

---

## 2. Route call-site audit

All six priority routes confirmed after reading source:

| Route | Emit position | Count |
|-------|--------------|-------|
| `transactionsRoutes.ts` | Outside `withTransaction`, after return | 5 primary + `emitRecalculatedInvoiceBillEvents` (separate pool.connect) |
| `invoicesRoutes.ts` | Outside `withTransaction`, after return | 3 |
| `billsRoutes.ts` | Outside `withTransaction`, after return; settle/reverse/replace open new pool.connect for re-read | 16 |
| `purchaseOrdersRoutes.ts` | Outside `withTransaction`, after return | 5 |
| `goodsReceiptsRoutes.ts` | Outside `withTransaction`, after return | 6 (including PO cascade emits) |
| `contractsRoutes.ts` | Outside `withTransaction`, after return | 5 |

---

## 3. Correct migration pattern

### 3.1 Primary entity emit — relocate inside fn(client)

The general pattern for simple CRUD routes (invoice, transaction, contract, PO, GRN):

**Before (current — emit outside, C-2 unfixed):**
```typescript
const result = await withTransaction((client) => serviceCall(client, tenantId, body));
if (result.conflict) { sendVersionConflict(res, result.row.version); return; }
const apiRow = toApiRow(result.row);
emitEntityEvent(tenantId, action, entityType, { data: apiRow, sourceUserId: req.userId });
sendSuccess(res, apiRow);
```

**After (corrected — emit inside fn(client), queued until after COMMIT):**
```typescript
const result = await withTransaction(async (client) => {
  const r = await serviceCall(client, tenantId, body);
  if (!r.conflict) {
    const action = r.wasInsert ? 'created' : 'updated';
    queueEntityEvent(tenantId, action, entityType, {
      data: toApiRow(r.row),
      sourceUserId: req.userId,
    });
  }
  return r;
});
if (result.conflict) { sendVersionConflict(res, result.row.version); return; }
sendSuccess(res, toApiRow(result.row));
```

Key principles:
- The event is only queued if there is no version conflict. If a conflict is returned, no event is queued, no event fires.
- The `toApiRow` call moves inside — the row is available from the service result.
- `sendSuccess` / `sendVersionConflict` remain outside — HTTP response is always after transaction.
- The queue flushes **after COMMIT** in `withTransaction` — the client receives the event only once the row is durable in PostgreSQL.

### 3.2 Cascaded secondary emits — leave outside as immediate

`billsRoutes.ts` settle/reverse/replace and `transactionsRoutes.ts` `emitRecalculatedInvoiceBillEvents` open a new `pool.connect()` after `withTransaction` completes and re-read the current row state before emitting. This is a deliberate pattern: the service layer returns IDs, and the route re-reads the full API shape post-commit.

These secondary emits are **already post-COMMIT** by design. Converting them to `queueEntityEvent` at their current positions is correct: no queue is active at that point, so `queueEntityEvent` falls through to `emitEntityEvent` immediately — semantics unchanged, the call is future-safe if the code path ever moves inside a transaction context.

**Action:** Replace `emitEntityEvent` with `queueEntityEvent` at secondary emit call sites. Do not relocate.

---

## 4. Before/after examples

### 4.1 `transactionsRoutes.ts` — POST /transactions

**Before:**

```typescript
transactionsRouter.post('/transactions', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) { sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
  try {
    const body = req.body as Record<string, unknown>;
    const result = await withTransaction(async (client) => {
      const id = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : null;
      const isNew = !id || !(await getTransactionByIdIncludingDeleted(client, tenantId, id));
      if (isNew) { await assertDemoCanCreateTransaction(client, tenantId); }
      return upsertTransaction(client, tenantId, body, req.userId ?? null);
    });
    if (result.conflict) {
      sendFailure(res, 409, 'CONFLICT', 'Record was modified by another user', { serverVersion: result.row.version });
      return;
    }
    const apiRow = rowToTransactionApi(result.row);
    memoryCacheDeletePrefix(`rental_balances:${tenantId}:`);
    memoryCacheDeletePrefix(`rental_monthly:${tenantId}:`);
    const action = result.wasInsert ? 'created' : 'updated';
    if (DEBUG_REALTIME) {
      console.log('[realtime] transaction.persisted', {
        tenantId, transactionId: apiRow.id, action,
        requestId: (req as RequestWithId).requestId,
      });
    }
    emitEntityEvent(tenantId, action, 'transaction', { data: apiRow, sourceUserId: req.userId });
    await emitRecalculatedInvoiceBillEvents(
      tenantId, req.userId,
      result.affectedInvoiceIds, result.affectedBillIds, result.affectedContractIds
    );
    sendSuccess(res, apiRow, result.wasInsert ? 201 : 200);
  } catch (e) { ... }
});
```

**After:**

```typescript
transactionsRouter.post('/transactions', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) { sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
  try {
    const body = req.body as Record<string, unknown>;
    const result = await withTransaction(async (client) => {
      const id = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : null;
      const isNew = !id || !(await getTransactionByIdIncludingDeleted(client, tenantId, id));
      if (isNew) { await assertDemoCanCreateTransaction(client, tenantId); }
      const r = await upsertTransaction(client, tenantId, body, req.userId ?? null);
      if (!r.conflict) {
        const apiRow = rowToTransactionApi(r.row);
        const action = r.wasInsert ? 'created' : 'updated';
        if (DEBUG_REALTIME) {
          console.log('[realtime] transaction.persisted', {
            tenantId, transactionId: apiRow.id, action,
            requestId: (req as RequestWithId).requestId,
          });
        }
        // Queued here — emitted after COMMIT, discarded on ROLLBACK
        queueEntityEvent(tenantId, action, 'transaction', { data: apiRow, sourceUserId: req.userId });
      }
      return r;
    });
    if (result.conflict) {
      sendFailure(res, 409, 'CONFLICT', 'Record was modified by another user', { serverVersion: result.row.version });
      return;
    }
    const apiRow = rowToTransactionApi(result.row);
    memoryCacheDeletePrefix(`rental_balances:${tenantId}:`);
    memoryCacheDeletePrefix(`rental_monthly:${tenantId}:`);
    // Secondary cascaded emits — post-COMMIT re-read, immediate emit (no active queue)
    await emitRecalculatedInvoiceBillEvents(
      tenantId, req.userId,
      result.affectedInvoiceIds, result.affectedBillIds, result.affectedContractIds
    );
    sendSuccess(res, apiRow, result.wasInsert ? 201 : 200);
  } catch (e) { ... }
});
```

**What changed:**
- `upsertTransaction` result captured as `r` inside `fn(client)`.
- Conflict guard flipped: emit only when `!r.conflict`.
- `queueEntityEvent` called inside the transaction callback — queued, flushed after `COMMIT`.
- `emitRecalculatedInvoiceBillEvents` unchanged outside — it opens its own connection and re-reads post-COMMIT state; `queueEntityEvent` inside it emits immediately (correct).
- `memoryCacheDeletePrefix` stays outside — cache invalidation is not transactional.
- HTTP response (`sendSuccess`, `sendFailure`) stays outside.

**What did NOT change:**
- Transaction boundary (`BEGIN`/`COMMIT`/`ROLLBACK`) — unchanged.
- The `DEBUG_REALTIME` log — moved inside with the emit for correlation.
- Conflict detection — still returned from service, checked in route.
- Secondary invoice/bill/contract emits — unchanged.

---

### 4.2 `invoicesRoutes.ts` — POST /invoices

**Before:**

```typescript
invoicesRouter.post('/invoices', requireResourceQuota('invoices'), async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) { sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
  try {
    const result = await withTransaction((client) =>
      upsertInvoice(client, tenantId, req.body as Record<string, unknown>, req.userId ?? null)
    );
    if (result.conflict) {
      sendFailure(res, 409, 'CONFLICT', 'Record was modified by another user', { serverVersion: result.row.version });
      return;
    }
    const apiRow = rowToInvoiceApi(result.row);
    const action = result.wasInsert ? 'created' : 'updated';
    emitEntityEvent(tenantId, action, 'invoice', { data: apiRow, sourceUserId: req.userId });
    sendSuccess(res, apiRow, result.wasInsert ? 201 : 200);
  } catch (e) { ... }
});
```

**After:**

```typescript
invoicesRouter.post('/invoices', requireResourceQuota('invoices'), async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) { sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized'); return; }
  try {
    const result = await withTransaction(async (client) => {
      const r = await upsertInvoice(client, tenantId, req.body as Record<string, unknown>, req.userId ?? null);
      if (!r.conflict) {
        const action = r.wasInsert ? 'created' : 'updated';
        // Queued here — emitted after COMMIT, discarded on ROLLBACK
        queueEntityEvent(tenantId, action, 'invoice', {
          data: rowToInvoiceApi(r.row),
          sourceUserId: req.userId,
        });
      }
      return r;
    });
    if (result.conflict) {
      sendFailure(res, 409, 'CONFLICT', 'Record was modified by another user', { serverVersion: result.row.version });
      return;
    }
    sendSuccess(res, rowToInvoiceApi(result.row), result.wasInsert ? 201 : 200);
  } catch (e) { ... }
});
```

**What changed:**
- Arrow function callback becomes `async (client) => { ... }` to allow `await` and the conditional queue.
- `upsertInvoice` result captured as `r`; emit queued only when `!r.conflict`.
- `rowToInvoiceApi(result.row)` in `sendSuccess` — called after the transaction completes, same row.
- One less local variable (`apiRow`) — the row is constructed twice (inside for the event, outside for the response), which is cheap for a POJO projection.

**Alternative — return apiRow from fn(client) to avoid double-projection:**

```typescript
const result = await withTransaction(async (client) => {
  const r = await upsertInvoice(client, tenantId, req.body as Record<string, unknown>, req.userId ?? null);
  if (r.conflict) return r;
  const apiRow = rowToInvoiceApi(r.row);
  queueEntityEvent(tenantId, r.wasInsert ? 'created' : 'updated', 'invoice', {
    data: apiRow, sourceUserId: req.userId,
  });
  return { ...r, apiRow };
});
if (result.conflict) { sendFailure(res, 409, ...); return; }
sendSuccess(res, result.apiRow, result.wasInsert ? 201 : 200);
```

This avoids the double `rowToInvoiceApi` call. Both approaches are correct. The choice is a style decision per route; the latter is preferred for routes with expensive projections.

---

## 5. Savepoint rollback analysis

### 5.1 The flaw

`withSavepoint` issues `ROLLBACK TO SAVEPOINT` on error, which undoes all PostgreSQL writes since the savepoint. The AsyncLocalStorage entity event queue is a Node.js array — it has no awareness of PostgreSQL savepoint boundaries. Events queued inside a savepoint that rolls back remain in the outer transaction queue. If the outer transaction commits, those events flush and reach clients — describing rows that were rolled back and no longer exist in the database.

**Concrete failure path:**

```
withTransaction(async (client) => {             // entity queue created: []
  await doOuterWork(client);                    // row A written

  await withSavepoint(client, 'risky', async (spClient) => {
    await doInnerWork(spClient);                // row B written
    queueEntityEvent(tenantId, 'created', 'invoice', { id: 'inv_B' });  // queue: [inv_B]
    throw new Error('inner failure');           // ROLLBACK TO SAVEPOINT — row B gone from DB
  }).catch(() => {});                           // error swallowed — outer tx continues

  // queue still: [inv_B]  —  describes a row that does not exist
});
// COMMIT — flushEntityEventQueue fires: inv_B emitted to all clients
// Client receives 'created' event for inv_B — queries it — 404
```

### 5.2 Current exposure in the codebase

`provisionApprovedOrganization` (`organizationApprovalService.ts` line 274–288) uses two swallowed savepoints inside `withTransaction`. Its savepoint bodies call `startTrialSubscription` and `getOrCreateOnboarding`. These services do not currently call `queueEntityEvent` — but they may in future. The coupling is silent and will break without any compile-time warning.

`transactionJournalBackfillService.ts` (line 99–108) uses per-row savepoints inside a transaction, errors caught and counted. `ensureTransactionJournalMirror` calls `FinancialPostingService` which calls `queueFinancialPosted`. The same savepoint-rollback-survives-queue flaw already exists for the financial posted queue and is pre-existing.

### 5.3 Option A — Savepoint-aware queue snapshots

On savepoint entry, capture the current queue length. On savepoint rollback, truncate the queue back to the captured length. No events queued inside the savepoint survive if the savepoint rolls back.

**`withSavepoint` change (conceptual):**

```typescript
export async function withSavepoint<T>(
  client: pg.PoolClient,
  label: string,
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const sp = savepointLabel(label);
  await client.query(`SAVEPOINT ${sp}`);

  // Capture queue lengths before the savepoint body runs
  const entityQueueSnapshot = snapshotEntityEventQueue();     // returns current length or null
  const financialQueueSnapshot = snapshotFinancialPostedQueue(); // same for financial

  try {
    const result = await fn(client);
    await client.query(`RELEASE SAVEPOINT ${sp}`);
    return result;
  } catch (e) {
    await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
    // Restore queues to pre-savepoint state — discard events from rolled-back writes
    restoreEntityEventQueue(entityQueueSnapshot);
    restoreFinancialPostedQueue(financialQueueSnapshot);
    throw e;
  }
}
```

`snapshotEntityEventQueue()` returns the current queue array length (or `null` if no queue is active). `restoreEntityEventQueue(n)` sets `queue.length = n` — the existing items up to `n` survive, items added inside the savepoint are discarded. This is O(1) and safe because the queue items are ordered by insertion time.

This also fixes the pre-existing savepoint flaw in `financialPostedEmissions.ts`. Both queues are protected with the same mechanism.

**Pros:**
- Correct by construction — no developer discipline required.
- Transparent to callsites — code inside savepoints can freely call `queueEntityEvent`; rollback automatically cleans up.
- Matches PostgreSQL semantics: savepoint rollback = those writes did not happen = those events should not fire.
- Fixes the pre-existing financial posted queue flaw simultaneously.

**Cons:**
- `withSavepoint` must import from both `entityEventEmissions.ts` and `financialPostedEmissions.ts` — adds coupling between pool.ts-adjacent utilities. Mitigated by exposing a single `snapshotQueues() / restoreQueues(snapshot)` facade.
- The snapshot functions must be exported from their respective modules.

### 5.4 Option B — Prohibit queueEntityEvent inside savepoints

Add a documentation rule and lint comment: do not call `queueEntityEvent` (or any service that calls it) from inside `withSavepoint`. The `withSavepoint` implementation is unchanged.

**Pros:**
- No code changes to `withSavepoint`.
- Simple conceptual model.

**Cons:**
- Not enforceable at the language or type level.
- Service composition makes the rule impossible to verify at call sites — a route calls `withSavepoint`, which calls a service, which calls another service, which calls `queueEntityEvent`. The person writing the inner service has no way to know they are inside a savepoint.
- The `transactionJournalBackfillService.ts` pattern (loop of savepoints calling `ensureTransactionJournalMirror`) demonstrates exactly this kind of deep call chain.
- As the codebase grows, violations are silent until a phantom event triggers a user-visible bug.

### 5.5 Recommendation: Option A

Option B is not enforceable without runtime or static analysis tooling that does not exist in this codebase. The failure mode (phantom event for a rolled-back row) is silent, tenant-wide, and produces incorrect UI state for all connected users. Option A is mechanically simple — a length snapshot and truncation — and provides the correct invariant automatically.

The `snapshotEntityEventQueue` / `restoreEntityEventQueue` functions are trivially testable and add three new exports to `entityEventEmissions.ts`. The `withSavepoint` change is four lines.

**Additionally:** Option A, as specified, simultaneously fixes the pre-existing savepoint vulnerability in `financialPostedEmissions.ts` (the same mechanism already exists there, just without the savepoint guard). This is a correctness improvement regardless of A1 scope.

---

## 6. Revised component design

### 6.1 `backend/src/core/entityEventEmissions.ts` (new file)

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

/**
 * Queue an entity event during an open DB transaction.
 * Flushed by `withTransaction` after COMMIT; discarded on ROLLBACK.
 * When no transaction queue is active, emits immediately (caller is post-commit).
 */
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

export function runWithEntityEventQueue<T>(
  queue: QueuedEntityEvent[],
  fn: () => Promise<T>
): Promise<T> {
  return entityEventQueueStorage.run(queue, fn);
}

/** Returns current queue length, or null if no queue is active. Used by withSavepoint. */
export function snapshotEntityEventQueue(): number | null {
  const queue = entityEventQueueStorage.getStore();
  return queue !== undefined ? queue.length : null;
}

/** Truncates queue to the snapshot length. Used by withSavepoint on rollback. */
export function restoreEntityEventQueue(snapshot: number | null): void {
  if (snapshot === null) return;
  const queue = entityEventQueueStorage.getStore();
  if (queue !== undefined && queue.length > snapshot) {
    queue.length = snapshot;
  }
}
```

### 6.2 `backend/src/core/financialPostedEmissions.ts` — add snapshot exports

Add two exports mirroring the entity event pattern (same mechanism, financial queue):

```typescript
/** Returns current queue length, or null if no queue is active. Used by withSavepoint. */
export function snapshotFinancialPostedQueue(): number | null {
  const queue = financialPostedQueueStorage.getStore();
  return queue !== undefined ? queue.length : null;
}

/** Truncates queue to the snapshot length. Used by withSavepoint on rollback. */
export function restoreFinancialPostedQueue(snapshot: number | null): void {
  if (snapshot === null) return;
  const queue = financialPostedQueueStorage.getStore();
  if (queue !== undefined && queue.length > snapshot) {
    queue.length = snapshot;
  }
}
```

### 6.3 `backend/src/db/pool.ts` — `withTransaction` change

```typescript
import {
  clearEntityEventQueue,
  flushEntityEventQueue,
  runWithEntityEventQueue,
} from '../core/entityEventEmissions.js';
import {
  clearFinancialPostedQueue,
  flushFinancialPostedQueue,
  runWithFinancialPostedQueue,
} from '../core/financialPostedEmissions.js';

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const pendingFinancialPosted: QueuedFinancialPosted[] = [];
  const pendingEntityEvents: QueuedEntityEvent[] = [];
  return runWithFinancialPostedQueue(pendingFinancialPosted, () =>
    runWithEntityEventQueue(pendingEntityEvents, async () => {
      const p = getPool();
      const client = await p.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        flushFinancialPostedQueue();   // financial.posted first — preserves Phase 1 ordering
        flushEntityEventQueue();       // entity_* after
        return result;
      } catch (e) {
        await client.query('ROLLBACK');
        clearFinancialPostedQueue();
        clearEntityEventQueue();
        throw e;
      } finally {
        client.release();
      }
    })
  );
}
```

Flush order: `financial.posted` before `entity_*` — preserves Phase 1 contract that the financial posted event arrives before entity patches on the client for the same operation.

### 6.4 `backend/src/db/pool.ts` — `withSavepoint` change (Option A)

```typescript
import {
  snapshotEntityEventQueue,
  restoreEntityEventQueue,
} from '../core/entityEventEmissions.js';
import {
  snapshotFinancialPostedQueue,
  restoreFinancialPostedQueue,
} from '../core/financialPostedEmissions.js';

export async function withSavepoint<T>(
  client: pg.PoolClient,
  label: string,
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const sp = savepointLabel(label);
  await client.query(`SAVEPOINT ${sp}`);

  const entitySnapshot = snapshotEntityEventQueue();
  const financialSnapshot = snapshotFinancialPostedQueue();

  try {
    const result = await fn(client);
    await client.query(`RELEASE SAVEPOINT ${sp}`);
    return result;
  } catch (e) {
    await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
    restoreEntityEventQueue(entitySnapshot);
    restoreFinancialPostedQueue(financialSnapshot);
    throw e;
  }
}
```

When `withSavepoint` is called outside any `withTransaction` (no active queue), both `snapshotEntityEventQueue()` and `snapshotFinancialPostedQueue()` return `null`. `restoreEntityEventQueue(null)` and `restoreFinancialPostedQueue(null)` are no-ops. Zero behavioral change for the non-transaction case.

---

## 7. Per-route migration guide

Each route handler follows one of two migration patterns:

### Pattern 1 — Single entity emit (CRUD routes)

**Routes:** `invoicesRoutes.ts` all verbs, `purchaseOrdersRoutes.ts` all verbs, `goodsReceiptsRoutes.ts` all verbs (including PO cascade emits), `contractsRoutes.ts` all verbs, `billsRoutes.ts` simple POST/PUT/DELETE, `transactionsRoutes.ts` simple verbs.

**Template:**

```typescript
const result = await withTransaction(async (client) => {
  const r = await serviceCall(client, tenantId, body);
  if (!r.conflict) {
    queueEntityEvent(tenantId, action, entityType, { data: toApiRow(r.row), sourceUserId: req.userId });
    // queue additional cascaded entity events here if they reference data available in the transaction
  }
  return r;
});
if (result.conflict) { ... return; }
sendSuccess(res, toApiRow(result.row));
```

**`goodsReceiptsRoutes.ts` — two entity emit (GRN + PO cascade):**

The `/goods-receipts/:id/post` route emits both `goods_receipt` and optionally `purchase_order`. Both are available from `result.purchaseOrder` in the service return value. Both can be queued inside `fn(client)`:

```typescript
const result = await withTransaction(async (client) => {
  const r = await postGoodsReceipt(client, tenantId, req.params.id, expectedVersion, req.userId ?? null);
  if (!r.conflict) {
    queueEntityEvent(tenantId, 'updated', 'goods_receipt', {
      data: r.api, id: r.row.id, sourceUserId: req.userId, version: r.row.version,
    });
    if (r.purchaseOrder) {
      queueEntityEvent(tenantId, 'updated', 'purchase_order', {
        data: rowToPurchaseOrderApi(r.purchaseOrder), id: r.purchaseOrder.id,
        sourceUserId: req.userId, version: r.purchaseOrder.version,
      });
    }
  }
  return r;
});
```

### Pattern 2 — Multi-entity with post-COMMIT re-read (billsRoutes complex verbs)

**Routes:** `billsRoutes.ts` `settle-with-advances`, `vendor-settlement/reverse`, `vendor-settlement/replace`.

These routes open a new `pool.connect()` after `withTransaction` to re-read affected rows at current DB state before emitting. The service layer returns IDs, not full rows. These emits are already post-COMMIT by design and should remain outside.

**Action:** Replace `emitEntityEvent` with `queueEntityEvent` at these positions. With no active queue, they emit immediately — behavior identical to current, call-site is future-safe.

**No relocation required for these routes.** The `withTransaction` callback may optionally queue the primary `transaction` or `bill` entity event where the row is already available inside `fn`, but the secondary emits (advances, linked bills, journal entries) stay outside.

---

## 8. Files affected

### New files

| File | Purpose |
|------|---------|
| `backend/src/core/entityEventEmissions.ts` | Queue implementation with snapshot/restore exports |

### Modified files

| File | Change |
|------|--------|
| `backend/src/core/financialPostedEmissions.ts` | Add `snapshotFinancialPostedQueue` and `restoreFinancialPostedQueue` exports |
| `backend/src/db/pool.ts` | `withTransaction`: add entity event queue; `withSavepoint`: add queue snapshot/restore (Option A) |
| `backend/src/modules/accounting/routes/transactionsRoutes.ts` | Primary emit relocated inside `fn(client)` via `queueEntityEvent`; secondary emits (`emitRecalculatedInvoiceBillEvents`) converted to `queueEntityEvent` at current positions |
| `backend/src/modules/customers/routes/invoicesRoutes.ts` | Primary emits relocated inside `fn(client)` |
| `backend/src/modules/vendors/routes/billsRoutes.ts` | Simple verb primary emits relocated inside `fn(client)`; complex settlement verb emits converted to `queueEntityEvent` in place |
| `backend/src/modules/purchase-orders/routes/purchaseOrdersRoutes.ts` | Primary emits relocated inside `fn(client)` |
| `backend/src/modules/goods-receipts/routes/goodsReceiptsRoutes.ts` | All emits (including PO cascade) relocated inside `fn(client)` |
| `backend/src/modules/project-selling/routes/contractsRoutes.ts` | Primary emits relocated inside `fn(client)` |

### Unchanged files

| File | Why |
|------|-----|
| `backend/src/core/realtime.ts` | `emitEntityEvent` remains the underlying implementation |
| All other routes not listed | `emitEntityEvent` preserved as-is; not in priority scope |

---

## 9. Migration invariants

These invariants must hold for every migrated route handler after migration:

1. **No `emitEntityEvent` call is inside any `withTransaction` callback.** — All calls inside `fn(client)` use `queueEntityEvent`. `emitEntityEvent` is only called inside `flushEntityEventQueue` and from non-transactional contexts.

2. **`queueEntityEvent` is only called when the operation succeeded.** — No event is queued on the conflict branch or inside a conditional that is later rolled back.

3. **HTTP response (`sendSuccess`, `sendFailure`, `sendVersionConflict`) remains outside `withTransaction`.** — Response must always happen after the transaction result is known; it must never block the transaction.

4. **`memoryCacheDeletePrefix` and other non-transactional side effects remain outside.** — Only database-backed state changes and socket events are inside the transaction scope.

5. **Secondary post-COMMIT re-read emits remain outside.** — Any emit whose payload is built from a fresh `pool.connect()` re-read is correctly post-COMMIT and must not be moved inside; it emits immediately via the `queueEntityEvent` fallback.

---

## 10. Testing strategy

### 10.1 Unit tests — `entityEventEmissions.ts`

| Test | Verifies |
|------|---------|
| `queueEntityEvent` with no active queue calls `emitEntityEvent` synchronously | Fallback path — immediate emit outside transaction |
| `queueEntityEvent` inside `runWithEntityEventQueue` context pushes to queue without calling `emitEntityEvent` | Queue active path |
| `flushEntityEventQueue` calls `emitEntityEvent` for each queued item in insertion order | Flush order preserved |
| `flushEntityEventQueue` with empty queue is a no-op | No crash on empty |
| `clearEntityEventQueue` discards all items — `emitEntityEvent` never called | Rollback path |
| Two concurrent `runWithEntityEventQueue` contexts do not share queues | AsyncLocalStorage isolation |
| `snapshotEntityEventQueue` with no active queue returns `null` | Outside-transaction snapshot |
| `snapshotEntityEventQueue` with active queue returns current length | Snapshot value |
| `restoreEntityEventQueue(null)` is a no-op | No active queue case |
| `restoreEntityEventQueue(n)` truncates queue to length `n`, discarding items added after snapshot | Savepoint restore |

### 10.2 Integration tests — `withTransaction`

| Test | Verifies |
|------|---------|
| Route calls `queueEntityEvent` inside `fn(client)` → COMMIT → `emitEntityEvent` called once after commit | **Emit after COMMIT — primary goal of C-2** |
| Route calls `queueEntityEvent` inside `fn(client)` → service throws → `ROLLBACK` → `emitEntityEvent` never called | **Rollback emits nothing** |
| `queueEntityEvent` called inside `fn(client)` AND `emitEntityEvent` called outside (partial migration scenario) → exactly two emits | **Duplicate detection — migration regression** |
| `financial.posted` queue flushes before entity queue on COMMIT | **Flush order preserved** |
| Two nested `withTransaction` calls (if any exist) each have their own independent queue | Isolation |

### 10.3 Integration tests — savepoint rollback

| Test | Verifies |
|------|---------|
| `withTransaction` → `queueEntityEvent` outside savepoint → `withSavepoint` throws → outer tx commits → event from outside savepoint emits, NO event from inside savepoint emits | **Savepoint rollback discards queued events** |
| `withTransaction` → `withSavepoint` succeeds → `queueEntityEvent` inside savepoint → outer tx commits → event emits | **Savepoint success: event survives** |
| `withTransaction` → `withSavepoint` throws → `.catch` swallows → outer tx commits → outer entity events emit, savepoint events do not | **Swallowed savepoint: no phantom event** |
| Same three tests for `queueFinancialPosted` — financial posted queue has same savepoint protection | **Financial posted queue regression** |
| `withSavepoint` outside any `withTransaction` → snapshot returns null → restore is a no-op | **No-transaction save-point case** |

### 10.4 Per-route smoke tests

For each of the six priority routes, after migration, run:

| Scenario | Expected |
|----------|---------|
| Successful POST → socket listener spy | Exactly one entity event emitted; payload matches response body |
| POST with version conflict (409 response) | Zero entity events emitted |
| POST with validation error (400 response) | Zero entity events emitted |
| POST where service throws mid-transaction | Zero entity events emitted; no partial data visible to concurrent clients |

### 10.5 Duplicate event prevention — CI grep gate

```bash
# Must find zero emitEntityEvent calls inside withTransaction callbacks after migration
# (all such calls should use queueEntityEvent)
grep -rn "emitEntityEvent" \
  backend/src/modules/accounting/routes/transactionsRoutes.ts \
  backend/src/modules/customers/routes/invoicesRoutes.ts \
  backend/src/modules/vendors/routes/billsRoutes.ts \
  backend/src/modules/purchase-orders/routes/purchaseOrdersRoutes.ts \
  backend/src/modules/goods-receipts/routes/goodsReceiptsRoutes.ts \
  backend/src/modules/project-selling/routes/contractsRoutes.ts
# Expected: 0 matches in priority routes (only queueEntityEvent should appear)
```

```bash
# Must find zero queueEntityEvent calls outside priority routes (no accidental global adoption)
grep -rn "queueEntityEvent" backend/src/modules/ \
  | grep -v "transactionsRoutes\|invoicesRoutes\|billsRoutes\|purchaseOrdersRoutes\|goodsReceiptsRoutes\|contractsRoutes"
# Expected: 0 matches — expansion to other routes is a separate, planned step
```

---

## 11. Rollback strategy

A1 is independently reversible with zero client-visible impact:

1. Revert `pool.ts` to Phase 1 version (remove entity queue from `withTransaction`, remove savepoint snapshot from `withSavepoint`).
2. Revert all six priority routes: remove `queueEntityEvent` calls inside `fn(client)`, restore `emitEntityEvent` calls outside (from git or Phase 1 implementation notes).
3. Remove `snapshotFinancialPostedQueue` / `restoreFinancialPostedQueue` from `financialPostedEmissions.ts`.
4. Delete `entityEventEmissions.ts`.

`emitEntityEvent` is never removed from `realtime.ts` — it remains the implementation. Rollback restores emit timing to the pre-A1 pattern (still post-COMMIT by luck, now without the queue guarantee).

---

## 12. What A1 does not solve

| Issue | Status after A1 |
|-------|----------------|
| C-2 phantom event on process crash between COMMIT and emit | **Solved** — event is now queued pre-COMMIT, emitted atomically at flush |
| C-2 phantom event on route handler exception between COMMIT and emit | **Solved** — emit is inside transaction; exception → ROLLBACK → clear |
| C-1 single-process Socket.io (horizontal scaling) | Not in scope |
| `emitRecalculatedInvoiceBillEvents` re-reads could see newer data if concurrent write occurs between COMMIT and pool.connect | Not addressed — this is an existing architectural tradeoff of the post-COMMIT re-read pattern |
| Emit ordering between multiple queued events within one transaction (e.g. `transaction` created then `invoice` updated) | Flush preserves insertion order; no guaranteed ordering relative to concurrent transactions |
| `financial.posted` savepoint flaw (pre-existing) | **Fixed as a side effect of Option A** — `withSavepoint` now protects both queues |

---

## 13. Document references

| Document | Role |
|----------|------|
| [multi-user-sync-phase2a-plan.md](./multi-user-sync-phase2a-plan.md) | Original Phase 2A plan; A1 section superseded by this document |
| [multi-user-sync-phase2-review.md](./multi-user-sync-phase2-review.md) | Phase 2 specification; C-2 root cause |
| [multi-user-sync-phase1-implementation-notes.md](./multi-user-sync-phase1-implementation-notes.md) | Phase 1 as-built; `financialPostedEmissions.ts` reference implementation |

---

*End of corrected A1 specification. No source files were modified.*
