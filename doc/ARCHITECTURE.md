# PBooks Pro — Architecture Guide

Single reference for new development. Mirrors the four Cursor agent rules: **Overview**, **Backend**, **Frontend**, and **Data Layer**.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Backend Architecture](#2-backend-architecture)
3. [Frontend Architecture](#3-frontend-architecture)
4. [Data Layer Architecture](#4-data-layer-architecture)

---

## 1. Architecture Overview

PBooks Pro is a monorepo: React/Vite frontend at repo root, Express/PostgreSQL backend in `backend/`, Electron shell in `electron/`, shared logic in `shared/`.

### Layer Stack

```
Electron (electron/) → React app (root) → apiClient / SQLite IPC → Express API (backend/src/) → PostgreSQL
```

### Runtime Modes

| Mode | Trigger | Data path |
|------|---------|-----------|
| Offline SQLite | `VITE_LOCAL_ONLY=true` | Electron → `sqliteBridge` → `services/database/` |
| LAN/API client | `VITE_LOCAL_ONLY=false` | `apiClient` → Express :3000 (prod) / :3001 (staging) → PostgreSQL |
| API server only | `backend/dist/index.js` | PostgreSQL + migrations on startup |

Never mix ports: staging = **3001**, production = **3000** (enforced in `services/api/client.ts`).

### Where to Put New Code

| Concern | Location |
|---------|----------|
| REST endpoints | `backend/src/routes/` → `backend/src/services/` |
| DB schema (API) | `database/migrations/NNN_name.sql` |
| DB schema (SQLite) | `services/database/schema.ts` → `npm run electron:extract-schema` |
| API client | `services/api/repositories/` or `services/api/*Api.ts` |
| UI pages | `components/<domain>/` |
| Navigation | `Page` union in `types.ts`, `PAGE_GROUPS` + lazy import in `App.tsx`, Sidebar |
| Shared RBAC / financial cores | `shared/` or `services/financialEngine/` (synced to backend) |
| Report engines | `components/reports/*Engine.ts` (bundled to `backend/dist/*.mjs`) |
| Custom report builder | `backend/src/modules/reporting/` |
| Self-contained modules | `modules/<feature>/` (hooks + UI colocated) |

### Reference Features (copy these patterns)

- **Dashboard metrics:** `dashboardMetricsRoutes` → `services/dashboard/` → `dashboardMetricsApi.ts` → `hooks/queries/` → `components/analytics/`
- **Project expense vouchers:** RBAC per endpoint, service state machine, `withTransaction`, `emitEntityEvent`
- **Custom reports:** `modules/reporting/` (metadata → SQL compiler → repository → service)

### Anti-Patterns

- SQL in route handlers — services own all DB access
- Missing `tenant_id` in queries — data leakage across orgs
- Editing AUTO-GENERATED backend files — edit source in `shared/` or `services/financialEngine/` and run `npm run build:backend`
- Broad `useAppContext()` in new code — use `useStateSelector` or domain hooks (`context/domains/`)
- Committing `backend/dist/`, `.env*`, or backup files

---

## 2. Backend Architecture

### Pattern: Routes → Services

Routes are thin; services own SQL and business logic.

```
backend/src/routes/myFeatureRoutes.ts    ← HTTP, validation, pool lifecycle
backend/src/services/myFeatureService.ts ← SQL, rowTo*Api(), transactions
```

**Exception:** `backend/src/modules/reporting/` uses repositories + SQL compilers for custom reports.

### New REST Endpoint Checklist

1. Migration in `database/migrations/` (next sequential number)
2. `*Service.ts` — all queries filter `WHERE tenant_id = $N`; pass `tenantId` as explicit param (no `runWithTenantContext` helper)
3. `*Routes.ts` — use `AuthedRequest`; return via `sendSuccess` / `handleRouteError`
4. Register router in `backend/src/index.ts` with correct middleware stack
5. On mutations: `emitEntityEvent(tenantId, action, entityType, payload)` for live sync
6. New permissions: edit `shared/rbac/permissions.ts`, then `npm run build:backend`

### Middleware Chain (order matters)

**Public routes (no JWT):** `/health`, auth login, marketing, webhooks.

**Authenticated stack** (per router mount in `index.ts`):

1. `authMiddleware` → sets `req.userId`, `req.tenantId`, `req.role`
2. `requireActiveSubscription()`
3. Optional: `requirePermissionWhenPathStartsWith`, `requireFinancialWriteOnMutations`, `requirePayrollAccessForPayrollPaths`

**Per-endpoint:** `requirePermission('feature.action')` from `middleware/rbacMiddleware.ts`.

**Admin portal** (`/api/admin`): separate JWT via `adminPortal/` — not tenant-scoped.

### API Response Contract

```typescript
// Success
sendSuccess(res, data);

// Failure in catch
handleRouteError(res, e);

// Manual failure
sendFailure(res, 400, 'Clear user-facing message');
```

Envelope shape: `{ success, data?, error? }`.

### Data Mapping

DB snake_case → `rowTo*Api()` in service → camelCase JSON → frontend `normalize*FromApi()`.

### DB Access

- `getPool()` / `pool.connect()` from `backend/src/db/pool.ts`
- Multi-step writes: `withTransaction(client => …)`
- Never expose raw SQL errors to clients; log with `console.error`

### Report Services

Standard reports: load tenant state in `*ReportService.ts`, call shared engine from `backend/dist/*Engine.mjs` (synced from `components/reports/`).

---

## 3. Frontend Architecture

### State Management (pick the right layer)

| Layer | Use when |
|-------|----------|
| `useStateSelector` / domain hooks | Reading slices of AppContext (`context/domains/`) — **preferred for new code** |
| `useDispatchOnly()` | Component only dispatches, never reads state |
| React Query (`hooks/queries/`) | Server-fetched or report data; add keys to `queryKeys.ts` |
| Zustand (`stores/`) | Ephemeral UI state decoupled from AppContext (e.g. dashboard filters) |
| AppContext reducer | Core entities that must persist/sync (accounts, transactions, invoices) |

Do not duplicate server-fetched report data in AppContext when a React Query hook exists.

- Pure state transitions → `context/reducers/`
- I/O (hydration, socket, save) → `AppContext.tsx` provider

### API Client Layer

- Singleton: `services/api/client.ts` (`apiClient`) — JWT, tenant ID, base URL, error parsing
- Per-entity repos: `services/api/repositories/*Api.ts` with `normalize*FromApi()`
- Thin feature APIs: `services/api/*Api.ts` for non-CRUD endpoints

### Navigation (not React Router)

1. Add page to `Page` union in `types.ts`
2. Add to `PAGE_GROUPS` and lazy import in `App.tsx` (`lazyWithRetry`)
3. Wire Sidebar / `utils/appNavigation.ts` for deep links

### Component Organization

```
components/layout/     — Header, Sidebar, Footer
components/ui/           — design system primitives (see doc/DESIGN_SYSTEM.md)
components/<domain>/     — feature pages and modals
components/reports/      — report UIs + calculation engines
components/erp/            — shared table/skeleton patterns
modules/<feature>/       — self-contained feature (hooks + UI colocated)
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

### SQLite (local-only / Electron)

- Schema source: `services/database/schema.ts`
- Extracted: `electron/schema.sql` via `npm run electron:extract-schema`
- Runtime: `electron/sqliteBridge.cjs` (better-sqlite3, WAL, multi-company via `companyManager.cjs`)
- Browser fallback: sql.js + OPFS in `services/database/databaseService.ts`

When adding SQLite tables/columns, update `schema.ts` and re-extract — keep aligned with PostgreSQL migrations.

### Shared / Synced Code (source of truth → backend copy)

| Edit here | Auto-generated in backend | Regenerate |
|-----------|---------------------------|------------|
| `shared/rbac/permissions.ts` | `backend/src/auth/permissions.ts` | `npm run build:backend` |
| `services/financialEngine/*.ts` | `backend/src/financial/*.ts` | `scripts/ensure-shared-financial-cores.mjs` |
| `shared/payrollLedgerCore.ts` | `backend/src/services/payrollLedgerCore.ts` | same script |

**Never edit AUTO-GENERATED backend files directly.**

### Report Engines

Calculation logic lives on the frontend, bundled to backend:

```
components/reports/balanceSheetEngine.ts  →  backend/dist/balanceSheetEngine.mjs
```

Build runs `scripts/ensure-*-engine.mjs` before `tsc`. New report:

1. Engine in `components/reports/`
2. Ensure script in `scripts/`
3. `*ReportService.ts` in `backend/src/services/`
4. Route under `/api/reports/` with RBAC permission

Custom/dynamic reports: extend `backend/src/modules/reporting/` (metadata, SQL compiler, validators).

### Multi-Tenant Data Rules

- Every business table has `tenant_id`
- Services always receive `tenantId` as explicit parameter from `req.tenantId`
- Realtime: `emitEntityEvent(tenantId, …)` scopes Socket.IO events per org
- Demo tenants: see `constants/demoEnvironment.ts` for read-only / master-tenant rules

---

## Quick Reference: Full-Stack Feature Flow

```
1. database/migrations/NNN_feature.sql
2. backend/src/services/featureService.ts
3. backend/src/routes/featureRoutes.ts  (+ register in index.ts)
4. services/api/repositories/featureApi.ts
5. hooks/queries/useFeature.ts          (if server-backed)
6. components/<domain>/FeaturePage.tsx
7. types.ts Page union + App.tsx + Sidebar
```
