# A5.1.6C — Production Hotfix Report (Router Mounting)

**Phase:** A5.1.6C hotfix  
**Classification:** B — Incorrect middleware mounting  
**Date:** 2026-06-19  
**Authority:** [`RBAC_V2_ROLLBACK_PLAN.md`](./RBAC_V2_ROLLBACK_PLAN.md), Architecture V2.1 (`mountVersionedApi.ts`)

---

## Executive summary

Production pilot with partial RBAC V2 flags enabled caused **503 `FEATURE_DISABLED`** on nearly all authenticated ERP routes (`/accounts`, `/projects`, `/properties`, payroll, dashboard, etc.). Login succeeded; business APIs failed.

**Root cause:** `dataScopeRouter` and `approvalMatrixRouter` were mounted on the **global** `/api/v1` prefix. Each router applies `router.use(featureGate)` that returns **503 without `next()`** when its feature flag is off. Every request hit the data-scope gate before reaching legacy ERP routers.

**Fix:** Mount both routers on **dedicated prefixes** only:

- `/api/v1/rbac/scopes/*`
- `/api/v1/rbac/approval-matrix/*`

Public URLs are unchanged. Authorization logic, scopes, and approval-matrix behavior are **not** modified.

---

## Production flag state (incident)

```env
RBAC_V2_ROLE_MANAGEMENT=true
RBAC_V2_SOD=true
RBAC_V2_BREAK_GLASS=true
RBAC_V2_AUTHORIZATION_ENGINE=false
RBAC_V2_DATA_SCOPE=false
RBAC_V2_APPROVAL_MATRIX=false
```

**Observed response** on `GET /api/v1/accounts`:

```json
{
  "success": false,
  "error": {
    "code": "FEATURE_DISABLED",
    "message": "RBAC v2 data scope is not enabled"
  }
}
```

Message matches `requireDataScopeFeature` in `dataScopeRoutes.ts` (line 23).

---

## Root cause analysis

### Call chain (before fix)

```
GET /api/v1/accounts
  → mountVersionedApi global middleware (pass)
  → securityRoleRouter / breakGlassRouter (pass — flags on)
  → dataScopeRouter mounted at prefix=/api/v1
      → requireDataScopeFeature (RBAC_V2_DATA_SCOPE=false)
      → 503 FEATURE_DISABLED — stop
  → accountsRouter (never reached)
```

Same pattern would block ERP routes when `RBAC_V2_APPROVAL_MATRIX=false` once data scope was bypassed (e.g. by enabling scope without fixing mounts).

### Why env-only rollback was insufficient

| Workaround | Result |
|------------|--------|
| Keep `DATA_SCOPE=false` | ERP blocked at dataScopeRouter gate |
| Set `DATA_SCOPE=true` only | `CONFIGURATION_ERROR` (requires `AUTHORIZATION_ENGINE`) |
| Enable scope + engine | Still blocked at `approvalMatrixRouter` unless matrix also enabled |

**Conclusion:** Router mounting must be corrected; flag rollback alone cannot restore ERP.

---

## Fix implemented

### 1. `mountVersionedApi.ts`

**Before:**

```typescript
app.use(prefix, authMiddleware, requireActiveSubscription(), dataScopeRouter);
app.use(prefix, authMiddleware, requireActiveSubscription(), approvalMatrixRouter);
```

**After:**

```typescript
app.use(`${prefix}/rbac/scopes`, authMiddleware, requireActiveSubscription(), dataScopeRouter);
app.use(`${prefix}/rbac/approval-matrix`, authMiddleware, requireActiveSubscription(), approvalMatrixRouter);
```

### 2. `dataScopeRoutes.ts` — paths relative to mount

| Public URL | Router path (unchanged externally) |
|------------|-------------------------------------|
| `GET /api/v1/rbac/scopes/users/:userId` | `GET /users/:userId` |
| `PUT /api/v1/rbac/scopes/users/:userId` | `PUT /users/:userId` |
| `DELETE /api/v1/rbac/scopes/:scopeId` | `DELETE /:scopeId` |

`requireDataScopeFeature` remains on the router; only scope admin URLs hit it.

### 3. `approvalMatrixRoutes.ts` — paths relative to mount

| Public URL | Router path |
|------------|-------------|
| `GET /api/v1/rbac/approval-matrix` | `GET /` |
| `GET /api/v1/rbac/approval-matrix/users/:userId/capabilities` | `GET /users/:userId/capabilities` |
| `PUT /api/v1/rbac/approval-matrix/rules` | `PUT /rules` |
| `POST /api/v1/rbac/approval-matrix/assignments` | `POST /assignments` |
| `DELETE /api/v1/rbac/approval-matrix/assignments/:assignmentId` | `DELETE /assignments/:assignmentId` |

