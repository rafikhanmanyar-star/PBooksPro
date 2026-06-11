# Architecture v2 — Post-Launch Deferred Items

Tracked items intentionally deferred after commercial launch scope.

| Item | Status | Notes |
|------|--------|-------|
| PostgreSQL RLS | Planned | `SET app.tenant_id` + policies on business tables |
| BullMQ + Redis | Planned | Replace `setInterval` schedulers; migrate `email_automation_queue` |
| Full CQRS | Not started | Event sourcing not required for launch |
| Field-level sync conflicts | Planned | After LWW (`change_log` + `version`) proven in production |
| Distributed workers | Planned | Depends on BullMQ |
| Retire `/api` alias | Planned | After all clients use `/api/v1` |
| Retire esbuild report bundles | Planned | After backend imports `shared/report-engines` directly |
| Payroll → journal_entries unification | Planned | `payrollLedger` remains separate exception |

## Launch scope completed in codebase

- `TenantRepository` + `AuditMutation` + `recordDomainMutation`
- `/api/v1` with deprecated `/api` alias
- `shared/financial-core` + `shared/report-engines`
- `FinancialPostingService` + `JournalRepository`
- Accounting period `locked` status
- `deleted_by` soft-delete columns
- `document_metadata` + R2 `DocumentStorageService`
- `sync_queue` + `change_log` + LWW helper
- `analytics_snapshots` + dashboard snapshot API + scheduler
