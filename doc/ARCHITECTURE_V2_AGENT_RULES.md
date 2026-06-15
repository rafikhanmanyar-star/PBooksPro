# PBooks Pro — Architecture v2.1 Agent Rules

**Purpose:** Mandatory compliance guide for AI agents and developers on **all new work** in PBooks Pro.  
**Full reference:** [`doc/ARCHITECTURE.md`](ARCHITECTURE.md) · **Post-launch deferred:** [`doc/ARCHITECTURE_V2_POST_LAUNCH.md`](ARCHITECTURE_V2_POST_LAUNCH.md)

Architecture v2.1 **launch scope is complete**. Client SQLite was **removed in Phase 6** (2026-06). Legacy flat routes/services remain as thin delegates only — **never extend legacy patterns for new features**.

> **Progress tracker:** [`doc/ARCHITECTURE_V2_1_MODERNIZATION_PROGRESS.md`](ARCHITECTURE_V2_1_MODERNIZATION_PROGRESS.md)

> **Database standard:** PostgreSQL is the single database engine for Desktop Edition, Cloud Edition, staging, and production. SQLite is deprecated and removed from the active architecture.

---

## 1. Mandatory Rules (MUST / MUST NOT)

### MUST

| Rule | Detail |
|------|--------|
| **Module layout** | New backend features go in `backend/src/modules/<domain>/` (`routes/` → `services/` → `repositories/`) |
| **Tenant scope** | Every business query includes `tenant_id`; repositories extend `TenantRepository` |
| **GL writes** | All general-ledger writes go through `FinancialPostingService` (`modules/accounting/services/`) |
| **API prefix** | New endpoints under `/api/v1` via `mountVersionedApi.ts` |
| **Mutations audit** | Use `withAudit()` or `recordDomainMutation()` on tenant data mutations |
| **Shared logic** | Financial/report calculations live in `shared/financial-core/` or `shared/report-engines/` |
| **Migrations** | Schema changes in `database/migrations/NNN_snake_case.sql` (PostgreSQL only) |
| **Permissions** | New RBAC in `shared/rbac/permissions.ts`, then `npm run build:backend` |
| **API client** | Frontend calls use `apiClient` with base URL `/api/v1` |
| **Explicit tenantId** | Services receive `tenantId` from `req.tenantId` — never trust client-supplied tenant |
| **PostgreSQL only** | All new data access uses PostgreSQL via module repositories |
| **Real-time sync** | Every business mutation: PostgreSQL commit → audit → `emitEntityEvent()` → client cache invalidation |
| **LWW conflicts** | Validate `version` before save; return HTTP 409 with `serverVersion`; inform user |

### MUST NOT

| Anti-pattern | Why |
|--------------|-----|
| SQL in route handlers | Repositories own DB access |
| Direct journal/GL writes outside `FinancialPostingService` | Bypasses period lock + balance validation |
| Missing `tenant_id` in queries | Cross-tenant data leakage |
| Edit `backend/src/financial/` or `backend/src/auth/permissions.ts` directly | AUTO-GENERATED from `shared/` |
| New report math in `components/` | Use `shared/report-engines/` |
| Broad `useAppContext()` in new UI | Use `useStateSelector`, domain hooks, or React Query |
| New endpoints on legacy `/api` | `/api` alias removed; `/api/v1` only |
| Commit `.env*`, `backend/dist/`, or backup files | Secrets and build artifacts |
| Drop columns/tables without migration plan | Data loss risk |
| Raw SQL errors to clients | Use `handleRouteError` / `sendFailure` |
| SQLite code, schemas, or sync logic | Deprecated — PostgreSQL only |
| New flat routes or flat services | Use module architecture |
| Duplicate financial/report calculations | Use `shared/financial-core/` and `shared/report-engines/` |
| Client-supplied `tenant_id` | Use `req.tenantId` from auth middleware |
| **Local-only state updates** | Multi-user ERP — changes must propagate to all org users |
| **Manual refresh as primary sync** | Real-Time First; F5 never required for consistency |
| **Refresh buttons as primary sync** | Supplementary only for new modules |
| **Polling-only sync** | Socket events required; polling is fallback only |
| **Unscoped broadcasts** | Events must use `tenant:${tenantId}` room only |

