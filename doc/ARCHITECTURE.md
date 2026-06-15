# PBooks Pro — Architecture Guide (v2.1)

Single reference for new development after the **Architecture v2.1** upgrade. Four sections: **Overview**, **Backend**, **Frontend**, and **Data Layer**.

> **For AI agents:** mandatory compliance checklists, enforcement rules, and MUST/MUST NOT rules are in [`doc/ARCHITECTURE_V2_AGENT_RULES.md`](ARCHITECTURE_V2_AGENT_RULES.md) (loaded via `.cursor/rules/architecture-v2-agent-compliance.mdc`).

> **Modernization progress:** [`doc/ARCHITECTURE_V2_1_MODERNIZATION_PROGRESS.md`](ARCHITECTURE_V2_1_MODERNIZATION_PROGRESS.md)

> **Database standard:** PBooks Pro uses **PostgreSQL only** for Desktop Edition, Cloud Edition, staging, and production. **Client SQLite was removed in Architecture v2.1 Phase 6** (2026-06). Legacy Electron/sql.js tooling under `tools/legacy/` is for one-off migrations only — not bundled in API client builds.

Post-launch deferred items (RLS, BullMQ, CQRS, etc.) are tracked in [`doc/ARCHITECTURE_V2_POST_LAUNCH.md`](ARCHITECTURE_V2_POST_LAUNCH.md).

> **Important:** Architecture v2 **launch scope is complete** — domain repositories, module routes, and posting/audit patterns are in place. Legacy `backend/src/routes/*.ts` files remain as thin re-exports for compatibility; implementations live under `modules/*/routes/`. Post-launch hardening (RLS, BullMQ, direct report-engine imports) is tracked separately.

---

## Table of Contents

