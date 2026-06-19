# Phase 2A A3 — RealtimeDispatchHub Implementation Plan

**Date:** 2026-06-19  
**Authority:** `docs/architecture/multi-user-sync-phase2a-a3-review-v2.md`  
**Status:** Plan only — **awaiting approval. No production code modified.**

---

## Executive Summary

Phase 2A A3 introduces a **plain TypeScript module** (`services/realtime/RealtimeDispatchHub.ts`) that becomes the **single owner** of core socket subscriptions currently embedded in `AppContext.tsx` and duplicated across procurement, workflow, and mobile hooks.

The hub consolidates **routing decisions** (tenant isolation, own-mutation policy, invalidation, dashboard flags, refresh scheduling) while **AppContext retains** refresh implementation, reducer dispatch closures, merge baseline strategy, and window-event handlers.

This plan preserves:

- Phase 1 synchronization fixes (`mergeTransactionsWithServerBaseline`, `latestStateRef` merge baseline)
- Phase 2A A1 transactional entity queue (post-COMMIT emit timing)
- Payment disappearance fix (`applyChangeLogToMergedState` shallow-merge / partial-payload preservation)
- Existing socket event contracts (no backend changes)
- Multi-tenant isolation

---

## Required Analysis

### 1. Current Listener Inventory

#### 1.1 Primary hub — `context/AppContext.tsx` (~1942–2299)

| Listener | Event(s) | Responsibilities |
|----------|----------|------------------|
| `handleEntity` | `entity_created`, `entity_updated`, `entity_deleted` | RQ invalidation, dashboard flag, tenant guard, settings bulk refresh, own-mutation skip, 20-type reducer patches, `scheduleRefresh` |
| `handleFinancialPosted` | `financial.posted` | RQ invalidation, dashboard flag, `scheduleRefresh` |
| `handleNotificationCreated` | `notification_created` | Tenant + user guard → invalidate user/mobile notification keys |
| `handleReconnect` | `connect` | Debounced refresh on reconnect (skip first connect) |

#### 1.2 Window / non-socket listeners — remain in AppContext

| Listener | Event | File |
|----------|-------|------|
| `handleBidirDownstreamComplete` | `sync:bidir-downstream-complete` | AppContext ~2325–2365 |
| `handleChunkApplied` | `sync:chunk-applied` | AppContext ~2557–2590 |
| `onVisibility` | `visibilitychange` | AppContext ~2301–2322 |
| `onRequestApiRefresh` | `pbooks:request-api-refresh` | AppContext ~1921–1928 |
| `handleCloudSettingsLoaded` | `load-cloud-settings` | AppContext |
| `handleSaveStateBeforeLogout` | `save-state-before-logout` | AppContext |

#### 1.3 Satellite socket listeners (duplicate or domain-specific)

| File | Event(s) | Purpose |
|------|----------|---------|
| `hooks/usePurchaseOrders.ts` | `entity_*` | Invalidate `purchase-orders`, `purchase-order-report` |
| `hooks/useGoodsReceipts.ts` | `entity_*` | Invalidate GRN/PO report keys |
| `hooks/useQuotationComparison.ts` | `entity_*` | Invalidate quotation-comparison, procurement-dashboard |
| `hooks/useWorkflow.ts` (×2 exports) | 6× `approval_*` | `invalidateApprovalQueries` — **duplicate when both hooks mount** |
| `hooks/useRealtimeQuerySync.ts` | `entity_*`, `financial.posted` | Central invalidation duplicate — **zero imports in app** |
| `modules/executive-mobile/hooks/useMobileNotifications.ts` | 6× `approval_*` | Mobile notification invalidation |
| `modules/executive-mobile/hooks/useMobileCommandCenter.ts` | 4 dead event names | **Never fires** — see §2 |
| `hooks/useRecordLock.ts` | `lock_acquired`, `lock_released` | Per-record UI lock state |
| `components/layout/Sidebar.tsx` | `chat:message` | Unread badge |
| `components/chat/ChatModal.tsx` | `chat:message` | Modal message list |
| `components/layout/Header.tsx` | `whatsapp:message:received` | WhatsApp unread + toast |
| `components/whatsapp/WhatsAppSidePanel.tsx` | `whatsapp:message:*` | Side panel live update |
| `components/whatsapp/WhatsAppChatWindow.tsx` | `whatsapp:message:*` | Chat window live update |

