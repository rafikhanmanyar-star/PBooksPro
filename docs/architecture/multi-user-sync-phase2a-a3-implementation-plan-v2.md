# Phase 2A A3 — RealtimeDispatchHub Implementation Plan v2

**Date:** 2026-06-19  
**Authority:** `docs/architecture/multi-user-sync-phase2a-a3-review-v2.md`  
**Supersedes:** `docs/architecture/multi-user-sync-phase2a-a3-implementation-plan.md` (v1)  
**Status:** Plan only — **awaiting approval. No production code modified.**

---

## Revision Summary (v1 → v2)

This revision incorporates six findings from the Claude architecture review. v1 gaps are closed before implementation proceeds.

| Issue | Severity | v2 resolution |
|-------|----------|---------------|
| Approval notification semantics | **HIGH** | Dedicated **Approval Payload Audit** (§ below); A3.4 blocked until audit decisions approved |
| `notification_created` ownership | MEDIUM | Moved to **A3.1**; AppContext listener removed in same PR; **no dual-subscription period** |
| Reconnect migration | MEDIUM | Lifecycle spec + **A3.1 reconnect test cases** |
| Sidebar / ChatModal connect ownership | MEDIUM | Moved to **A3.1**; hub sole `connectRealtimeSocket()` owner; CI gate in A3.1 |
| Tenant switch behavior | LOW | **Option A only:** full hub cleanup + re-init; `updateDispatchHubContext` **removed** |
| Hub cleanup | LOW | Documented guard pattern + **A3.1 cleanup test** |

---

## Executive Summary

Phase 2A A3 introduces a plain TypeScript module (`services/realtime/RealtimeDispatchHub.ts`) that becomes the **single owner** of core socket subscriptions currently embedded in `AppContext.tsx` and duplicated across procurement, workflow, and mobile hooks.

The hub consolidates routing decisions (tenant isolation, own-mutation policy, invalidation, dashboard flags, refresh scheduling) while **AppContext retains** refresh implementation, reducer dispatch closures, merge baseline strategy, and window-event handlers.

This plan preserves:

- Phase 1 synchronization fixes (`mergeTransactionsWithServerBaseline`, `latestStateRef` merge baseline)
- Phase 2A A1 transactional entity queue (post-COMMIT emit timing)
- Payment disappearance fix (`applyChangeLogToMergedState` shallow-merge / partial-payload preservation)
- Existing socket **event names** (payload extensions for approval are a separate, gated decision — see Approval Payload Audit)
- Multi-tenant isolation

---

## Approval Payload Audit

> **Gate:** A3.4 must not begin until this audit is reviewed and the **Approval recommendation** at the end of this document is accepted or amended.

### 1. Current payload shape

**Type:** `ApprovalSocketPayload` — `backend/src/core/realtime.ts`

```typescript
export type ApprovalSocketPayload = {
  tenantId: string;
  requestId: string;
  entityType: string;
  entityId: string;
  level?: number;
  autoApproved?: boolean;
  sourceUserId?: string;  // present on all emits; semantics below
  ts: string;
};
```

**Fields audited — present / absent:**

| Field | In payload? | Notes |
|-------|-------------|-------|
| `sourceUserId` | Yes (optional) | **Actor** who triggered the workflow action — not a recipient identifier |
| `assigneeId` | **No** | `assigned_approver_id` exists on DB row only; not emitted on socket |
| `targetUserId` | **No** | — |
| `requestorUserId` | **No** | Requester identity is implicit via `sourceUserId` on `approval_requested` only |
| `userId` | **No** | Used on `UserNotificationSocketPayload` (`notification_created`), not on approval events |

**Related type (separate event):**

```typescript
export type UserNotificationSocketPayload = {
  tenantId: string;
  userId: string;           // true per-user recipient
  notificationId: string;
  ts: string;
};
```

### 2. Backend emit semantics (`workflowEngineService.ts`)

All six `approval_*` events are tenant-room broadcasts via `emitApprovalEvent`. `sourceUserId` is always the **acting user**:

