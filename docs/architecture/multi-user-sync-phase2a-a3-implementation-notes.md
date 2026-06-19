# Phase 2A A3 — Implementation Notes

**Date:** 2026-06-19  
**Authority:** [multi-user-sync-phase2a-a3-implementation-plan-v2.md](multi-user-sync-phase2a-a3-implementation-plan-v2.md)  
**Status:** A3 complete (A3.1–A3.5)

---

## Executive Summary

Phase 2A A3 consolidated all core realtime socket subscriptions into `RealtimeDispatchHub.ts`. AppContext retains refresh implementation, reducer dispatch closures, merge baseline strategy, and window-event handlers. Duplicate hook listeners were removed across procurement, workflow, and mobile modules. CI gates enforce sole hub ownership of connect and core socket events.

---

## Final Hub Ownership Model

### Production socket connect

| Responsibility | Owner |
|----------------|-------|
| `connectRealtimeSocket()` | [RealtimeDispatchHub.ts](../../services/realtime/RealtimeDispatchHub.ts) only (via `initRealtimeDispatchHub`) |
| `getRealtimeSocket()` | [core/socket.ts](../../core/socket.ts) — read-only access for satellite UI |
| `disconnectRealtimeSocket()` | [AppContext.tsx](../../context/AppContext.tsx) on unauthenticated / tenant teardown paths |

### Core hub subscriptions (single bind site)

| Event | Handler | Invalidation / action |
|-------|---------|----------------------|
| `entity_created` / `entity_updated` / `entity_deleted` | `handleEntity` | [entityQueryInvalidation.ts](../../services/realtime/entityQueryInvalidation.ts), reducer patch, dashboard flag, `scheduleRefresh` |
| `financial.posted` | `handleFinancialPosted` | Financial query keys, dashboard flag, `scheduleRefresh` |
| `notification_created` | `handleNotificationCreated` | Per-user: `user-notifications`, `mobile-notifications`, `mobile-command-center` |
| `approval_*` (6 events) | `handleApprovalEvent` | Tenant-wide: [approvalQueryInvalidation.ts](../../services/realtime/approvalQueryInvalidation.ts) + [mobileApprovalQueryInvalidation.ts](../../services/realtime/mobileApprovalQueryInvalidation.ts) |
| `connect` | `handleReconnect` | Debounced `scheduleRefresh` (skip first connect; cooldown via [entityEventRefreshPolicy.ts](../../services/realtime/entityEventRefreshPolicy.ts)) |

### Allowed satellite listeners

These components use `getRealtimeSocket()` only — never `connectRealtimeSocket()`:

| File | Events | Purpose |
|------|--------|---------|
| [Sidebar.tsx](../../components/layout/Sidebar.tsx), [ChatModal.tsx](../../components/chat/ChatModal.tsx) | `chat:message` | Chat badge / modal |
| [Header.tsx](../../components/layout/Header.tsx), WhatsApp components | `whatsapp:message:*` | WhatsApp UI |
| [useRecordLock.ts](../../hooks/useRecordLock.ts) | `lock_acquired`, `lock_released` | Record lock UI |

---

## Tenant Switch Lifecycle

**Option A (implemented):** Full hub cleanup + re-init on tenant/user change.

When `currentTenantId` or auth context changes, AppContext socket `useEffect` re-runs:

1. Previous effect cleanup calls `cleanupRealtimeDispatchHub()` — clears listeners, reconnect timer, `hubConfig`.
2. New effect calls `initRealtimeDispatchHub({ ... currentTenantId, currentUserId })`.
3. `isFirstConnect` resets; reconnect policy applies fresh.

No `updateDispatchHubContext()` partial update path exists.

---

## Mutation-Local Invalidation Boundary

**Rule:** Socket-driven invalidation lives in the hub + central maps. Mutation `onSuccess` invalidations stay in hooks/AppContext and are **not** moved into central maps.

| Location | Trigger | Example keys |
|----------|---------|--------------|
| Hub + maps | Remote socket events | Entity map, approval 8-key sweep, mobile-approvals |
| [useWorkflow.ts](../../hooks/useWorkflow.ts) | Local save/act success | `invalidateApprovalQueries` |
| [useMobileApprovals.ts](../../modules/executive-mobile/hooks/useMobileApprovals.ts) | Local approve/reject | `mobile-approvals`, `workflow`, etc. |
| [AppContext.tsx](../../context/AppContext.tsx) ~1546 | Local unit API persist success | `invalidateQueriesForEntityEvent` for unit |

CI gates prevent hooks from re-registering `socket.on('entity_*')` or approval listeners.

---

## Notification Ownership

**Event:** `notification_created`  
**Payload:** `{ tenantId, userId, notificationId, ts }` — `userId` is the true recipient.

**Hub handler:**

```
tenant guard → userId guard → invalidate:
  ['user-notifications']
  ['mobile-notifications']
  ['mobile-command-center']
```

**Backend:** `emitUserNotification` after `createUserNotification(s)` — used by workflow approver notifications, unposted transaction alerts, contract retention, etc.