**Socket connection:** `core/socket.ts` singleton — `connectRealtimeSocket()` called from AppContext (primary), Sidebar, ChatModal.

---

### 2. Current Event Inventory

#### 2.1 Backend → client (emitted)

| Event | Emitter | Payload |
|-------|---------|---------|
| `entity_created` / `entity_updated` / `entity_deleted` | `emitEntityEvent` (A1 queue flush) | `RealtimePayload` |
| `financial.posted` | `emitFinancialPosted` (A1 queue flush) | `RealtimePayload` (type=payment) |
| `notification_created` | `emitUserNotification` | `UserNotificationSocketPayload` |
| `lock_acquired` / `lock_released` | `emitLockEvent` | `LockSocketPayload` |
| `chat:message` | `emitInternalChatMessage` | Chat payload |
| `whatsapp:message:sent/received/status` | `emitWhatsAppEvent` | WhatsApp payload |
| 6× `approval_*` | `emitApprovalEvent` | `ApprovalSocketPayload` |

Source: `backend/src/core/realtime.ts`

#### 2.2 Dead client subscriptions (server never emits)

| Client event name | Location |
|-------------------|----------|
| `entity_event` | `useMobileCommandCenter.ts` |
| `financial_posted` (no dot) | `useMobileCommandCenter.ts` |
| `project_expense_voucher_updated` | `useMobileCommandCenter.ts` |
| `installment_plan_updated` | `useMobileCommandCenter.ts` |

#### 2.3 A3 hub target subscriptions (Phase A3.1–A3.4)

Core business sync (move from AppContext):

- `entity_created`, `entity_updated`, `entity_deleted`
- `financial.posted`
- `notification_created`
- `connect`

Approval consolidation (Phase A3.4):

- `approval_requested`, `approval_approved`, `approval_rejected`, `approval_returned`, `approval_escalated`, `approval_delegated`

**Out of hub scope (remain component-local):**

- `lock_*`, `chat:message`, `whatsapp:message:*` — UI-only, no shared invalidation/refresh policy

---

### 3. Current Invalidation Inventory

#### 3.1 Central map — `services/realtime/entityQueryInvalidation.ts`

| Trigger types | Query keys |
|---------------|------------|
| `FINANCIAL_ENTITY_TYPES` | `ledger.all`, `reports.all`, `dashboardMetrics.root` |
| `invoice`, `bill` | + `invoices.all`, `rental.invoicesList()` |
| `RENTAL_ENTITY_TYPES` | rental invoice list, `['rental']` |
| `contact` | `['contacts']`, org users report |
| `vendor`, `quotation` | vendors, quotations, quotation-comparison, procurement-dashboard |
| `purchase_order` | purchase-orders, procurement-dashboard, quotation-comparison |
| `goods_receipt` | goods-receipts, goods-receipt-report, purchase-orders, procurement-dashboard |
| `approval_request`, `settings` | `['workflow']` |
| `contract`, `project`, `user`, payroll, document, personal, report defs | domain keys |
| `settings` + `bulkRefresh` | full tenant sweep |
| `financial.posted` | ledger, reports, dashboard |

#### 3.2 Duplicate invalidation paths

| Event | Duplicate | Cause |
|-------|-----------|-------|
| `entity_*` | `invalidateQueriesForEntityEvent` ×2 | AppContext + `useRealtimeQuerySync` (if enabled) |
| `financial.posted` | `invalidateQueriesForFinancialPosted` ×2 | Same |
| `purchase_order` | `['purchase-orders']` ×2 | Central map + `usePurchaseOrders` |
| `goods_receipt` | GRN keys ×2 | Central map + `useGoodsReceipts` (full overlap) |
| `quotation` / `vendor` | comparison keys ×2 | Central map + `useQuotationComparison` |
| `approval_*` | workflow keys ×2–3 | `useWorkflowSettings` + `useApprovalQueue` + `useMobileNotifications` |

#### 3.3 Missing from central map (must add in A3.3)

