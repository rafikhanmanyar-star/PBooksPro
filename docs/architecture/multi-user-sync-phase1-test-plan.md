# Phase 1 Multi-User Sync — Test Plan

**Status:** Implemented with Phase 1 (v2 plan)  
**Reference:** [multi-user-sync-phase1-plan-v2.md](./multi-user-sync-phase1-plan-v2.md)

## Unit / integration tests

| Test | Target file | What it verifies |
|------|-------------|------------------|
| Parallel financial invalidation | `tests/entityQueryInvalidation.test.ts` | Financial entity events invalidate ledger/reports/dashboard in parallel |
| Selling analytics warn on failure | `tests/entityQueryInvalidation.test.ts` | Dynamic import failure logs warn + trace event |
| Own-mutation refresh policy (C-5) | `tests/entityEventRefreshPolicy.test.ts` | Own mutation skips reducer patch but still schedules refresh |
| Reconnect + cooldown policy | `tests/entityEventRefreshPolicy.test.ts` | First `connect` skipped; cooldown blocks rapid refresh |
| `rtTrace` no-ops when flag off | `tests/realtimeTrace.test.ts` | Trace gated by `VITE_DEBUG_REALTIME` |
| CORS allowlist accepts/rejects | `backend/src/config/corsOrigins.test.ts` | Allowed origins pass; unknown origins rejected |
| Query client tier defaults | `tests/queryClientPhase1.test.ts` | Financial 30s + focus; operational 2m; global 5m unchanged |
| Dashboard metrics key prefix (QI-1) | `tests/queryClientPhase1.test.ts` | `DASHBOARD_METRICS_FINANCIAL_QUERY_PREFIX` === `dashboardMetricsQueryKeys.root` |

## Manual verification (two-browser)

1. User A creates transaction → User B sees update in **< 500ms**.
2. **C-5:** User A rapid edits → debounced `refreshFromApi` fires (`api.refresh.scheduled`, `isOwnMutation: true`).
3. **Trace (server):** `transaction.persisted` then `socket.emitted` with `requestId` in server logs only.
4. **Trace (client):** `socket.received` → `query.invalidated` → `ui.refetched`; no `requestId` in WebSocket frames.
5. **Reconnect:** Offline 30s; rapid connect/disconnect verifies cooldown prevents >1 refresh per 3s.
6. **Notifications:** Bell updates; grep confirms single `notification_created` listener in AppContext.
7. **WhatsApp:** Inbound message updates badge without 60s poll.
8. **CORS:** Allowed origin connects; disallowed origin rejected in staging.

## Manual — focus refresh policy

1. Block WebSocket; wait 35s on financial view — 30s stale refetch.
2. Non-financial page still uses 5-min global cache.

## Regression checks

- Remote-mutation reducer patches unchanged.
- Bulk `setQueryDefaults` refresh still triggers full tenant sweep.
- Mobile approval events in `useMobileNotifications` still work.
- No `useRealtimeQuerySync` mount.
- Global `QUERY_STALE_MS` remains `300_000`.
