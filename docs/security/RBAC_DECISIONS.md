# RBAC 2.0 — Architecture Decision Record

**Phase:** A5.1.0 / A5.1.0.1  
**Status:** Approved for second review (planning only — no implementation)  
**Last updated:** June 2026

This document records **binding architectural decisions** for RBAC 2.0. Detailed design lives in companion docs; this file is the single index of what was decided and why.

---

## Document map

| Document | Role |
|----------|------|
| **[This file](./RBAC_DECISIONS.md)** | Decision log — what we chose |
| [`RBAC_2_ARCHITECTURE_V2.md`](./RBAC_2_ARCHITECTURE_V2.md) | Target architecture |
| [`RBAC_2_IMPLEMENTATION_PLAN_V2.md`](./RBAC_2_IMPLEMENTATION_PLAN_V2.md) | Phased delivery |
| [`SoD_MATRIX.md`](./SoD_MATRIX.md) | Mandatory incompatible permission pairs |
| [`PERMISSION_MIGRATION_MAP.md`](./PERMISSION_MIGRATION_MAP.md) | `financial.write` decomposition |
| [`RBAC_2_ARCHITECTURE.md`](./RBAC_2_ARCHITECTURE.md) | Superseded v1 draft |
| [`docs/rbac/rbac-v2-specification.md`](../rbac/rbac-v2-specification.md) | Prior delegation/audit spec |

---

## Decision index

