# A5.1.2.1 — Role Management Security Closure Report

**Phase:** A5.1.2.1 — Security hardening (no new features)  
**Date:** 2026-06-19  
**Authority:** [`A5_1_2_IMPLEMENTATION_REPORT.md`](./A5_1_2_IMPLEMENTATION_REPORT.md), [`RBAC_2_ARCHITECTURE_V2.md`](./RBAC_2_ARCHITECTURE_V2.md)

---

## Summary

This closure resolves all High (H1–H4) and Medium (M1, M2, M3, M5) findings from the A5.1.2 security review. Changes are validation-order fixes, permission hardening, archive/restore contract enforcement, effective-union filtering, system-role API blocks, SoD Point #3 holder checks, and automated tests. Feature flag **`RBAC_V2_ROLE_MANAGEMENT`** remains default `false`.

---

## Findings Resolved

| ID | Finding | Resolution |
|----|---------|------------|
| **H1** | Bundle expansion not guaranteed before delegation / ceiling / SoD | `runRolePermissionValidation()` expands actor + target via `expandBundles()` **first**, then `assertCanDelegateExpanded` → `assertWithinPrivilegeCeiling` → `findSodViolation` |
| **H2** | Template instantiate path must use full pipeline; `DELEGATION_DENIED` must be reachable | `securityInstantiateTemplate()` calls `runRolePermissionValidation()`; test proves under-privileged actor gets `DelegationDeniedError` |
| **H3** | RBAC audit endpoint used `roles.view` instead of dedicated permission | `GET /security/roles-audit` now uses `requireRbacAuditRead()` → `audit_logs.rbac.read` |
| **H4** | Archive / restore security contract undefined | Documented + implemented: deactivate assignments on archive, SoD revalidation before restore, `assertRoleMutable()` blocks edits on archived roles |
| **M1** | Effective union ignored `is_active` / `expires_at` | `listActiveUserRoleAssignments()` / `listActiveUserRolesExpanded()` filter `is_active = TRUE AND (expires_at IS NULL OR expires_at > NOW())`; `buildActorContext()` uses active assignments only |
| **M2** | `is_system = true` roles modifiable via security API | `assertRoleMutable()` returns **403 FORBIDDEN**; repository `archiveRole` / `restoreRole` SQL also excludes `is_system` |
| **M3** | Phase 2 role hash → Phase 3 composite hash undocumented | Documented below (Deliverable 7); no JWT usage in Phase 2 |
| **M5** | SoD Point #3 `PERMS_ADDED` holder check incomplete | `runRolePermissionUpdateHolderCheck()` computes `new \ old`, simulates each holder's union, calls `assertNoSodViolationOnUnion` |

---

## Deliverable 1 — Bundle Expansion Validation

**Contract:** `expandBundles()` runs before `assertCanDelegate()`, `assertWithinPrivilegeCeiling()`, and SoD checks.

**Implementation:** `backend/src/modules/rbac/services/rbacV2ValidationPipeline.ts`

```
1. actorExpanded  = expandBundles(actor.resolvedPermissions, actorEnterpriseRole)
2. targetExpanded = expandBundles(targetPermissions, targetEnterpriseRole)
3. assertCanDelegateExpanded(actorExpanded, targetExpanded, ...)
4. assertWithinPrivilegeCeiling(tier, actorExpanded, targetExpanded, ...)
5. findSodViolation(targetExpanded, ...)
```

**Tests:** `rbacV2SecurityClosure.test.ts` — suite *Deliverable 1*; `rbacV2Validation.test.ts` — bundle expansion in SoD context.

---

## Deliverable 2 — Template Instantiation Validation

**Route:** `POST /api/v1/security/templates/:id/instantiate`

**Pipeline:** `validatePermissionKeysV2` → `buildActorContext` (active assignments) → `runRolePermissionValidation(..., 'template_instantiate', slug)` → persist role.

**DELEGATION_DENIED:** Actor with only `roles.view` instantiating `tpl_company_admin` throws `DelegationDeniedError` (HTTP 409 in route handler).

**Tests:** `rbacV2SecurityClosure.test.ts` — suite *Deliverable 2*.

---

## Deliverable 3 — Audit Endpoint Hardening

| Before | After |
|--------|-------|
| `requireAnyPermission('roles.view', 'permissions.manage', 'audit_logs.read')` | `requireRbacAuditRead()` → **`audit_logs.rbac.read`** |

**Permission model:**

- **`audit_logs.rbac.read`** — read `rbac_audit_log` via `/security/roles-audit` (RBAC-specific mutations, blocks, template events).
- **`audit_logs.read`** — general enterprise audit (unchanged; not sufficient for RBAC audit endpoint).
- **`roles.view`** — list/view roles only; no longer grants RBAC audit access.
- **Bypass:** `SYSTEM_OWNER` / `super_admin` via resolver (unchanged).

**Files:** `securityRoleRoutes.ts`, `rbacV2Middleware.ts`, `shared/rbac/restrictedPermissions.ts`.

---

## Deliverable 4 — Archive / Restore Security Contract

### Archive (`POST /security/roles/:id/archive`)

1. `assertRoleMutable()` — rejects `is_system`, `is_hidden`, immutable slugs, already archived.
2. Sets `status = 'archived'`, `archived_at = NOW()`, LWW `version++`.
3. **`deactivateAllAssignmentsForRole`** — all `rbac_user_roles.is_active = FALSE` for that role.
4. Increments **`users.access_version`** for each former active holder.
5. Audit: `ROLE_ARCHIVED` with holder count.

