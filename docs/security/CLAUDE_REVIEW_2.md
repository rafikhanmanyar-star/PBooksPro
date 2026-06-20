# RBAC 2.0 — Architecture Review #2

**Reviewer:** Claude (Sonnet 4.6)
**Documents reviewed:** `RBAC_2_ARCHITECTURE_V2.md`, `RBAC_2_IMPLEMENTATION_PLAN_V2.md`, `SoD_MATRIX.md`, `PERMISSION_MIGRATION_MAP.md`
**Date:** 2026-06-19
**Phase:** A5.1.0.1 — Verification of Critical findings C1–C5 and High findings H1–H6

---

## Verdict

**APPROVED WITH CHANGES**

All five Critical findings are credibly resolved. Three High findings remain open (H1, H2, H6), two are partially resolved (H3, H4). Two new High-severity risks were identified (NR1, NR2). These must be resolved before Phase 2 implementation begins.

---

## Critical Findings Resolution

### C1 — Separation of Duties `RESOLVED`

`SoD_MATRIX.md` fully addresses this finding:
- Six mandatory blocking pairs defined: payroll, procurement PO, vendor bills, payments, manual journals, journal reversal.
- Five extended pairs with the same blocking policy.
- Enforcement at: role create/update, user role assignment, delegation, template instantiation.
- HTTP 409 `SOD_VIOLATION` — no tenant override, no warnings-only mode.
- SoD runs on the expanded effective union across all assigned roles.
- Bundle expansion runs before SoD validation.
- `SOD_VIOLATION_BLOCKED` audit entry on every blocked attempt.
- Architecture §7.2 shows the correct enforcement call chain.

---

### C2 — SYSTEM_OWNER Auditability `RESOLVED`

Architecture V2 §4.6 fully addresses this finding:
- Standing `SYSTEM_OWNER` role assignment removed. Break-glass is session-only, MFA-gated.
- 15-minute default, 60-minute hard maximum, not tenant-configurable.
- `actor_type = 'system_owner'` on every audit row, logged to both `rbac_audit_log` and `enterpriseAuditService`.
- IP address and user agent required fields on all break-glass audit entries.
- `BREAK_GLASS_ACTIVATED` and `BREAK_GLASS_EXPIRED` lifecycle events logged.
- Maximum one concurrent session per tenant.
- `break_glass_session_id` included in `roleVersionHash`.

---

### C3 — Company-Level Isolation `RESOLVED`

- Option A explicitly chosen: 1 Tenant = 1 Company.
- Technical rationale verified against the existing data model (no `company_id` on business entities).
- In-tenant `company` scope dimension removed from §5.2.
- Cross-tenant user flow correctly described: `user_tenants` → `select-company` → JWT `tenantId` switch → single tenant per session.
- Option B documented as a future initiative, not deferred ambiguity.

---

### C4 — Role Cache Invalidation `RESOLVED`

Architecture V2 §2.5 provides a complete version-based invalidation design:
- `role_version_hash` computed from: `tenantId + userId + user.is_active + user.suspended_at + MAX(rbac_roles.version) + COUNT(rbac_user_roles) + HASH(rbac_role_permissions) + HASH(rbac_user_data_scopes) + break_glass_session_id`.
- JWT `av` claim — middleware rejects stale tokens with 401 `TOKEN_STALE`.
- TTL is now a performance optimization only; correctness is driven by hash.
- User suspension produces immediate 401.
- Full invalidation flows documented for all relevant events.

---

### C5 — `financial.write` Expansion Set `RESOLVED`

`PERMISSION_MIGRATION_MAP.md` is thorough:
- Complete canonical v2 expansion set across 9 domains (~80+ keys).
- All 22 `requireFinancialWriteOnMutations` mounts mapped with target v2 keys.
- All explicit `requireLedgerRole` / `requireFinancialWriteRole` route guards mapped.
- Frontend `canWriteFinancial` usages mapped with replacement targets.
- Approve-type permissions explicitly excluded from the expansion set.

---

## High Findings Resolution

### H1 — Payroll Department Scope `NOT RESOLVED`

