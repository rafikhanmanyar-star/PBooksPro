# RBAC 2.0 — Architecture Review #3

**Reviewer:** Claude  
**Documents reviewed:** Full security package (Architecture V2, Implementation Plan V2, SoD, Migration Map, Privilege Ceiling)  
**Date:** June 2026  
**Phase:** A5.1.0.4 — Final Review Closure  
**Archive:** [`reviews/`](./) · Action log: [`REVIEW_ACTION_LOG.md`](./REVIEW_ACTION_LOG.md)

---

## Verdict

**APPROVED FOR IMPLEMENTATION AUTHORIZATION**

All remaining findings from Review #3 closed in documentation. No open Critical or High items.

---

## New High Finding

### NH1 — SoD on Role Permission Updates

**Finding:** Adding a permission to an existing role can create SoD violations for current role holders via permission union across roles. Enforcement Point #1 (role permission set) and Point #2 (user assignment) do not cover this path explicitly.

**Required:**

1. On role permission **add**, identify all users holding the role
2. Compute each user's new effective permission union
3. Run `assertNoSodViolation()` per user
4. Reject entire role update if any user would violate SoD

**Status:** Closed → [`SoD_MATRIX.md`](../SoD_MATRIX.md) Enforcement Point #3.

---

## New Medium Findings

### NM1 — Break-Glass Capability Governance

**Finding:** Break-glass activation gate referenced "tenant bootstrap list" without storage location, assignment authority, or revocation model. Risk of tenant self-granting recovery access.

**Required:** Vendor-controlled capability; not tenant-assignable.

**Status:** Closed → Architecture V2 §4.6.1.

---

### NM2 — Department Scope Prerequisite Ambiguity

**Finding:** Architecture references `department` scope but does not state whether `departments` / `payroll_departments` table exists or requires Phase 4 migration.

**Required:** Explicit Option A (exists) or Option B (prerequisite task).

**Status:** Closed → **Option A:** `payroll_departments` exists (`021_payroll.sql`). Plan Phase 4 prerequisite section.

---

### NM3 — personal.finance Classification

**Finding:** `personal.finance.*` included in `financial.write` bundle without data classification, sensitivity, or scope analysis.

**Required:** Document data type, sensitivity, scope; decide bundle inclusion.

**Status:** Closed → **Removed from bundle.** [`PERMISSION_MIGRATION_MAP.md`](../PERMISSION_MIGRATION_MAP.md) §12.

---

## Summary

| ID | Severity | Status |
|----|----------|--------|
| NH1 | High | Closed |
| NM1 | Medium | Closed |
| NM2 | Medium | Closed |
| NM3 | Medium | Closed |

---

## Implementation authorization

Architecture package is **finalized**. Implementation may proceed upon program owner sign-off.

---

*End of Architecture Review #3.*
