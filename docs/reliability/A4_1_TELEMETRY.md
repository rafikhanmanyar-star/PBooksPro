# A4.1 — Application Telemetry

## Objective

Capture application performance metrics automatically without modifying business logic or synchronization behavior.

## Architecture

| Layer | Location | Responsibility |
|-------|----------|----------------|
| Shared contracts | `shared/reliability/observabilityTypes.ts` | Metric and error type definitions |
| Backend mirror | `backend/src/reliability/observabilityTypes.ts` | Same contracts for API compile |
| Client collector | `services/telemetry/telemetryClient.ts` | Buffer and flush frontend metrics |
| Client bootstrap | `index.tsx` → `initClientTelemetry()` | Page load, memory, periodic flush |
| API ingest | `POST /api/v1/monitoring/telemetry` | Accept batched client metrics |
| API metrics | `backend/src/services/telemetry/apiMetricsStore.ts` | In-memory ring buffer per endpoint |
| Request timing | `backend/src/middleware/performanceTimingMiddleware.ts` | Records duration on every request |

## Frontend metrics

| Metric | Name | Unit | Trigger |
|--------|------|------|---------|
| Page load | `page_load` | ms | `initClientTelemetry()` on boot |
| Route transition | `route_transition` | ms | `recordRouteTransition(from, to, ms)` |
| API client latency | `api_client_latency` | ms | `recordApiClientLatency(path, ms, status)` |
| JS heap | `js_heap_bytes` | bytes | Chrome/Electron `performance.memory` |

Metrics batch every 60 seconds (or when buffer reaches 40 items) via `monitoringIngestApi.reportTelemetry()`.

### Optional hooks

- Navigation: call `recordRouteTransition` from your router `onNavigate` handler.
- API client: wrap `apiClient` responses to call `recordApiClientLatency`.

## Backend metrics

| Metric | Source |
|--------|--------|
| Request duration | `performanceTimingMiddleware` |
| Endpoint latency (p50/p95/p99) | `apiMetricsStore.recordApiMetric()` |
| Database latency | Slow requests logged to `monitoring_events` (category `performance` / `database`) |
| Queue latency | `syncDiagnosticsService` reads `sync_queue` timestamps (observe-only) |

## Admin access

- **System Health Center → API Performance** — endpoint stats from in-memory store (last 60 minutes).
- **Settings → System Health Center → Overview** — aggregate API request/error counts.

## Configuration

| Constant | Value | File |
|----------|-------|------|
| `API_LATENCY_WARN_MS` | 500 | `shared/reliability/observabilityTypes.ts` |
| `API_LATENCY_CRITICAL_MS` | 1000 | same |
| `MONITORING_SLOW_REQUEST_MS` | 3000 (legacy) | env / `doc/PRODUCTION_MONITORING.md` |

## External APM

`observabilityProvider.ts` supports Sentry, Application Insights, and OpenTelemetry stubs. Set env vars documented in `doc/PRODUCTION_MONITORING.md` to fan out beyond in-process stores.

## Constraints

- No changes to RealtimeDispatchHub, transactional entity queue, or sync ordering.
- Telemetry is additive and non-blocking.
