# A4.2 — Error Tracking

## Objective

Centralized error collection with a standard error model across frontend and backend.

## Standard error model

```ts
{
  id: string;
  timestamp: string;       // ISO-8601
  module: string;          // domain or component
  severity: ObservabilitySeverity;
  message: string;
  stackTrace?: string;
  context?: Record<string, unknown>;
}
```

Defined in `shared/reliability/observabilityTypes.ts` as `ObservabilityErrorRecord`.

## Frontend

| Source | Handler | Ingest |
|--------|---------|--------|
| Unhandled exceptions | `services/errorLogger.ts` (global listeners) | localStorage + console |
| React errors | `ErrorBoundary.tsx` | `POST /monitoring/client-errors` |
| Network / render | `services/telemetry/errorTracking.ts` → `trackClientError()` | local log + server ingest |
| Manual | `trackClientError({ module, message, source, ... })` | same |

`initClientErrorTracking()` was **not** duplicated — global handlers remain in `errorLogger.ts` to avoid double-reporting. Use `trackClientError` from ErrorBoundary and explicit call sites.

## Backend

| Source | Service | Storage |
|--------|---------|---------|
| Unhandled exceptions | Process handlers + `errorTrackingService` | `monitoring_events` |
| API failures (5xx) | `performanceTimingMiddleware` / monitoring capture | `monitoring_events` (`api_failure`) |
| Database errors | DB pool / route error handlers | `monitoring_events` (`database`) |
| Sync errors | Queue failure rows + monitoring capture | `monitoring_events` (`sync`) |

`backend/src/services/telemetry/errorTrackingService.ts` maps `ObservabilityErrorRecord` → `captureMonitoringEvent()`.

## Severity mapping

| Severity | Typical use |
|----------|-------------|
| `debug` | Diagnostic only |
| `info` | Expected operational events |
| `warn` | Degraded but recoverable |
| `error` | User-visible failure |
| `critical` | Data loss / security / outage risk |

## Admin access

- **System Health Center → Events & Alerts** — log viewer, category filters, alert incidents.
- **Overview tab** — error counts by category and severity (24h window).

API: `GET /api/v1/admin/monitoring/events`, `GET /api/v1/admin/monitoring/overview`.

## External fan-out

Configure `SENTRY_DSN` or Application Insights connection string; extend `observabilityProvider.ts` for production APM.

## Constraints

- Error tracking does not alter mutation pipelines, GL posting, or sync behavior.
