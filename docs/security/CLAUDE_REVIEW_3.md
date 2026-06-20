# RBAC 2.0 — Architecture Review #3 (Final)

**Reviewer:** Claude (Sonnet 4.6)
**Documents reviewed:** `RBAC_2_ARCHITECTURE_V2.md`, `RBAC_2_IMPLEMENTATION_PLAN_V2.md`, `SoD_MATRIX.md`, `PERMISSION_MIGRATION_MAP.md`, `PRIVILEGE_CEILING.md`, `RBAC_2_REVIEW_3_CHANGES.md`
**Date:** 2026-06-19
**Phase:** A5.1.0.3 — Final security closure; verification of H1–H6 and NR1–NR2

---

## Verdict

**APPROVED WITH MINOR CHANGES**

All seven previously unresolved findings (H1, H2, H3, H4, H6, NR1, NR2) are fully and correctly resolved. One new High-severity finding (NH1) was identified in the SoD enforcement model. This is a specification gap requiring a single additional enforcement point — it does not require architectural redesign. Three medium findings require documentation before implementation begins.

Implementation may be authorized once NH1 is resolved in `SoD_MATRIX.md` and the three medium items are addressed. No phase of implementation should begin before NH1 is closed.

---

## Resolved Findings

### H1 — Payroll Department Scope `RESOLVED`

Architecture V2 §5.2 adds `department` as a fourth scope dimension. §5.7 fully specifies the design:
- Scope column: `department_id` on employees and payroll runs.
- Modules covered: `payrollRouter`, employee CRUD, payroll reports.
- `payroll_officer` and `hr_manager` templates seeded with `assigned` mode as default.
- Migration safe: no scope rows = all departments.
- SQL enforcement via `applyDataScope(scopes, 'department', 'department_id')` at repository layer.
- Payroll reports included in §5.9 mandatory enforcement list.
- Phase 4 acceptance criterion: "Payroll officer with assigned department X cannot view department Y employees."

---

### H2 — Report Scope Enforcement `RESOLVED`

Architecture V2 §5.9 mandates repository-layer enforcement for all report queries:
- Client-supplied scope parameters prohibited for authorization purposes.
- `params` restricted to: date range, report type, format only.
- All report SQL paths call `applyDataScope(req.effectiveAccess.scopes, ...)`.
- Custom report templates cannot embed scope-bypass filters.
- Export and print scoped identically to read — no widening at export time.
- Consolidated reports require `reports.consolidated.read` plus all-dimension scope.
- CI gate: `npm run verify:rbac-v2` greps report repositories for `applyDataScope` presence.

---

### H3 — Template Instantiation Escalation `RESOLVED`

Architecture V2 §4.7 mandates a four-step validation pipeline for all five materialization paths (role create, role permission update, role assignment, role clone, template instantiation):

```
1. expandBundles(targetPermissions)          ← permissionBundles.ts
2. assertCanDelegate(actor, expanded)        ← actor holds all target permissions
3. assertWithinCeiling(actor, expanded)      ← tier ceiling respected
4. assertNoSodViolation(expanded)            ← no incompatible pairs
```

Distinct error codes per failure type (`DELEGATION_DENIED`, `PRIVILEGE_CEILING_EXCEEDED`, `SOD_VIOLATION`). Phase 2 acceptance criterion: "Template instantiation blocked if actor does not hold every permission in template (409 DELEGATION_DENIED)." `PRIVILEGE_CEILING.md` blocks restricted permissions from instantiation by T2/T3 actors.

---

### H4 — Journal Approval Mandatory `RESOLVED`

Architecture V2 §6.4 makes journal approval non-configurable:
- "Manual journal approval is mandatory, non-configurable, and cannot be disabled by any tenant setting or feature flag."
- `AUTO_APPROVE` path disabled for `manual_journal` entity type.
- Default matrix seed required for every tenant: `entity_type: manual_journal`, `min_approvers: 1`, `allow_self_approval: false`.
- Journal reversal requires a separate approval step.
- `accounting.journals.approve` is in the Restricted Permission Registry — only super_admin (T1) can assign it.
- Phase 5 acceptance criteria: "Manual journal approval cannot be disabled" and "Unapproved journal cannot post to GL."

