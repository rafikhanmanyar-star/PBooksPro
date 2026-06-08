# Production Monitoring

Unified monitoring for application errors, API failures, database issues, authentication, payments, performance, email delivery, and user activity.

## Architecture

| Layer | Responsibility |
|-------|----------------|
| `monitoringCapture.ts` | Non-blocking event ingestion from hooks |
| `monitoring_events` | Searchable event store (log viewer) |
| `monitoring_alert_rules` + `monitoring_alert_incidents` | Threshold-based alerting |
| `monitoring_health_checks` | Component health snapshots |
| `observabilityProvider.ts` | Fan-out to Sentry / App Insights / OpenTelemetry |

## Tracked categories

1. **application_error** — React boundary + `POST /api/monitoring/client-errors`
2. **api_failure** — HTTP 5xx responses
3. **database** — Connection/query failures (`DB_CONNECTION`, timeouts)
4. **authentication** — 401 responses from auth middleware
5. **payment** — Paddle past-due / webhook failures
6. **performance** — Requests slower than `MONITORING_SLOW_REQUEST_MS` (default 3000ms)
7. **email** — Failed rows in `email_automation_queue`
8. **user_activity** — Successful logins

## Health endpoints

| Endpoint | Type |
|----------|------|
| `GET /health` | Liveness (process up) |
| `GET /api/health/ready` | Readiness (DB, email queue, webhooks, app errors) |

## Admin dashboard

**Settings → Monitoring** (super_admin, cloud mode)

Tabs: Overview, Log Viewer, Alerts, Health Checks

API prefix: `/api/admin/monitoring/*`

## Alerting

Default rules seeded in migration `086_production_monitoring.sql`. When event counts exceed thresholds within the configured window, an incident is created and logged at `error` level.

Acknowledge: `POST /api/admin/monitoring/alerts/:id/acknowledge`  
Resolve: `POST /api/admin/monitoring/alerts/:id/resolve`

## External APM integration points

Set env vars and extend `observabilityProvider.ts` with real SDK calls:

```env
SENTRY_DSN=https://...@sentry.io/...
APPLICATIONINSIGHTS_CONNECTION_STRING=InstrumentationKey=...
OTEL_EXPORTER_OTLP_ENDPOINT=https://otel-collector:4318
OTEL_SERVICE_NAME=pbooks-backend
```

Stub providers log debug lines when configured; install `@sentry/node`, `applicationinsights`, or `@opentelemetry/sdk-node` to send real telemetry.

## Deploy

```bash
npm run migrate --prefix backend
npm run build --prefix backend
```

Set `MONITORING_ENABLED=true` (default unless `false`).
