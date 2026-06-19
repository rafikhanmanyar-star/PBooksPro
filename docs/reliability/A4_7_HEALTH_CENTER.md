# A4.7 — Production Health Center

## Objective

Single read-only operational dashboard for production support.

## UI

**Settings → System Health Center** (`super_admin`)

Component: `components/monitoring/SystemHealthCenter.tsx`

## Tabs

| Tab | Content |
|-----|---------|
| **Overview** | Overall status, API/sync/DB/error KPIs, component health |
| **API Performance** | Endpoint table with p95/p99 and breach counts |
| **Database** | Pool stats, slow queries, pg_stat_statements (if enabled) |
| **Sync Diagnostics** | Queue pending/failed/retry, recent rows |
| **Audit Coverage** | Module/action counts, gap list |
| **Events & Alerts** | Embedded `AdminMonitoringDashboard` (logs, alerts, health checks) |

## Health metrics

### Frontend

| Metric | Source |
|--------|--------|
| Client telemetry | `POST /monitoring/telemetry` ingest flag |
| Error rate | `monitoring_events` stats (24h) |
| Performance | API slow counts + client `page_load` metrics |

### Backend

| Metric | Source |
|--------|--------|
| API health | `apiMetricsStore` + component checks |
| Queue health | `sync_queue` diagnostics |
| Database health | Pool + lock checks |

### Synchronization

| Metric | Source |
|--------|--------|
| Pending events | `sync_queue` |
| Failed events | `sync_queue` failed status |

## API

`GET /api/v1/admin/monitoring/health-center`

Returns `HealthCenterSnapshot` (see `healthCenterService.ts`).

Overall status logic:

- Starts from aggregated component health
- Degrades on sync failures or high pending queue
- Unhealthy on critical API slowness or error spike

## Permissions

Requires super-admin enterprise role (same as prior Monitoring dashboard).

## Constraints

Read-only UI — no mutation controls on sync queue or health components from this page.
