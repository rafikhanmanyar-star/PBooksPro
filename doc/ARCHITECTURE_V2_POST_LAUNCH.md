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

## Launch scope — foundation built (not full migration)

These items were **scaffolded or partially wired** for commercial launch. Most domains still use legacy flat `routes/` + `services/` with inline SQL. See `doc/ARCHITECTURE.md` § Implementation Status for an honest audit.

| Item | Built | Fully adopted across codebase |
|------|-------|------------------------------|
| `TenantRepository` + `AuditMutation` + `recordDomainMutation` | Yes | No — repos unused by legacy services; `withAudit()` never called; `recordDomainMutation` only on bills/invoices |
| `/api/v1` with deprecated `/api` alias | Yes | Client yes; alias still active |
| `shared/financial-core` + `shared/report-engines` | Yes | Backend still uses esbuild `.mjs` bundles for reports |
| `FinancialPostingService` + `JournalRepository` | Yes | Bill/invoice/transaction/journal only; not PEV/payroll/investor |
| Accounting period `locked` status | Yes | Yes (posting gateway) |
| `deleted_by` soft-delete columns | Yes | Partial — columns exist; not all services use `TenantRepository.softDelete()` |
| `document_metadata` + R2 `DocumentStorageService` | Yes | Phase 3 complete — legacy `documents` table read/write retired (migration 111) |
| `sync_queue` + `change_log` + LWW helper | Yes | No — helpers exist; LWW not wired; bulk sync skips `change_log` |
| `analytics_snapshots` + dashboard snapshot API + scheduler | Yes | Partial — API mode uses snapshots; legacy KPI/metrics paths remain |
