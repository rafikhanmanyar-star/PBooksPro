# Phase 1 Implementation Notes

**Date:** June 2026  
**Plan:** [multi-user-sync-phase1-plan-v2.md](./multi-user-sync-phase1-plan-v2.md)

## Files changed

| File | Change |
|------|--------|
| `backend/src/config/corsOrigins.ts` | **New** — Socket.io CORS allowlist resolver |
| `backend/src/config/corsOrigins.test.ts` | **New** — CORS unit tests |
| `backend/src/core/realtime.ts` | CORS allowlist; `DEBUG_REALTIME` emit logging |
| `backend/src/modules/accounting/routes/transactionsRoutes.ts` | `transaction.persisted` server log |
| `services/realtime/realtimeTrace.ts` | **New** — client trace utility |
| `services/realtime/entityEventRefreshPolicy.ts` | **New** — C-5 / reconnect / visibility policy |
| `services/logger.ts` | `realtime` logging category |
| `services/realtime/entityQueryInvalidation.ts` | `Promise.all` invalidation; selling-analytics warn |
| `config/queryClient.ts` | Financial + operational `setQueryDefaults` |
| `context/AppContext.tsx` | C-5, reconnect, visibility cooldown, notifications, entity trace |
| `hooks/useUserNotifications.ts` | Removed duplicate `notification_created` listener |
| `modules/executive-mobile/hooks/useMobileNotifications.ts` | Removed `notification_created`; kept approval events |
| `components/layout/Header.tsx` | WhatsApp via `getRealtimeSocket()` |
| `components/whatsapp/WhatsAppSidePanel.tsx` | Real socket listeners |
| `components/whatsapp/WhatsAppChatWindow.tsx` | Real socket listeners |
| `hooks/useDashboardMetrics.ts` | `ui.refetched` trace |
| `tests/realtimeTrace.test.ts` | **New** |
| `tests/entityQueryInvalidation.test.ts` | **New** |
| `tests/entityEventRefreshPolicy.test.ts` | **New** |
| `tests/queryClientPhase1.test.ts` | **New** |
| `docs/architecture/multi-user-sync-phase1-test-plan.md` | **New** |

**Not modified (per plan):** `services/api/client.ts`, `hooks/useRealtimeQuerySync.ts`, `backend/src/index.ts` Express CORS, Redis, SyncEngine V2, event replay.

## New / traced events

### Server (`DEBUG_REALTIME=true`)

| Event | Location |
|-------|----------|
| `transaction.persisted` | `transactionsRoutes.ts` POST `/transactions` |
| `socket.emitted` | `realtime.ts` `emitEvent()` |

### Client (`VITE_DEBUG_REALTIME=true`)

| Event | Location |
|-------|----------|
| `socket.received` | `AppContext.tsx` `handleEntity` |
| `query.invalidated` | `entityQueryInvalidation.ts` |
| `selling_analytics.invalidate_failed` | `entityQueryInvalidation.ts` |
| `ui.refetched` | `useDashboardMetrics.ts` `refetchDashboardQueries` |

### Socket events (no payload change)

| Event | Handler |
|-------|---------|
| `notification_created` | Centralized in `AppContext.tsx` |
| `connect` (reconnect) | `AppContext.tsx` — debounced refresh with cooldown |
| `whatsapp:message:*` | Header + WhatsApp panels via `getRealtimeSocket()` |

## New logging categories

| Category | Usage |
|----------|--------|
| `realtime` | Client trace + selling-analytics invalidation warnings |

## Dashboard metrics query key alignment (QI-1)

React Query uses a **prefix** for both cache policy and invalidation. All dashboard KPI queries share one root:

| Role | Location | Key |
|------|----------|-----|
| **Canonical root** | `hooks/useDashboardMetrics.ts` | `dashboardMetricsQueryKeys.root` → `['dashboardMetrics']` |
| **Hook query keys** | `useDashboardMetrics`, `useDashboardCharts`, etc. | `[...dashboardMetricsQueryKeys.root, 'metrics' \| 'charts' \| …]` |
| **Financial stale-time tier** | `config/queryClient.ts` | `setQueryDefaults(DASHBOARD_METRICS_FINANCIAL_QUERY_PREFIX)` — same as `dashboardMetricsQueryKeys.root` |
| **Socket invalidation** | `services/realtime/entityQueryInvalidation.ts` | `invalidateQueries({ queryKey: dashboardMetricsQueryKeys.root })` on financial / GL events |

`invalidateQueries({ queryKey: dashboardMetricsQueryKeys.root })` matches every cached query whose key **starts with** `'dashboardMetrics'`, including metrics, charts, activity, and snapshots.

**Do not** hardcode a separate `'dashboardMetrics'` string in `queryClient.ts`; import `dashboardMetricsQueryKeys.root` (exported as `DASHBOARD_METRICS_FINANCIAL_QUERY_PREFIX`). A dev-mode assertion in `applyPhase1QueryDefaults` throws if the prefixes diverge.

## New query invalidations

No new invalidation *targets* — existing keys are now invalidated in **parallel** (`Promise.all`) per block:

- Financial: `ledger`, `reports`, `dashboardMetrics` (via `dashboardMetricsQueryKeys.root`)
- Invoice/bill, rental, contact, vendor, PO, goods receipt, workflow, contract, project, user, payroll, document, personal, report designer
- Bulk tenant refresh (settings `bulkRefresh`)
- Notifications: `user-notifications`, `mobile-notifications` (centralized on `notification_created`)

## Environment flags

| Flag | Default | Purpose |
|------|---------|---------|
| `DEBUG_REALTIME` | off | Server socket + transaction trace logs |
| `VITE_DEBUG_REALTIME` | off | Client realtime trace logs |
| `CORS_ALLOW_ALL` | off | Emergency Socket.io CORS bypass |
| `CORS_ORIGINS` | — | Comma-separated extra allowed origins |
| `FRONTEND_URL` | — | Single origin added to allowlist |