| Event | `sourceUserId` value | Also emitted? |
|-------|---------------------|---------------|
| `approval_requested` | `input.requesterId` | `notifyApproversForRequest` → DB notifications → `notification_created` per approver |
| `approval_approved` | `input.actorId` or `input.requesterId` (auto-approve path) | — |
| `approval_rejected` | `input.actorId` | — |
| `approval_returned` | `input.actorId` | — |
| `approval_delegated` | `input.actorId` | `notifyApproversForRequest` → delegatee gets `notification_created` |
| `approval_escalated` | `input.actorId` | `notifyApproversForRequest` → new level approvers get `notification_created` |

**Critical:** Approver targeting is **not** carried on `approval_*` payloads. Per-user bell/mobile refresh for approvers is delivered through `notification_created` (`emitUserNotification`) after `createUserNotifications`.

### 3. Intended recipient semantics (by consumer)

| Consumer | Event | Intended recipient scope | Correct filter today? |
|----------|-------|--------------------------|----------------------|
| **Approval queue invalidation** (`useWorkflow`, hub A3.4) | `approval_*` | **All tenant users** viewing shared workflow/entity caches | Yes — tenant guard only (`payload.tenantId`) |
| **Workflow notification invalidation** (`['notifications']`, `['workflow']`, entity keys) | `approval_*` | **All tenant users** — shared read models | Yes — tenant guard only |
| **Mobile / bell user notifications** | `notification_created` | **Specific user** (`payload.userId`) | Yes — AppContext filters tenant + user |
| **Mobile approval list refresh** | `approval_*` **or** `notification_created` | Approvers need queue refresh; requesters need status refresh | **Broken on approval path** — see §4 |

### 4. Current client bugs (approval path)

**`useMobileNotifications.ts`** filters approval events with `payload.userId`:

```typescript
if (payload?.userId && payload.userId !== user.id) return;
```

`ApprovalSocketPayload` has **no `userId` field**. The guard never excludes anyone → every tenant user invalidates `mobile-notifications`, `user-notifications`, `mobile-approvals` on **every** approval event. This is the opposite of the intended user scoping.

**v1 plan error:** A3.4 proposed fixing mobile filter by aligning with `sourceUserId`. That would still be wrong — on `approval_requested`, `sourceUserId` is the **requester**, not the approver.

### 5. Whether backend payload changes are required

| Goal | Backend change required? |
|------|--------------------------|
| Shared approval queue + entity cache live update | **No** — tenant broadcast + tenant guard is correct |
| Per-user bell / mobile notification refresh for approvers | **No** — already handled by `notification_created` with `userId` |
| Per-user mobile approval invalidation keyed off `approval_*` alone | **Yes** — would need new fields (e.g. `assignedApproverId`, `requesterId`, or `notifyUserIds[]`) **or** drop user filter on approval path and rely on `notification_created` |

**Recommendation:** Do **not** use `sourceUserId` as recipient in A3.4. See **Approval recommendation** at document end.

---

## Required Analysis (unchanged from v1, with v2 corrections)

### Current Listener Inventory

#### Primary hub — `context/AppContext.tsx` (~1942–2299)

| Listener | Event(s) | Responsibilities |
|----------|----------|------------------|
| `handleEntity` | `entity_created`, `entity_updated`, `entity_deleted` | RQ invalidation, dashboard flag, tenant guard, settings bulk refresh, own-mutation skip, 20-type reducer patches, `scheduleRefresh` |
| `handleFinancialPosted` | `financial.posted` | RQ invalidation, dashboard flag, `scheduleRefresh` |
| `handleNotificationCreated` | `notification_created` | Tenant + user guard → invalidate user/mobile notification keys — **moves to hub A3.1; removed from AppContext same PR** |
| `handleReconnect` | `connect` | Debounced refresh on reconnect (skip first connect) — **moves to hub A3.1** |

#### Satellite socket listeners (duplicate or domain-specific)

| File | Event(s) | Purpose |
|------|----------|---------|
| `hooks/usePurchaseOrders.ts` | `entity_*` | Duplicate invalidation — removed A3.3 |
| `hooks/useGoodsReceipts.ts` | `entity_*` | Duplicate invalidation — removed A3.3 |
| `hooks/useQuotationComparison.ts` | `entity_*` | Duplicate invalidation — removed A3.3 |
| `hooks/useWorkflow.ts` (×2 exports) | 6× `approval_*` | Duplicate — removed A3.4 |
| `hooks/useRealtimeQuerySync.ts` | `entity_*`, `financial.posted` | Unused duplicate — removed A3.5 |
| `modules/executive-mobile/hooks/useMobileNotifications.ts` | 6× `approval_*` | Broken user filter — removed A3.4 |
| `modules/executive-mobile/hooks/useMobileCommandCenter.ts` | 4 dead event names | Removed A3.5 |
| `hooks/useRecordLock.ts` | `lock_*` | **Stays** — UI-local |
| `components/layout/Sidebar.tsx` | `chat:message` | **A3.1:** stop calling `connectRealtimeSocket`; use `getRealtimeSocket()` only |
| `components/chat/ChatModal.tsx` | `chat:message` | **A3.1:** same |
| WhatsApp / Header components | `whatsapp:message:*` | **Stays** — UI-local |

