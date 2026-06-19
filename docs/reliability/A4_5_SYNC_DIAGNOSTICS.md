# A4.5 — Synchronization Diagnostics

## Objective

Improve supportability of multi-user synchronization **without modifying sync behavior**.

## Critical constraint

**Observe only.** This phase does **not** change:

- RealtimeDispatchHub
- Transactional entity queue
- Event ordering or conflict resolution
- `emitEntityEvent()` pipelines

## Service

`backend/src/services/telemetry/syncDiagnosticsService.ts`

**Endpoint:** `GET /api/v1/admin/monitoring/sync-diagnostics`

## Lifecycle stages (observed)

| Stage | Data source |
|-------|-------------|
| Event created | `change_log` inserts (count last 24h) |
| Event queued | `sync_queue` status `pending` |
| Event processed | `sync_queue` status `processing` / `completed` |
| Event failed | `sync_queue` status `failed` + `last_error` |
| Event retried | Rows with `attempts > 1` in 24h window |

Acknowledgement is inferred from client socket subscriptions and successful queue completion — no hub instrumentation added.

## Queue metrics

```ts
queue: {
  pending: number;
  processing: number;
  completed24h: number;
  failed: number;
  retried24h: number;
}
```

## Admin view

**Settings → System Health Center → Sync Diagnostics** (read-only)

Shows:

- Queue status summary
- Recent failed items (entity type, action, error)
- Recent pending items
- Connected socket clients (from `getConnectedClientsSnapshot`)

## Monitoring category

Sync-related monitoring events use category `sync` (`backend/src/constants/monitoring.ts`).

## Health center integration

`healthCenterService` degrades overall status when:

- `failed > 0`, or
- `pending > 100`

## Constraints

SQL `SELECT` only on `sync_queue` and `change_log`. No writes, no queue processor changes.