| Key | Entity trigger | Currently only in |
|-----|----------------|-------------------|
| `['purchase-order-report']` | `purchase_order`, optionally `bill` | `usePurchaseOrders.ts` |

---

### 4. Current Refresh Path Inventory

| Path | Owner | Trigger |
|------|-------|---------|
| `scheduleRefresh()` → debounced `refreshFromApi` | AppContext | Every entity event (incl. own-mutation); financial.posted; reconnect |
| `runRefreshFromApi()` immediate | AppContext | `settings.bulkRefresh` |
| `refreshFromApi` → `mergePartialStateIntoBaseline(latestStateRef.current, …)` → `SET_STATE` | AppContext | Scheduled / visibility / post-auth / tenant switch |
| Remote reducer patches (`_isRemote: true`) | AppContext `handleEntity` | 20 entity types before `scheduleRefresh` |
| React Query refetch | Invalidation map | Parallel read path — intentional complement to AppContext state |
| `sync:bidir-downstream-complete` | AppContext window handler | Partial load + merge with `latestStateRef` |
| `sync:chunk-applied` → `BATCH_UPSERT_ENTITIES` | AppContext window handler | Incremental chunk upsert (no known dispatcher today) |

**Preserved invariant:** Hub calls `scheduleRefresh` / `runRefreshFromApi` as **opaque callbacks** — implementation stays in AppContext.

---

### 5. Proposed RealtimeDispatchHub Responsibilities

| Responsibility | Owner after A3 |
|----------------|----------------|
| Single socket subscribe for entity/financial/notification/approval/connect | **Hub** |
| Tenant isolation guard (`payload.tenantId`) | **Hub** |
| Own-mutation policy (`shouldSkipRemoteReducerPatch`) | **Hub** (calls policy from `entityEventRefreshPolicy.ts`) |
| `invalidateQueriesForEntityEvent` / `invalidateQueriesForFinancialPosted` | **Hub** → existing module |
| Approval query invalidation (consolidated) | **Hub** (A3.4) |
| `maybeMarkDashboardRefreshForEntity` / `markDashboardRefreshForFinancialPosted` | **Hub** |
| `rtTrace` diagnostic logging | **Hub** |
| Invoke `onEntityReducerPatch(payload)` callback | **Hub** → AppContext |
| Invoke `scheduleRefresh()` / `runRefreshFromApi()` callbacks | **Hub** → AppContext |
| `handleEntityReducerPatch` implementation (20-type dispatch switch) | **AppContext callback** (extracted to `entityReducerPatch.ts`) |
| `scheduleRefresh` debounce + cooldown refs | **AppContext** |
| `refreshFromApi` + merge + `latestStateRef` baseline | **AppContext** |
| Window events (bidir, chunk, visibility, logout) | **AppContext** |
| Chat / WhatsApp / record-lock UI listeners | **Component hooks** (unchanged) |
| Socket connect/disconnect lifecycle | **Hub** (A3.1 — single connect owner) |

#### Hub interface (from review v2 §11.3)

```typescript
// services/realtime/RealtimeDispatchHub.ts

export type DispatchHubConfig = {
  onEntityReducerPatch: (payload: RealtimeEntityPayload) => void;
  scheduleRefresh: () => void;
  runRefreshFromApi: () => void;
  queryClient: QueryClient;
  currentUserId: string | undefined;
  currentTenantId: string | undefined;
};

export function initRealtimeDispatchHub(config: DispatchHubConfig): () => void;
export function updateDispatchHubContext(
  partial: Pick<DispatchHubConfig, 'currentUserId' | 'currentTenantId'>
): void;
```

`updateDispatchHubContext` allows AppContext to refresh user/tenant without re-subscribing sockets.

---

### 6. Responsibilities That Remain in AppContext

| Item | Reason |
|------|--------|
| `refreshFromApi` / `runRefreshFromApi` implementation | Uses `latestStateRef`, merge helpers, `setStoredState`, sync cursor |
| `scheduleRefresh` debounce timer + `lastApiRefreshAtRef` | Closure over refs; single-debounce semantics |
| `onEntityReducerPatch` callback body | Uses `baseDispatch`, `latestStateRef`, normalization helpers |
| `handleBidirDownstreamComplete` | Window event; merge with `latestStateRef.current` |
| `handleChunkApplied` | Window event; `BATCH_UPSERT_ENTITIES` |
| Tab visibility refresh | Not a socket event |
| Post-auth / tenant-switch refresh | Lifecycle, not socket routing |
| Transaction dispatch intercept (local saves) | Unrelated to socket hub |
| Payment trace / dev globals | Debug instrumentation |

