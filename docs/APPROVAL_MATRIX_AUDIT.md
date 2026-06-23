# Approval Matrix — Full Architectural Audit
**Date:** 2026-06-23  
**Auditor:** Claude Sonnet 4.6  
**Status:** COMPLETE

---

## 1. Executive Summary

The PBooksPro codebase contains a **substantially complete, dual-engine approval system** that has been built across multiple sprints. The system is fully implemented at the infrastructure level and is operational for journal entries. It is gated behind a single feature flag (`RBAC_V2_APPROVAL_MATRIX=false`) that has never been enabled in production.

**Verdict: GO — with targeted gaps to close before enabling the flag.**

---

## 2. Existing Architecture

### Two Complementary Engines

#### Engine A: Universal Workflow Engine (Sprint 4)
Handles configurable, tenant-driven approval for procurement documents.

- Entry point: `backend/src/modules/workflow/services/workflowEngineService.ts`
- Configuration: `tenant_settings.workflow_config` (JSONB)
- Routing: `backend/src/modules/workflow/routes/workflowApprovalRoutes.ts`
- Queue: `GET /workflow/queue`, `POST /workflow/requests/:id/action`

#### Engine B: RBAC v2 Approval Matrix (Phase 5)
Handles mandatory, role-based approval with SoD enforcement and privilege ceiling.

- Entry point: `backend/src/approval/approvalEngine.ts`
- Administration: `backend/src/modules/rbac/services/rbacApprovalMatrixService.ts`
- Routing: `backend/src/modules/rbac/routes/approvalMatrixRoutes.ts`
- Seeding: `backend/src/modules/rbac/services/approvalMatrixSeed.ts`

The two engines are unified by `workflowEngineService.ts`: when `RBAC_V2_APPROVAL_MATRIX=true`, the RBAC matrix is used to resolve approvers; when false, it falls back to role-based resolution.

---

## 3. Database Audit

### Tables — Existence and Status

| Table | Migration | Status | Notes |
|-------|-----------|--------|-------|
| `tenant_settings` | 127 | ✅ Production Ready | Stores per-tenant workflow enable/config |
| `approval_requests` | 127 | ✅ Production Ready | Core request table, all columns present |
| `approval_request_actions` | 127 | ✅ Production Ready | Full audit trail (approve/reject/delegate/escalate/return) |
| `rbac_approval_matrix` | 136 | ✅ Production Ready | Matrix header per tenant |
| `rbac_approval_capabilities` | 136 | ✅ Production Ready | Per-entity capability definitions |
| `rbac_approval_rules` | 136 | ✅ Production Ready | Amount/condition-based rules |
| `rbac_approval_assignments` | 136 | ✅ Production Ready | User/role assignments to rules |
| `rbac_journal_approval_drafts` | 136 | ✅ Production Ready | Mandatory journal approval payload storage |

### Columns Added to Entity Tables (Migration 129)

| Table | Columns Added | Status |
|-------|---------------|--------|
| `bills` | approval_status, submitted_at, submitted_by, approved_at, approved_by | ✅ Exists |
| `contracts` | approval_status, submitted_at, submitted_by, approved_at, approved_by | ✅ Exists |
| `transactions` | approval_status, submitted_at, submitted_by, approved_at, approved_by | ✅ Exists |

### Design Spec vs Actual Schema Mapping

| Design Spec Table | Actual Table | Notes |
|-------------------|--------------|-------|
| `approval_workflows` | `tenant_settings` | Stored as JSONB config within tenant_settings |
| `approval_rules` | `rbac_approval_rules` | Full implementation with conditions JSONB |
| `approval_steps` | Implicit in `approval_requests.current_level` + `approval_request_actions` | No standalone table needed |
| `approval_requests` | `approval_requests` | Exists, fully structured |
| `approval_history` | `approval_request_actions` | Complete audit trail |
| `approval_delegations` | `approval_request_actions.delegate_to_user_id` | Stored as action, not separate table |

---

## 4. API Audit

### Workflow Engine Endpoints

| Method | Path | Status | Permission |
|--------|------|--------|------------|
| GET | `/api/workflow/entity-types` | ✅ Implemented | `workflow.view` |
| GET | `/api/workflow/queue` | ✅ Implemented | `workflow.view` |
| GET | `/api/workflow/requests/:id` | ✅ Implemented | `workflow.view` |
| POST | `/api/workflow/submit` | ✅ Implemented | `workflow.view` |
| POST | `/api/workflow/requests/:id/action` | ✅ Implemented | `workflow.approve` |
| GET | `/api/workflow/settings` | ✅ Implemented | `workflow.manage` |
| PUT | `/api/workflow/settings` | ✅ Implemented | `workflow.manage` |

