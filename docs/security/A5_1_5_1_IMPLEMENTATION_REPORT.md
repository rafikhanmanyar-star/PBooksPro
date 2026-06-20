# A5.1.5.1 — Approval Matrix Security Closure Report

**Phase:** A5.1.5.1  
**Status:** Security closure complete — ready for Claude re-review  
**Date:** June 2026  
**Scope:** Remediation only — no new features, no migrations, no rollout

---

## Verdict addressed

Claude Review **A5.1.5 REJECTED** — all Critical and High findings remediated with code evidence and tests.

---

## Phase 1 — Evidence review summary

| Finding | Pre-closure state | Action taken |
|---------|-------------------|--------------|
| **C1** | Route guard only; no assignee/ceiling validation | Added `approvalAssignmentValidation.ts` + service integration |
| **C2** | Journal bypassed workflow auto-approve; no explicit block | Added `isAutoApproveBlocked()` hardcoded for mandatory types |
| **H1** | Submit succeeded with empty approver pool | Added `assertNonEmptyApproverPool()` — fail closed before draft |
| **H2** | Permission on non-standard path | Documented + test: `requirePermissionV2('accounting.journals.approve')` |
| **H3** | SoD in `canApprove` but untested | Extracted `validateApproverPermissionSet()` + tests |
| **H4** | Self-check present; mandatory rule mutable | Forced immutable fields; super_admin-only mandatory rule edits |
| **M1** | Hash undocumented | Documented line format in `approvalCapabilityResolver.ts` |
| **M2** | States named differently | Documented `Pending Approval` = Submitted |
| **M3** | Partial audit actions | Extended `RbacAuditAction` inventory |
| **L1–L3** | Undocumented | Documented below |

---

## C1 — Approval capability assignment

### Enforcement path

| Layer | File | Function / route | Lines |
|-------|------|------------------|-------|
| Route guard | `approvalMatrixRoutes.ts` | `requirePermissionV2('administration.approvals.final')` | 102–104 |
| Restricted registry | `shared/rbac/restrictedPermissions.ts` | `administration.approvals.final` in `RESTRICTED_V2_PERMISSION_KEYS` | 33 |
| Actor tier | `approvalAssignmentValidation.ts` | `assertApprovalAssignmentAllowed()` | 108–155 |
| Journal-specific | `approvalAssignmentValidation.ts` | `accounting.journals.approve` requires `super_admin` | 147–154 |
| Assignee must hold permission | `approvalAssignmentValidation.ts` | `assertAssigneeEligibleForApproval()` | 157–195 |
| Service orchestration | `rbacApprovalMatrixService.ts` | `createApprovalAssignment()` | 180–230 |

### Answers

1. **Can `company_admin` assign manual_journal approvers?** **No.** Tier T3 is rejected in `assertApprovalAssignmentAllowed()`; journal assignments require `super_admin` (T1).
2. **Must assignee hold `accounting.journals.approve`?** **Yes.** `assertAssigneeEligibleForApproval()` queries effective permissions.
3. **Is privilege ceiling enforced?** **Yes.** `assertWithinPrivilegeCeiling()` + restricted registry.
4. **Is super_admin required?** **Yes** for journal approver assignments and for holding `administration.approvals.final`.

---

## C2 — AUTO_APPROVE disable

| Question | Answer | Evidence |
|----------|--------|----------|
| Does AUTO_APPROVE exist? | Yes, in `workflowEngineService.submitEntityForApproval()` | Lines 163–187 |
| Disabled for `manual_journal`? | **Yes** — journals never enter workflow auto path; `isJournalApprovalRequired()` gates journal routes | `journalRoutes.ts`, `journalApprovalService.ts` |
| Hardcoded? | **Yes** — `isAutoApproveBlocked()` uses `MANDATORY_APPROVAL_ENTITY_TYPES` | `approvalEngine.ts:160–163` |
| Config-independent? | **Yes** — not tied to tenant workflow settings | `workflowEngineService.ts:164–169` throws `APPROVAL_AUTO_APPROVE_BLOCKED` |

---

## H1 — Empty approver pool

**Behavior:** `submitManualJournalForApproval()` resolves approver pool → `assertNonEmptyApproverPool()` → throws `APPROVAL_POOL_EMPTY` **before** draft insert. Audit: `APPROVAL_POOL_EMPTY`. No GL post. Same for `journal_reversal`.

**File:** `journalApprovalService.ts` lines 66–88

**Tests:** `approvalSecurityClosure.test.ts` — H1 suite

---

## H2 — Approve endpoint permission

| Item | Value |
|------|-------|
| Endpoint | `POST /api/v1/transactions/journal/approvals/:draftId/action` |
| Required permission | `accounting.journals.approve` |
| Guard | `requirePermissionV2('accounting.journals.approve')` in `journalRoutes.ts:98–100` |
| Runtime re-check | `canApprove()` in `approveJournalDraft()` |

