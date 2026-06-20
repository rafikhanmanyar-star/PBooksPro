# RBAC 2.0 — Architecture Review #1

**Reviewer:** Claude (Sonnet 4.6)
**Documents reviewed:** `RBAC_2_ARCHITECTURE.md`, `RBAC_2_IMPLEMENTATION_PLAN.md`
**Date:** 2026-06-19
**Phase:** A5.1.0 — Initial architecture review

---

## Verdict

**APPROVED WITH CHANGES**

Changes required at Critical and High severity before Phase 3 enablement. Medium items must be resolved by Phase 5.

---

## Critical Findings

### C1 — Separation of Duties is advisory, not enforced

The architecture lists "Same user cannot hold conflicting roles" as `Optional tenant policy (warn vs block)`. For an ERP handling payroll, procurement, and construction payments, SoD is a regulatory control, not an optional policy.

**Specific gaps:**
- A `payroll_officer` can simultaneously hold `finance_controller` — enabling payroll creation and approval by the same person.
- A `procurement_officer` can hold both `procurement.*` and `procurement.purchase_orders.approve`.
- A user can hold `accounting.journals.create` and `accounting.journals.reverse` with no restriction.
- No SoD matrix is defined anywhere. No specification of which role/permission pairs are mutually exclusive.
- `allowSelfApproval: boolean` in `ApprovalMatrixRule` must be removed or hardcoded `false` for financial entity types.

**Required fix:** Define a mandatory SoD incompatibility matrix. Enforce as blocking errors at role-assignment time. Remove configurable self-approval for financial entity types.

---

### C2 — `SYSTEM_OWNER` has no audit trail

`SYSTEM_OWNER` is described as "Hidden; all permissions (recovery)" and short-circuits the resolver. There is no mention of `SYSTEM_OWNER` actions being captured by `rbac_audit_log` or `withAudit()`.

In a SaaS ERP, the vendor's own recovery account performing unlogged actions on tenant data is a critical compliance risk.

**Required fix:** `SYSTEM_OWNER` actions must be logged with `actor_type: 'system_owner'`. Require a short-lived session token (15 minutes) with MFA for break-glass access. Log token issuance itself.

---

### C3 — Company-level (legal entity) isolation is deferred with no boundary

The architecture defers the Company scope dimension as future work. If tenants operate multiple legal entities within a single tenant, there is no row-level isolation between companies in Phases 1–6. Payroll, rental properties, and project data belonging to one legal entity are visible to users of sibling entities.

**Required fix:** Define an explicit policy before Phase 4: either (a) single tenant = single legal entity, or (b) add company scope to Phase 4 as a mandatory dimension.

---

### C4 — Role-level permission cache invalidation is not addressed

The architecture caches `EffectiveAccessContext` at 45 seconds. The `emitEntityEvent()` call is for client UI invalidation only. There is no mechanism for server-side cache invalidation when a role's permissions are modified. At 1000+ users, modifying a widely-held role leaves all holders with stale permissions until their individual cache entries expire.

**Required fix:** Define a cache invalidation strategy for role-level changes. Options: cache key includes `role_version` (bumped on edit); publish a `rbac_role_invalidated` event the server cache subscribes to; near-zero TTL for high-risk permissions.

---

### C5 — `financial.write` bundle expansion set is undefined

The architecture describes `financial.write` as expanding to a "defined set of v2 keys internally" but never defines that set. Nearly every module without dedicated permissions today gates on `financial.write`. When Phase 3 enables the PermissionEngine, users holding `financial.write` will receive all keys in the expansion — but the expansion is not enumerated, reviewed, or approved.

**Required fix:** Fully enumerate the `financial.write` expansion set before Phase 1 closes. Map every current route guard to its target v2 keys. Review against current role assignments for net-new permission grants.

---

## High Findings

### H1 — No payroll data scope: all payroll users see all employees

Any user with `payroll.employees.view` sees every employee's record — salary, deductions, bank details — across the entire tenant. No department or cost-center scope dimension exists.

**Required fix:** Add a `department` scope dimension to Phase 4. `payroll_officer` template should default to `mode: 'assigned'`. Add separate `payroll.myslip.view` for self-service access.

---

### H2 — Report engine scope is parameter-passed, not enforced

For reports, the architecture states "pass scope filters to report engine parameters." This is a suggestion, not enforcement. Reports are the highest-value data extraction path in an ERP. A scope bypass in a report is more damaging than a bypass on a list endpoint.