**Do not** filter `notification_created` logic onto `approval_*` events. `sourceUserId` on approval payloads is the **actor**, not the recipient.

---

## Approval Ownership

**Events:** `approval_requested`, `approval_approved`, `approval_rejected`, `approval_returned`, `approval_escalated`, `approval_delegated`

**Hub handler:**

```
tenant guard only (no userId / sourceUserId filter)
→ invalidateApprovalQueries()     // 8 ERP keys
→ invalidateMobileApprovalQueries() // ['mobile-approvals']
```

**Per-user bell for approvers:** Delivered via `notification_created` when `notifyApproversForRequest` runs (request, delegate, escalate, mid-level approve).

**Requester queue refresh on terminal actions** (final approve, reject, return): Tenant-wide `workflow` + `mobile-approvals` invalidation — no requester bell unless backend adds `notification_created` (see open questions).

---

## Invalidation Module Responsibilities

| Module | Scope |
|--------|-------|
| [entityQueryInvalidation.ts](../../services/realtime/entityQueryInvalidation.ts) | Entity type → React Query keys (incl. PO report, bill→PO, GRN parity from A3.3) |
| [approvalQueryInvalidation.ts](../../services/realtime/approvalQueryInvalidation.ts) | 8 tenant-wide ERP keys on every `approval_*` event |
| [mobileApprovalQueryInvalidation.ts](../../services/realtime/mobileApprovalQueryInvalidation.ts) | `['mobile-approvals']` tenant-wide on every `approval_*` event |
| [entityReducerPatch.ts](../../services/realtime/entityReducerPatch.ts) | Immediate reducer patches for remote entity events (via AppContext callback) |
| [entityEventRefreshPolicy.ts](../../services/realtime/entityEventRefreshPolicy.ts) | Own-mutation skip, reconnect debounce, cooldown helpers |

---

## Phase Completion Record

| Phase | Deliverable |
|-------|-------------|
| A3.1 | Hub foundation, notification_created, reconnect, connect ownership, entityReducerPatch |
| A3.2 | Absorbed into A3.1 (central routing in hub) |
| A3.3 | Procurement dedupe, hub approval_*, approvalQueryInvalidation, workflow socket removal |
| A3.4 | Mobile hook cleanup, mobile-approvals + command-center hub keys, two-channel approval model |
| A3.5 | Deleted useRealtimeQuerySync, full CI gates, test hardening, this document |

---

## CI Verification

```powershell
npm run test:phase1-sync
npm run verify:track-a3
npm run build
npm run verify:track-e2
```

**Gates in [verify-realtime-hub-gates.mjs](../../scripts/verify-realtime-hub-gates.mjs):**

1. `connectRealtimeSocket()` ownership
2. `entity_created` / `entity_updated` / `entity_deleted` listener ownership
3. `financial.posted` listener ownership
4. `notification_created` listener ownership
5. `approval_*` listener ownership

Production owner for gates 2–5: `services/realtime/RealtimeDispatchHub.ts` only.

---

## Open Product Questions (from A3.4)

These are **documented limitations**, not A3 defects. Backend follow-up only if product requires:

1. **Requester bell on terminal approval** — Final approve/reject/return do not emit `notification_created` to the requester today. Requesters see status via tenant-wide queue invalidation (`workflow`, `mobile-approvals`).

2. **Entity → mobile command center** — Hub does not invalidate `mobile-command-center` on `entity_*` events. Pre-A3.4 dead listeners never worked for entity/financial refresh; command center relies on `notification_created` (bell) + 90s poll.

3. **Entity → mobile dashboard** — Module-scoped key `['mobile-dashboard', moduleId]` is not hub-invalidated on entity events. Same pre-existing gap as command center entity path.

4. **ApprovalSocketPayload extension** — Adding `requesterId` / `assignedApproverId` would only be needed for socket-only per-user routing without `notification_created`. Not required for current backend behavior.

---

## Removed / Retired

| Item | Phase | Notes |
|------|-------|-------|
| AppContext inline `s.on` handlers | A3.1 | Replaced by hub init |
| Procurement hook entity listeners | A3.3 | usePurchaseOrders, useGoodsReceipts, useQuotationComparison |
| Workflow hook approval listeners | A3.3 | useWorkflowSettings, useApprovalQueue |
| Mobile approval/command-center socket blocks | A3.4 | useMobileNotifications, useMobileCommandCenter |
| [useRealtimeQuerySync.ts](../../hooks/useRealtimeQuerySync.ts) | A3.5 | Deleted — duplicate entity/financial path, zero importers |

---

## References

- [multi-user-sync-phase2a-a3.5-plan.md](multi-user-sync-phase2a-a3.5-plan.md)
- [multi-user-sync-phase2a-a3.4-plan.md](multi-user-sync-phase2a-a3.4-plan.md)
- [multi-user-sync-phase2a-a3.3-plan.md](multi-user-sync-phase2a-a3.3-plan.md)
- [multi-user-sync-phase2a-a3-review-v2.md](multi-user-sync-phase2a-a3-review-v2.md)
