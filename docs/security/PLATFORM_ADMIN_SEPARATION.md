# Platform Administration / Tenant Isolation — Security Validation Matrix

## Problem

A tenant **Super Admin** could open **Settings → Subscription Admin / System Health Center /
Referral Admin** in the customer client and view cross-tenant platform data (every tenant's
billing, system health, referral program). Root cause: the tenant RBAC role `super_admin` is
**per-tenant** (seeded per tenant in `rbac_roles`, stored in `user_tenants.role`), yet the
platform-admin dashboards and their `/admin/*` APIs were mounted on the **tenant API** and
gated only by `requireRole('super_admin')` — which resolves that tenant role. Every tenant's
Super Admin therefore passed the check.

## Fix summary

- **Permission:** added `platform.admin` to the permission model
  ([shared/rbac/permissions.ts](../../shared/rbac/permissions.ts)). It is **excluded from
  `ALL_PERMISSIONS` and granted to no `EnterpriseRole`**, so no tenant token — including a
  tenant Super Admin — can ever hold it. The module registry maps the three platform sections
  to it ([shared/rbac/modulePermissions.ts](../../shared/rbac/modulePermissions.ts)).
- **Tenant API:** the four cross-tenant routers (subscriptions, referrals, email-automation,
  monitoring) were **removed** from `mountVersionedApi`
  ([backend/src/routes/mountVersionedApi.ts](../../backend/src/routes/mountVersionedApi.ts)).
  A defense-in-depth guard `requirePlatformAdmin`
  ([backend/src/middleware/rbacMiddleware.ts](../../backend/src/middleware/rbacMiddleware.ts))
  fails closed for any cross-tenant route accidentally mounted on the tenant API.
- **Admin portal:** the routes were relocated under `/api/admin/*` behind `adminAuthMiddleware`
  (the separate `admin_users` table) in
  [backend/src/modules/admin-portal/routes/](../../backend/src/modules/admin-portal/routes/);
  sensitive writes additionally require `requireAdminPortalSuperAdmin()`.
- **Client app:** the three dashboards, their tenant-API service clients, and the Settings menu
  entries/render branches were deleted. The dashboards were re-implemented in the admin SPA
  (`admin/src/components/{subscriptions,referrals,monitoring}`).

## Validation matrix

Legend: ✅ allowed / ❌ blocked. "Tenant Super Admin" = a tenant user whose role resolves to
`super_admin`. "Platform Admin" = an authenticated `admin_users` account in the admin portal.

| Capability | Surface | Menu visible (tenant) | Tenant route reachable | Tenant API reachable | Platform admin access | Tenant isolated |
|---|---|---|---|---|---|---|
| Subscription Admin | `/api/v1/admin/subscriptions/*` (removed) → `/api/admin/subscriptions/*` | ❌ | ❌ (404) | ❌ (`platform.admin` denied / route gone) | ✅ (admin portal) | ✅ |
| System Health Center | `/api/v1/admin/monitoring/*` (removed) → `/api/admin/monitoring/*` | ❌ | ❌ (404) | ❌ | ✅ (admin portal) | ✅ |
| Referral Admin | `/api/v1/admin/referrals/*` (removed) → `/api/admin/referrals/*` | ❌ | ❌ (404) | ❌ | ✅ (admin portal) | ✅ |
| Email Automation Admin | `/api/v1/admin/email-automation/*` (removed) → `/api/admin/email-automation/*` | ❌ (no tenant UI) | ❌ (404) | ❌ | ✅ (admin portal) | ✅ |
| Tenant Management | `/api/admin/tenants/*` | ❌ (never in client) | n/a | ❌ (admin portal only) | ✅ | ✅ |
| License Administration | `/api/admin/licenses/*` | ❌ | n/a | ❌ (admin portal only) | ✅ | ✅ |
| Platform monitoring (system metrics) | `/api/admin/system-metrics/*` | ❌ | n/a | ❌ (admin portal only) | ✅ | ✅ |
| Liveness / readiness | `/api/v1/health`, `/health/ready` | n/a | ✅ (public, no tenant data) | ✅ | ✅ | ✅ (no tenant data) |
| Client telemetry / error ingest | `/api/v1/monitoring/client-errors`, `/telemetry` | n/a | ✅ (write-only, own tenant) | ✅ | n/a | ✅ (scoped to caller's tenantId) |

## Enforcement points

1. **Navigation visibility** — Settings menu no longer renders the three platform sections; the
   gate (`platform.admin`) can never be satisfied by a tenant token, and the entries + render
   branches were removed entirely.
2. **Route / direct URL** — `activeCategory` branches for `admin-subscriptions` /
   `admin-monitoring` / `admin-referrals` were deleted, so a forced category id renders nothing.
3. **API** — the `/admin/*` cross-tenant routers are not mounted on the tenant API (404).
   `requirePlatformAdmin` is available as a fail-closed guard for any future cross-tenant route.
4. **Super-admin isolation** — `super_admin` is per-tenant and cannot hold `platform.admin`.
   Platform administration is a distinct identity (`admin_users` + `adminAuthMiddleware`),
   reachable only via `/api/admin/*`.

## Cross-tenant audit (tenant API)

- The four relocated routers were the only tenant-API routes returning multi-tenant data.
- `TenantListRepository.listAllTenantIds` is used only by the background
  `dashboardSnapshotScheduler` (no route exposure).
- `monitoringPublicRouter` exposes only liveness/readiness (no tenant data);
  `monitoringIngestRouter` is write-only and scoped to the caller's own `tenantId`.

## Regression guards

- No `EnterpriseRole` set includes `platform.admin`; it is excluded from `ALL_PERMISSIONS`
  (`super_admin = new Set(ALL_PERMISSIONS)` therefore never receives it).
- A unit test asserts `roleHasPermission(role, 'platform.admin') === false` for every enterprise
  role (see backend RBAC tests).