The revised scope model (§5.2) defines three dimensions: project, property, owner. No `department` or `cost_center` dimension was added. Any user with `payroll.employees.view` continues to see every employee's payroll record across the entire tenant.

---

### H2 — Report Scope Enforcement `NOT RESOLVED`

Architecture V2 §6 states the approval model is "largely unchanged from v1 §6." The report engine scope enforcement model is not addressed. The v1 language — pass scope as a parameter — is not explicitly superseded. A scoped user running a financial report could receive cross-scope data if the report engine ignores the scope parameter.

---

### H3 — Template Instantiation Escalation `PARTIALLY RESOLVED`

SoD at template instantiation is now specified. However, the delegation invariant check (`actor.permissions ⊇ targetRole.permissions`) at instantiation time is not explicitly confirmed in Phase 2 acceptance criteria. A company admin could instantiate a `finance_controller` system template with permissions they do not hold — passing SoD (no create/approve conflict) but violating delegation.

---

### H4 — Journal Approval Mandatory `PARTIALLY RESOLVED`

The SoD pair (`accounting.journals.create` ↔ `accounting.journals.approve`) is now mandatory and blocking. However, the approval matrix entry for journal posting is still configurable — a tenant can leave `manual_journal` approval unconfigured. SoD prevents one person from doing both, but if no approval rule exists, a user with only `accounting.journals.create` can post without any approval step.

---

### H6 — Company Admin Privilege Ceiling `NOT RESOLVED`

V2 does not define a maximum privilege boundary for `company_admin`. The SoD constraint prevents create+approve coexistence but does not prevent a company admin (once granted `administration.roles.edit` by a super_admin) from creating a role with super_admin-equivalent permissions.

---

## New Risks Identified

### NR1 — SoD Enforcement Uses a Stub Expander in Phase 2 `HIGH`

Implementation Plan Phase 2 states: "rbacSodService — run after bundle expand stub (static expand in Phase 2, full engine in Phase 3)." If the Phase 2 stub does not fully expand `financial.write`, users holding the bundle plus an approve permission may pass the Phase 2 SoD check when they should be flagged. This creates a gap window during Phase 2.

**Required fix:** The Phase 2 stub must use the same enumerated bundle definition (`permissionBundles.ts`) as Phase 3. One source of truth.

---

### NR2 — `project_manager` Bundle Subset Is Undefined `HIGH`

Both documents note that `project_manager` receives a "subset, not full bundle" but neither defines what that subset is. The CI verification checklist flags this as a check item but provides no answer. SoD validation against the `project_manager` effective set cannot be confirmed.

**Required fix:** Enumerate the `project_manager` subset explicitly in `PERMISSION_MIGRATION_MAP.md` before Phase 1 closes.

---

## Other Risks Noted

| ID | Risk | Severity |
|----|------|----------|
| NR3 | Break-glass capability flag authorization not defined | Medium |
| NR4 | Break-glass sessions bypass SoD for financial operations without operational scope restriction | Medium |
| NR5 | `role_version_hash` computation requires multiple DB reads on cache miss at scale | Medium |
| NR6 | Role permission edit does not validate SoD against existing users holding that role | Medium |

---

## Required Changes Before Phase 2

| Finding | Required action |
|---------|-----------------|
| H3 | Add Phase 2 acceptance criterion: "Template instantiation blocked if actor does not hold every permission in template (DELEGATION_DENIED)" |
| H6 | Define a permission ceiling for `company_admin` — restricted permissions only assignable by `super_admin` regardless of delegation invariant |
| NR1 | Mandate Phase 2 SoD stub uses `permissionBundles.ts` as its sole expansion source |
| NR2 | Enumerate `project_manager` permission subset in `PERMISSION_MIGRATION_MAP.md` |

## Required Changes Before Phase 4

| Finding | Required action |
|---------|-----------------|
| H1 | Add `department` scope dimension for payroll/HR data isolation |
| H2 | Mandate `applyDataScope()` at repository layer for all report engine queries |

## Required Changes Before Phase 5

| Finding | Required action |
|---------|-----------------|
| H4 | Add `manual_journal` approval as a mandatory default matrix seed for all tenants |

---

*End of RBAC 2.0 Architecture Review #2.*