---

## 2. Runtime Architecture

**Single source of truth:** PostgreSQL.

### Desktop Edition

```
Electron → React → apiClient (/api/v1) → Express API → modules (routes→services→repositories) → FinancialPostingService → PostgreSQL
```

### Cloud Edition

```
Browser → React → apiClient (/api/v1) → Express API → modules (routes→services→repositories) → FinancialPostingService → PostgreSQL
```

### Backend

```
Express API → Modules → Services → Repositories → PostgreSQL
```

**Shared packages** (`shared/financial-core/`, `shared/report-engines/`, `shared/rbac/`) are the single source of truth for calculation and permission definitions.

**Real-Time First:** PBooks Pro is multi-user. Every business mutation must propagate to all connected clients in the same tenant via Socket.IO — mandatory, not optional. See [§ Real-Time First Architecture](#real-time-first-architecture-mandatory).

### Editions & Environments

| Edition / Environment | Client | API port | Database |
|----------------------|--------|----------|----------|
| Desktop Edition (production) | Electron | **3000** | `pbookspro` |
| Desktop Edition (staging) | Electron | **3001** | `pBookspro_Staging` |
| Cloud Edition | Browser | **3000** / **3001** | PostgreSQL |
| API server only | — | **3000** / **3001** | PostgreSQL + migrations on startup |

**Ports:** staging = **3001**, production = **3000**. Never mix.

> **Deprecated:** Offline SQLite (`VITE_LOCAL_ONLY`, `sqliteBridge`, `services/database/`). Do not use or extend.

---

## Real-Time First Architecture (Mandatory)

PBooks Pro is a **multi-user ERP**. Multiple users work simultaneously within the same organization. **Real-time synchronization is mandatory** — never implement features that only update the local screen without propagating to every connected client in the same tenant.

**Full reference:** [`doc/ARCHITECTURE.md`](ARCHITECTURE.md#real-time-first-architecture)

### Every business entity mutation MUST

1. **Save to PostgreSQL** — transaction committed before emitting
2. **Record audit trail** — `withAudit()` or `recordDomainMutation()`
3. **Emit tenant-scoped event** — `emitEntityEvent()` or `emitFinancialPosted()`
4. **Notify connected clients** — Socket.IO via `initRealtime()` → `tenant:${tenantId}` room
5. **Refresh affected screens automatically** — React Query invalidation + AppContext merge; no manual page refresh

**Examples:** contracts, payments, invoices, vendor bills, receipts, journal entries, properties, leads, customers, vendors, quotations, POs, retention releases, IPC bills, BOQs, and all other tenant-scoped entities.

### MUST NOT (real-time)

| Anti-pattern | Why |
|--------------|-----|
| Local-only state updates | Other sessions never see changes |
| Manual refresh dependencies | Violates Real-Time First |
| Screen refresh buttons as primary sync | Supplementary only |
| Polling-only solutions | Socket events required for mutations |
| Tenant-wide broadcasts without tenant filtering | Cross-tenant leakage |

### Event architecture standard

**No mutation is complete until the event is emitted.**

```
Repository → Service → withAudit() / recordDomainMutation() → emitEntityEvent() → Real-Time Gateway → Connected Clients
```

| Component | Path |
|-----------|------|
| Real-time gateway | `backend/src/core/realtime.ts` — `initRealtime()`, `emitEntityEvent()`, `emitFinancialPosted()` |
| Audit + change_log | `backend/src/core/recordDomainMutation.ts`, `backend/src/core/AuditMutation.ts` |
| LWW helpers | `backend/src/core/entityMutation.ts` → `assertLwwVersion()` in `backend/src/services/changeLogService.ts` |
| Route reference | `backend/src/modules/vendors/routes/billsRoutes.ts` |
| Socket client | `core/socket.ts` — `connectRealtimeSocket()`, `getRealtimeSocket()` |
| Global listener | `context/AppContext.tsx` — `entity_created` / `entity_updated` / `entity_deleted` / `financial.posted` |
| Change log merge | `services/api/changeLogMerge.ts` |

**Socket events:** `entity_created`, `entity_updated`, `entity_deleted`, `financial.posted`.

**Required semantic event types:** `created`, `updated`, `deleted`, `approved`, `rejected`, `posted`, `reversed`, `status_changed`. Map lifecycle transitions to `emitEntityEvent(..., 'updated', …)` with appropriate audit actions until dedicated socket names exist.

### Tenant isolation

Events must include: **`tenantId`**, **entity type**, **entity id**, **event type** (`action`), **timestamp** (`ts`), **version** (in `data` when LWW-enabled). Never cross tenant boundaries — server joins `tenant:${tenantId}`; clients filter `payload.tenantId !== currentTenantId`.

### Frontend synchronization rules

- Subscribe to tenant events via shared socket (`core/socket.ts`)
- On event: `queryClient.invalidateQueries(...)` or `setQueryData(...)` — reference: `hooks/useUserNotifications.ts`, `modules/executive-mobile/hooks/useMobileNotifications.ts`
- Invalidate dashboards, lists, and open forms when safe (respect LWW `version`)
- Manual page refresh never required

### React Query integration

New server-backed hooks **must** wire socket listeners that invalidate or patch the relevant query keys. Implement automatically for new modules.

### Optimistic locking

- Entities with `version` + `updated_at`: validate via `checkEntityLwwConflict()` before save
- HTTP **409** `CONFLICT` with `{ serverVersion }` on stale write
- Inform the user — do not silently overwrite

### Agent enforcement

If a feature is requested **without** real-time sync, the agent **must** add:

1. `emitEntityEvent()` (or `emitFinancialPosted()`) after mutation commit
2. Frontend subscription to relevant socket events
3. React Query cache invalidation (or targeted `setQueryData`)
4. LWW conflict handling when the entity has `version`

---

## 3. Database Standard

PBooks Pro uses **PostgreSQL** as the single database engine for Desktop Edition, Cloud Edition, staging, and production.

SQLite is **not** part of the active architecture and must **not** be used for:

- New features
- New schemas
- New migrations
- New repositories
- New synchronization logic

Legacy SQLite components (`sqliteBridge`, `VITE_LOCAL_ONLY`, `services/database/schema.ts`, `electron:extract-schema`, SQLite sync services) are **@deprecated** and scheduled for removal.

---

## 4. Architecture Enforcement Rules

The AI agent **MUST**:

- Follow Architecture v2.1 exactly
- Refuse to introduce alternative architectural patterns
- Refuse to create new flat routes
- Refuse to create new flat services
- Refuse direct SQL in route handlers
- Refuse bypassing repositories
- Refuse bypassing `FinancialPostingService`
- Refuse creating duplicate financial calculations
- Refuse creating duplicate report calculations
- Refuse creating new database technologies
- Refuse creating SQLite-specific code
- Refuse creating new APIs outside `/api/v1`
- Refuse client-supplied `tenant_id` usage

If a requested implementation conflicts with architecture rules, the agent must:

1. Explain the violation
2. Propose the architecture-compliant implementation
3. Continue using the approved architecture

---

## 5. Financial Reporting Rules

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

## 6. Core Business Domains

The following are first-class domains and must be implemented under `backend/src/modules/`:

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

---

## 7. Where to Put New Code

| Concern | Location |
|---------|----------|
| REST endpoints | `backend/src/modules/<domain>/routes/` |
| Business logic | `backend/src/modules/<domain>/services/` |
| DB access | `backend/src/modules/<domain>/repositories/` (extends `TenantRepository`) |
| GL / journal writes | `FinancialPostingService` only |
| DB schema | `database/migrations/NNN_name.sql` (PostgreSQL only) |
| Financial calculation | `shared/financial-core/` |
| Report calculation | `shared/report-engines/` |
| RBAC permissions | `shared/rbac/permissions.ts` |
| API client | `services/api/repositories/` or `services/api/*Api.ts` |
| UI pages | `components/<domain>/` or `modules/<feature>/` |
| Server-backed hooks | `hooks/queries/` |
| Navigation | `Page` in `types.ts`, `PAGE_GROUPS` + lazy import in `App.tsx`, Sidebar |
| Custom report builder | `backend/src/modules/reporting/` |
| Documents (files) | `DocumentStorageService` + `document_metadata` (R2) — not inline BLOBs |

---

## 8. Backend Rules

### Pattern

```
modules/<domain>/routes/       ← HTTP, Zod validation, sendSuccess/handleRouteError
modules/<domain>/services/     ← orchestration, rowTo*Api mapping
modules/<domain>/repositories/ ← SQL via TenantRepository
```

Legacy `backend/src/routes/*.ts` are **@deprecated re-exports only** — do not add new handlers there.

### Core Infrastructure

- **`TenantRepository`** — constructor `(tenantId, client?)`; `query()`, `softDelete()`, `activeOnly()`
- **`recordDomainMutation()`** — audit_events + change_log (+ optional sync_queue)
- **`withAudit()`** — transactional audit wrapper; delegates to `recordDomainMutation()`
- **`FinancialPostingService`** — balanced entries, accounting period enforcement, `JournalRepository`
- **`assertLwwVersion()`** — via `checkEntityLwwConflict()` on upserts where entity has `version`
- **`emitEntityEvent()`** — mandatory after business mutations; `emitFinancialPosted()` for GL — `backend/src/core/realtime.ts`

### Mutation pipeline (real-time)

Every business mutation in routes/services:

```
1. withTransaction (when multi-step)
2. checkEntityLwwConflict() — if entity has version and client sends version
3. Repository write (PostgreSQL)
4. withAudit() or completeEntityMutation() / recordDomainMutation()
5. emitEntityEvent(tenantId, action, entityType, { data, sourceUserId: req.userId })
6. sendSuccess — or sendFailure 409 CONFLICT with serverVersion on LWW conflict
```

Reference: `backend/src/modules/vendors/routes/billsRoutes.ts`

### Accounting Periods

| Status | Behavior |
|--------|----------|
| `open` | Full write access |
| `closed` | Mutations rejected |
| `locked` | Rejected unless `super_admin` override |

### Middleware Chain (authenticated `/api/v1`)

1. `authMiddleware` → `req.userId`, `req.tenantId`, `req.role`
2. `requireActiveSubscription()`
3. Optional: RBAC / financial-write / payroll guards
4. `auditRequestContextMiddleware`
5. Per-endpoint: `requirePermission('feature.action')`

### New REST Endpoint Checklist

1. Migration in `database/migrations/`
2. `*Repository extends TenantRepository`
3. Service — pass `tenantId` explicitly
4. Thin route — Zod → service → `sendSuccess` / `handleRouteError`
5. Register in `mountVersionedApi.ts`
6. Mutations: `withAudit()` or `recordDomainMutation()` + **`emitEntityEvent()`** (mandatory)
7. GL: `FinancialPostingService` only
8. Permissions: `shared/rbac/permissions.ts` → `npm run build:backend`
9. Real-time: event after commit; 409 on LWW conflict

### API Response Contract

```typescript
sendSuccess(res, data);
handleRouteError(res, e, { route: 'GET /feature' });
sendFailure(res, 400, 'BAD_REQUEST', 'Clear user-facing message');
```

Envelope: `{ success, data?, error? }`. DB snake_case → camelCase JSON via `rowTo*Api()`.

### Reference Backend Features (copy these)

- **Financial posting:** `FinancialPostingService` → `JournalRepository` → `assertAccountingPeriodOpen`
- **Domain CRUD:** `modules/vendors/repositories/BillRepository.ts`
- **Dashboard:** `modules/dashboard/` → `GET /dashboard/snapshots`
- **Custom reports:** `modules/reporting/`
- **Documents:** `DocumentStorageService` + R2

---

## 9. Frontend Rules

### State Management (pick one layer)

| Layer | Use when |
|-------|----------|
| `useStateSelector` / `context/domains/` hooks | AppContext slices — **preferred for new code** |
| React Query (`hooks/queries/`) | Server-fetched data, snapshots, reports |
| Zustand (`stores/`) | Ephemeral UI-only state |
| AppContext reducer | Core entities that persist via API sync |

Do **not** duplicate server KPI/report data in AppContext when a React Query hook exists.

### API Client

- Singleton: `services/api/client.ts` (`apiClient`)
- Base URL: `/api/v1` via `config/apiUrl.ts` `normalizeApiBaseUrl()`
- Per-entity: `services/api/repositories/*Api.ts` with `normalize*FromApi()`

### Report & Financial UI

- **Calculation:** `shared/report-engines/` and `shared/financial-core/` only
- **`components/reports/`:** preview/format + re-export shims — **no new calculation logic**
- **Dashboard:** `useDashboardSnapshots` → `GET /dashboard/snapshots`

### Navigation (not React Router)

1. Add to `Page` union in `types.ts`
2. `PAGE_GROUPS` + `lazyWithRetry` in `App.tsx`
3. Sidebar / `utils/appNavigation.ts`

### New Frontend Feature Checklist

1. Types in `types/` or `types.ts`
2. API repo in `services/api/`
3. React Query hook in `hooks/queries/` (if server-backed)
4. UI in `components/<domain>/` or `modules/<feature>/`
5. Navigation wiring
6. Permissions via `usePermissions()`
7. **Real-time:** socket listener → `invalidateQueries` / `setQueryData` for entity query keys (`core/socket.ts`, pattern in `hooks/useUserNotifications.ts`)

### Real-Time Frontend Rules

- Use shared socket: `connectRealtimeSocket()` (login) / `getRealtimeSocket()` (hooks)
- Filter by `payload.tenantId === currentTenantId`
- On `entity_*` events: invalidate affected React Query keys; AppContext handles core entities in `context/AppContext.tsx`
- Incremental sync merge: `services/api/changeLogMerge.ts`
- Never rely on manual page refresh or refresh buttons as primary sync

### Styling

- Tailwind + tokens from `styles/design-tokens.css`
- Icons: `lucide-react`
- Entity modals: `hooks/useEntityFormModal`
- Design system: `doc/DESIGN_SYSTEM.md`

---

## 10. Data Layer Rules

### PostgreSQL (single database engine)

- Migrations: lexicographic order via `backend/src/migrate.ts`
- All tenant tables: `tenant_id` + index on `(tenant_id, …)`
- Soft delete: `deleted_at` + `deleted_by` via `TenantRepository.softDelete()`
- Multi-step writes: `withTransaction(client => …)`
- **Never** add SQLite migrations or schema for new features

### Shared Packages

| Edit here | Generated copy (do not edit) |
|-----------|------------------------------|
| `shared/financial-core/` | `backend/src/financial/` |
| `shared/report-engines/` | `backend/src/reportEngines/index.ts` (build via `ensure-shared-report-engines.mjs`) |
| `shared/rbac/permissions.ts` | `backend/src/auth/permissions.ts` |

After editing `shared/`: `npm run build:backend`

### New Report Checklist

1. Engine in `shared/report-engines/` (no React imports)
2. Re-export shim in `components/reports/` if needed
3. Backend `*ReportService.ts` importing from `reportEngines/index.ts` or module service
4. Route under `/api/v1/reports/` with RBAC
5. Custom/dynamic reports: extend `modules/reporting/`

### Documents

- Metadata: `document_metadata` table
- Files: R2 via `DocumentStorageService` — never new inline `file_data` columns

### Change Log Sync (API path)

- `change_log` written by `recordDomainMutation()` and bulk mutation services
- LWW: compare `version` + `updated_at`; return 409 on conflict
- Client merge: `services/api/changeLogMerge.ts`

### Legacy SQLite (deprecated — do not extend)

| Component | Location |
|-----------|----------|
| SQLite bridge | `electron/sqliteBridge.cjs` |
| Local schema | `services/database/schema.ts` |
| Schema extraction | `npm run electron:extract-schema` |
| Offline flag | `VITE_LOCAL_ONLY` / `isLocalOnlyMode()` |
| SQLite sync | `services/database/schemaSync.ts` |

---

## 11. Full-Stack Feature Flow

Use this sequence for every new feature:

```
1.  database/migrations/NNN_feature.sql
2.  backend/src/modules/<domain>/repositories/FeatureRepository.ts
3.  backend/src/modules/<domain>/services/featureService.ts
4.  backend/src/modules/<domain>/routes/featureRoutes.ts
5.  Register in mountVersionedApi.ts
6.  services/api/featureApi.ts (or repositories/*Api.ts)
7.  hooks/queries/useFeature.ts          (if server-backed)
8.  components/<domain>/FeaturePage.tsx
9.  types.ts Page union + App.tsx + Sidebar
10. Mutations: withAudit/recordDomainMutation + **emitEntityEvent()**; GL: FinancialPostingService
11. Frontend: React Query hook invalidates on socket events for entity type
```

---

## 12. Strangler Migration (when touching legacy code)

| Legacy (do not extend) | v2.1 (use instead) |
|------------------------|-------------------|
| Inline SQL in flat `services/` | Module repository + service |
| `backend/src/routes/` new handlers | `modules/<domain>/routes/` |
| Direct `*JournalPostingService` GL | `FinancialPostingService` |
| Ad hoc `appendAuditEvent` | `withAudit()` / `recordDomainMutation()` |
| Client KPI scans | `analytics_snapshots` + dashboard API |
| Inline document BLOBs | `document_metadata` + R2 |
| SQLite / `services/legacy-sqlite*` | **Removed** (Phase 6) — use PostgreSQL via module repositories |

When fixing legacy code, **delegate to module layers** rather than adding inline SQL.

---

## 13. Post-Launch — Do Not Implement Unless Requested

These are tracked in `doc/ARCHITECTURE_V2_POST_LAUNCH.md`:

- PostgreSQL RLS (`SET app.tenant_id`)
- BullMQ + Redis job queues
- Full CQRS / event sourcing
- Field-level sync conflict resolution
- Direct backend TS imports of `shared/report-engines` (retire esbuild bundles)
- Payroll → `journal_entries` unification (payroll ledger remains separate)

---

## 14. Environment & Release

- Staging: `staging` branch, port **3001**, DB `pBookspro_Staging`, `.env.staging`
- Production: `main` branch, port **3000**, DB `pbookspro`, `.env.production`
- Release: `npm run release:staging` / `npm run release:production`
- See `.cursor/rules/commands.mdc` for full workflow

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
- [ ] Event scoped to tenant room; payload includes `tenantId`, entity type, id, action, `ts`
- [ ] Entity `version` in payload when LWW-enabled
- [ ] No cross-tenant event leakage
- [ ] Frontend subscribes via `core/socket.ts`
- [ ] React Query caches invalidated or patched on relevant socket events
- [ ] Screens refresh without manual page reload
- [ ] No local-only updates for shared business entities
- [ ] No refresh button as primary sync for new modules
- [ ] Not polling-only for mutation propagation
- [ ] LWW: `checkEntityLwwConflict()` before upsert when entity has `version`
- [ ] HTTP 409 with `serverVersion` on conflict; user informed
- [ ] Lifecycle events (approved, rejected, posted, reversed, status_changed) emit appropriately
- [ ] Agent added emit + subscription + invalidation if feature lacked real-time sync