---

### 7. Responsibilities That Move Out of AppContext

| Item | Destination |
|------|-------------|
| Inline `s.on('entity_*')` block | Hub |
| Inline `s.on('financial.posted')` | Hub |
| Inline `s.on('notification_created')` | Hub (A3.4) |
| Inline `s.on('connect')` reconnect handler | Hub |
| Duplicate invalidation in procurement hooks | Removed — hub + central map |
| Duplicate approval invalidation in workflow/mobile hooks | Hub approval router (A3.4) |
| Dead socket block in `useMobileCommandCenter` | Removed (A3.5) |
| Unused `useRealtimeQuerySync` socket wiring | Removed (A3.5) |

---

### 8. Domain Handler Summary

#### 8.1 Accounting

- **Invalidation:** `entityQueryInvalidation.ts` — `FINANCIAL_ENTITY_TYPES`, invoice/bill keys, `financial.posted`
- **Reducer patches (AppContext callback):** `bill`, `invoice`, `transaction` create/update/delete; versioned entities with LWW
- **No dedicated accounting socket hook** — all via hub + AppContext callback
- **A1 interaction:** Post-COMMIT timing improves `scheduleRefresh` and remote `ADD_TRANSACTION` correctness; hub is passive receiver

#### 8.2 Procurement

- **Invalidation:** Central map covers PO, GRN, vendor, quotation keys
- **Reducer patches:** None — procurement entities use refresh + RQ only
- **Satellite hooks:** `usePurchaseOrders`, `useGoodsReceipts`, `useQuotationComparison` — **remove socket blocks in A3.3**
- **Gap to close:** Add `['purchase-order-report']` to central map

#### 8.3 Notifications

- **`notification_created`:** AppContext today → hub A3.4; user + tenant filter
- **Approval-driven notification keys:** Consolidate in hub; fix `useMobileNotifications` filter (`sourceUserId` vs `userId` bug noted in inventory)
- **`useUserNotifications`:** Query-only hook — no socket change

#### 8.4 Obsolete after A1

**No client handler is obsolete solely because of A1.** A1 changed emit timing, not client contracts.

**Obsolete / redundant (pre-existing, addressed in A3):**

- `useMobileCommandCenter` dead event names
- `useRealtimeQuerySync` parallel socket (unused)
- Procurement hook duplicate `entity_*` listeners
- Dual `useWorkflow` approval registration

---

## Phased Implementation Plan

---

## Phase A3.1 — RealtimeDispatchHub Foundation

### Objective

Create the hub module and extract reducer-patch logic into a testable unit. Wire AppContext to initialize the hub **without removing** existing inline listeners yet (parallel-safe bootstrap optional) OR perform a single cutover with identical behavior. **Recommended: direct cutover** in one PR to avoid double-subscription.

Establish hub as the **only** subscriber for: `entity_*`, `financial.posted`, `notification_created`, `connect`.

### Files Affected

| File | Change |
|------|--------|
| `services/realtime/RealtimeDispatchHub.ts` | **New** — init, cleanup, event routers |
| `services/realtime/entityReducerPatch.ts` | **New** — extract 20-type dispatch from AppContext |
| `services/realtime/entityReducerPatch.test.ts` | **New** — unit tests |
| `services/realtime/RealtimeDispatchHub.test.ts` | **New** — routing / tenant / own-mutation tests |
| `context/AppContext.tsx` | Replace inline `s.on` block with `initRealtimeDispatchHub`; pass callbacks |
| `core/socket.ts` | Document hub as primary connect owner; optional: remove redundant connects later |

### Architectural Changes

```
Before: AppContext useEffect → s.on × 5 handlers (inline ~300 lines)
After:  AppContext useEffect → initRealtimeDispatchHub(config) → hub s.on × 5
        AppContext provides: onEntityReducerPatch, scheduleRefresh, runRefreshFromApi
```

