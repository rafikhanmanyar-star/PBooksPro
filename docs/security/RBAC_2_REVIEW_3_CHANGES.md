# RBAC 2.0 — Review #3 Change Summary

**Phase:** A5.1.0.3 — Final Security Closure  
**Date:** June 2026  
**Status:** Architecture complete — ready for implementation authorization

This document maps **Claude Review #2** findings to resolutions and updated documentation.

---

## Summary

| Category | Count | Status |
|----------|-------|--------|
| High findings (H1–H6) | 5 resolved | Closed |
| New risks (NR1–NR2) | 2 resolved | Closed |
| New documents | 2 | Created |
| Updated documents | 3 | Revised |

---

## High findings

### H1 — Payroll Department Scope

| | |
|--|--|
| **Finding** | Payroll and HR data lacked a scope dimension; department-scoped access required for payroll officers and HR managers. |
| **Resolution** | Added **`department`** as fourth scope dimension. Mandatory for payroll routes, employee records, and HR modules. Default: `all` during migration; HR/payroll roles default to assigned departments. |
| **Document** | [`RBAC_2_ARCHITECTURE_V2.md`](./RBAC_2_ARCHITECTURE_V2.md) |
| **Section** | §5.2 Scope dimensions, §5.7 Department scope, §5.8 Default scope behavior |

---

### H2 — Report Scope Enforcement

| | |
|--|--|
| **Finding** | Reports could bypass data scope by passing filter parameters without repository enforcement. |
| **Resolution** | All report queries **must** call `applyDataScope()` at repository layer. Parameter-only scope passing prohibited. Report engine receives `EffectiveAccessContext`, not client-supplied filters. |
| **Document** | [`RBAC_2_ARCHITECTURE_V2.md`](./RBAC_2_ARCHITECTURE_V2.md) |
| **Section** | §5.9 Report engine enforcement |

---

### H3 — Template Instantiation Escalation

| | |
|--|--|
| **Finding** | Template instantiation could grant permissions the actor does not hold (separate from SoD). |
| **Resolution** | `assertCanDelegate()` mandatory on role create, role assignment, role clone, and template instantiation. Phase 2 acceptance criteria: block if actor lacks any template permission. Privilege ceiling in [`PRIVILEGE_CEILING.md`](./PRIVILEGE_CEILING.md). |
| **Document** | [`RBAC_2_ARCHITECTURE_V2.md`](./RBAC_2_ARCHITECTURE_V2.md), [`RBAC_2_IMPLEMENTATION_PLAN_V2.md`](./RBAC_2_IMPLEMENTATION_PLAN_V2.md), [`PRIVILEGE_CEILING.md`](./PRIVILEGE_CEILING.md) |
| **Section** | Architecture §4.7 Template instantiation security; Plan Phase 2 acceptance criteria; PRIVILEGE_CEILING §Escalation rules |

---

### H4 — Journal Approval Mandatory

| | |
|--|--|
| **Finding** | Journal posting could bypass approval; approval must not be tenant-configurable off. |
| **Resolution** | Manual journal approval is **mandatory** and cannot be disabled. Default approval matrix seed required for `manual_journal` entity type. Creator cannot approve (SoD). Flow documented. |
| **Document** | [`RBAC_2_ARCHITECTURE_V2.md`](./RBAC_2_ARCHITECTURE_V2.md) |
| **Section** | §6.4 Mandatory journal approval |

---

### H6 — Company Admin Privilege Ceiling

| | |
|--|--|
| **Finding** | `company_admin` with delegation could approach super_admin equivalent without explicit ceiling. |
| **Resolution** | Restricted Permission Registry, company admin ceiling, security administrator ceiling, tier-based grant rules. |
| **Document** | [`PRIVILEGE_CEILING.md`](./PRIVILEGE_CEILING.md) (new), [`RBAC_2_ARCHITECTURE_V2.md`](./RBAC_2_ARCHITECTURE_V2.md) |
| **Section** | Architecture §3.4 Privilege ceiling; PRIVILEGE_CEILING (full document) |

---

## New risks

### NR1 — SoD Stub Expansion Source

| | |
|--|--|
| **Finding** | Phase 2 SoD stub and Phase 3 engine could use duplicate bundle definitions, causing validation drift. |
| **Resolution** | `shared/rbac/permissionBundles.ts` is the **single source of truth**. Phase 2 SoD stub and Phase 3 PermissionEngine import the same module. CI verifies no duplicate bundle arrays. |
| **Document** | [`RBAC_2_IMPLEMENTATION_PLAN_V2.md`](./RBAC_2_IMPLEMENTATION_PLAN_V2.md) |
| **Section** | §Bundle expansion source (cross-phase) |

---

### NR2 — project_manager Permission Subset

| | |
|--|--|
| **Finding** | `project_manager` bundle subset was referenced but not fully enumerated. |
| **Resolution** | Complete included/excluded permission lists in PERMISSION_MIGRATION_MAP §11. Derived from v1 static matrix + intentional PM domain boundary. |
| **Document** | [`PERMISSION_MIGRATION_MAP.md`](./PERMISSION_MIGRATION_MAP.md) |
| **Section** | §11 project_manager bundle definition |

---

## Documents created

| Document | Purpose |
|----------|---------|
| [`PRIVILEGE_CEILING.md`](./PRIVILEGE_CEILING.md) | H6 — Restricted registry, ceilings, escalation |
| [`RBAC_2_REVIEW_3_CHANGES.md`](./RBAC_2_REVIEW_3_CHANGES.md) | This summary |

---

## Documents updated

| Document | Sections added or revised |
|----------|---------------------------|
| [`RBAC_2_ARCHITECTURE_V2.md`](./RBAC_2_ARCHITECTURE_V2.md) | §3.4 Privilege ceiling; §4.7 Template instantiation security; §5.2–5.9 Department scope + report enforcement; §6.4 Mandatory journal approval; Review #3 summary table; TOC |
| [`RBAC_2_IMPLEMENTATION_PLAN_V2.md`](./RBAC_2_IMPLEMENTATION_PLAN_V2.md) | Phase 2 acceptance (template delegation); Bundle expansion source; Phase 4 department scope; Phase 5 journal matrix seed; Review #3 checklist |
| [`PERMISSION_MIGRATION_MAP.md`](./PERMISSION_MIGRATION_MAP.md) | §11 project_manager bundle definition (full enumeration) |

---

## Implementation authorization gate

- [x] All High findings H1, H2, H3, H4, H6 resolved
- [x] All New risks NR1, NR2 resolved
- [x] PRIVILEGE_CEILING.md complete
- [x] Architecture V2 updated
- [x] Implementation Plan V2 updated
- [x] PERMISSION_MIGRATION_MAP complete (no TBD)
- [ ] Third architecture review sign-off
- [ ] Implementation authorized

---

*End of Review #3 Change Summary.*