**Edit restrictions while archived:** `assertRoleMutable()` rejects any action except `'restored'` when `status === 'archived'`.

### Restore (`POST /security/roles/:id/restore`)

1. Role must be `status = 'archived'`; rejects `is_system` / `is_hidden`.
2. For each user with **inactive** assignment to this role:
   - Load **active-only** effective union via `listActiveUserRolesExpanded`.
   - Simulate union including restored role permissions.
   - **`assertNoSodViolationOnUnion`** — restore blocked on SoD violation (409).
3. Sets `status = 'active'`, clears `archived_at`, LWW `version++`.
4. **`reactivateAllAssignmentsForRole`** — `is_active = TRUE` for prior holders.
5. Increments `access_version` for reactivated holders.
6. Audit: `ROLE_RESTORED`.

**Assignment handling:** Archive soft-deactivates; restore reactivates same rows (no delete). Unassign uses `setUserRoleActive(..., false)`.

---

## Deliverable 5 — Effective Union Filtering

**SQL filter** (active assignments only):

```sql
ur.is_active = TRUE AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
```

**Used by:**

- `listActiveUserRoleAssignments()` → `buildActorContext()` (actor delegation input)
- `listActiveUserRolesExpanded()` → assign / restore / permission-update holder checks
- `listRoleHolderUserIds()` → archive holder enumeration

**Tests:** `rbacV2SecurityClosure.test.ts` — suite *effective union active assignment filters*; SoD Point #3 holder tests use simulated unions.

---

## Deliverable 6 — System Role Protection

**API behavior:** Any mutation on `is_system = true` roles through `/security/*` returns **403 FORBIDDEN** (`assertRoleMutable`).

**Blocked operations:** create-permission override, `PUT`, archive, restore (system roles cannot be archived via SQL guard either).

**Assignment:** System roles may still be assigned where business rules allow (e.g. legacy paths); **modification** is blocked.

**Tests:** Service-level contract test in `rbacV2SecurityClosure.test.ts`; repository SQL excludes `is_system` on archive/restore.

---

## Deliverable 7 — Role Version Documentation (Phase 2 → Phase 3)

Phase 2 persists per-role hash only; **no JWT `av` claim** in this phase.

```
role_version_hash = SHA-256(tenantId | roleId | version | sortedPermissionKeys)

user_composite_hash (Phase 3) = SHA-256(
  tenantId | userId | access_version | sorted(role_version_hashes of active assignments) | isActive
)
```

| Column | Phase | Purpose |
|--------|-------|---------|
| `rbac_roles.role_version_hash` | 2 | Invalidates role permission cache entries |
| `rbac_roles.version` | 2 | LWW optimistic concurrency |
| `users.access_version` | 2 write / 3 read | Bumped on assign, unassign, archive, restore |
| JWT `av` | **3 only** | Compare against composite hash at request time |

**Tests:** `rbacRoleVersionService` stability + Phase 2→3 separation in `rbacV2SecurityClosure.test.ts`.

---

## Deliverable 8 — SoD Point #3 (`PERMS_ADDED`)

**Logic:**

```typescript
PERMS_ADDED = permissionsAfter \ permissionsBefore
if PERMS_ADDED empty → skip
for each role holder:
  simulate union with updated role permissions
  assertNoSodViolationOnUnion(simulatedSets, slugs, 'role_permission_update')
```

**Trigger:** `securityUpdateRole()` when permission keys change.

**Tests:** `runRolePermissionUpdateHolderCheck` — empty delta, single-role violation, multi-role union violation.

---

## Files Changed (A5.1.2.1)

| File | Change |
|------|--------|
| `rbacV2ValidationPipeline.ts` | Expansion-first pipeline; Point #3 holder check |
| `rbacDelegationService.ts` | `assertCanDelegateExpanded`, `computePermissionsAdded` |
| `rbacPermissionExpansion.ts` | `expandBundles()` alias, `isSubsetOf()` |
| `rbacSecurityRoleService.ts` | `assertRoleMutable`, archive/restore contract, active union |
| `RbacRepository.ts` | Active filters, deactivate/reactivate assignments |
| `securityRoleRoutes.ts` | `requireRbacAuditRead()` on audit endpoint |
| `rbacV2Middleware.ts` | **New** — `requireRbacAuditRead()` |
| `rbacV2SecurityClosure.test.ts` | **New** — closure test suite |
| `backend/package.json` | Include closure tests in `npm test` |

---

## Testing

```powershell
npm run verify:rbac-v2
cd backend
node --import tsx --test src/modules/rbac/services/rbacV2Validation.test.ts src/modules/rbac/services/rbacV2SecurityClosure.test.ts
```

**Result:** **33/33** RBAC v2 tests pass (19 validation + 14 closure).

---

## Success Criteria

| Criterion | Status |
|-----------|--------|
| All High findings (H1–H4) resolved | ✅ |
| All Medium findings (M1, M2, M3, M5) resolved | ✅ |
| Automated tests for all deliverables | ✅ |
| Ready for Break-Glass (Phase 2 C2) | ✅ |

---

## Related Documents

- [`A5_1_2_APPROVED.md`](./A5_1_2_APPROVED.md) — Phase 2 approval record (post-closure)
- [`SoD_MATRIX.md`](./SoD_MATRIX.md) — Enforcement points 1–3
- [`PRIVILEGE_CEILING.md`](./PRIVILEGE_CEILING.md) — `audit_logs.rbac.read` tier rules

---

*End of A5.1.2.1 implementation report.*