### 4. Frontend API clients

No changes required. Clients already call `/rbac/scopes/...` and `/rbac/approval-matrix/...`:

- `services/api/securityDataScopeApi.ts`
- `services/api/securityApprovalMatrixApi.ts`

---

## Behavior preservation (flags enabled)

When `RBAC_V2_DATA_SCOPE=true` and `RBAC_V2_AUTHORIZATION_ENGINE=true`:

- Scope admin endpoints behave as before (same URLs, same gates, same permissions).
- Repository scope enforcement (`dataScopeEnforcement`) is unchanged.

When `RBAC_V2_APPROVAL_MATRIX=true` and engine enabled:

- Approval-matrix admin endpoints behave as before.

When flags are **disabled**:

- **ERP routes** (`/accounts`, `/projects`, etc.) proceed to their routers.
- **RBAC admin endpoints** under `/rbac/scopes/*` and `/rbac/approval-matrix/*` return **503 `FEATURE_DISABLED`** (expected).

---

## Regression tests

**File:** `backend/src/routes/mountVersionedApi.rbacFeatureMount.test.ts`

| Test | Assertion |
|------|-----------|
| Static mount — data scope | `dataScopeRouter` on `` `${prefix}/rbac/scopes` ``, not global `prefix` |
| Static mount — approval matrix | `approvalMatrixRouter` on `` `${prefix}/rbac/approval-matrix` `` |
| `DATA_SCOPE=false` | `GET /api/v1/accounts` ≠ `FEATURE_DISABLED` |
| `APPROVAL_MATRIX=false` | `GET /api/v1/accounts` ≠ `FEATURE_DISABLED` |
| `DATA_SCOPE=false` | `GET /api/v1/rbac/scopes/users/:id` → `FEATURE_DISABLED` |
| `APPROVAL_MATRIX=false` | `GET /api/v1/rbac/approval-matrix` → `FEATURE_DISABLED` |

Run:

```powershell
cd backend
node --import tsx --test src/routes/mountVersionedApi.rbacFeatureMount.test.ts
```

---

## Post-deploy verification

After deploy to Render (or production API):

1. Confirm env flags match pilot (scope/matrix off, role management on).
2. Authenticated `GET /api/v1/accounts` → **200** or **403** (permission), **not** 503 `FEATURE_DISABLED`.
3. `GET /api/v1/rbac/scopes/users/{id}` → **503** `FEATURE_DISABLED` (expected while scope off).
4. Smoke: `/projects`, `/dashboard/*`, `/users` — no data-scope gate message.

---

## Out of scope (not changed)

- `requireDataScopeFeature` / `requireApprovalMatrixFeature` logic
- Repository data-scope enforcement when flags effectively enabled
- `securityRoleRouter`, `breakGlassRouter` (still global mount; pass with current pilot flags)
- Authorization engine (`RBAC_V2_AUTHORIZATION_ENGINE`) — remains false per pilot plan

**Note:** Disabling `RBAC_V2_ROLE_MANAGEMENT` would still block ERP at `securityRoleRouter` before data scope. That is a separate global-mount pattern; this hotfix addresses **data scope** and **approval matrix** only.

---

## Files changed

| File | Change |
|------|--------|
| `backend/src/routes/mountVersionedApi.ts` | Dedicated prefix mounts |
| `backend/src/modules/rbac/routes/dataScopeRoutes.ts` | Relative route paths |
| `backend/src/modules/rbac/routes/approvalMatrixRoutes.ts` | Relative route paths |
| `backend/src/routes/mountVersionedApi.rbacFeatureMount.test.ts` | Regression tests |
| `backend/package.json` | Include new test in `npm test` |
| `docs/security/A5_1_6C_HOTFIX_REPORT.md` | This document |

---

## Rollout recommendation

1. Deploy hotfix to production API.
2. Re-run pilot with existing flag matrix (no need to enable `DATA_SCOPE` / `APPROVAL_MATRIX` for ERP recovery).
3. Enable scope/matrix flags only when ready per [`A5_1_6C_PRE_CUTOVER_CHECKLIST.md`](./A5_1_6C_PRE_CUTOVER_CHECKLIST.md) (engine + monitoring).

**Hotfix status:** Ready for production deploy.
