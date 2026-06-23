# Approval Matrix V1 — Design Document
**Date:** 2026-06-23  
**Status:** Implemented

---

## 1. Architecture Overview

Approval Matrix V1 uses the existing dual-engine infrastructure — no greenfield development required.

```
┌─────────────────────────────────────────────────────────┐
│                     Frontend                            │
│  Sidebar → ApprovalsPage → ApprovalQueuePanel           │
│  Settings → Workflow → WorkflowSettingsSection          │
│  Document Forms → SubmitForApprovalButton               │
└────────────────────────┬────────────────────────────────┘
                         │ REST API
┌────────────────────────▼────────────────────────────────┐
│                     Backend                             │
│  /workflow/queue         workflowEngineService          │
│  /workflow/submit        approvalLifecycleService       │
│  /workflow/requests/:id  workflowEntityAdapters         │
│  /rbac/approvals         rbacApprovalMatrixService      │
└────────────────────────┬────────────────────────────────┘
                         │ PostgreSQL
┌────────────────────────▼────────────────────────────────┐
│                    Database                             │
│  tenant_settings        approval_requests               │
│  approval_request_actions  rbac_approval_rules          │
│  rbac_approval_assignments  rbac_approval_capabilities  │
│  rbac_journal_approval_drafts                           │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Feature Flag

| Flag | Value | Effect |
|------|-------|--------|
| `RBAC_V2_APPROVAL_MATRIX` | `true` | Enables backend approval matrix engine |
| `VITE_RBAC_V2_APPROVAL_MATRIX` | `true` | Shows Approvals sidebar + RBAC matrix UI |

Both flags are now enabled in all environment files.

---

## 3. Data Model

### Existing Tables (no migration needed)

#### `tenant_settings` — Workflow Configuration
```
tenant_id (PK)          — one row per tenant
approval_workflow_enabled BOOLEAN
workflow_config JSONB   — { levels: 1|2|3, rules: WorkflowRule[] }
```

#### `approval_requests` — Active Approvals
```
id (PK)
tenant_id
entity_type             — 'bill' | 'purchase_order' | 'payment' | 'contract' | ...
entity_id
entity_ref              — human-readable ref (PO-001, BILL-042)
requester_id
status                  — 'pending' | 'approved' | 'rejected' | 'cancelled'
current_level           — 1, 2, or 3
max_level
amount
assigned_approver_id
```

#### `approval_request_actions` — Audit Trail
```
id (PK)
approval_request_id
action                  — 'approve' | 'reject' | 'return' | 'delegate' | 'escalate'
actor_id
approval_level
previous_status / new_status
comments
created_at
```

#### `rbac_approval_rules` — Amount-based Rules
```
id (PK)
tenant_id
entity_type
priority
approval_level          — 1, 2, or 3
min_approvers
required_permission     — e.g. 'procurement.bills.approve'
conditions JSONB        — { minAmount, maxAmount, ... }
is_mandatory
```

#### `rbac_approval_assignments` — Who Approves
```
id (PK)
tenant_id
rule_id / capability_id
assignee_type           — 'user' | 'role'
assignee_id
approval_level
```

### Entity Columns (Migration 129 — already applied)
Bills, contracts, and transactions each have:
- `approval_status` — 'Draft' | 'Submitted' | 'Approved'
- `submitted_at`, `submitted_by`, `approved_at`, `approved_by`

---

## 4. Workflow Configuration

Configured at: **Settings → Preferences → Workflow**

| Setting | Description |
|---------|-------------|
| Enable Approval Workflow | Toggle on/off per tenant |
| Maximum Approval Steps | 1, 2, or 3 levels |
| Routing Rules | Amount-based, entity-type, submitter role |

### Default Amount Tiers (seeded via `approvalMatrixSeed.ts`)

| Amount Range | Required Levels | Approver Permission |
|--------------|-----------------|---------------------|
| Any | Level 1 | `procurement.bills.approve` / `approve.payments` |
| Configurable | Level 2 | `accounting.journals.approve` |
| Mandatory | Level 1 | `accounting.journals.approve` (journals always mandatory) |

---

## 5. Enforcement Points

### Hard Enforcement (backend blocks the action)

| Action | Guard Location | Condition |
|--------|---------------|-----------|
| Edit bill | `billsService.updateBill()` | approval_status = 'Submitted' → 403 |
| Edit transaction | `transactionsService.upsertTransaction()` | approval_status = 'Submitted' → 403 |
| Edit PO | `purchaseOrderService.upsertPurchaseOrder()` | status != 'Draft' → 403 |
| Post journal | `journalApprovalService.ts` | Mandatory — cannot bypass |
| Approve own document | `workflowEngineService.canApprove()` | SoD check via RBAC engine |

### Soft Enforcement (journal sync gated)

| Action | Guard | Notes |
|--------|-------|-------|
| Bill GL sync | `billsService.finalizeBillSaveFromLedger()` | Only syncs if approval_status = 'Approved' |
| Contract status | `approvalLifecycleService.setApprovalLifecycleStatus()` | Status changes on approval |

---

## 6. Workflow Lifecycle

```
Document Created
      │
      ▼
  [Draft]  ──── User submits ────▶  [Submitted / Pending Approval]
      │                                        │
      │                             Approver reviews queue
      │                                        │
      │                          ┌─────────────┴─────────────┐
      │                          ▼                           ▼
      │                    [Approved]                  [Rejected]
      │                          │                           │
      │                    GL posted /                Returns to
      │                    finalized                  [Draft]
      │
      └─── If workflow disabled → auto-approve on submit
```

---

## 7. Approvals Inbox

**Location:** Main sidebar → Approvals (gated by `VITE_RBAC_V2_APPROVAL_MATRIX=true` + `workflow.view` permission)

**Views available:**
- Assigned to Me
- All Pending

**Actions per item:**
- Approve
- Reject  
- Return (send back for revision)
- Escalate (push to next level)

---

## 8. Permissions

| Permission | Who Needs It | Use |
|------------|-------------|-----|
| `workflow.view` | Anyone who can approve | See approvals queue + sidebar |
| `workflow.approve` | Designated approvers | Perform approve/reject/return/escalate |
| `workflow.manage` | Finance admin | Configure workflow settings |
| `administration.approvals.final` | Super admin only | Manage RBAC approval matrix rules |

### SoD Enforcement
When `RBAC_V2_SOD=true`:
- Creator cannot approve own bill (`procurement.bills.create` ↔ `procurement.bills.approve`)
- Creator cannot approve own PO (`procurement.purchase_orders.create` ↔ `procurement.purchase_orders.approve`)
- Creator cannot approve own payment (`accounting.transactions.create` ↔ `approve.payments`)
- Creator cannot approve own journal (always enforced)

---

## 9. Phase 2 (Deferred)

| Feature | Status | Notes |
|---------|--------|-------|
| Payroll approval enforcement | Deferred | Permissions defined, no enforcement added |
| Rental approval enforcement | Deferred | Permissions defined, no enforcement added |
| Dedicated Approvals dashboard with metrics | Deferred | Currently queue panel only |
| Email notifications for approvers | Partial | `workflowNotificationService.ts` exists, needs email config |
| Delegation workflow | Implemented | Available via 'delegate' action |
| Mobile approvals | Implemented | Separate `mobileApprovalsApi.ts` for executive mobile |
