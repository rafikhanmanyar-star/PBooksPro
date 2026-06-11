# PBooks Pro — Architecture Guide (v2)

Single reference for new development after the **Architecture v2** upgrade. Four sections: **Overview**, **Backend**, **Frontend**, and **Data Layer**.

Post-launch deferred items (RLS, BullMQ, CQRS, etc.) are tracked in [`doc/ARCHITECTURE_V2_POST_LAUNCH.md`](ARCHITECTURE_V2_POST_LAUNCH.md).

> **Important:** Architecture v2 describes the **target** design. The codebase is a **strangler migration in progress** — foundation is in place, but most domains still run on the legacy flat `routes/` + `services/` stack. See [Implementation Status](#implementation-status-v2) below.

---

## Table of Contents

0. [Implementation Status (v2)](#implementation-status-v2)
1. [Architecture Overview](#1-architecture-overview)
2. [Backend Architecture](#2-backend-architecture)
3. [Frontend Architecture](#3-frontend-architecture)
4. [Data Layer Architecture](#4-data-layer-architecture)

---

## Implementation Status (v2)

Architecture v2 was planned as an **incremental strangler**, not a big-bang rewrite. “Launch scope completed” in the migration plan means **foundation + first slices** were built — not that every domain was migrated.

### Done (foundation & first slices)

| Area | Status |
|------|--------|
| `TenantRepository` base class | Implemented |
| `FinancialPostingService` + `JournalRepository` | Wired for journal, bill, invoice, transaction, **PEV**, and **investor journal** GL mirrors |
| `/api/v1` mount + client normalization | Implemented; **`/api` alias removed** (v2 canonical prefix only) |
| `shared/financial-core/` + `shared/report-engines/` | Packages exist; backend loads esbuild `.mjs` bundles via **`reportEngines/loadReportEngine.ts`** |
| Accounting period `locked` status | Migration + enforcement in posting gateway |
| `deleted_by` columns | Migration applied |
| `analytics_snapshots` + dashboard API + scheduler | Implemented; dashboard also uses legacy metrics/KPI paths in parallel |
| `document_metadata` + `DocumentStorageService` | Built in `modules/documents/` |
| `change_log` + `sync_queue` + `assertLwwVersion()` | Tables + helpers; **`completeEntityMutation()`** combines LWW + audit (opt-in per route) |
| `recordDomainMutation()` + `withAudit()` | Wired for bills, invoices, documents, transactions, contacts, rental agreements, vendors, properties, buildings, projects, units, project agreements, accounts, categories, contracts, budgets, installment plans, sales returns, quotations, recurring invoice templates, **payroll (departments, grades, employees, runs, payslips, projects, tenant config)**, **personal categories/transactions/tasks**, **PM cycle allocations**, **plan amenities**, **project received assets**, **app settings (single + bulk)**, **PEV + project expense categories**, **contractor advances/bills**, **investor journal postings**, **vendor bill prepaid settlement (settle + reverse + replace)** |
| Domain repository strangler | Bills, invoices (**reads + insert/update/soft-delete/payment-aggregate writes**), **transactions (reads + insert/update/soft-delete writes, for-update + including-deleted upsert locks)**, **contacts + vendors + properties + buildings + budgets + projects + units [reads + writes]**, **personal categories [writes]**, **app settings [upsert/delete writes]**, rental agreements, project agreements, accounts, categories, contracts, installment plans, sales returns, quotations, recurring invoice templates, **payroll (departments + grades + employees + runs + payslips + projects + tenant config [writes]; salary components [reads])**, **personal transactions + tasks**, **PM cycle allocations**, **plan amenities**, **project received assets**, **project expense (vouchers + categories)**, **contractor advances (insert + remaining/journal/description writes) / bills (insert + adjustments + approve)**, **vendor bill advance clearings (insert + delete-by-journal)**, **journal (investor equity ledger reads + settlement posting via repo)** — list/get delegated to domain repos |

### Not done / partially wired

| Area | Current reality |
|------|-----------------|
| **Routes → Services → Repositories** | ~93 flat route files + ~120+ services with inline SQL. Repositories exist for key domains; **bills/invoices reads** delegate to repos; most writes still inline SQL |
| **`withAudit()`** | Implemented; delegates to **`recordDomainMutation()`** (audit + change_log) |
| **`recordDomainMutation()`** | Priority domains above; payroll **salary components** read-only via repo (no upsert routes); no `version` column on payroll tables — LWW deferred |
| **`change_log` writes** | Via `recordDomainMutation` on priority mutations (incl. **bill/invoice soft delete**); bulk writes via **`appStateBulkMutationService`** (`POST /app-settings/bulk`, bulk personal transaction import); **single app_settings** POST/DELETE also write change_log |
| **`assertLwwVersion()` (LWW)** | Wired on priority upserts/updates via **`checkEntityLwwConflict()`** (transactions, bills, invoices, contacts, rental agreements, vendors, properties, buildings, projects, units, project agreements, accounts, categories, contracts, budgets, installment plans, sales returns, **quotations**, **recurring invoice templates**, **personal categories**, **personal transactions**, **PM cycle allocations**, **plan amenities**, **project received assets**, **project expense vouchers**, **project expense categories**) |
| **`change_log` in incremental sync** | **`GET /state/changes`** includes `changeLog[]`; **Electron client merges `changeLog` in `loadStateViaIncrementalSync()`** via `services/api/changeLogMerge.ts` (AppState) and **`services/api/payrollChangeLogMerge.ts`** (payroll localStorage) |
| **Documents on R2** | Phase 3 ✅ — `document_metadata` only; legacy `documents` blocked by trigger (migration 111) |
| **Domain module migration** | Repositories scaffolded (vendors, customers, crm, leases, properties, project-selling); **no module routes/services** except dashboard + documents storage + accounting posting |
| **Report engines** | Logic in `shared/report-engines/`; backend uses centralized **`loadReportEngine()`** over esbuild bundles (direct TS import deferred) |
| **GL posting gateway** | Bills, invoices, transactions, **PEV**, **investor journal** via `FinancialPostingService`; payroll journal backfill still separate |
| **Audit unification** | Priority financial/CRM mutations unified; admin/billing/backup paths still use `appendAuditEvent` directly |

### What “v2 complete” would look like

- All domain CRUD goes through `modules/<domain>/` repositories
- All GL writes go through `FinancialPostingService`
- All mutations use `recordDomainMutation()` or `withAudit()`
- Documents served from R2 via `DocumentStorageService`
- Backend imports `shared/report-engines` directly (no esbuild bundles) — **or** keeps bundles behind `loadReportEngine()` until TS path alias is solved
- Clients on `/api/v1` only — **done** (`/api` alias removed)

**For new development:** follow v2 **patterns** (see checklists below) even while legacy code remains. Prefer extending module layers over adding inline SQL to flat services.

---

## 1. Architecture Overview

PBooks Pro is a monorepo: React/Vite frontend at repo root, Express/PostgreSQL backend in `backend/`, Electron shell in `electron/`, shared packages in `shared/`.

### v2 Target Layer Stack

```
Electron (electron/)
  → React app (root)
    → apiClient (/api/v1) or SQLite IPC
      → Express API (backend/src/)
        → Domain modules (routes → services → repositories)
          → FinancialPostingService (all GL writes)
          → PostgreSQL
```

**Shared packages** (`shared/financial-core/`, `shared/report-engines/`) are the single source of truth for calculation logic on both client and server.

### Runtime Modes

| Mode | Trigger | Data path |
|------|---------|-----------|
| Offline SQLite | `VITE_LOCAL_ONLY=true` | Electron → `sqliteBridge` → `services/database/` |
| LAN/API client | `VITE_LOCAL_ONLY=false` | `apiClient` → `/api/v1` on :3000 (prod) / :3001 (staging) → PostgreSQL |
| API server only | `backend/dist/index.js` | PostgreSQL + migrations on startup |

Never mix ports: staging = **3001**, production = **3000** (enforced in `services/api/client.ts` and `config/apiUrl.ts`).

### Strangler Migration (v1 → v2)

Architecture v2 was rolled out incrementally. **Legacy paths still exist** as thin delegates until each domain is fully migrated:

| v1 (legacy) | v2 (target) |
|-------------|-------------|
| `backend/src/routes/` + inline SQL in `services/` | `backend/src/modules/<domain>/` with `*Repository extends TenantRepository` |
| Direct journal posting in `*JournalPostingService.ts` | `FinancialPostingService` gateway |
| `appendAuditEvent` called ad hoc | `withAudit()` / `recordDomainMutation()` |
| Client-side KPI scans (`kpiDefinitions.ts`) | `analytics_snapshots` + `GET /dashboard/snapshots` |
| Inline `documents.file_data` | `document_metadata` + R2 via `DocumentStorageService` |
| `/api` only | **`/api/v1`** canonical; `/api` deprecated alias |

**New code must follow v2 patterns.** When touching legacy services, prefer delegating to module layers rather than adding inline SQL.

### Where to Put New Code

| Concern | Location (v2) |
|---------|---------------|
| REST endpoints | `backend/src/modules/<domain>/routes/` or thin `backend/src/routes/` delegating to module services |
| Business logic + SQL | `backend/src/modules/<domain>/services/` |
| DB access | `backend/src/modules/<domain>/repositories/` extending `TenantRepository` |
| GL / journal writes | `backend/src/modules/accounting/services/FinancialPostingService.ts` only |
| DB schema (API) | `database/migrations/NNN_name.sql` |
| DB schema (SQLite) | `services/database/schema.ts` → `npm run electron:extract-schema` |
| Financial calculation | `shared/financial-core/` |
| Report calculation | `shared/report-engines/` (UI imports via re-export shims in `components/reports/`) |
| RBAC permissions | `shared/rbac/permissions.ts` |
| API client | `services/api/repositories/` or `services/api/*Api.ts` (base URL `/api/v1`) |
| UI pages | `components/<domain>/` or `modules/<feature>/` |
| Navigation | `Page` union in `types.ts`, `PAGE_GROUPS` + lazy import in `App.tsx`, Sidebar |
| Custom report builder | `backend/src/modules/reporting/` |

### Reference Features (copy these patterns)

- **Dashboard snapshots (v2):** `modules/dashboard/` → `analytics_snapshots` table → `GET /dashboard/snapshots` → `dashboardSnapshotsApi.ts` → `useDashboardSnapshots`
- **Financial posting (v2):** `FinancialPostingService` → `JournalRepository` → `assertAccountingPeriodOpen` → `emitFinancialPosted`
- **Domain strangler:** `modules/vendors/repositories/BillRepository.ts` extends `TenantRepository`; legacy `billsService.ts` delegates over time
- **Custom reports:** `modules/reporting/` (metadata → SQL compiler → repository → service)
- **Project expense vouchers:** RBAC per endpoint, service state machine, `withTransaction`, `emitEntityEvent`

### Anti-Patterns

- SQL in route handlers — repositories and services own DB access
- Direct GL writes outside `FinancialPostingService`
- Missing `tenant_id` in queries — data leakage across orgs
- Editing AUTO-GENERATED files in `backend/src/financial/` — edit `shared/financial-core/` and run `npm run build:backend`
- New report calculation logic in `components/` — put engines in `shared/report-engines/`
- Broad `useAppContext()` in new code — use `useStateSelector` or domain hooks (`context/domains/`)
- New endpoints on `/api` without going through `mountVersionedApi` — use `/api/v1`
- Committing `backend/dist/`, `.env*`, or backup files

---

## 2. Backend Architecture

### Pattern: Routes → Services → Repositories

v2 domain modules follow a three-layer stack. Legacy flat routes may still call `services/*Service.ts` directly during strangler migration.

```
backend/src/modules/<domain>/routes/       ← HTTP, Zod validation, pool lifecycle
backend/src/modules/<domain>/services/     ← business logic, orchestration
backend/src/modules/<domain>/repositories/ ← SQL via TenantRepository
```

**Registered modules today:**

| Module | Path | Repositories |
|--------|------|--------------|
| accounting | `modules/accounting/` | `JournalRepository`, `FinancialPostingService`, **`AccountRepository`**, **`CategoryRepository`** |
| dashboard | `modules/dashboard/` | `AnalyticsSnapshotRepository`, `TenantListRepository` |
| documents | `modules/documents/` | `DocumentRepository`, `DocumentStorageService` (R2) |
| vendors | `modules/vendors/` | `BillRepository`, `ContractRepository`, **`QuotationRepository`**, `VendorRepository` |
| customers | `modules/customers/` | `InvoiceRepository`, **`RecurringInvoiceTemplateRepository`** |
| project-selling | `modules/project-selling/` | `ProjectAgreementRepository`, `ProjectRepository`, `UnitRepository`, `BudgetRepository`, **`InstallmentPlanRepository`**, **`SalesReturnRepository`**, **`PmCycleAllocationRepository`**, **`PlanAmenityRepository`**, **`ProjectReceivedAssetRepository`** |
| leases | `modules/leases/` | `RentalAgreementRepository` |
| properties | `modules/properties/` | `PropertyRepository` |
| crm | `modules/crm/` | `ContactRepository` |
| payroll | `modules/payroll/` | **`PayrollDepartmentRepository`**, **`PayrollGradeRepository`**, **`PayrollEmployeeRepository`**, **`PayrollRunRepository`**, **`PayslipRepository`**, **`PayrollSalaryComponentRepository`**, **`PayrollProjectRepository`**, **`PayrollTenantConfigRepository`** |
| personal-finance | `modules/personal-finance/` | **`PersonalCategoryRepository`**, **`PersonalTransactionRepository`**, **`PersonalTaskRepository`** |
| app-settings | `modules/app-settings/` | **`AppSettingsRepository`** |
| reporting | `modules/reporting/` | custom report templates, SQL compilers |

Each module scaffold: `routes/`, `services/`, `repositories/`, `validators/`, `types/`.

### Core Infrastructure

**`TenantRepository`** (`backend/src/core/TenantRepository.ts`)

- Constructor requires `tenantId`; optional `PoolClient` for transactions
- Protected helpers: `query()`, `queryOne()`, `insert()`, `update()`, `softDelete()`
- Auto-injects `tenant_id`; `activeOnly()` → `deleted_at IS NULL`
- `version` column maps to v2 `version_number` in types/docs

**`withAudit()` / `withAuditValues()`** (`backend/src/core/AuditMutation.ts`)

- Wraps mutations inside a transaction; writes `audit_events` with old/new values
- Captures IP/user-agent via `auditRequestContextMiddleware` on `/api/v1`

**`recordDomainMutation()`** (`backend/src/core/recordDomainMutation.ts`)

- Unified writer: `audit_events` + `change_log` + optional `sync_queue`
- Used by priority domain services (bills, invoices, transactions, etc.)

### FinancialPostingService (GL gateway)

All general-ledger writes go through **`FinancialPostingService`** (`modules/accounting/services/`):

- Validates balanced entries (`shared/financial-core/validation`)
- Enforces accounting period rules (`open` / `closed` / `locked`)
- Persists via `JournalRepository`
- Emits `financial.posted` realtime event

Strangler delegates: `journalRoutes`, `*JournalPostingService.ts` (bill, invoice, transaction) call `createFinancialPostingService(tenantId)`.

**Payroll ledger** remains a separate exception (not unified into `journal_entries` yet).

### Accounting Periods

| Status | Behavior |
|--------|----------|
| `open` | Full write access |
| `closed` | Mutations rejected |
| `locked` | Rejected unless `super_admin` override (`overrideLockedPeriod`) |

Migration: `105_accounting_periods_locked_status.sql`. Enforced in `FinancialPostingService` and `assertAccountingPeriodOpen()`.

### API Versioning

- **Canonical prefix:** `/api/v1` (mounted via `mountVersionedApi()` in `backend/src/routes/mountVersionedApi.ts`)
- **Deprecated alias:** removed — clients use `/api/v1` only
- **Exempt from versioning:** `/health`, `/api/webhooks/*`, `/api/admin`
- Client default: `getDefaultApiBaseUrl()` → `…/api/v1` (`config/apiUrl.ts`)

### New REST Endpoint Checklist

1. Migration in `database/migrations/` (next sequential number)
2. `*Repository extends TenantRepository` in `modules/<domain>/repositories/`
3. Service in `modules/<domain>/services/` — pass `tenantId` explicitly
4. Thin route: Zod validator → service → `sendSuccess` / `handleRouteError`
5. Register in `mountVersionedApi.ts` (or delegate from existing flat route during migration)
6. Mutations: `withAudit()` or `recordDomainMutation()` + `emitEntityEvent()` for live sync
7. GL writes: route through `FinancialPostingService` only
8. New permissions: edit `shared/rbac/permissions.ts`, then `npm run build:backend`

### Middleware Chain (order matters)

**Public routes (no JWT):** `/health`, auth login, marketing, webhooks.

**Authenticated stack** (per router mount in `mountVersionedApi.ts`):

1. `authMiddleware` → sets `req.userId`, `req.tenantId`, `req.role`
2. `requireActiveSubscription()`
3. Optional: `requirePermissionWhenPathStartsWith`, `requireFinancialWriteOnMutations`, `requirePayrollAccessForPayrollPaths`
4. `auditRequestContextMiddleware` on `/api/v1`

**Per-endpoint:** `requirePermission('feature.action')` from `middleware/rbacMiddleware.ts`.

**Admin portal** (`/api/admin`): separate JWT via `adminPortal/` — not tenant-scoped.

### API Response Contract

```typescript
sendSuccess(res, data);
handleRouteError(res, e, { route: 'GET /feature' });
sendFailure(res, 400, 'BAD_REQUEST', 'Clear user-facing message');
```

Envelope shape: `{ success, data?, error? }`.

### Data Mapping

DB snake_case → `rowTo*Api()` in service → camelCase JSON → frontend `normalize*FromApi()`.

### DB Access

- `getPool()` / `pool.connect()` from `backend/src/db/pool.ts`
- Multi-step writes: `withTransaction(client => …)`
- Soft delete: `TenantRepository.softDelete()` sets `deleted_at`, `deleted_by`, bumps `version`
- Never expose raw SQL errors to clients; log with `console.error`

---

## 3. Frontend Architecture

### State Management (pick the right layer)

| Layer | Use when |
|-------|----------|
| `useStateSelector` / domain hooks | Reading slices of AppContext (`context/domains/`) — **preferred for new code** |
| `useDispatchOnly()` | Component only dispatches, never reads state |
| React Query (`hooks/queries/`) | Server-fetched data, dashboard snapshots, reports; keys in `queryKeys.ts` |
| Zustand (`stores/`) | Ephemeral UI state decoupled from AppContext (e.g. dashboard filters) |
| AppContext reducer | Core entities that must persist/sync (accounts, transactions, invoices) |

Do not duplicate server-fetched KPI/report data in AppContext when a React Query hook exists.

- Pure state transitions → `context/reducers/`
- I/O (hydration, socket, save) → `AppContext.tsx` provider

### API Client Layer

- Singleton: `services/api/client.ts` (`apiClient`) — JWT, tenant ID, base URL **`/api/v1`**, error parsing
- Normalization: `config/apiUrl.ts` `normalizeApiBaseUrl()` ensures `/api/v1` suffix
- Per-entity repos: `services/api/repositories/*Api.ts` with `normalize*FromApi()`
- Feature APIs: `services/api/*Api.ts` (e.g. `dashboardSnapshotsApi.ts`)

Endpoints are relative to base URL (e.g. `apiClient.get('/dashboard/snapshots')` → `/api/v1/dashboard/snapshots`).

### Report & Financial Logic (v2)

- **Calculation source of truth:** `shared/report-engines/` and `shared/financial-core/`
- **UI rule:** report components preview/format only — no new calculation logic in `components/reports/`
- Legacy shims in `components/reports/*Engine.ts` and `services/financialEngine/` re-export from `shared/` during migration
- Backend still bundles some engines to `backend/dist/*.mjs` via `scripts/ensure-*-engine.mjs` (planned retirement — import `shared/` directly)

### Dashboard (v2)

When `!isLocalOnlyMode()`:

- Fetch pre-calculated KPIs via `useDashboardSnapshots` → `GET /dashboard/snapshots?date=`
- Backend computes from `analytics_snapshots` + `shared/report-engines` (not raw client `AppState` scans)
- Keep client-side fallback during transition for offline mode

### Navigation (not React Router)

1. Add page to `Page` union in `types.ts`
2. Add to `PAGE_GROUPS` and lazy import in `App.tsx` (`lazyWithRetry`)
3. Wire Sidebar / `utils/appNavigation.ts` for deep links

### Component Organization

```
components/layout/       — Header, Sidebar, Footer
components/ui/             — design system primitives (see doc/DESIGN_SYSTEM.md)
components/<domain>/       — feature pages and modals
components/reports/        — report UI (engines re-export from shared/report-engines)
components/erp/              — shared table/skeleton patterns
modules/<feature>/         — self-contained feature (hooks + UI colocated)
```

### New Frontend Feature Checklist

1. Types in `types/` or root `types.ts`
2. API repo in `services/api/repositories/` or `services/api/`
3. React Query hook in `hooks/queries/` (if server-backed)
4. UI in `components/<domain>/` or `modules/<feature>/`
5. Navigation wiring (Page, PAGE_GROUPS, Sidebar)
6. Permissions: `usePermissions()` / `hooks/usePermissions.ts`

### Styling

- Tailwind CSS + semantic tokens from `styles/design-tokens.css`
- Icons: `lucide-react`
- Entity CRUD modals: `hooks/useEntityFormModal`

### Local-Only (SQLite) Path

- Schema changes: `services/database/schema.ts` → `npm run electron:extract-schema`
- Access via database service / Electron IPC — never raw SQL from components
- `unifiedDatabaseService.query()` throws by design in API mode
- Sync metadata tables (`change_log`, `sync_queue`) are API-path only in v2 launch scope

---

## 4. Data Layer Architecture

### PostgreSQL (API / LAN mode)

- Migrations: `database/migrations/NNN_snake_case.sql` (lexicographic order)
- Runner: `backend/src/migrate.ts` — tracks `schema_migrations`, runs on API startup
- Pool: `backend/src/db/pool.ts` — `getPool()`, `withTransaction()`
- All tenant tables: `tenant_id` column + index on `(tenant_id, …)`

**Migration rules:**

- Idempotent where possible (`IF NOT EXISTS`, `IF EXISTS`)
- Never drop columns/tables without explicit plan and backup
- Document staging vs production differences in migration or `doc/`

### v2 Schema Additions (launch scope)

| Migration | Purpose |
|-----------|---------|
| `105_accounting_periods_locked_status.sql` | `locked` status on accounting periods |
| `106_soft_delete_standard_columns.sql` | `deleted_by` on business tables |
| `107_document_metadata_r2.sql` | `document_metadata` table (R2 `storage_key`) |
| `108_offline_sync_metadata.sql` | `sync_queue`, `change_log`, `updated_by` columns |
| `109_analytics_snapshots.sql` | Pre-calculated dashboard KPIs |

### SQLite (local-only / Electron)

- Schema source: `services/database/schema.ts`
- Extracted: `electron/schema.sql` via `npm run electron:extract-schema`
- Runtime: `electron/sqliteBridge.cjs` (better-sqlite3, WAL, multi-company via `companyManager.cjs`)
- Browser fallback: sql.js + OPFS in `services/database/databaseService.ts`

When adding SQLite tables/columns, update `schema.ts` and re-extract — keep aligned with PostgreSQL migrations where applicable.

### Shared Packages (source of truth)

| Package | Contents | Backend consumption |
|---------|----------|---------------------|
| `shared/financial-core/` | journal ledger, trial balance, validation, reconciliation | Copied to `backend/src/financial/` via `ensure-shared-financial-cores.mjs` |
| `shared/report-engines/` | P&L, balance sheet, cash flow, ledger reports | Bundled to `backend/dist/*.mjs` via `ensure-*-engine.mjs` (transitional) |
| `shared/rbac/permissions.ts` | Permission definitions | Copied to `backend/src/auth/permissions.ts` |

**Never edit AUTO-GENERATED backend copies directly.** Edit `shared/` and regenerate.

### Document Storage (R2)

- Metadata: `document_metadata` table (`storage_key`, `entity_type`, `entity_id`, …)
- Service: `modules/documents/services/DocumentStorageService.ts` (S3-compatible R2 provider)
- Env: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_BUCKET`

### Offline Sync Metadata

- **`change_log`:** inbound change feed per tenant (entity_type, entity_id, action, payload, version)
- **`sync_queue`:** outbound mutations awaiting push
- Written by `recordDomainMutation()` and **`appStateBulkMutationService`** on bulk mutation paths (`app_settings` bulk upsert, personal transaction bulk import)
- Phase 1 conflict policy: **last-write-wins** comparing `version` + `updated_at` (409 on conflict)

### Report Engines

New report checklist:

1. Engine in `shared/report-engines/` (no React imports)
2. Re-export shim in `components/reports/` if UI still imports old path
3. Ensure script in `scripts/` (until backend imports `shared/` directly)
4. `*ReportService.ts` in `backend/src/services/` or module service
5. Route under `/api/v1/reports/` with RBAC permission

Custom/dynamic reports: extend `backend/src/modules/reporting/`.

### Multi-Tenant Data Rules

- Every business table has `tenant_id`
- Repositories enforce tenant scope via `TenantRepository`
- Services receive `tenantId` as explicit parameter from `req.tenantId`
- Soft delete: `deleted_at` + `deleted_by`; financial posted records never physically deleted
- Realtime: `emitEntityEvent(tenantId, …)` and `emitFinancialPosted()` scope Socket.IO per org
- Demo tenants: see `constants/demoEnvironment.ts` for read-only / master-tenant rules

---

## Quick Reference: Full-Stack Feature Flow (v2)

```
1. database/migrations/NNN_feature.sql
2. backend/src/modules/<domain>/repositories/FeatureRepository.ts  (extends TenantRepository)
3. backend/src/modules/<domain>/services/featureService.ts
4. backend/src/modules/<domain>/routes/ or thin backend/src/routes/featureRoutes.ts
5. Register in mountVersionedApi.ts under /api/v1
6. services/api/featureApi.ts
7. hooks/queries/useFeature.ts                    (if server-backed)
8. components/<domain>/FeaturePage.tsx
9. types.ts Page union + App.tsx + Sidebar
10. Mutations: withAudit() or recordDomainMutation(); GL: FinancialPostingService
```

---

## Post-Launch (not in current scope)

See [`doc/ARCHITECTURE_V2_POST_LAUNCH.md`](ARCHITECTURE_V2_POST_LAUNCH.md):

- PostgreSQL RLS (`SET app.tenant_id`)
- BullMQ + Redis (replace `setInterval` schedulers)
- Full CQRS / event sourcing
- Field-level sync conflicts
- Retire `/api` alias and esbuild report bundles
- Payroll → `journal_entries` unification