**Socket connection (today):** `connectRealtimeSocket()` from AppContext, **Sidebar.tsx:171**, **ChatModal.tsx:56**.  
**After A3.1:** Hub (via AppContext init) is the **only** caller of `connectRealtimeSocket()`.

---

### Proposed RealtimeDispatchHub Responsibilities

| Responsibility | Owner after A3 |
|----------------|----------------|
| Single socket connect (`connectRealtimeSocket`) | **Hub** (A3.1) |
| Single socket subscribe for entity/financial/notification/connect | **Hub** (A3.1) |
| Single socket subscribe for approval_* | **Hub** (A3.4) |
| Tenant isolation guard | **Hub** |
| Own-mutation policy | **Hub** → `entityEventRefreshPolicy.ts` |
| Query invalidation (entity/financial/approval) | **Hub** → existing modules |
| Dashboard refresh marking | **Hub** |
| `rtTrace` for entity/financial | **Hub** |
| `onEntityReducerPatch` callback | **Hub** → AppContext |
| `scheduleRefresh` / `runRefreshFromApi` callbacks | **Hub** → AppContext |
| Reconnect debounce (`isFirstConnect`, timer) | **Hub module state** (A3.1) |
| Window events, merge, `latestStateRef` | **AppContext** |
| Chat / WhatsApp / record-lock UI | **Component hooks** (unchanged) |

#### Hub interface (v2 — simplified)

```typescript
// services/realtime/RealtimeDispatchHub.ts

export type DispatchHubConfig = {
  onEntityReducerPatch: (payload: RealtimeEntityPayload) => void;
  scheduleRefresh: () => void;
  runRefreshFromApi: () => void;
  getLastRefreshAt: () => number;  // reads AppContext lastApiRefreshAtRef for reconnect cooldown
  queryClient: QueryClient;
  authToken: string;
  currentUserId: string | undefined;
  currentTenantId: string | undefined;
};

export function initRealtimeDispatchHub(config: DispatchHubConfig): () => void;

// v2: NO updateDispatchHubContext — tenant/user changes trigger full cleanup + re-init (see § Tenant switch)
```

---

### Tenant switch behavior (v2 decision)

**Chosen: Option A — full hub cleanup + re-init**

When `currentTenantId` changes (AppContext tenant-isolation effect ~1706–1724):

1. AppContext clears state and calls `refreshFromApi` (unchanged).
2. Socket `useEffect` re-runs because `currentTenantId` is a dependency.
3. Effect cleanup calls hub teardown → `disconnectRealtimeSocket()` if unauthenticated path, or hub `cleanup()` then `initRealtimeDispatchHub(...)` with new tenant/user context.

**Not supported:** `updateDispatchHubContext(partial)` for in-place tenant/user mutation. Removing this avoids dual code paths and stale hub module state.

**Rationale:** Simplest architecture — one lifecycle, one init path, reconnect flags reset on every init.

---

### Hub cleanup contract (v2)

Module-level hub state must be fully reset on teardown:

```typescript
// Pseudocode — implement in RealtimeDispatchHub.ts

let hubConfig: DispatchHubConfig | null = null;
let isFirstConnect = true;
let reconnectDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const boundHandlers = { /* stable refs for s.off */ };

export function initRealtimeDispatchHub(config: DispatchHubConfig): () => void {
  cleanupRealtimeDispatchHub(); // idempotent — safe if called twice

  hubConfig = config;
  isFirstConnect = true;
  const s = connectRealtimeSocket(config.authToken);
  if (s.connected) isFirstConnect = false;

  s.on('entity_created', boundHandlers.handleEntity);
  // ... all hub listeners including notification_created, connect

  return cleanupRealtimeDispatchHub;
}

function cleanupRealtimeDispatchHub(): void {
  if (reconnectDebounceTimer) {
    clearTimeout(reconnectDebounceTimer);
    reconnectDebounceTimer = null;
  }
  const s = getRealtimeSocket();
  if (s) {
    s.off('entity_created', boundHandlers.handleEntity);
    // ... mirror every s.on from init
  }
  isFirstConnect = true;
  hubConfig = null;
}

// Every handler starts with:
function guardHubConfig(): DispatchHubConfig | null {
  return hubConfig;
}
```