0. [Implementation Status (v2)](#implementation-status-v2)
1. [Architecture Overview](#1-architecture-overview)
2. [Database Standard](#database-standard)
3. [Architecture Enforcement Rules](#architecture-enforcement-rules)
4. [Financial Reporting Rules](#financial-reporting-rules)
5. [Core Business Domains](#core-business-domains)
6. [Backend Architecture](#2-backend-architecture)
7. [Frontend Architecture](#3-frontend-architecture)
8. [Data Layer Architecture](#4-data-layer-architecture)
9. [Real-Time First Architecture](#real-time-first-architecture)
10. [Architecture Compliance Checklist](#architecture-compliance-checklist)

---

## Implementation Status (v2)

Architecture v2 was planned as an **incremental strangler**, not a big-bang rewrite. **Launch scope is now complete** — repositories, module routes, posting gateway, and sync/audit patterns are wired; remaining items are post-launch hardening.

### Done (foundation & first slices)

| Area | Status |
|------|--------|
| `TenantRepository` base class | Implemented |
| `core/repositories/` (sync/audit infra) | **`ChangeLogRepository`**, **`SyncQueueRepository`**, **`AuditEventRepository`**, **`TenantChartRepository`**, **`TenantJournalMaintenanceRepository`**, **`TenantWipeRepository`** |
| `FinancialPostingService` + `JournalRepository` | Wired for journal, bill, invoice, transaction, **PEV**, and **investor journal** GL mirrors |
| `/api/v1` mount + client normalization | Implemented; **`/api` alias removed** (v2 canonical prefix only) |
| `shared/financial-core/` + `shared/report-engines/` | Packages exist; backend uses **`reportEngines/index.ts`** (compiled from `shared/report-engines` at build time) |
| Accounting period `locked` status | Migration + enforcement in posting gateway |
| `deleted_by` columns | Migration applied |
| `analytics_snapshots` + dashboard API + scheduler | Implemented; dashboard also uses legacy metrics/KPI paths in parallel |
| `document_metadata` + `DocumentStorageService` | Built in `modules/documents/` |
| `change_log` + `sync_queue` + `assertLwwVersion()` | Tables + helpers; **`completeEntityMutation()`** combines LWW + audit (opt-in per route) |
| `recordDomainMutation()` + `withAudit()` | Wired for bills, invoices, documents, transactions, contacts, rental agreements, vendors, properties, buildings, projects, units, project agreements, accounts, categories, contracts, budgets, installment plans, sales returns, quotations, recurring invoice templates, **payroll (departments, grades, employees, runs, payslips, projects, tenant config)**, **personal categories/transactions/tasks**, **PM cycle allocations**, **plan amenities**, **project received assets**, **app settings (single + bulk)**, **PEV + project expense categories**, **contractor advances/bills**, **investor journal postings**, **vendor bill prepaid settlement (settle + reverse + replace)** |
| Domain repository strangler | Core AppState domains, GL/journal, backup/DR, billing, referrals, onboarding, privacy, marketing, demo, auth, trial, legal, email-automation, organization, monitoring, admin portal, transaction journal backfill, backup audit context — priority services delegate SQL to `modules/*/repositories/` |
| **Module routes (physical migration)** | **Done (batch 49)** — all tenant/SaaS API routers live under `modules/<domain>/routes/`; `mountVersionedApi.ts` + legacy `routes/*.ts` re-exports only |

### Not done / post-launch

| Area | Current reality |
|------|-----------------|
| **Routes → Services → Repositories** | **Done** — implementations in `modules/*/routes/`; legacy `routes/*.ts` are `@deprecated` re-exports. `mountVersionedApi.ts`, `healthLiveness.ts`, and `adminPortalRoutes.ts` remain at flat `routes/` (mount wiring only) |
| **`withAudit()`** | Implemented; delegates to **`recordDomainMutation()`** (audit + change_log) |
| **`recordDomainMutation()`** | Priority domains above; payroll **salary components** read-only via repo (no upsert routes); no `version` column on payroll tables — LWW deferred |
| **`change_log` writes** | Via `recordDomainMutation` on priority mutations (incl. **bill/invoice soft delete**); bulk writes via **`appStateBulkMutationService`** (`POST /app-settings/bulk`, bulk personal transaction import); **single app_settings** POST/DELETE also write change_log |
| **`assertLwwVersion()` (LWW)** | Wired on priority upserts/updates via **`checkEntityLwwConflict()`** (transactions, bills, invoices, contacts, rental agreements, vendors, properties, buildings, projects, units, project agreements, accounts, categories, contracts, budgets, installment plans, sales returns, **quotations**, **recurring invoice templates**, **personal categories**, **personal transactions**, **PM cycle allocations**, **plan amenities**, **project received assets**, **project expense vouchers**, **project expense categories**) |
| **`change_log` in incremental sync** | **`GET /state/changes`** includes `changeLog[]`; **Electron client merges `changeLog` in `loadStateViaIncrementalSync()`** via `services/api/changeLogMerge.ts` (AppState) and **`services/api/payrollChangeLogMerge.ts`** (payroll localStorage) |
| **Documents on R2** | Phase 3 ✅ — `document_metadata` only; legacy `documents` blocked by trigger (migration 111) |
| **Domain module services** | Repositories + routes migrated; some flat `services/*` wrappers remain as delegation shims (acceptable) |
| **Report engines** | Logic in `shared/report-engines/`; backend **`reportEngines/index.ts`** static imports (build bundles via `ensure-shared-report-engines.mjs`) |
| **GL posting gateway** | Bills, invoices, transactions, **PEV**, **investor journal** via `FinancialPostingService`; payroll journal backfill still separate |
| **Audit unification** | Priority financial/CRM mutations unified; admin/billing/backup paths still use `appendAuditEvent` directly |
| **Admin portal `system.ts`** | Pool stats / health only (no tenant SQL); optional future repo slice |

### What “v2 complete” looks like (launch scope ✅)

- All domain CRUD goes through `modules/<domain>/` repositories — **done for priority domains**
- All tenant API routes live under `modules/<domain>/routes/` — **done (batch 49)**
- All GL writes go through `FinancialPostingService` — **done for bills/invoices/transactions/PEV/investor journal**
- Priority mutations use `recordDomainMutation()` or `withAudit()` — **done for listed domains**
- Documents served from R2 via `DocumentStorageService` — **done**
- Clients on `/api/v1` only — **done** (`/api` alias removed)

**Deferred to post-launch:** RLS, BullMQ job queues, direct `shared/report-engines` TS imports, full audit path unification, payroll LWW columns.

**For new development:** follow v2 **patterns** (see checklists below) even while legacy code remains. Prefer extending module layers over adding inline SQL to flat services.

---

## 1. Architecture Overview

PBooks Pro is a monorepo: React/Vite frontend at repo root, Express/PostgreSQL backend in `backend/`, Electron shell in `electron/`, shared packages in `shared/`.

**Single source of truth:** PostgreSQL.

### Runtime Architecture (v2.1)

**Desktop Edition**

```
Electron (electron/)
  → React app (root)
    → apiClient (/api/v1)
      → Express API (backend/src/)
        → Domain modules (routes → services → repositories)
          → FinancialPostingService (all GL writes)
          → PostgreSQL
```

**Cloud Edition**

```
Browser
  → React app (root)
    → apiClient (/api/v1)
      → Express API (backend/src/)
        → Domain modules (routes → services → repositories)
          → FinancialPostingService (all GL writes)
          → PostgreSQL
```

**Backend**

```
Express API
  → Modules (routes → services → repositories)
  → PostgreSQL
```

**Shared packages** (`shared/financial-core/`, `shared/report-engines/`, `shared/rbac/`) are the single source of truth for calculation logic and permission definitions on both client and server.

### Editions & Environments

| Edition / Environment | Client | API port | Database |
|----------------------|--------|----------|----------|
| Desktop Edition (production) | Electron | **3000** | `pbookspro` |
| Desktop Edition (staging) | Electron | **3001** | `pBookspro_Staging` |
| Cloud Edition | Browser | **3000** / **3001** | PostgreSQL (same as above) |
| API server only | — | **3000** / **3001** | PostgreSQL + migrations on startup |

Never mix ports: staging = **3001**, production = **3000** (enforced in `services/api/client.ts` and `config/apiUrl.ts`).

> **Deprecated:** Offline SQLite was removed from the application client (Phase 6). Desktop and Cloud editions use `apiClient` → `/api/v1` → PostgreSQL only.

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
| DB schema | `database/migrations/NNN_name.sql` (PostgreSQL only) |
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
- SQLite-specific code, schemas, or sync logic — **deprecated**; use PostgreSQL via module repositories
- Local-only screen updates for business entities — mutations must propagate to all users in the org via real-time events (see [Real-Time First Architecture](#real-time-first-architecture))

---

## Real-Time First Architecture

PBooks Pro is a **multi-user ERP**. Multiple users in the same organization work simultaneously. Real-time synchronization is **mandatory**, not optional.

**Principle:** Never implement features that only update the local screen without propagating changes to every connected client in the same tenant.

### Every business entity mutation MUST

1. **Save to PostgreSQL** — commit the transaction before emitting events
2. **Record audit trail** — `withAudit()` or `recordDomainMutation()` (`backend/src/core/recordDomainMutation.ts`, `backend/src/core/AuditMutation.ts`)
3. **Emit tenant-scoped event** — `emitEntityEvent()` or `emitFinancialPosted()` (`backend/src/core/realtime.ts`)
4. **Notify connected clients** — Socket.IO tenant room via `initRealtime()` (same HTTP server as Express)
5. **Refresh affected screens automatically** — clients invalidate caches and merge remote changes; manual page refresh is never required

**Applies to all business entities**, including: contracts, payments, invoices, vendor bills, receipts, journal entries, properties, leads, customers, vendors, quotations, purchase orders, retention releases, IPC bills, BOQs, and every other tenant-scoped domain.

### MUST NOT

| Anti-pattern | Why |
|--------------|-----|
| Local-only state updates | Other users never see the change |
| Manual refresh as primary sync | Violates Real-Time First; refresh buttons are supplementary only |
| Screen refresh buttons as primary sync mechanism | Same |
| Polling-only solutions | Acceptable as fallback only; socket events are required for mutations |
| Tenant-wide broadcasts without tenant filtering | Cross-tenant leakage; always scope to `tenant:${tenantId}` room |

### Event architecture standard

No mutation is complete until the event is emitted. Standard pipeline:

```
Repository → Service → withAudit() / recordDomainMutation() → emitEntityEvent() → Real-Time Gateway → Connected Clients
```

| Layer | Reference |
|-------|-----------|
| Audit + change_log | `recordDomainMutation()` — `backend/src/core/recordDomainMutation.ts` |
| LWW before write | `checkEntityLwwConflict()` / `assertEntityLwwBeforeWrite()` — `backend/src/core/entityMutation.ts` → `assertLwwVersion()` in `backend/src/services/changeLogService.ts` |
| Real-time gateway | `initRealtime()`, `emitEntityEvent()`, `emitFinancialPosted()` — `backend/src/core/realtime.ts` |
| Route example (bill upsert + 409) | `backend/src/modules/vendors/routes/billsRoutes.ts` |
| GL posted event | `FinancialPostingService` → `emitFinancialPosted()` |

**Socket events today:** `entity_created`, `entity_updated`, `entity_deleted`, `financial.posted` (plus `lock_acquired` / `lock_released`, `notification_created`, WhatsApp events).

**Required semantic event types** (lifecycle): `created`, `updated`, `deleted`, `approved`, `rejected`, `posted`, `reversed`, `status_changed`. Map workflow transitions to `emitEntityEvent(..., 'updated', …)` with the appropriate `recordDomainMutation` audit action until dedicated socket event names are added for each lifecycle.

### Tenant isolation

Every event payload must be scoped to one organization:

| Field | Source |
|-------|--------|
| `tenantId` | JWT / `req.tenantId` — never from client body |
| Entity type | `RealtimeEntityType` in `backend/src/core/realtime.ts` |
| Entity id | `id` on payload or nested `data.id` |
| Event type | `action`: `created` \| `updated` \| `deleted` (socket layer) |
| Timestamp | `ts` (ISO string, set by `emitEvent()`) |
| Version | Entity `version` in `data` and `change_log` when LWW-enabled |

Clients **must** ignore events where `payload.tenantId !== currentTenantId` (see `handleEntity` in `context/AppContext.tsx`). Server joins sockets only to `tenant:${tenantId}` (`initRealtime()` in `backend/src/core/realtime.ts`).

### Frontend synchronization

| Concern | Reference |
|---------|-----------|
| Socket client | `connectRealtimeSocket()`, `getRealtimeSocket()` — `core/socket.ts` |
| Global entity listener | `context/AppContext.tsx` — subscribes to `entity_created` / `entity_updated` / `entity_deleted` / `financial.posted`; debounced API refresh + selective AppState patches for bills/invoices/transactions/units |
| Incremental merge | `services/api/changeLogMerge.ts` — `applyChangeLogToMergedState()` + `CHANGE_LOG_ENTITY_MAP` |
| React Query + socket | `hooks/useUserNotifications.ts`, `modules/executive-mobile/hooks/useMobileNotifications.ts` — `getRealtimeSocket()` + `queryClient.invalidateQueries()` on `notification_created` |
| Record locks | `hooks/useRecordLock.ts` — `lock_acquired` / `lock_released` via `getRealtimeSocket()` |
| Connection UI | `components/ui/ConnectionStatusIndicator.tsx` |

**Rules for new modules:**

1. Subscribe to tenant entity events (reuse shared socket from `core/socket.ts`)
2. On event: `queryClient.invalidateQueries({ queryKey: … })` or `queryClient.setQueryData(...)` for targeted updates
3. Update dashboards, lists, and open forms when safe (respect LWW `version`)
4. Manual page refresh (`F5`) is never required for multi-user consistency

### React Query integration

New server-backed hooks **must** wire cache invalidation to relevant socket events:

```typescript
useEffect(() => {
  const socket = getRealtimeSocket();
  if (!socket) return;
  const onEntity = (payload: { tenantId?: string; type?: string }) => {
    if (payload.tenantId && payload.tenantId !== currentTenantId) return;
    if (payload.type === 'bill') {
      void queryClient.invalidateQueries({ queryKey: ['bills'] });
    }
  };
  socket.on('entity_updated', onEntity);
  socket.on('entity_created', onEntity);
  socket.on('entity_deleted', onEntity);
  return () => {
    socket.off('entity_updated', onEntity);
    socket.off('entity_created', onEntity);
    socket.off('entity_deleted', onEntity);
  };
}, [currentTenantId, queryClient]);
```

Prefer `invalidateQueries` for list/report hooks; use `setQueryData` when merging a single row without refetch is safe and version-checked.

### Optimistic locking (LWW)

Entities with a `version` column use **last-write-wins**:

1. Client sends `version` on upsert
2. Service calls `checkEntityLwwConflict()` before write
3. On conflict: HTTP **409** `CONFLICT` with `{ serverVersion }` — see `billsRoutes.ts`
4. UI informs the user; do not silently overwrite

Change log merge on the client skips stale payloads when `entry.version < entityVersion(existing)` (`services/api/changeLogMerge.ts`).

---

## Database Standard

PBooks Pro uses **PostgreSQL** as the single database engine for:

- Desktop Edition
- Cloud Edition
- Staging
- Production

SQLite is **not** part of the active architecture and must **not** be used for:

- New features
- New schemas
- New migrations
- New repositories
- New synchronization logic

Any SQLite references remaining in legacy code (`sqliteBridge`, `VITE_LOCAL_ONLY`, `services/database/schema.ts`, `electron:extract-schema`) are **deprecated** and scheduled for removal. Do not extend them.

---

## Architecture Enforcement Rules

AI agents and developers **must**:

- Follow Architecture v2.1 exactly
- Refuse to introduce alternative architectural patterns
- Refuse to create new flat routes or flat services
- Refuse direct SQL in route handlers
- Refuse bypassing repositories or `FinancialPostingService`
- Refuse duplicate financial or report calculations
- Refuse new database technologies or SQLite-specific code
- Refuse new APIs outside `/api/v1`
- Refuse client-supplied `tenant_id` usage

If a requested implementation conflicts with architecture rules:

1. Explain the violation
2. Propose the architecture-compliant implementation
3. Continue using the approved architecture

---

## Financial Reporting Rules

All financial statements must be generated exclusively from:

- `shared/financial-core/`
- `shared/report-engines/`

The following reports must **never** contain duplicated business logic:

- Balance Sheet
- Income Statement
- Profit & Loss
- Cash Flow Statement
- Trial Balance
- General Ledger
- Subsidiary Ledgers
- Financial Position Statement

Calculation logic is **prohibited** in:

- React components
- Route handlers
- Repositories
- UI utilities

Only formatting and presentation are allowed in UI layers.

---

## Core Business Domains

The following are first-class domains in PBooks Pro and must be implemented under `backend/src/modules/`:

- Project Construction
- Contracts
- BOQ
- IPC Bills
- Retention Management
- Variation Orders
- Purchase Orders
- Vendor Quotations
- Property Sales
- Property Rentals
- CRM
- Collections
- Facility Management

Do not implement these features as generic modules or temporary utilities.

## 2. Backend Architecture

### Pattern: Routes → Services → Repositories

v2 domain modules follow a three-layer stack (`routes/` → `services/` → `repositories/`). Legacy flat `backend/src/routes/*.ts` files re-export module routers for backward-compatible imports.

```
backend/src/modules/<domain>/routes/       ← HTTP, Zod validation, pool lifecycle
backend/src/modules/<domain>/services/     ← business logic, orchestration
backend/src/modules/<domain>/repositories/ ← SQL via TenantRepository
```

**Registered modules today:**

| Module | Path | Repositories |
|--------|------|--------------|
| accounting | `modules/accounting/` | `JournalRepository`, `FinancialPostingService`, **`AccountRepository`**, **`CategoryRepository`**, **`TransactionRepository`**, **`TransactionJournalBackfillRepository`**, **`AccountingPeriodRepository`**, **`RecordLockRepository`** |
| dashboard | `modules/dashboard/` | `AnalyticsSnapshotRepository`, `TenantListRepository` |
| documents | `modules/documents/` | `DocumentRepository`, `DocumentStorageService` (R2) |
| vendors | `modules/vendors/` | `BillRepository`, `ContractRepository`, **`QuotationRepository`**, `VendorRepository` |
| customers | `modules/customers/` | `InvoiceRepository`, **`RecurringInvoiceTemplateRepository`** |
| project-selling | `modules/project-selling/` | `ProjectAgreementRepository`, `ProjectRepository`, `UnitRepository`, `BudgetRepository`, **`InstallmentPlanRepository`**, **`SalesReturnRepository`**, **`PmCycleAllocationRepository`**, **`PlanAmenityRepository`**, **`ProjectReceivedAssetRepository`** |
| leases | `modules/leases/` | `RentalAgreementRepository`, **`OwnerBalanceRepository`**, **`MonthlyOwnerSummaryRepository`** |
| properties | `modules/properties/` | `PropertyRepository` |
| crm | `modules/crm/` | `ContactRepository` |
| payroll | `modules/payroll/` | **`PayrollDepartmentRepository`**, **`PayrollGradeRepository`**, **`PayrollEmployeeRepository`**, **`PayrollRunRepository`**, **`PayslipRepository`**, **`PayrollSalaryComponentRepository`**, **`PayrollProjectRepository`**, **`PayrollTenantConfigRepository`**, **`PayrollTransactionRepository`** |
| personal-finance | `modules/personal-finance/` | **`PersonalCategoryRepository`**, **`PersonalTransactionRepository`**, **`PersonalTaskRepository`** |
| app-settings | `modules/app-settings/` | **`AppSettingsRepository`** |
| backup | `modules/backup/` | **`TenantBackupRepository`**, **`TenantRestoreRepository`**, **`BackupJobRepository`**, **`BackupStorageSettingsRepository`**, **`BackupOffsiteRepository`**, **`BackupSecuritySettingsRepository`**, **`BackupRestoreAuthRepository`** |
| billing | `modules/billing/` | **`BillingPlanRepository`**, **`SubscriptionRepository`**, **`SubscriptionEventRepository`**, **`SubscriptionInvoiceRepository`**, **`BillingCustomerRepository`**, **`SubscriptionUsageRepository`**, **`AdminSubscriptionRepository`**, **`PaddleWebhookRepository`** |
| dr | `modules/dr/` | **`DrAlertRepository`**, **`DrReportRepository`**, **`DrVerificationRepository`**, **`DrRestoreTestRepository`** |
| referrals | `modules/referrals/` | **`ReferralProgramConfigRepository`**, **`ReferralCodeRepository`**, **`ReferralAttributionRepository`**, **`ReferralRewardRepository`**, **`ReferralInvitationRepository`**, **`ReferralFraudRepository`**, **`ReferralDashboardRepository`**, **`AdminReferralRepository`**, **`ReferralEventRepository`** |
| demo | `modules/demo/` | **`DemoEnvironmentRepository`**, **`DemoBookingRepository`**, **`DemoSeedRepository`** (template seed SQL) |
| onboarding | `modules/onboarding/` | **`OnboardingRepository`** |
| privacy | `modules/privacy/` | **`PrivacyRequestRepository`**, **`PrivacyAnonymizationRepository`**, **`PrivacyDataExportRepository`** |
| marketing | `modules/marketing/` | **`MarketingLeadRepository`**, **`MarketingEmailSequenceRepository`** |
| auth | `modules/auth/` | **`MfaRepository`**, **`UserSessionRepository`**, **`UserTenantRepository`**, **`UserTenantMembershipRepository`** |
| trial | `modules/trial/` | **`TrialSignupRepository`** |
| legal | `modules/legal/` | **`LegalAcceptanceRepository`** |
| email-automation | `modules/email-automation/` | **`EmailAutomationQueueRepository`**, **`EmailAutomationCampaignRepository`**, **`EmailAutomationUnsubscribeRepository`** |
| organization | `modules/organization/` | **`OrganizationRepository`** |
| monitoring | `modules/monitoring/` | **`MonitoringEventRepository`**, **`MonitoringAlertRepository`**, **`MonitoringHealthRepository`** |
| admin-portal | `modules/admin-portal/` | **`AdminLicenseRepository`**, **`AdminUserRepository`** (+ routes under `modules/admin-portal/routes/`) |
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
9. Real-time: emit after commit; LWW 409 on conflict — see `billsRoutes.ts`

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
- Real-time: `core/socket.ts` + entity listeners in `AppContext.tsx`; React Query invalidation in domain hooks — see [Real-Time First Architecture](#real-time-first-architecture)

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
- Backend report services import **`reportEngines/index.ts`** (source: `shared/report-engines/serverEntry.ts`, built by `ensure-shared-report-engines.mjs`)

### Dashboard (v2)

- Fetch pre-calculated KPIs via `useDashboardSnapshots` → `GET /dashboard/snapshots?date=`
- Backend computes from `analytics_snapshots` + `shared/report-engines` (not raw client `AppState` scans)

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

---

## 4. Data Layer Architecture

### PostgreSQL (single database engine)

- Migrations: `database/migrations/NNN_snake_case.sql` (lexicographic order)
- Runner: `backend/src/migrate.ts` — tracks `schema_migrations`, runs on API startup
- Pool: `backend/src/db/pool.ts` — `getPool()`, `withTransaction()`
- All tenant tables: `tenant_id` column + index on `(tenant_id, …)`

**Migration rules:**

- Idempotent where possible (`IF NOT EXISTS`, `IF EXISTS`)
- Never drop columns/tables without explicit plan and backup
- Document staging vs production differences in migration or `doc/`
- **Never** add SQLite migrations or schema files for new features

### v2 Schema Additions (launch scope)

| Migration | Purpose |
|-----------|---------|
| `105_accounting_periods_locked_status.sql` | `locked` status on accounting periods |
| `106_soft_delete_standard_columns.sql` | `deleted_by` on business tables |
| `107_document_metadata_r2.sql` | `document_metadata` table (R2 `storage_key`) |
| `108_offline_sync_metadata.sql` | `sync_queue`, `change_log`, `updated_by` columns |
| `109_analytics_snapshots.sql` | Pre-calculated dashboard KPIs |

### Legacy SQLite (removed from client — tools only)

The **application client** no longer includes SQLite IPC, stubs, or offline import paths (see [`SQLITE_REMOVAL.md`](SQLITE_REMOVAL.md) Phase 6).

| Component | Location | Status |
|-----------|----------|--------|
| Client SQLite stack | `services/legacy-sqlite*`, `importService.ts`, Vite stubs | **Removed** (Phase 6) |
| SQLite bridge | `electron/sqliteBridge.cjs` | Excluded from API client installers; gated behind `PBOOKS_ENABLE_SQLITE=1` |
| Schema extraction | `npm run electron:extract-schema` | @deprecated — use `electron/schema.sql` |
| Offline flag | `isLocalOnlyMode()` | Always `false`; no-op session helpers in `config/apiUrl.ts` |
| One-off migration scripts | `tools/legacy/*` | Uses `sql.js` locally — **not** shipped in Desktop/Cloud client |

Do not use legacy paths for new development. All schema changes go through PostgreSQL migrations only.

### Shared Packages (source of truth)

| Package | Contents | Backend consumption |
|---------|----------|---------------------|
| `shared/financial-core/` | journal ledger, trial balance, validation, reconciliation | Copied to `backend/src/financial/` via `ensure-shared-financial-cores.mjs` |
| `shared/report-engines/` | P&L, balance sheet, cash flow, ledger reports | Backend via `reportEngines/index.ts` + `ensure-shared-report-engines.mjs` |
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
- Realtime: `emitEntityEvent(tenantId, …)` and `emitFinancialPosted()` scope Socket.IO per org — see [Real-Time First Architecture](#real-time-first-architecture)
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
10. Mutations: withAudit() or recordDomainMutation(); emitEntityEvent() for live sync; GL: FinancialPostingService
11. Frontend: React Query hook invalidates on socket events for the entity type
```

---

## Architecture Compliance Checklist

Before completing any task, verify **Architecture v2.1** and **Real-Time First** compliance.

### Architecture v2.1

- [ ] Uses `backend/src/modules/<domain>/`
- [ ] Repository extends `TenantRepository`
- [ ] All queries include `tenant_id`
- [ ] Uses PostgreSQL only
- [ ] No SQLite references added
- [ ] Uses `/api/v1`
- [ ] Uses `FinancialPostingService` for GL
- [ ] Uses `withAudit()` or `recordDomainMutation()`
- [ ] Financial calculations exist only in `shared/financial-core/`
- [ ] Report calculations exist only in `shared/report-engines/`
- [ ] Migration added for schema changes
- [ ] Permissions updated when required
- [ ] No direct SQL in routes
- [ ] No duplicate business logic
- [ ] No legacy architecture extensions
- [ ] No secrets or build artifacts committed

### Real-Time First

- [ ] Mutation commits to PostgreSQL before event emission
- [ ] Audit trail recorded (`withAudit()` or `recordDomainMutation()`)
- [ ] `emitEntityEvent()` or `emitFinancialPosted()` called after successful mutation
- [ ] Event scoped to tenant room (`tenant:${tenantId}`); payload includes `tenantId`, entity type, id, action, `ts`
- [ ] Entity `version` included in payload when LWW-enabled
- [ ] No cross-tenant event leakage (server room join + client tenant filter)
- [ ] Frontend subscribes via `core/socket.ts` (`connectRealtimeSocket` / `getRealtimeSocket`)
- [ ] React Query caches invalidated (or `setQueryData`) on relevant socket events
- [ ] AppContext / module hooks refresh lists, dashboards, and forms without manual page reload
- [ ] No local-only screen updates for shared business entities
- [ ] No refresh button as primary sync for new modules
- [ ] Not polling-only — socket events required for mutation propagation
- [ ] LWW: `checkEntityLwwConflict()` before upsert when entity has `version`
- [ ] HTTP 409 `CONFLICT` with `serverVersion` on stale write; user informed
- [ ] Lifecycle transitions (approved, rejected, posted, reversed, status_changed) emit events (typically as `updated` + audit action)
- [ ] Agent added full pipeline (emit + subscription + cache invalidation) if feature was requested without real-time sync

---

## Post-Launch (not in current scope)

See [`doc/ARCHITECTURE_V2_POST_LAUNCH.md`](ARCHITECTURE_V2_POST_LAUNCH.md):

- PostgreSQL RLS (`SET app.tenant_id`)
- BullMQ + Redis (replace `setInterval` schedulers)
- Full CQRS / event sourcing
- Field-level sync conflicts
- Retire `/api` alias and esbuild report bundles
- Payroll → `journal_entries` unification