**Required fix:** Report engine queries must pass through the same `applyDataScope()` mixin used by all other repositories. Add integration test: scoped user cannot widen report scope via parameters.

---

### H3 — Template instantiation can grant permissions the actor does not hold

System templates (e.g., `finance_controller`) contain permissions exceeding what a company admin holds. If a company admin can instantiate any published template, the delegation invariant is violated at instantiation time. The architecture does not explicitly confirm `assertCanDelegate()` runs at instantiation.

**Required fix:** Confirm `assertCanDelegate()` runs at template instantiation time. System templates with elevated permissions should only be instantiable by `super_admin` or `security_administrator`.

---

### H4 — `approve.journals` is optional

Manual journal entries are the highest-risk financial operations in any ERP. The architecture lists `approve.journals` as "optional high level." A tenant can leave journal approval entirely unconfigured.

**Required fix:** `approve.journals` must be a mandatory matrix rule for all tenants. `accounting.journals.reverse` requires separate mandatory approval at a higher level than `journals.create`.

---

### H5 — No mechanism to propagate security patches from updated templates to instantiated roles

Templates are copied at instantiation (not live-linked). If a security flaw is discovered in a template, there is no mechanism to notify admins or fix derived custom roles across tenants.

**Required fix:** Store `derived_from_template_id` and `derived_from_template_version` on every instantiated role. Generate admin alerts when a template version is updated with a security change.

---

### H6 — No defined maximum privilege boundary for company admins

The delegation invariant allows a company admin to grant anything they hold. If a super_admin elevates a company admin to include `administration.roles.edit`, the company admin can create roles of equivalent power — bootstrapping an unbounded escalation chain within the tenant.

**Required fix:** Define a permission ceiling for `company_admin` that can only be raised by `super_admin`. Introduce a `maxGrantablePermissions` constraint. Audit every case where `administration.roles.edit` is assignable.

---

## Medium Findings

| ID | Finding |
|----|---------|
| M1 | No "deny" override in the permission union model — role exclusions require custom role creation |
| M2 | Scope entity ID arrays are unbounded — large IN clauses degrade at scale |
| M3 | JWT role slug remains active during migration — stale token risk on sensitive revocations |
| M4 | Role expiry (`expires_at`) checked at which layer is unspecified; cache TTL interaction |
| M5 | No unit-level scope within properties |
| M6 | Audit log has no defined retention policy or partitioning strategy |
| M7 | `minApprovers` field in the matrix rule is not surfaced in Phase 5 acceptance criteria |
| M8 | Cross-tenant SYSTEM_OWNER boundary not documented for SaaS model |

---

## Recommended Design Changes

| ID | Recommendation |
|----|----------------|
| RD1 | Define a formal SoD matrix before Phase 2; implement as `shared/rbac/sodConstraints.ts`; enforce at role-assignment time |
| RD2 | Add `department` as a scope dimension in Phase 4 for payroll and HR data |
| RD3 | Promote report engine scope to mandatory repository enforcement via `applyDataScope()` |
| RD4 | Remove `allowSelfApproval: boolean` from `ApprovalMatrixRule`; replace with entity-type allowlist |
| RD5 | Enumerate `financial.write` expansion set as a Phase 1 exit gate — no Phase 3 enablement until the map is reviewed |
| RD6 | Introduce `role_version` into `EffectiveAccessContext` cache key; invalidate on role edit |
| RD7 | Add `SYSTEM_OWNER` audit logging as a hard cross-cutting requirement, not a Phase 2 optional |

---

## Summary Table

| ID | Finding | Severity | Blocks Production? |
|----|---------|----------|--------------------|
| C1 | SoD advisory only | Critical | Yes |
| C2 | SYSTEM_OWNER unaudited | Critical | Yes |
| C3 | No company-level isolation | Critical | Yes (multi-company) |
| C4 | Role cache not invalidated | Critical | Yes |
| C5 | `financial.write` expansion undefined | Critical | Yes |
| H1 | No payroll department scope | High | Yes (payroll tenants) |
| H2 | Report scope unenforced | High | Yes |
| H3 | Template instantiation escalation | High | Yes |
| H4 | Journal approval optional | High | Yes |
| H5 | No template security patch propagation | High | No (operational) |
| H6 | No company admin privilege ceiling | High | Yes |
| M1–M8 | Medium findings | Medium | No |

---

*End of RBAC 2.0 Architecture Review #1.*