---

### H6 — Company Admin Privilege Ceiling `RESOLVED`

`PRIVILEGE_CEILING.md` provides a comprehensive closure:
- Five-tier hierarchy (T0 Platform → T5 Standard user) with explicit grant boundaries.
- Restricted Permission Registry: 19 named keys that only T1 (super_admin) can assign, including `permissions.delegate`, `administration.roles.edit`, `accounting.journals.approve`, `accounting.periods.close`, and all backup/audit admin keys.
- Company admin ceiling: all `*.approve` keys are above ceiling; `permissions.delegate` itself is above ceiling.
- Security administrator ceiling: RBAC keys only; no financial write or approve keys.
- "company_admin cannot become super_admin equivalent" explicitly stated and enforced via `assertWithinPrivilegeCeiling()` — the third step in the four-step validation pipeline.
- CI gate: `npm run verify:rbac-ceiling`.

---

### NR1 — SoD Stub Expansion Source `RESOLVED`

Implementation Plan Phase 2 Task 2: "expand via `permissionBundles.ts` only (NR1)." Phase 2 acceptance criterion: "All bundle expansion in Phase 2 uses `permissionBundles.ts` only." Architecture §7.2 labels the expand step "(NR1)" and cites `permissionBundles.ts`. Phase 3 uses the same module. Single source of truth architecturally mandated.

---

### NR2 — `project_manager` Permission Subset `RESOLVED`

`PERMISSION_MIGRATION_MAP.md` §11 provides complete enumeration:
- **Included (v1):** 20 keys — procurement, GRN, project selling, PEV, retention, workflow.
- **Included (v2 PM subset):** 19 keys — projects domain, budget view/create/edit, limited property/vendor view.
- **Excluded (v1):** 24 keys with explicit reasons — payroll, admin, billing, audit, all approve keys.
- **Excluded (full §2 bundle):** 51 keys — full accounting domain, rental, customers, administration, personal finance, custom reports.
- **Total: 39 effective permissions** — counted and cross-referenced to `permissionBundles.ts`.

---

## New Finding

### NH1 — SoD Enforcement on Role Edits Does Not Check Existing Users `HIGH`

**Document:** `SoD_MATRIX.md` Enforcement Point #1; Architecture V2 §7.2

`SoD_MATRIX.md` defines two enforcement points:

1. Role create/update — "reject permission set if any incompatible pair is present **on the same role**."
2. User role assignment — "reject if the user's **effective permission union** (all assigned roles combined) contains any incompatible pair."

Enforcement point #1 checks the role's own permission set in isolation. Enforcement point #2 checks the effective union but only fires at assignment time.

**Bypass scenario:**

```
State:  User A holds Role X (payroll.runs.create) + Role Y (no payroll permissions)
Action: Admin edits Role Y → adds payroll.runs.approve
Check:  SoD on Role Y's new permission set → passes (approve alone is not a violation)
Result: User A now holds payroll.runs.create + payroll.runs.approve in effective union
        No assignment occurred → Enforcement Point #2 never fires
        C4 cache invalidation fires → but SoD is not re-evaluated at resolution time
```

User A is now in SoD violation without any check having fired. The user can create and approve their own payroll run. This defeats the stated SoD invariant: "must not coexist in any single user's effective permission set across all assigned roles."

This gap is systematic — it requires only sequential role edits, each individually valid. A super_admin (who holds all permissions) can create this state for any user.

**Required fix:** Add Enforcement Point #3 to `SoD_MATRIX.md`:

> **3. Role permission update** — when permission P is added to Role R, query all users currently holding Role R and validate the effective union after adding P for each. Reject the role edit if any existing user would enter a SoD violation. Return HTTP 409 with affected user IDs.

The implementation must specify whether this check is synchronous (blocking the edit) or asynchronous (with rollback), and define behavior when existing violations are detected.

---

## Medium Findings

### NM1 — Break-Glass Capability Flag Authorization Undefined `MEDIUM`