| Concern | Rule |
|---------|------|
| `hubConfig = null` | Set synchronously at start of cleanup; handlers no-op if null |
| Timer cleanup | Clear `reconnectDebounceTimer` on cleanup; never leak across init |
| Listener cleanup | Every `s.on` in init has matching `s.off` in cleanup (same function reference) |
| Guard pattern | Async/timer callbacks read `hubConfig` at invocation time; return early if null |
| Re-init | `init` calls `cleanup` first — idempotent, resets `isFirstConnect` |

**Test:** `RealtimeDispatchHub.test.ts` — `cleanup()` nulls config; post-cleanup emit does not invoke callbacks; timer cleared.

---

### Reconnect lifecycle (v2 — migrated to hub in A3.1)

Migrated from AppContext `handleReconnect` (~2263–2276) and `entityEventRefreshPolicy.ts`.

| State | Owner | Lifecycle |
|-------|-------|-----------|
| `isFirstConnect` | Hub module | `true` at init; set `false` on first `connect` handled OR if socket already connected at init |
| `reconnectDebounceTimer` | Hub module | Cleared on each `connect`; new 500ms timer; cleared on hub cleanup |
| Cooldown check | Hub handler | `isWithinRefreshCooldown(now, config.getLastRefreshAt(), API_REFRESH_COOLDOWN_MS)` |
| Debounce constant | Shared | `RECONNECT_DEBOUNCE_MS = 500` from `entityEventRefreshPolicy.ts` |
| Skip first connect | Shared | `shouldSkipInitialSocketConnect(isFirstConnect)` |

**Routing (unchanged behavior):**

```
connect → handleReconnect()
  ├── cfg = guardHubConfig(); if !cfg return
  ├── if shouldSkipInitialSocketConnect(isFirstConnect) → isFirstConnect = false; return
  ├── clear reconnectDebounceTimer if set
  └── setTimeout(RECONNECT_DEBOUNCE_MS):
        ├── if !hubConfig return
        ├── if isWithinRefreshCooldown → return
        └── hubConfig.scheduleRefresh()
```

**Reset on `initRealtimeDispatchHub`:** `isFirstConnect = true`; timer cleared; if socket already connected, set `isFirstConnect = false` (matches AppContext today).

#### A3.1 reconnect lifecycle test cases

| # | Scenario | Expected |
|---|----------|----------|
| R1 | First `connect` after init | No `scheduleRefresh` |
| R2 | Second `connect` (simulated reconnect) | `scheduleRefresh` once after 500ms |
| R3 | Reconnect within API cooldown | No `scheduleRefresh` |
| R4 | Two rapid reconnects | Single debounced refresh (timer reset) |
| R5 | `cleanup()` then emit `connect` | No `scheduleRefresh` |
| R6 | Re-init after cleanup | R1 behavior again (`isFirstConnect` reset) |
| R7 | Init with `socket.connected === true` | First `connect` event skipped (same as AppContext) |

---

## Phased Implementation Plan

---

## Phase A3.1 — RealtimeDispatchHub Foundation (+ v2 scope)

### Objective

Create the hub module; extract reducer-patch logic; **single cutover PR** with **no parallel listeners**.

**A3.1 sole ownership (same PR, no dual subscription):**

- `entity_*`, `financial.posted`, **`notification_created`**, `connect`
- **`connectRealtimeSocket()`** — hub only; Sidebar + ChatModal migrate to `getRealtimeSocket()`
- AppContext **`handleNotificationCreated` removed** — not deferred to A3.4
- Reconnect state migrated to hub per § Reconnect lifecycle
- Hub cleanup per § Hub cleanup contract
- Tenant switch: full cleanup + re-init on effect re-run
- **CI gate:** fail if `connectRealtimeSocket(` appears outside hub + `core/socket.ts` + tests