| ID | Decision | Status |
|----|----------|--------|
| [D-01](#d-01--rbac-20-over-incremental-patches) | RBAC 2.0 program (not incremental patches) | Accepted |
| [D-02](#d-02--three-layer-permission-taxonomy) | Feature → page → action taxonomy | Accepted |
| [D-03](#d-03--company-isolation-option-a) | 1 Tenant = 1 Company (Option A) | Accepted |
| [D-04](#d-04--data-scope-dimensions) | Scope: project, property, owner only | Accepted |
| [D-05](#d-05--separation-of-duties-blocking) | SoD violations are blocking, no override | Accepted |
| [D-06](#d-06--system_owner-break-glass) | SYSTEM_OWNER via break-glass sessions only | Accepted |
| [D-07](#d-07--super_admin-retained) | Retain `super_admin` standing role | Accepted |
| [D-08](#d-08--role_version_hash-cache) | Version-hash cache invalidation (not TTL-only) | Accepted |
| [D-09](#d-09--financialwrite-as-migration-bundle) | `financial.write` as deprecated bundle alias | Accepted |
| [D-10](#d-10--permission-based-approval-matrix) | Replace role-slug approver routing | Accepted |
| [D-11](#d-11--delegation-subset-rule) | Grant only permissions you hold | Accepted |
| [D-12](#d-12--no-sync-layer-changes) | Do not modify RealtimeDispatchHub / TEQ / sockets | Accepted |
| [D-13](#d-13--feature-flag-rollout) | Per-tenant feature flags for rollback | Accepted |
| [D-14](#d-14--multi-role-union--sod-on-union) | Multi-role union; SoD on effective union | Accepted |
| [D-15](#d-15--option-b-deferred) | In-tenant multi-company (Option B) deferred | Deferred |

---

## D-01 — RBAC 2.0 over incremental patches

**Context:** v1 RBAC has 51 flat keys, `super_admin` dependency, coarse `financial.write`, no SoD, TTL-only cache.

**Decision:** Deliver RBAC 2.0 as a structured program (7 phases) rather than ad-hoc permission additions.

**Consequences:**

- New domains get catalog entries before route guards.
- Migration is phased with dual-run and feature flags.
- v1 keys remain valid aliases until Phase 7 strict mode.

**References:** [`RBAC_2_IMPLEMENTATION_PLAN_V2.md`](./RBAC_2_IMPLEMENTATION_PLAN_V2.md)

---

## D-02 — Three-layer permission taxonomy

**Context:** Business requirements ask for feature-, page-, and action-level control.

**Decision:** Permission keys follow `{feature}.{page}.{action}` with standardized actions: `view`, `create`, `edit`, `delete`, `approve`, `reverse`, `export`, `print`. Feature gates use `{feature}.access`.

**Consequences:**

- Permission catalog is hierarchical (machine-readable metadata).
- UI can group by feature/page.
- Route guards target specific action keys after migration.

**References:** [`RBAC_2_ARCHITECTURE_V2.md`](./RBAC_2_ARCHITECTURE_V2.md) §3

---

## D-03 — Company isolation: Option A

**Context:** Review finding C3 required an explicit choice between:

- **Option A:** 1 Tenant = 1 Company  
- **Option B:** 1 Tenant = Multiple Companies (`company_id` mandatory scope)

**Decision:** **Option A — 1 Tenant = 1 Company.**

| Concept | Implementation |
|---------|----------------|
| Company / organization | `tenants` row |
| Data isolation | `tenant_id` on all business queries |
| User with multiple companies | `user_tenants` + JWT switch via `/auth/select-company` |
| In-tenant `company_id` | Not used |

**Rationale:**

- PostgreSQL schema has no tenant-scoped `company_id` on business entities.
- Login flow already switches organization by changing JWT `tenantId`.
- Option B would require a new legal-entity model and schema-wide `company_id` — out of RBAC 2.0 scope.

**Business requirement mapping:**

| Requirement | Interpretation |
|-------------|----------------|
| All Companies | User may access all tenants in `user_tenants` |
| Assigned Companies | Subset of `user_tenants` (future: restrict selectable tenants) |
| All / Assigned Projects, Properties, Owners | In-tenant scope dimensions (D-04) |

**References:** [`RBAC_2_ARCHITECTURE_V2.md`](./RBAC_2_ARCHITECTURE_V2.md) §5.1

---

## D-04 — Data scope dimensions

**Context:** Permissions alone do not restrict which rows a user sees.

**Decision:** In-tenant data scope uses three dimensions only:

| Dimension | Entity FK |
|-----------|-----------|
| `project` | `projects.id` |
| `property` | `buildings.id`, `properties.id` |
| `owner` | `contacts.id` (owner/investor type) |

**Rules:**

- Scope enforced in **repositories**, not route handlers.
- Client scope is never trusted.
- No scope rows during migration = implicit **all** within tenant.
- `super_admin`, `company_admin`, `accountant` default to all within tenant.

**Consequences:**

- No `company` scope dimension (see D-03).
- Project managers default to assigned projects only (opt-in tightening in Phase 4).

**References:** [`RBAC_2_ARCHITECTURE_V2.md`](./RBAC_2_ARCHITECTURE_V2.md) §5

---

## D-05 — Separation of Duties: blocking

**Context:** Review finding C1 — create and approve permissions must not coexist.

**Decision:** SoD violations are **blocking errors** (HTTP 409 `SOD_VIOLATION`). Not warnings. No tenant override. No configuration flag to disable in production.

**Mandatory pairs:**

| Domain | Permission A | Permission B |
|--------|--------------|--------------|
| Payroll | `payroll.runs.create` | `payroll.runs.approve` |
| Purchase orders | `procurement.purchase_orders.create` | `procurement.purchase_orders.approve` |
| Vendor bills | `procurement.bills.create` | `procurement.bills.approve` |
| Payments | `accounting.transactions.create` | `approve.payments` |
| Manual journals | `accounting.journals.create` | `accounting.journals.approve` |
| Journal reversal | `accounting.journals.reverse` | `accounting.journals.approve` |

**Enforcement:** Role create/update, user role assignment, template instantiation — on **expanded** effective permission union (post bundle expand).

**Consequences:**

- Phase 6 must split `accountant` / `company_admin` roles that hold create + approve after expansion.
- `financial.write` bundle excludes all approve keys (D-09).

**References:** [`SoD_MATRIX.md`](./SoD_MATRIX.md), [`RBAC_2_ARCHITECTURE_V2.md`](./RBAC_2_ARCHITECTURE_V2.md) §7

---

## D-06 — SYSTEM_OWNER break-glass

**Context:** Review finding C2 — hidden SYSTEM_OWNER role lacked auditability and session boundaries.

**Decision:** SYSTEM_OWNER is **not** a standing day-to-day assignment. Elevation uses explicit **break-glass sessions**:

| Parameter | Value |
|-----------|-------|
| MFA | Mandatory step-up |
| Session duration | 15 minutes default (60 min hard max) |
| Concurrent sessions per tenant | 1 |
| Audit | Every action with `actor_type = system_owner` |
| Token | Short-lived JWT with `sessionType: break_glass` |

**Consequences:**

- `POST /api/v1/rbac/break-glass/activate` (implementation phase).
- Persistent UI banner during session.
- Lifecycle events: `BREAK_GLASS_ACTIVATED`, `BREAK_GLASS_EXPIRED`.

**References:** [`RBAC_2_ARCHITECTURE_V2.md`](./RBAC_2_ARCHITECTURE_V2.md) §4.6

---

## D-07 — Retain super_admin

**Context:** Goal is to reduce `super_admin` dependency, not eliminate break-glass administration.

**Decision:** Keep `super_admin` as a visible standing role with all permissions. It remains distinct from SYSTEM_OWNER break-glass.

| | super_admin | SYSTEM_OWNER break-glass |
|--|-------------|--------------------------|
| Assignment | Standing role | Session only |
| MFA | Login policy | Mandatory step-up each session |
| Session | Normal JWT TTL | 15 min expiry |
| Audit `actor_type` | `user` | `system_owner` |
| Use case | Tenant admin | Emergency / recovery |

**Consequences:** Delegation (`permissions.delegate`) and `security_administrator` reduce day-to-day super_admin need; super_admin retained for break-glass alternative path.

**References:** [`RBAC_2_ARCHITECTURE_V2.md`](./RBAC_2_ARCHITECTURE_V2.md) §4.6, [`docs/rbac/rbac-v2-specification.md`](../rbac/rbac-v2-specification.md)

---

## D-08 — role_version_hash cache

**Context:** Review finding C4 — 45s TTL-only cache delays permission revocation.

**Decision:** Replace TTL-only **correctness** with `role_version_hash`:

- Stored on `EffectiveAccessContext` and JWT `av` claim.
- Computed from: user active state, role versions, permission sets, scopes, break-glass session.
- TTL (45s) remains a performance optimization only.
- Mismatch → re-resolve or 401 `TOKEN_STALE`.

**Invalidation triggers:**

| Event | Action |
|-------|--------|
| Permission revoked from role | Increment role version; invalidate all holders |
| Role modified | Same |
| User role assigned/revoked | Increment `users.access_version` |
| User suspended | Immediate 401 |
| Scope changed | Increment user access version |
| Break-glass ended | Invalidate user cache |

**Consequences:** Socket `rbac_access` events drive client permission query invalidation.

**References:** [`RBAC_2_ARCHITECTURE_V2.md`](./RBAC_2_ARCHITECTURE_V2.md) §2.5

---

## D-09 — financial.write as migration bundle

**Context:** Review finding C5 — bundle used on 22+ API mounts without documented v2 mapping.

**Decision:**

1. `financial.write` remains a **deprecated bundle alias** during migration.
2. PermissionEngine expands it to ~80 granular v2 keys (see migration map).
3. Bundle expansion **excludes** all approve-type permissions (SoD-safe).
4. Route guards migrate to specific v2 keys in Phases 3 and 6.
5. `project_manager` receives a **subset**, not the full bundle.
6. Phase 7 strict mode removes direct `financial.write` guards (alias in engine only until final deprecation).

**References:** [`PERMISSION_MIGRATION_MAP.md`](./PERMISSION_MIGRATION_MAP.md)

---

## D-10 — Permission-based approval matrix

**Context:** Workflow engine resolves approvers by hardcoded role slugs (`super_admin`, `company_admin`, etc.).

**Decision:** Replace with **ApprovalMatrixEngine** — rules match entity type, amount, project; approver pool = users holding required permission + data scope + SoD compliance. Self-approval blocked at service layer.

**Rollout:** 2-week shadow mode on staging before cutover. Feature flag `RBAC_V2_APPROVAL_MATRIX`.

**Consequences:** `workflow.approve` remains minimum API gate; matrix selects eligible approvers.

**References:** [`RBAC_2_ARCHITECTURE_V2.md`](./RBAC_2_ARCHITECTURE_V2.md) §6

---

## D-11 — Delegation subset rule

**Context:** Enterprise RBAC requires admins to assign roles without privilege escalation.

**Decision:** A user may assign only permissions that are a subset of their own resolved set:

```
actor.permissions ⊇ targetPermissions
```

Combined with SoD (D-05). `permissions.delegate` required for `company_admin` delegation (not granted by default).

**References:** [`docs/rbac/rbac-v2-specification.md`](../rbac/rbac-v2-specification.md) §6

---

## D-12 — No sync-layer changes

**Context:** Architecture constraints from A5.1.0.

**Decision:** RBAC 2.0 must **not** modify:

- RealtimeDispatchHub
- Transactional Entity Queue
- Socket.IO event ordering
- Conflict resolution / LWW on business entities
- FinancialPostingService / GL posting logic

RBAC integrates **before** handlers via middleware and repository scope. RBAC mutations use existing `emitEntityEvent()` for cache invalidation only.

**References:** [`RBAC_2_ARCHITECTURE_V2.md`](./RBAC_2_ARCHITECTURE_V2.md) (hard constraints table)

---

## D-13 — Feature-flag rollout

**Context:** Reduce rollback risk across 7 phases.

**Decision:** Per-tenant flags control each capability:

| Flag | Capability |
|------|------------|
| `RBAC_V2_SOD` | Blocking SoD |
| `RBAC_V2_BREAK_GLASS` | SYSTEM_OWNER sessions |
| `RBAC_V2_VERSION_HASH` | Version-based cache |
| `RBAC_V2_CATALOG` | Hierarchical catalog |
| `RBAC_V2_RESOLVER` | PermissionEngine + bundle expand |
| `RBAC_V2_DATA_SCOPE` | Repository scope filters |
| `RBAC_V2_APPROVAL_MATRIX` | Matrix approvers |
| `RBAC_V2_STRICT_MODE` | Deny unmapped permissions |

Disable flag = instant rollback (except SoD post-production requires security sign-off).

**References:** [`RBAC_2_IMPLEMENTATION_PLAN_V2.md`](./RBAC_2_IMPLEMENTATION_PLAN_V2.md)

---

## D-14 — Multi-role union; SoD on union

**Context:** Users may hold multiple roles via `rbac_user_roles`.

**Decision:**

- Effective permissions = **union** of all assigned roles.
- SoD validation runs on the **union**, not per-role.
- A user with Role A (create) + Role B (approve) is **blocked** even if each role alone is valid.

**Consequences:** User Management must show effective-permission preview including SoD status before save.

**References:** [`SoD_MATRIX.md`](./SoD_MATRIX.md), [`RBAC_2_ARCHITECTURE_V2.md`](./RBAC_2_ARCHITECTURE_V2.md) §4.4

---

## D-15 — Option B deferred

**Context:** Holding companies may want multiple legal entities within one tenant.

**Decision:** **Deferred** — not in RBAC 2.0 scope. If pursued later:

- Requires `company_id` on business tables.
- Adds mandatory `company` scope dimension.
- Separate architecture initiative (not an RBAC-only change).

**Status:** Deferred until explicit product request and schema design.

---

## Rejected / not chosen

| Alternative | Why rejected |
|-------------|--------------|
| SoD as warnings only | Fails C1; unacceptable for payroll/procurement/payments |
| Tenant-configurable SoD disable | Fails C1 |
| TTL-only cache invalidation | Fails C4; revocation delay unacceptable |
| Standing SYSTEM_OWNER assignment | Fails C2; no audit trail or session boundary |
| Option B (in-tenant multi-company) | No schema support; scope explosion; deferred as D-15 |
| Remove `super_admin` entirely | Break-glass and legacy tenant ops risk; retained per D-07 |
| Big-bang permission migration | Breaks production; phased dual-run chosen |
| PostgreSQL RLS for scope | Deferred per Architecture v2.1 post-launch policy |

---

## Critical findings traceability

| Finding | Decision(s) | Verified by |
|---------|-------------|-------------|
| C1 SoD | D-05, D-14 | [`SoD_MATRIX.md`](./SoD_MATRIX.md) |
| C2 SYSTEM_OWNER | D-06 | Architecture V2 §4.6 |
| C3 Company isolation | D-03, D-04, D-15 | Architecture V2 §5.1 |
| C4 Cache invalidation | D-08 | Architecture V2 §2.5 |
| C5 financial.write | D-09 | [`PERMISSION_MIGRATION_MAP.md`](./PERMISSION_MIGRATION_MAP.md) |

---

## Implementation gate

Implementation must **not** begin until:

- [ ] Second architecture review complete
- [ ] All decisions D-01 through D-14 accepted (D-15 explicitly deferred)
- [ ] Companion docs aligned with this decision log

---

## Revision history

| Date | Phase | Change |
|------|-------|--------|
| June 2026 | A5.1.0 | Initial RBAC 2.0 architecture (v1 draft) |
| June 2026 | A5.1.0.1 | C1–C5 security foundation; V2 architecture and plan |
| June 2026 | A5.1.0.1 | This decision log created |

---

*End of RBAC Decisions.*
