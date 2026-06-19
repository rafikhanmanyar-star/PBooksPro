# A4.3 — API Monitoring

## Objective

Identify slow or failing endpoints with percentile latency and breach counts.

## Measurement

For every HTTP request handled by the API, `performanceTimingMiddleware` calls `recordApiMetric()` with:

- method, path, status code, duration (ms)
- warning/critical breach flags (A4 thresholds)

`apiMetricsStore` maintains an in-memory ring buffer (per process) and computes:

| Field | Description |
|-------|-------------|
| `requestCount` | Total requests in window |
| `errorCount` | HTTP status ≥ 500 |
| `avgMs` | Mean latency |
| `p50Ms`, `p95Ms`, `p99Ms` | Percentiles |
| `maxMs` | Worst request |
| `warningBreaches` | Requests > 500ms |
| `criticalBreaches` | Requests > 1000ms |

## Thresholds

| Level | Threshold |
|-------|-----------|
| Warning | > **500 ms** |
| Critical | > **1000 ms** |

Constants: `API_LATENCY_WARN_MS`, `API_LATENCY_CRITICAL_MS` in `shared/reliability/observabilityTypes.ts`.

Legacy slow-request logging to `monitoring_events` still uses `MONITORING_SLOW_REQUEST_MS` (default 3000ms) for long-tail persistence.

## Slow API report

**Endpoint:** `GET /api/v1/admin/monitoring/slow-apis?minutes=60&limit=20`

Returns endpoints sorted by p95 latency with breach counts.

Also available via **System Health Center → API Performance**.

## Related endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /admin/monitoring/api-stats` | Full summary + all endpoint rows |
| `GET /admin/monitoring/health-center` | API section embedded in unified snapshot |
| `GET /admin/monitoring/overview` | 24h error/slow counts from `monitoring_events` |

## Permissions

Super-admin / monitoring admin routes (see `adminMonitoringRoutes.ts`).

## Operational notes

- In-memory metrics reset on API process restart; use `monitoring_events` for historical slow-request audit.
- Horizontal scale: each API instance holds its own buffer — aggregate at load balancer or external APM for multi-node deployments.

## Constraints

No route handler or business logic changes beyond timing middleware (already present for monitoring).
