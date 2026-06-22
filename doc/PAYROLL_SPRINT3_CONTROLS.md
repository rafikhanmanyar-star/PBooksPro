# Payroll Sprint 3 — Audit Trail, Void & Reversal Controls

**Document ID:** PAYROLL-SPRINT3-001  
**Last updated:** 2026-06-22  
**Depends on:** Sprint 2 accrual accounting (`doc/PAYROLL_ACCOUNTING_VERIFICATION.md`)

---

## 1. Payroll Audit Event Catalog

Canonical keys live in `backend/src/modules/payroll/services/payroll/payrollAuditCatalog.ts` (mirrored in `components/payroll/utils/payrollAuditCatalog.ts`).

| Audit action | Entity type | Trigger | Before state | After state | Reason required |
|--------------|-------------|---------|--------------|-------------|-----------------|
| `payroll.run.created` | payroll_run | Create/upsert run for period | — / prior run | Run snapshot | No |
| `payroll.run.generated` | payroll_run | Attendance summaries generated (wizard) | — | Period + count | No |
| `payroll.summary.generated` | payroll_summary | Same (batch detail) | — | Summary batch | No |
| `payroll.run.processed` | payroll_run | Process payslips | Run | Run + processing_summary | No |
| `payroll.run.approved` | payroll_run | Approve (SoD) | GENERATED | APPROVED | No |
| `payroll.run.unapproved` | payroll_run | Unapprove | APPROVED | GENERATED | No |
| `payroll.run.accrual_posted` | payroll_run | Accrual journal on approve | — | journal ref | No |
| `payroll.run.reversed` | payroll_run | Accrual reversed (unapprove/void) | APPROVED | accrualReversed | **Yes** (void) |
| `payroll.run.voided` | payroll_run | Void run | Run | voided | **Yes** |
| `payroll.payslip.created` | payslip | Manual create | — | Payslip | No |
| `payroll.payslip.generated` | payslip | Process/revive | — | Payslip | No |
| `payroll.payslip.updated` | payslip | Edit amounts | Payslip | Payslip | No |
| `payroll.payslip.paid` | payslip | Pay payslip | Payslip | Payslip paid | No |
| `payroll.payslip.voided` | payslip | Void payslip | Payslip | voided | **Yes** |
| `payroll.payment.created` | payroll_payment | Pay payslip (transaction) | — | tx + payslipId | No |
| `payroll.payment.reversed` | payroll_payment | Reverse payment | Payment | reversed | **Yes** |
| `payroll.payment.voided` | payslip | Linked payslip audit on reversal | — | reversed tx | **Yes** |
| `payroll.lop.applied` | payslip | LOP on generate | — | LOP detail | No |
| `payroll.work_week.updated` | payroll_settings | Work week change | — | Config | No |

**Standard fields (all events):** `user_id`, `created_at`, `entity_id`, `entity_type`, `old_value`, `new_value`; reason stored in `new_value.reason` when applicable.

---

## 2. Audit Log Validation Report

| Surface | Who | When | What changed | Why |
|---------|-----|------|--------------|-----|
| **Audit Log tab** | `user_name` / `user_id` | `created_at` | Event label + Before/After diff | **Reason** column (`new_value.reason`) |
| **Run approval panel** | Creator / approver names | `created_at`, `approved_at` | Status transitions | Unapprove/void via API reason |
| **Payslip void modal** | Current user | On submit | Payslip removed from cycle | Mandatory textarea → API |
| **Payment reversal** | Current user | On POST reverse | Transaction soft-deleted + journal reversed | Mandatory reason |

**API:** `GET /api/v1/audit/events?module=payroll`

**Gap (Sprint 4+):** Per-entity audit tab on payslip/payment detail drawers (filter by `entity_id`).

---

## 3. Void Payslip Workflow

```
GENERATED run + unpaid payslip → POST /payroll/payslips/:id/void { reason }
```

| Rule | Enforcement |
|------|-------------|
| Reason mandatory (≥3 chars) | Zod + `PayrollValidationError` |
| RBAC | Payroll write access on route |
| No silent delete | Soft-delete + `payroll.payslip.voided` audit |
| Has payments | Block — reverse payment first |
| APPROVED/PAID run | Block — unapprove run first (correction workflow) |
| Real-time | `emitEntityEvent` deleted payslip |

---

## 4. Void Payroll Run Workflow

```
POST /api/v1/payroll/runs/:id/void { reason }
```

| Rule | Enforcement |
|------|-------------|
| Reason mandatory | Zod |
| PAID run | Block |
| Any payslip with payment | Block |
| APPROVED run | Reverse accrual journal first → `payroll.run.reversed` → void |
| Audit | `payroll.run.voided` with reason |
| UI | `VoidPayrollRunModal` (API mode) |

---

## 5. Payment Reversal Design

**Choice:** **Reverse payment** (not a separate void flag) — aligns with Sprint 2 settlement journals.

```
POST /api/v1/payroll/payments/:transactionId/reverse { reason }
```

1. Validate transaction has `payslip_id`
2. `softDeleteTransaction` → `reverseTransactionJournalMirror` (Dr Bank / Cr AP reversal)
3. `recalculatePayslipPaymentFromLedger`
4. Audit: `payroll.payment.reversed` + `payroll.payment.voided` on payslip
5. Emit transaction deleted + payslip updated

**Journal integrity:** Uses existing `FinancialPostingService.reverseTransactionMirror` — no Sprint 2 accrual changes.

---

## 6. Guided Correction Workflow