### Files Affected

| File | Change |
|------|--------|
| `services/realtime/RealtimeDispatchHub.ts` | **New** — init, cleanup, entity/financial/notification/connect routers |
| `services/realtime/entityReducerPatch.ts` | **New** — extract 20-type dispatch from AppContext |
| `services/realtime/entityReducerPatch.test.ts` | **New** |
| `services/realtime/RealtimeDispatchHub.test.ts` | **New** — routing, tenant, own-mutation, **reconnect R1–R7**, **cleanup** |
| `context/AppContext.tsx` | Replace inline `s.on` with `initRealtimeDispatchHub`; **remove** `handleNotificationCreated`; pass `getLastRefreshAt` |
| `components/layout/Sidebar.tsx` | Replace `connectRealtimeSocket(token)` → `getRealtimeSocket()` |
| `components/chat/ChatModal.tsx` | Same |
| `scripts/verify-realtime-hub-gates.mjs` | **New (partial)** — `connectRealtimeSocket` gate |
| `package.json` | Add `verify:track-a3` (connect gate active in A3.1; entity/approval gates added A3.5) |

### Architectural changes

```
Before:
  AppContext → connectRealtimeSocket + s.on × 5
  Sidebar / ChatModal → connectRealtimeSocket (redundant)
  AppContext → handleNotificationCreated

After:
  AppContext useEffect → initRealtimeDispatchHub(config) → hub owns connect + s.on × 5
  Sidebar / ChatModal → getRealtimeSocket() only
  notification_created → hub handleNotificationCreated only
```

**`handleNotificationCreated` in hub (A3.1 — line-for-line parity with AppContext today):**

```
notification_created → tenant guard → userId guard
  → invalidate ['user-notifications']
  → invalidate ['mobile-notifications']
```

### Risks

| Risk | Mitigation |
|------|------------|
| Chat breaks without Sidebar connect | Hub connects on auth before routes; satellites wait for socket |
| Double `notification_created` subscription | Single cutover — remove AppContext handler in same commit |
| Reconnect regression | R1–R7 unit tests |
| Tenant switch stale hub | Full cleanup + re-init; no partial context update |

### Test strategy

**Unit:** `entityReducerPatch`, hub routing, reconnect R1–R7, cleanup null-config guard  
**Integration:** `npm run test:phase1-sync`  
**CI:** `npm run verify:track-a3` (connect ownership gate)  
**Manual:** Bell icon updates on `notification_created`; chat badge still works; reconnect after network blip

### Rollback

Revert single A3.1 PR — restore AppContext inline listeners + Sidebar/ChatModal connect calls.

---

## Phase A3.2 — Centralized Event Routing

### Objective

Move all **routing policy** into the hub: tenant guard, own-mutation branch, settings bulk refresh, trace, dashboard flags. Ensure `entityEventRefreshPolicy.ts` is the single policy source.

**Unchanged from v1** except: `notification_created` and reconnect already live in hub from A3.1.

### Files Affected

| File | Change |
|------|--------|
| `services/realtime/RealtimeDispatchHub.ts` | Complete `handleEntityEvent` router |
| `services/realtime/entityEventRefreshPolicy.ts` | Hub-exclusive policy imports |
| `context/AppContext.tsx` | Remove leftover routing outside callbacks |

### Rollback

Revert A3.2; A3.1 hub remains with simpler routing.

---

## Phase A3.3 — Centralized Query Invalidation

### Objective

Remove duplicate `entity_*` listeners in procurement hooks; extend central map with `['purchase-order-report']`.

**Unchanged from v1.**

### Files Affected

| File | Change |
|------|--------|
| `services/realtime/entityQueryInvalidation.ts` | Add `['purchase-order-report']` |
| `hooks/usePurchaseOrders.ts` | Remove socket block |
| `hooks/useGoodsReceipts.ts` | Remove socket block |
| `hooks/useQuotationComparison.ts` | Remove socket block |
| `tests/entityQueryInvalidation.test.ts` | New key coverage |

### CI (deferred to A3.5)

Full `s.on('entity_created'` gate — not required until A3.5 if procurement hooks removed in A3.3.

---

## Phase A3.4 — Approval Routing

### Prerequisite

**Approval Payload Audit (§ above) reviewed and recommendation accepted.**

