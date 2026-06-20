# RBAC 2.0 — Architecture Review #2

**Reviewer:** Claude  
**Documents reviewed:** `RBAC_2_ARCHITECTURE_V2.md` (draft), `RBAC_2_IMPLEMENTATION_PLAN_V2.md`, `SoD_MATRIX.md`, `PERMISSION_MIGRATION_MAP.md`  
**Date:** June 2026  
**Phase:** A5.1.0.1 — Security Foundation Revision  
**Archive:** [`reviews/`](./) · Action log: [`REVIEW_ACTION_LOG.md`](./REVIEW_ACTION_LOG.md)

---

## Verdict

**APPROVED WITH CHANGES**

Critical findings C1–C5 from Review #1 addressed. Remaining High and New Risk items required closure before implementation authorization.

---

## High Findings (Review #2)

### H1 — Payroll Department Scope

Payroll/HR requires department-scoped access; `department` dimension missing from scope model.

**Required:** Add `department` scope; apply to payroll, HR, employee records.

**Status:** Closed in A5.1.0.3 → Architecture V2 §5.7.

---

### H2 — Report Scope Enforcement

Reports must not rely on parameter-only scope passing.

**Required:** Mandatory repository `applyDataScope()` on all report SQL paths.

**Status:** Closed in A5.1.0.3 → Architecture V2 §5.9.

---

### H3 — Template Instantiation Escalation

`assertCanDelegate()` must run at template instantiation; separate from SoD.

**Required:** Block if actor lacks any template permission.

**Status:** Closed in A5.1.0.3 → Architecture V2 §4.7; Plan Phase 2 acceptance criteria.

---

### H4 — Journal Approval Mandatory

Manual journal approval must not be tenant-disableable.

**Required:** Mandatory matrix seed; non-configurable approval path.

**Status:** Closed in A5.1.0.3 → Architecture V2 §6.4; Plan Phase 5.

---

### H6 — Company Admin Privilege Ceiling

No maximum grantable boundary for `company_admin` delegation.

**Required:** Restricted Permission Registry; tier ceilings.

**Status:** Closed in A5.1.0.3 → [`PRIVILEGE_CEILING.md`](../PRIVILEGE_CEILING.md).

---

## New Risks (Review #2)

### NR1 — SoD Stub Expansion Source

Phase 2 SoD stub and Phase 3 engine could diverge on bundle definitions.

**Required:** Single `permissionBundles.ts` source of truth.

**Status:** Closed in A5.1.0.3 → Plan §Bundle expansion source.

---

### NR2 — project_manager Permission Subset

PM bundle referenced but not fully enumerated.

**Required:** Complete included/excluded lists.

**Status:** Closed in A5.1.0.3 → [`PERMISSION_MIGRATION_MAP.md`](../PERMISSION_MIGRATION_MAP.md) §11.

---

## Deferred (non-blocking)

| ID | Finding | Notes |
|----|---------|-------|
| H5 | Template security patch propagation | Operational; post-launch |
| M1–M8 | Medium items from Review #1 | Tracked separately |

---

## Summary

| Category | Count | Status |
|----------|-------|--------|
| High (H1–H4, H6) | 5 | Closed |
| New risks (NR1–NR2) | 2 | Closed |

Change summary: [`../RBAC_2_REVIEW_3_CHANGES.md`](../RBAC_2_REVIEW_3_CHANGES.md)

---

*End of Architecture Review #2.*