**Supported actions:** `approve`, `reject`, `return`, `delegate`, `escalate`

### RBAC Approval Matrix Admin Endpoints

| Method | Path | Status | Permission |
|--------|------|--------|------------|
| GET | `/api/rbac/approvals` | ✅ Implemented | `administration.approvals.final` |
| GET | `/api/rbac/approvals/users/:id/capabilities` | ✅ Implemented | `administration.approvals.final` |
| PUT | `/api/rbac/approvals/rules` | ✅ Implemented | `administration.approvals.final` |
| POST | `/api/rbac/approvals/assignments` | ✅ Implemented | `administration.approvals.final` |
| DELETE | `/api/rbac/approvals/assignments/:id` | ✅ Implemented | `administration.approvals.final` |

---

## 5. Frontend Audit

### Components

| Component | File | Lines | Classification |
|-----------|------|-------|----------------|
| Workflow Settings Editor | `WorkflowSettingsSection.tsx` | 443 | ✅ Implemented |
| Approval Queue Panel | `ApprovalQueuePanel.tsx` | 201 | ✅ Implemented |
| Submit For Approval Button | `SubmitForApprovalButton.tsx` | 68 | ✅ Implemented |
| RBAC Approval Matrix UI | `SecurityApprovalMatrixSection.tsx` | 256 | ⏸️ Feature-flagged (disabled) |

### Services & Hooks

| File | Lines | Classification |
|------|-------|----------------|
| `services/workflowApi.ts` | 99 | ✅ Implemented |
| `hooks/useWorkflow.ts` | 52 | ✅ Implemented |
| `services/api/securityApprovalMatrixApi.ts` | 102 | ⏸️ Feature-flagged (disabled) |
| `services/realtime/approvalQueryInvalidation.ts` | 22 | ✅ Implemented |
| `services/api/mobileApprovalsApi.ts` | 21 | ✅ Implemented (mobile) |

### Permissions (usePermissions.ts)

| Flag | Permission | Status |
|------|------------|--------|
| `canViewWorkflow` | `workflow.view` | ✅ Implemented |
| `canApproveWorkflow` | `workflow.approve` | ✅ Implemented |
| `canManageWorkflow` | `workflow.manage` | ✅ Implemented |
| `canAdminWorkflow` | `workflow.admin` | ✅ Implemented |

### Integration Points (Submit Button)

| Module | Status |
|--------|--------|
| Bills (`InvoiceBillForm.tsx:3221`) | ✅ Integrated |
| Contracts (`ProjectContractForm.tsx`) | ✅ Integrated |
| Payments | ✅ Referenced in `workflowApi.ts` |
| Purchase Orders | ✅ Referenced in entity adapters |

---

## 6. Enforcement Audit

### Module-Level Enforcement Status

| Module | Hard Enforcement | Soft Enforcement | Status |
|--------|-----------------|-----------------|--------|
| Manual Journals | ✅ YES — mandatory via `journalApprovalService.ts` | — | Production Ready |
| Journal Reversals | ✅ YES — mandatory via `journalApprovalService.ts` | — | Production Ready |
| Bills | ⚠️ Partial — approval_status columns exist, submit button in UI | Lifecycle tracked | Beta |
| Payments | ⚠️ Partial — referenced in workflow engine | Lifecycle tracked | Beta |
| Purchase Orders | ⚠️ Partial — entity adapter exists, no posting-block guard | Lifecycle tracked | Beta |
| Contracts | ⚠️ Partial — submit button in UI, lifecycle columns exist | Lifecycle tracked | Beta |
| Payroll Runs | ❌ None — permission defined, seed rule exists, no enforcement | — | Stub |
| Rental Agreements | ❌ None — permission defined, seed rule exists, no enforcement | — | Stub |

**Key gap:** For Bills, POs, and Payments, there is no hard guard that blocks posting/finalization when `approval_status != 'approved'`. The UI provides the submit button and the workflow engine tracks the state, but the backend does not block the action at the service layer.

---

## 7. RBAC Integration Audit

### Permissions Registered in Catalog