### Objective

Consolidate six `approval_*` events into the hub. Remove duplicate approval listeners from workflow and mobile hooks.

**v2 constraint:** A3.4 **must not** assume `sourceUserId` is the notification recipient.

### Intended routing (post-audit)

```
approval_* → tenant guard (payload.tenantId === currentTenantId)
         → invalidateApprovalQueries (shared tenant caches):
              ['workflow'], ['purchase-orders'], ['notifications'],
              dashboardMetrics.root, ['contracts'], ['bills'],
              ['transactions'], ['vendors']

         → DO NOT user-filter mobile/bell keys on approval_* using sourceUserId

Per-user mobile/bell refresh:
  → notification_created handler (A3.1) with payload.userId guard
  → workflow engine already emits notification_created to approvers via notifyApproversForRequest
```

**Optional A3.4+ backend follow-up (not in A3 client scope unless explicitly approved):**

Extend `ApprovalSocketPayload` with `assignedApproverId` and/or `requesterId` if product requires approval-socket-driven per-user invalidation without relying on `notification_created`. Requires backend + migration-free type extension + client hub update — **separate change request**.

### Files Affected

| File | Change |
|------|--------|
| `services/realtime/RealtimeDispatchHub.ts` | Add `handleApprovalEvent` |
| `services/realtime/approvalQueryInvalidation.ts` | **New** — extract from `useWorkflow.ts` |
| `hooks/useWorkflow.ts` | Remove socket subscriptions |
| `modules/executive-mobile/hooks/useMobileNotifications.ts` | Remove approval socket block entirely |
| `modules/executive-mobile/hooks/useMobileCommandCenter.ts` | Remove dead socket block (if not done earlier) |

**Not in A3.4:** Move `notification_created` — already in hub since A3.1.

### Test strategy

**Unit:** Approval router — tenant mismatch; key list parity with old `invalidateApprovalQueries`; **assert no user filter on `sourceUserId`**  
**Manual:** User A submits approval; User B approver queue updates; delegatee bell updates via `notification_created`  
**Regression:** Confirm `useMobileNotifications` no longer listens to `approval_*` (poll + `notification_created` sufficient)

### Rollback

Restore workflow + mobile approval socket blocks; revert hub approval handler.

---

## Phase A3.5 — Cleanup and CI Gates

### Objective

Remove dead code; complete CI guardrails; document final architecture.

### Files Affected

| File | Change |
|------|--------|
| `hooks/useRealtimeQuerySync.ts` | Remove socket wiring |
| `scripts/verify-realtime-hub-gates.mjs` | **Complete** — entity + approval + invalidation gates |
| `docs/architecture/multi-user-sync-phase2a-a3-implementation-notes.md` | Post-implementation record |

**Note:** Sidebar/ChatModal connect migration and connect CI gate are **done in A3.1**, not deferred here.

### Forbidden patterns (CI enforced at A3.5)

- `s.on('entity_created'` outside `RealtimeDispatchHub.ts` and test mocks
- `s.on('approval_` outside hub
- `connectRealtimeSocket(` outside hub + `core/socket.ts` + tests *(gate live from A3.1)*
- Direct `invalidateQueriesForEntityEvent` from hooks (socket path)

### Allowed satellite listeners

- `lock_*`, `chat:message`, `whatsapp:message:*` — UI-local only; `getRealtimeSocket()` only

---

## Cross-Phase Constraints Checklist

| Constraint | How preserved |
|------------|---------------|
| Multi-tenant isolation | Hub checks `tenantId`; tenant switch = full re-init |
| A1 transactional queue | Backend unchanged |
| Socket event names | Unchanged; approval payload extension optional later |
| React Query behavior | Same keys; fewer duplicate calls |
| changeLog merge / `latestStateRef` | AppContext unchanged |
| No dual `notification_created` subscription | A3.1 single cutover |
| No `updateDispatchHubContext` | Full cleanup + re-init only |

---

## Verification Commands (Post-Implementation)

```powershell
npm run test:phase1-sync
npm run build:backend
npm run verify:track-e2
npm run verify:track-a3
```

---

## Approval Gate