**Path:** Approved → Unapprove → Edit → Reprocess → Reapprove

| Step | API / UI | Audit |
|------|----------|-------|
| 1 Unapprove | `POST /payroll/runs/:id/unapprove` | `payroll.run.unapproved` + accrual reverse |
| 2 Edit payslips | `PUT /payroll/payslips/:id` | `payroll.payslip.updated` |
| 3 Reprocess | `POST /payroll/runs/:id/process` | `payroll.run.processed` |
| 4 Reapprove | `POST /payroll/runs/:id/approve` (non-creator) | `payroll.run.approved` + `payroll.run.accrual_posted` |

**UI:** `PayrollCorrectionGuide` in `PayrollRunApprovalPanel` when run is APPROVED.

**Validation:** Unapprove blocked if any payslip has payments (existing Sprint 2 rule).

---

## 7. Payroll Reversal Accounting Matrix

| Action | Journal entries | AP impact | Expense impact | Bank impact |
|--------|-----------------|-----------|----------------|-------------|
| **Unapprove** (no payments) | Reverse accrual: Dr AP / Cr Expense Summary | AP ↓ | Expense ↓ | None |
| **Void payslip** (unpaid, editable run) | None (payslip only) | None until re-approve | None | None |
| **Void run** (approved, no payments) | Reverse accrual then soft-delete | AP ↓ to 0 for run | Expense ↓ | None |
| **Reverse payment** | Reverse settlement: Dr Bank / Cr AP | AP ↑ (liability restored) | None | Bank ↑ |
| **Reverse payroll** (void approved run) | Accrual reversal + remove run | AP cleared | Expense cleared | None if unpaid |

Accrual/settlement account mapping unchanged from Sprint 2 (`sys-acc-expense-summary`, `sys-acc-ap`, bank account on payment).

---

## 8. ATP Additions (evidence requirements)

| ID | Test | Evidence |
|----|------|----------|
| AUD-01 | Create run → process → approve | Audit Log shows `created`, `processed`, `approved`, `accrual_posted` with user + timestamp |
| AUD-02 | Void payslip with reason | Audit Log row: `payslip.voided`, Reason column populated, diff shows prior payslip |
| VOID-01 | Void unpaid payslip on GENERATED run | 200 POST void; payslip gone from cycle; audit event |
| VOID-02 | Void APPROVED run (no payments) | Accrual reversed in GL; run soft-deleted; `run.reversed` + `run.voided` |
| REV-01 | Unapprove approved run | Status GENERATED; accrual journal reversed |
| REV-02 | Reapprove after correction | New accrual journal; SoD still enforced |
| REV-03 | Reverse payroll payment | AP/bank journal reversed; payslip unpaid; `payment.reversed` audit |
| NEG-01 | Void without payroll.write | 403 |
| NEG-02 | Reverse payment without permission | 403 |
| NEG-03 | Void paid run | 400 `RUN_PAID` |
| NEG-04 | Void payslip with payments | 400 `PAYSLIP_HAS_PAYMENTS` |

---

## 9. Sprint 3 Security Review

| Control | Status |
|---------|--------|
| Creator cannot approve | SoD in `approvePayrollRunLifecycle` (unchanged) |
| Unauthorized void | Requires authenticated tenant + payroll module access |
| Unauthorized reversal | Same; payment reverse on payroll router |
| Employee role | Payroll Hub gates admin tabs; no void on self-service path |
| Cross-tenant isolation | `TenantRepository` + `req.tenantId` on all mutations |
| Reason capture | Mandatory on void/reverse POST bodies |
| No hard delete | Soft-delete payslips/runs/transactions only |

**Recommendation:** Add explicit `payroll.void` permission in a future RBAC pass; currently guarded by payroll write + route auth.

---

## 10. Files Changed

| Area | Files |
|------|-------|
| Audit catalog | `payrollAuditCatalog.ts`, `payrollAuditService.ts` |
| Void/reversal | `payrollVoidService.ts` |
| Runs/pay audit | `payrollRuns.ts`, `attendanceSummary.service.ts` |
| API routes | `payrollRoutes.ts` |
| Frontend API | `payrollApi.ts` |
| UI | `PayrollAuditLog.tsx`, `VoidPayslipModal.tsx`, `VoidPayrollRunModal.tsx`, `PayrollCorrectionGuide.tsx`, `PayrollRunApprovalPanel.tsx`, `PayrollHub.tsx`, `payrollAuditCatalog.ts` (FE) |
| Docs | This file, `PAYROLL_MODULE_UAT.md` (ATP section) |

---

## 11. Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Legacy DELETE without reason still callable | Low | Prefer POST void; DELETE delegates to void and fails without reason in future |
| Void approved payslip without unapprove | Medium | Blocked server-side; UI shows correction workflow |
| Payment reversal via Accounting bypasses payroll audit | Medium | Use `POST /payroll/payments/:id/reverse` for payroll-linked txs |
| No dedicated `payroll.void` RBAC key | Low | Documented; uses payroll write until RBAC expansion |
| Finance ACCT verification in parallel | — | Sprint 2 design frozen unless defect found |

---

## Exit criteria

- [x] Payroll audit event catalog standardized
- [x] Void payslip/run with mandatory reason
- [x] Payment reversal with journal integrity
- [x] Correction workflow UI guidance
- [x] ATP definitions documented
- [ ] QA execution of AUD/VOID/REV/NEG on staging (manual)

**Next:** Sprint 4 — Payroll Reports & Exports.