Extract `handleEntityReducerPatch` from `handleEntity` into `entityReducerPatch.ts`:

- Inputs: `payload`, `latestStateRef`, `baseDispatch`, normalization helpers
- Outputs: reducer actions dispatched (or no-op for filtered events)
- Preserves `shouldApplyRemoteEntityPatch` LWW for versioned entities

Hub routing mirrors current `handleEntity` / `handleFinancialPosted` / `handleNotificationCreated` / `handleReconnect` **line-for-line** (no behavior change).

### Risks

| Risk | Mitigation |
|------|------------|
| Stale closure in callbacks | Pass `latestStateRef` into reducer patch module; use refs for user/tenant via `updateDispatchHubContext` |
| Double subscription if parallel bootstrap | Single cutover PR; remove old `s.on` in same commit |
| Missed edge case in 20-type switch | Copy-extract with tests before refactor |

### Regression Risks

- Remote invoice/bill/transaction patches stop applying → multi-user screens stale
- Own-mutation events incorrectly reducer-patch → duplicate rows
- Reconnect refresh stops firing → stale state after network blip
- `settings.bulkRefresh` path breaks → admin bulk operations incomplete

### Test Strategy

**Unit:**

- `entityReducerPatch`: tenant filter, own-mutation skip, each entity type action, LWW skip
- `RealtimeDispatchHub`: mock socket emits → assert callback invocation order matches current AppContext

**Integration:**

- `npm run test:phase1-sync` (merge + bidir tests)
- `npm run verify:track-e2` if present (realtime gates)

**Manual smoke:**

- Two clients; User A creates invoice; appears on User B without F5
- Payment disappear regression: no `REMOVED_IDS` in trace after receive payment + refresh

### Rollback Strategy

- Revert single PR restoring AppContext inline `s.on` block
- Hub files are additive — delete `RealtimeDispatchHub.ts` + `entityReducerPatch.ts`
- No backend, migration, or schema changes → rollback is client-only

---

## Phase A3.2 — Centralized Event Routing

### Objective

Move all **routing policy** into the hub: tenant guard, own-mutation branch, settings bulk refresh branch, trace logging, dashboard refresh marking. Ensure `entityEventRefreshPolicy.ts` is the single policy source (no duplicated checks in AppContext).

Validate event routing table matches review v2 §11.4 exactly.

### Files Affected

| File | Change |
|------|--------|
| `services/realtime/RealtimeDispatchHub.ts` | Complete `handleEntityEvent` router |
| `services/realtime/entityEventRefreshPolicy.ts` | Ensure exported helpers used exclusively by hub |
| `services/realtime/realtimeTrace.ts` | Called from hub only for entity/financial paths |
| `services/realtime/dashboardRefreshIndicator.ts` | Called from hub |
| `context/AppContext.tsx` | Remove any leftover routing logic outside callbacks |

### Architectural Changes

Formal routing table in hub:

```
entity_* → trace → invalidate → dashboard flag → tenant guard
         → bulkRefresh? → runRefreshFromApi
         → own-mutation? → scheduleRefresh only
         → onEntityReducerPatch → scheduleRefresh

financial.posted → invalidate → dashboard flag → scheduleRefresh

notification_created → tenant + user guard → invalidate notification keys

connect → reconnect debounce → scheduleRefresh (cooldown aware)
```

AppContext callback `onEntityReducerPatch` becomes **pure dispatch** — no invalidation, no refresh calls inside it.

### Risks

| Risk | Mitigation |
|------|------------|
| Policy drift between hub and old AppContext | Side-by-side trace comparison in staging before merge |
| `settings.bulkRefresh` mis-routed | Dedicated unit test + manual admin settings test |

### Regression Risks

- Own-mutation still schedules refresh but skips patch (C-5) — must not regress
- Foreign tenant events must never dispatch or invalidate wrong tenant cache

### Test Strategy

**Unit:** Full router matrix — entity type × action × own/foreign × bulkRefresh  
**Manual:** Trace log comparison pre/post on same user flows  
**Automated:** Extend `tests/entityEventRefreshPolicy.test.ts` for hub integration shim

### Rollback Strategy