| Phase | Deliverable | Approval required before |
|-------|-------------|--------------------------|
| **Audit** | Approval Payload Audit accepted | Start A3.4 |
| A3.1 | Hub + notification + connect + reconnect + cleanup | Start A3.2 |
| A3.2 | Full entity routing policy | Start A3.3 |
| A3.3 | Procurement dedupe | Start A3.4 |
| A3.4 | Approval consolidation (per audit) | Start A3.5 |
| A3.5 | Cleanup + full CI gates | Mark A3 complete |

**Do not implement production code until this plan v2 is approved.**

---

## Issues Resolved (v2)

1. **Approval semantics** — Payload audited; `sourceUserId` documented as actor; A3.4 routing corrected; backend extension flagged as optional follow-up.
2. **`notification_created`** — Sole hub owner in A3.1; AppContext listener removed same PR; no dual-subscription window.
3. **Reconnect** — Lifecycle specified; module ownership; R1–R7 tests in A3.1.
4. **Connect ownership** — Sidebar/ChatModal in A3.1; CI gate from A3.1.
5. **Tenant switch** — Option A only (full cleanup + re-init); `updateDispatchHubContext` removed from interface.
6. **Hub cleanup** — config nulling, timer/listener teardown, guard pattern, cleanup unit test in A3.1.

---

## Remaining Open Questions

1. **Backend approval payload extension** — If product requires mobile approval list refresh for users who did **not** receive a `notification_created` (e.g. requester watching queue status via approval socket only), should we add `requesterId` + `assignedApproverId` to `ApprovalSocketPayload`? Current design: requesters see queue updates via tenant-wide `invalidateApprovalQueries`; approvers get bell via `notification_created`.

2. **Requester mobile notifications** — Does `createUserNotifications` notify the requester on approve/reject, or only approvers on request/delegate/escalate? If requesters need bell updates on terminal approval actions, confirm whether that is today driven by `approval_*` tenant invalidation of `['mobile-notifications']` (currently over-broad) or missing `notification_created` emits — **audit backend notification templates before A3.4**.

3. **`['mobile-approvals']` key** — Today invalidated on every approval event for all users (bug). After A3.4, should this key invalidate on tenant-wide approval events (same as workflow queue) or only via `notification_created`? **Recommend:** tenant-wide on `approval_*` (shared queue read model), same as `['workflow']`.

4. **A3.1 cutover vs staged rollout** — Plan mandates single PR cutover. Confirm team accepts no feature flag / parallel-run period.

5. **`useMobileCommandCenter` dead listeners** — Remove in A3.4 or A3.5? Either is fine; v2 suggests A3.4 when touching mobile hooks.

---

## Approval Recommendation

**Approve plan v2 for implementation** with this approval-routing decision:

| Path | Action |
|------|--------|
| **`notification_created`** | Hub (A3.1): filter `tenantId` + `userId`; invalidate `user-notifications`, `mobile-notifications` |
| **`approval_*` shared caches** | Hub (A3.4): tenant guard only; call `invalidateApprovalQueries` (no user filter) |
| **`approval_*` per-user bell/mobile** | **Do not** filter on `sourceUserId`; rely on `notification_created` for user-targeted refresh |
| **Remove** | `useMobileNotifications` approval socket block; fix by removal, not by mapping `sourceUserId` → recipient |
| **Defer unless requested** | Backend `ApprovalSocketPayload` extension |

This matches actual backend emit semantics, fixes the `userId`-on-approval-payload bug without introducing a new `sourceUserId`-as-recipient bug, and keeps A3 client-only unless backend extension is explicitly scoped.

---

## References

- `docs/architecture/multi-user-sync-phase2a-a3-review-v2.md`
- `docs/architecture/multi-user-sync-phase2a-a3-implementation-plan.md` (v1 — superseded)
- `backend/src/core/realtime.ts` — `ApprovalSocketPayload`, `UserNotificationSocketPayload`
- `backend/src/modules/workflow/services/workflowEngineService.ts` — approval emits
- `backend/src/modules/workflow/services/workflowNotificationService.ts` — approver DB notifications
- `modules/executive-mobile/hooks/useMobileNotifications.ts` — broken `userId` filter
- `hooks/useWorkflow.ts` — tenant-scoped approval invalidation (reference implementation)
- `context/AppContext.tsx` (~1942–2299 socket effect; ~1706–1724 tenant switch)
- `core/socket.ts` — singleton connect/disconnect
- `services/realtime/entityEventRefreshPolicy.ts` — reconnect policy helpers