| Permission | Risk Level | SoD Pair | Status |
|------------|------------|----------|--------|
| `workflow.view` | LOW | — | ✅ Registered |
| `workflow.approve` | CRITICAL | — | ✅ Registered |
| `workflow.manage` | HIGH | — | ✅ Registered |
| `workflow.admin` | CRITICAL | — | ✅ Registered |
| `administration.approvals.final` | CRITICAL | — | ✅ Registered (privilege ceiling) |
| `accounting.journals.approve` | CRITICAL | `accounting.journals.create` | ✅ SoD enforced |
| `procurement.bills.approve` | CRITICAL | `procurement.bills.create` | ✅ SoD defined |
| `procurement.purchase_orders.approve` | CRITICAL | `procurement.purchase_orders.create` | ✅ SoD defined |
| `payroll.runs.approve` | CRITICAL | `payroll.runs.create` | ✅ SoD defined |
| `approve.payments` | CRITICAL | `accounting.transactions.create` | ✅ SoD defined |

### RBAC v2 Integration

| Feature | Status |
|---------|--------|
| Permission checks on all approval endpoints | ✅ Enforced |
| Privilege ceiling on matrix administration | ✅ T0/T1 only |
| SoD: creator cannot approve own document (journals) | ✅ Enforced |
| SoD: creator cannot approve own document (bills/POs) | ⚠️ Defined but not actively enforced in workflow engine |
| Token hash invalidation on matrix change | ✅ Implemented |
| Role assignment to approval levels | ✅ Implemented |

---

## 8. Feature Flag State

| Flag | Backend | Frontend | Current Value |
|------|---------|----------|---------------|
| `RBAC_V2_APPROVAL_MATRIX` | `process.env.RBAC_V2_APPROVAL_MATRIX` | `VITE_RBAC_V2_APPROVAL_MATRIX` | **false** |
| `RBAC_V2_AUTHORIZATION_ENGINE` | Required prerequisite | `VITE_RBAC_V2_AUTHORIZATION_ENGINE` | **true** ✅ |

The approval matrix requires `RBAC_V2_AUTHORIZATION_ENGINE=true` (already enabled). Turning on `RBAC_V2_APPROVAL_MATRIX` will activate all the gated code.

---

## 9. Dead Code

None found. All approval/workflow code is actively referenced and wired.

---

## 10. Security Gaps

| Gap | Severity | Detail |
|-----|----------|--------|
| No posting-block guard for Bills | HIGH | A bill can be posted even if approval_status='pending'. The UI hides the button but there is no backend enforcement. |
| No posting-block guard for Purchase Orders | HIGH | Same issue — workflow tracks state but does not block the action server-side. |
| No posting-block guard for Payments | HIGH | Same issue — payment can be finalized without approval. |
| SoD for bills/POs partially enforced | MEDIUM | SoD permissions are defined but `workflowEngineService.ts` does not call the SoD check for these entity types (only journals have it). |
| Payroll and Rental have zero enforcement | LOW | No risk today since those flows don't check approval status, but the permissions create a false sense of security. |

---

## 11. Production Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Posting without approval (bills/POs/payments) | HIGH if flag enabled | HIGH | Add posting guards before enabling flag |
| Self-approval on bills/POs | MEDIUM | HIGH | Wire SoD check in workflowEngineService.canApprove |
| Approver pool empty on fresh tenants | LOW | MEDIUM | Seed ensures at least super_admin can approve |
| Token stale after matrix change mid-session | LOW | LOW | Handled by approval hash system |

---

## 12. Effort Estimate

| Task | Effort |
|------|--------|
| Add posting guards for Bills | 2h |
| Add posting guards for Purchase Orders | 2h |
| Add posting guards for Payments | 2h |
| Wire SoD check in workflowEngineService | 1h |
| Add Approvals sidebar navigation item | 1h |
| Payroll approval enforcement | 4h |
| Rental approval enforcement | 4h |
| Enable feature flags + verification | 1h |
| **Phase 1 total (bills/POs/payments + flag)** | **~9h** |
| **Phase 2 total (payroll/rental)** | **~8h** |

---

## 13. Go / No-Go Recommendation

**RECOMMENDATION: GO FOR PHASE 1**

The core infrastructure (database, API, RBAC integration, audit trail, frontend queue) is production-ready. The feature flag can be enabled once posting guards are added for Bills, Purchase Orders, and Payments, and the SoD check is wired in the workflow engine.

Payroll and Rental approvals should remain as Phase 2 (stubs are correctly defined, enabling them prematurely would create false enforcement).

**Blocking issues before enabling flag:**
1. Add `approval_status` guard in BillService.postBill() — block if pending
2. Add `approval_status` guard in PurchaseOrderService — block if pending
3. Add `approval_status` guard in PaymentService — block if pending
4. Wire SoD check in workflowEngineService.canUserApprove()