Revert A3.2 commit; A3.1 hub shell still works with simplified routing

---

## Phase A3.3 — Centralized Query Invalidation

### Objective

Eliminate duplicate `entity_*` socket listeners in procurement hooks. Extend central invalidation map with missing keys. Hub becomes the **sole** caller of `invalidateQueriesForEntityEvent` for socket-driven events.

### Files Affected

| File | Change |
|------|--------|
| `services/realtime/entityQueryInvalidation.ts` | Add `['purchase-order-report']` for `purchase_order`; document `bill` → PO report if needed |
| `hooks/usePurchaseOrders.ts` | **Remove** socket `useEffect` block |
| `hooks/useGoodsReceipts.ts` | **Remove** socket block |
| `hooks/useQuotationComparison.ts` | **Remove** socket block |
| `tests/entityQueryInvalidation.test.ts` | Add coverage for new keys |

### Architectural Changes

```
Before: AppContext + usePurchaseOrders + useGoodsReceipts + useQuotationComparison
        all call invalidate on entity_*

After:  Hub only → entityQueryInvalidation.ts
        Hooks = useQuery + mutations only
```

### Risks

| Risk | Mitigation |
|------|------------|
| Page mounted before hub init misses event | Hub init in AppContext before routes render (already true) |
| `bill` event not invalidating PO report | Explicit map entry if product requires it |

### Regression Risks

- Procurement pages stop live-updating when another user edits PO/GRN
- Extra refetch if map too broad — performance only, not correctness

### Test Strategy

**Unit:** `entityQueryInvalidation.test.ts` — assert keys for `purchase_order`, `goods_receipt`, `quotation`  
**Manual:** Two users on Purchase Orders page; edit PO on A; list updates on B  
**CI grep gate (optional):** Fail if `s.on('entity_created'` appears outside hub + tests

### Rollback Strategy

Restore socket blocks in three hooks; revert map extension

---

## Phase A3.4 — Notification Routing

### Objective

Consolidate `notification_created` and all six `approval_*` events into the hub. Remove duplicate approval listeners from workflow and mobile hooks. Fix approval payload user filtering for mobile-targeted keys.

### Files Affected

| File | Change |
|------|--------|
| `services/realtime/RealtimeDispatchHub.ts` | Add `handleNotificationCreated`, `handleApprovalEvent` |
| `services/realtime/approvalQueryInvalidation.ts` | **New** — extract `invalidateApprovalQueries` from `useWorkflow.ts` |
| `hooks/useWorkflow.ts` | Remove socket subscriptions from `useWorkflowSettings` / `useApprovalQueue` |
| `modules/executive-mobile/hooks/useMobileNotifications.ts` | Remove approval socket block |
| `modules/executive-mobile/hooks/useMobileCommandCenter.ts` | Remove dead socket block; rely on hub invalidation + existing poll |
| `context/AppContext.tsx` | Remove `handleNotificationCreated` if fully moved to hub |

### Architectural Changes

```
approval_* → tenant guard
           → invalidateApprovalQueries (workflow, PO, bills, contracts, vendors, dashboard)
           → if payload targets current user (sourceUserId / assignee — fix filter):
                invalidate mobile-notifications, mobile-approvals, user-notifications

notification_created → tenant + userId guard → user-notifications, mobile-notifications
```

**Bug fix included:** Align mobile approval filter with actual `ApprovalSocketPayload` fields (review notes `userId` vs `sourceUserId` mismatch).

### Risks

| Risk | Mitigation |
|------|------------|
| Over-invalidation of mobile keys | User-scoped branch only for mobile-specific keys |
| Under-invalidation after removing hook listeners | Parity test against old `invalidateApprovalQueries` key list |

### Regression Risks

- Approval queue UI stale after remote approval action
- Mobile executive notifications miss approval events
- Bell icon (`useUserNotifications`) stops updating on `notification_created`

### Test Strategy

**Unit:** Approval router — tenant mismatch, user match/mismatch, key list parity  
**Manual:** Submit approval on User A; queue updates on User B approver  
**Manual:** `notification_created` → bell badge updates without reload

### Rollback Strategy

Restore approval socket blocks in workflow + mobile hooks; revert hub approval handler

---