Note: Review referenced `POST /journals/:id/approve`; implementation uses draft-based path (architecture §6.4 draft → approve → post).

---

## H3 — SoD at approval time

**Implementation:** `validateApproverPermissionSet()` → `findSodViolation()` on approver's effective permission set.

**File:** `approvalEngine.ts:169–196`, used by `canApprove()` at line 254

**Test:** Rejects `accounting.journals.create` + `accounting.journals.approve` union

---

## H4 — Self-approval prevention

| Control | Location |
|---------|----------|
| Runtime | `validateApproverPermissionSet()` — `approverId === requesterId` when `allowSelfApproval=false` |
| Mandatory rule immutability | `rbacApprovalMatrixService.upsertApprovalRule()` forces `allowSelfApproval: false` |
| Mandatory rule edit | Only T0/T1 (`super_admin`) may modify mandatory rules |
| Seed | `allow_self_approval=false`, `min_approvers=1` in migration 137 |

---

## M1 — approvalHash format

```
lines = rows.map(r => `${kind}:${id}:${payload}`).sort()
approvalHash = SHA256(lines.join('\n'))
```

Documented in `approvalCapabilityResolver.ts` header comment.

---

## M2 — Workflow state machine

| UI/API state | Review term | Transitions |
|--------------|-------------|-------------|
| Draft | Draft | → Pending Approval, Cancelled |
| Pending Approval | **Submitted** | → Approved, Rejected, Cancelled |
| Approved | Approved | terminal |
| Rejected | Rejected | → Draft |
| Cancelled | Cancelled | terminal |

**Payload mutability:** Draft payload immutable after submit (stored in `rbac_journal_approval_drafts`).

**Atomicity:** `approveJournalDraft()` uses `FOR UPDATE` on draft; GL post + status update in same transaction.

---

## M3 — Audit event inventory

| Event | When | Module |
|-------|------|--------|
| `APPROVAL_SUBMITTED` | Journal submitted | `journalApprovalService` |
| `APPROVAL_APPROVED` | Journal approved + posted | `journalApprovalService` |
| `APPROVAL_REJECTED` | Journal rejected | `journalApprovalService` |
| `APPROVAL_SOD_BLOCKED` | SoD on approve (type defined) | `rbacAuditService` |
| `APPROVAL_SELF_APPROVAL_BLOCKED` | Self-approve attempt (type defined) | `rbacAuditService` |
| `APPROVAL_POOL_EMPTY` | Zero approvers on submit | `journalApprovalService` |
| `APPROVAL_AUTO_APPROVE_BLOCKED` | Blocked auto path (type defined) | `workflowEngineService` |
| `APPROVAL_ASSIGNMENT_CREATED` | Matrix assignment | `rbacApprovalMatrixService` |
| `APPROVAL_RULE_UPDATED` | Mandatory rule protected | `rbacApprovalMatrixService` |

---

## Low findings

### L1 — Notifications

Integrated via `notifyApproversForRequest()` when approver pool non-empty (`journalApprovalService.ts:151–153`). Empty pool fails before notification (fail closed).

### L2 — Test inventory

| File | Tests | Coverage |
|------|-------|----------|
| `approvalEnforcement.test.ts` | 16 | Hash, mandatory, SoD pairs, transitions |
| `approvalSecurityClosure.test.ts` | 17 | C1, C2, H1–H4, M1, M2 |

**Total:** 33 passing

### L3 — `allow_self_approval` immutability

Mandatory entity upsert normalizes `allowSelfApproval: false` regardless of request body (`rbacApprovalMatrixService.ts:122–131`).

---

## Files changed (A5.1.5.1)

| File | Change |
|------|--------|
| `backend/src/modules/rbac/services/approvalAssignmentValidation.ts` | **New** — C1 validation |
| `backend/src/modules/rbac/services/rbacApprovalMatrixService.ts` | Assignment validation, mandatory rule protection |
| `backend/src/approval/approvalEngine.ts` | `isAutoApproveBlocked`, `validateApproverPermissionSet`, `assertNonEmptyApproverPool` |
| `backend/src/modules/accounting/services/journalApprovalService.ts` | Empty pool fail-closed, audit events |
| `backend/src/modules/workflow/services/workflowEngineService.ts` | AUTO_APPROVE block guard |
| `backend/src/modules/rbac/services/rbacAuditService.ts` | Extended audit actions |
| `backend/src/auth/approvalCapabilityResolver.ts` | M1 hash documentation |
| `shared/rbac/restrictedPermissions.ts` | `administration.approvals.final` restricted |
| `backend/src/auth/approvalSecurityClosure.test.ts` | **New** — 17 security tests |

---

## Verification

```powershell
node --import tsx --test backend/src/auth/approvalEnforcement.test.ts backend/src/auth/approvalSecurityClosure.test.ts
npm run verify:rbac-v2
```

**Result:** 33/33 tests pass

---

## Rollback

Revert A5.1.5.1 commits only — no schema changes. Prior A5.1.5 behavior restored.
