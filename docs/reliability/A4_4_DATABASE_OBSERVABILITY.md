# A4.4 — Database Observability

## Objective

Detect database bottlenecks: pool pressure, slow queries, lock contention.

## Service

`backend/src/services/telemetry/databaseObservabilityService.ts`

**Endpoint:** `GET /api/v1/admin/monitoring/database`

Also embedded in **System Health Center → Database**.

## Tracked signals

| Signal | Source |
|--------|--------|
| Connection pool usage | `pg.Pool` (`totalCount`, `idleCount`, `waitingCount`, `max`) |
| Slow queries (app-level) | Last N `monitoring_events` with category `performance` or `database` |
| Top slow SQL | `pg_stat_statements` when extension enabled |
| Lock contention | `pg_locks` waiting count |

## Top 20 slowest queries

1. **Monitoring events** — up to 20 recent slow request records with route, method, duration.
2. **pg_stat_statements** — when available, top statements by mean execution time.

Enable `pg_stat_statements` in PostgreSQL for statement-level insight:

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

## Health integration

`monitoringHealthService` includes `connection_pool` component:

- **healthy** — no clients waiting
- **degraded** — `waitingCount > 0`
- **unhealthy** — pool exhausted or DB unreachable

## Transaction duration

Long API requests that include DB work appear in API metrics (A4.3) and, when above legacy threshold, in `monitoring_events`.

## Operational playbook

| Symptom | Check |
|---------|-------|
| High `waitingCount` | Scale pool / reduce query time / add indexes |
| Repeated slow route in monitoring events | API Performance tab → optimize that endpoint |
| High `waitingLocks` | Identify blocking sessions in PostgreSQL |
| `pgStatStatementsAvailable: false` | Enable extension on staging/production |

## Constraints

Read-only observability queries only — no schema or sync changes.
