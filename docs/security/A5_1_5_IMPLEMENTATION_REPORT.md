# A5.1.5 — Approval Matrix Enforcement Implementation Report

**Phase:** A5.1.5  
**Status:** Implementation complete — security closure in [A5_1_5_1_IMPLEMENTATION_REPORT.md](./A5_1_5_1_IMPLEMENTATION_REPORT.md)  
**Date:** June 2026  
**Authority:** [`A5_1_4_FINAL_APPROVED.md`](./A5_1_4_FINAL_APPROVED.md), [`RBAC_2_ARCHITECTURE_V2.md`](./RBAC_2_ARCHITECTURE_V2.md) §6

---

## Summary

RBAC 2.0 Phase 5 delivers approval matrix enforcement on top of the authorization engine, SoD, data scope, and privilege ceiling controls from prior phases. When `RBAC_V2_APPROVAL_MATRIX=true`, manual journals and reversals require approval before GL posting; procurement and payment workflows use matrix-based approver pools; `EffectiveAccessContext.approvalCapabilities` and `approvalHash` participate in JWT `av` invalidation.

---

## Files Added

| File | Purpose |
|------|---------|
| `shared/rbac/approvalTypes.ts` | Canonical approval entity/capability types |
| `backend/src/auth/approvalTypes.ts` | AUTO-GENERATED sync copy |
| `database/migrations/136_rbac_approval_matrix.sql` | Schema: matrix, capabilities, rules, assignments, journal drafts |
| `database/migrations/137_rbac_approval_matrix_seed.sql` | Per-tenant default seeds (mandatory journal rules) |
| `backend/src/auth/rbacApprovalFeatureFlag.ts` | Feature flag + engine dependency gate |
| `backend/src/middleware/rbacApprovalConfigMiddleware.ts` | 503 when misconfigured |
| `backend/src/auth/approvalCapabilityResolver.ts` | Resolve capabilities + `approvalHash` material |
| `backend/src/approval/approvalEngine.ts` | `canApprove`, `requiresApproval`, `approvalChain`, `approvalLevel` |
| `backend/src/modules/rbac/repositories/ApprovalMatrixRepository.ts` | Tenant-scoped matrix CRUD |
| `backend/src/modules/rbac/services/approvalMatrixSeed.ts` | Runtime tenant seed helper |
| `backend/src/modules/rbac/services/rbacApprovalMatrixService.ts` | Admin service + audit/metrics |
| `backend/src/modules/rbac/routes/approvalMatrixRoutes.ts` | `/api/v1/rbac/approval-matrix/*` |
| `backend/src/modules/accounting/services/journalApprovalService.ts` | Mandatory journal/reversal approval flow |
| `backend/src/auth/approvalEnforcement.test.ts` | 16 automated tests |
| `services/api/securityApprovalMatrixApi.ts` | Frontend API client |
| `components/settings/security/SecurityApprovalMatrixSection.tsx` | Settings UI |

---

## Files Modified

| File | Change |
|------|--------|
| `backend/src/auth/effectiveAccessContext.ts` | Added `approvalCapabilities` |
| `backend/src/auth/accessVersionService.ts` | Composite hash includes `approvalHash` |
| `backend/src/auth/authorizeV2.ts` | Resolves approval material into context |
| `backend/src/auth/rbacV2Metrics.ts` | `RBAC_V2_APPROVAL_*` metrics |
| `backend/src/modules/rbac/services/rbacAuditService.ts` | Approval audit actions |
| `backend/src/modules/rbac/repositories/RbacRepository.ts` | `incrementTenantUsersAccessVersion()` |
| `backend/src/modules/workflow/services/workflowEngineService.ts` | Matrix approver pools + SoD on actions |
| `backend/src/modules/accounting/routes/journalRoutes.ts` | Draft/submit/approve/reject when flag on |
| `backend/src/routes/mountVersionedApi.ts` | Mount approval router + config middleware |
| `components/settings/SettingsPage.tsx` | Approval Matrix nav entry |
| `scripts/ensure-shared-financial-cores.mjs` | Sync `approvalTypes.ts` |
| `scripts/verify-rbac-v2.mjs` | Section 11 approval artifacts |

---

## Schema Changes

| Table | Purpose |
|-------|---------|
| `rbac_approval_matrix` | Tenant matrix version (`approvalHash` input) |
| `rbac_approval_capabilities` | Capability registry |
| `rbac_approval_rules` | Rules (levels, min approvers, mandatory flag) |
| `rbac_approval_assignments` | User/role approver assignments |
| `rbac_journal_approval_drafts` | Pending manual journal/reversal payloads |

---

## Approval Hash Design

```
approvalHash = SHA256(sorted rows from matrix version, capabilities, rules, assignments)
role_version_hash = SHA256(...existing..., scopeHash, approvalHash, ...)
```

---

## Expected TOKEN_STALE Behavior

1. JWT `av` includes `approvalHash` at issue time.
2. Matrix mutation changes `approvalHash` → next request returns **401 TOKEN_STALE**.
3. Expect one-time spike on Phase 5 rollout per A5.1.4 approval note.

---

## Verification

```powershell
node --import tsx --test backend/src/auth/approvalEnforcement.test.ts backend/src/auth/approvalSecurityClosure.test.ts
npm run verify:rbac-v2
```

**Tests:** 33/33 pass (16 enforcement + 17 security closure — C1, C2, H1–H4, M1–M2).

**Security closure (A5.1.5.1):** See [`A5_1_5_1_IMPLEMENTATION_REPORT.md`](./A5_1_5_1_IMPLEMENTATION_REPORT.md).

---

## Rollback Plan

1. Set `RBAC_V2_APPROVAL_MATRIX=false`.
2. Restart API — legacy journal post + role-slug workflow approvers.
3. Schema is additive; no drop required for emergency rollback.

---

## Constraints Preserved

No changes to RealtimeDispatchHub, transactional entity queue, Socket.IO ordering, `FinancialPostingService` posting logic, or report engines.