## Phase A3.5 — Cleanup and Removal of Obsolete Listeners

### Objective

Remove dead code, unused hooks, and redundant socket connects. Add CI guardrails. Document final architecture.

### Files Affected

| File | Change |
|------|--------|
| `hooks/useRealtimeQuerySync.ts` | Remove socket wiring; keep optional `onEntityEvent` callback API OR delete if unused |
| `App.tsx` | Remove / disable `useRealtimeQuerySync` call site if any |
| `modules/executive-mobile/hooks/useMobileCommandCenter.ts` | Confirm dead listeners removed (A3.4) |
| `components/layout/Sidebar.tsx` | Evaluate: stop calling `connectRealtimeSocket` if hub owns connect |
| `components/chat/ChatModal.tsx` | Same — subscribe only via `getRealtimeSocket()` |
| `scripts/verify-realtime-hub-gates.mjs` | **New** — grep gates for forbidden patterns |
| `docs/architecture/multi-user-sync-phase2a-a3-implementation-notes.md` | **New** — post-implementation record |
| `package.json` | Add `verify:track-a3` script |

### Architectural Changes

**Forbidden after A3.5 (CI enforced):**

- `s.on('entity_created'` outside `RealtimeDispatchHub.ts` and test mocks
- `s.on('approval_` outside hub
- Direct `invalidateQueriesForEntityEvent` from hooks (socket path)

**Allowed satellite listeners:**

- `lock_*`, `chat:message`, `whatsapp:message:*` — UI-local state only

### Risks

| Risk | Mitigation |
|------|------------|
| Chat/WhatsApp break if connect timing changes | Hub connects on auth; satellites use `getRealtimeSocket()` only |
| Over-aggressive grep false positives | Allowlist test files |

### Regression Risks

- Chat unread badge stops updating
- WhatsApp live message panel stale
- Record lock UI desync (should be unaffected — `useRecordLock` unchanged)

### Test Strategy

**CI:** `npm run verify:track-a3` — grep gates  
**Full:** `npm run test:phase1-sync`, backend tests, staging two-user smoke  
**Manual:** Chat message, WhatsApp receive, record lock acquire/release

### Rollback Strategy

Revert cleanup commit; grep gate can be disabled independently

---

## Cross-Phase Constraints Checklist

| Constraint | How preserved |
|------------|---------------|
| Multi-tenant isolation | Hub checks `tenantId` before every action |
| A1 transactional queue | Backend unchanged; hub receives post-COMMIT events |
| Socket event contracts | Same event names and payloads |
| React Query behavior | Same keys invalidated; fewer duplicate calls |
| changeLog merge / partial payload | AppContext `refreshFromApi` unchanged |
| latestStateRef merge baseline | AppContext owns merge; hub never replaces `stateRef` |
| No Redis / event replay | Hub is in-process module only |
| No new React providers | Plain TS module + AppContext init |
| No backend / schema changes | Client-only phases |

---

## Verification Commands (Post-Implementation)

```powershell
npm run test:phase1-sync
npm run build:backend          # ensure no accidental backend edits
npm run verify:track-e2        # existing realtime gates
npm run verify:track-a3        # new A3 grep gates (A3.5)
```

---

## Approval Gate

| Phase | Deliverable | Approval required before |
|-------|-------------|--------------------------|
| A3.1 | Hub + extract reducer patch | Start A3.2 |
| A3.2 | Full routing policy in hub | Start A3.3 |
| A3.3 | Procurement dedupe | Start A3.4 |
| A3.4 | Notification + approval consolidation | Start A3.5 |
| A3.5 | Cleanup + CI gates | Mark A3 complete |

**Do not implement production code until this plan is approved.**

---

## References

- `docs/architecture/multi-user-sync-phase2a-a3-review-v2.md`
- `docs/architecture/payment-disappearing-investigation.md`
- `docs/architecture/multi-user-sync-phase1-implementation-notes.md`
- `services/realtime/entityQueryInvalidation.ts`
- `services/realtime/entityEventRefreshPolicy.ts`
- `context/AppContext.tsx` (socket effect ~1942–2299)
- `backend/src/core/realtime.ts`
- `backend/src/core/entityEventEmissions.ts` (A1)