Architecture §4.6 states "Verify user holds SYSTEM_OWNER capability flag (tenant bootstrap list)" but neither the architecture nor `PRIVILEGE_CEILING.md` defines where this flag is stored, who can set or revoke it, or whether it is vendor-controlled or tenant-controllable. If a tenant's `super_admin` can grant this flag to arbitrary users, a compromised `super_admin` account can create additional break-glass-capable accounts before detection.

**Required fix:** Document flag storage, authorization model, and whether it is vendor-controlled or tenant-settable. Add to Architecture §4.6 before Phase 2 implementation.

---

### NM2 — `departments` Table Existence Assumed, Not Confirmed `MEDIUM`

Architecture §5.7 requires department scope using `department_id` FK to a payroll module `departments` table. The current-state assessment does not confirm this table exists. If payroll uses string department names or cost codes without a surrogate ID, department scope cannot be implemented without prior payroll schema work not scoped in any phase.

**Required fix:** Confirm the `departments` entity with surrogate ID exists, or add a prerequisite schema task to Phase 4.

---

### NM3 — `personal.finance.*` in `financial.write` Bundle Lacks Data Classification `MEDIUM`

`PERMISSION_MIGRATION_MAP.md` §2 includes `personal.finance.view`, `.create`, `.edit`, `.delete` in the canonical `financial.write` expansion. This grants these permissions to `company_admin` and `accountant` via bundle expansion. The nature of data in the `personal.finance` module is not documented. If it contains individual-level financial records (employee, investor, or owner personal accounts), granting this to all accountants is a data privacy concern that should be gated by scope.

**Required fix:** Document what entity the `personal.finance` module covers. If individual-level data, either restrict from the bundle or add a scope requirement.

---

## Summary

### Resolved findings

| ID | Finding | Status |
|----|---------|--------|
| H1 | Payroll Department Scope | Resolved |
| H2 | Report Scope Enforcement | Resolved |
| H3 | Template Instantiation Escalation | Resolved |
| H4 | Journal Approval Mandatory | Resolved |
| H6 | Company Admin Privilege Ceiling | Resolved |
| NR1 | SoD Stub Expansion Source | Resolved |
| NR2 | `project_manager` Permission Subset | Resolved |

### Remaining findings

| ID | Finding | Severity | Blocks |
|----|---------|----------|--------|
| NH1 | SoD not validated against existing user effective union on role permission edits | High | SoD enforcement completeness |
| NM1 | Break-glass capability flag authorization not defined | Medium | Phase 2 implementation |
| NM2 | `departments` table assumed to exist, not confirmed | Medium | Phase 4 department scope |
| NM3 | `personal.finance.*` data classification absent | Medium | Bundle expansion correctness |

### Required changes before implementation begins

1. **(NH1 — High)** Add Enforcement Point #3 to `SoD_MATRIX.md`: role permission updates must validate the effective union of all users currently holding that role. Specify synchronous vs asynchronous check and define behavior when existing violations are found.

2. **(NM1 — Medium)** Define break-glass capability flag: storage, who can set/revoke it, vendor vs tenant control.

### Required changes before Phase 4

3. **(NM2 — Medium)** Confirm `departments` entity exists with surrogate ID or add prerequisite task.

4. **(NM3 — Medium)** Document `personal.finance` module data type; add scope requirement if individual-level data.

---

## Architecture Assessment

The package is comprehensive and the security controls are appropriate for an enterprise ERP. Key strengths:

- **Four-step validation pipeline** (expand → delegate → ceiling → SoD) closes all previously identified privilege escalation paths.
- **Privilege ceiling** with Restricted Permission Registry prevents company_admin from approaching super_admin equivalence.
- **Department scope** closes payroll confidentiality gap across HR and payroll modules.
- **Report repository enforcement** closes the highest-risk data extraction bypass path.
- **Mandatory journal approval** eliminates the highest-risk financial posting bypass.
- **Version-based cache invalidation** replaces TTL-only correctness with immediate revocation.
- **Single bundle source of truth** (`permissionBundles.ts`) closes the SoD stub drift risk.
- **Complete `project_manager` subset enumeration** makes the permission boundary verifiable by CI.

---

*End of RBAC 2.0 Architecture Review #3.*
