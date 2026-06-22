# Payroll Module — User Acceptance Test (UAT)

**Document ID:** UAT-PAYROLL-002  
**UAT version:** 2.0  
**Product build:** 1.2.456+  
**Last updated:** 2026-06-21  

> Regenerate Word: `node scripts/generate-payroll-uat-docx.mjs`

**Changelog:** v2.0 — Audit Log tab, SoD payroll approval, in-cycle approval panel, void payslip, enhanced dashboard KPIs, API-only PostgreSQL path, RBAC 2.0.

---

## What changed in v2.0

- New **Audit Log** sub-tab — payroll events from GET /api/v1/audit/events?module=payroll
- **Segregation of duties (SoD)** — payroll run creator cannot approve their own run
- **PayrollRunApprovalPanel** in Wizard step 7 and Payroll Processing banner (approve / revert)
- **Unapprove** — revert APPROVED run to GENERATED (blocked if any payslip has payments)
- **Void payslip** (fully paid) vs **Delete payslip** (unpaid) — void requires reason; manual GL reversal warning
- **Dashboard** — 8 KPI cards + Awaiting Approval / Ready to Pay / Unpaid Liability banners
- **API-only** — PostgreSQL + REST; no client SQLite payroll path in staging/production
- Virtualized employee list & ledger; server-side employee search pagination

---

## UI navigation reference

```text
Desktop Full ERP navigation
• Main sidebar → **Payroll** opens Payroll Hub.
• Payroll sub-navigation (desktop left column / mobile **Payroll** dropdown):
  Dashboard | Employees | Attendance* | Leave Management* | Payroll Wizard | Payroll Processing | Payslips | Reports | Payment History | **Audit Log** | Settings
  (*Attendance / Leave require attendance.read / leave.read.)
• Staging: org **test company**, user **Rafi** / **Rafi1234** (npm run db:seed:staging).
• SoD tests need **two users**: one with payroll.runs.create (Preparer) and one with payroll.runs.approve (Approver) who is NOT the run creator.
```

---

## Test environment

| Item | Value |
|------|-------|
| Stack | `npm run test:staging` |
| Database | PostgreSQL `pBookspro_Staging` (API-only) |
| SoD | Two users: Preparer + independent Approver |
| Login | test company / Rafi / Rafi1234 |

---

## 1. Navigation & shell

| ID | Test case | Persona | UI guide | Expected | Result | Tester | Date | Notes |
|----|-----------|---------|----------|----------|--------|--------|------|-------|
| NAV-01 | Open Payroll module | Payroll Admin | 1. Log in (Desktop Full ERP).<br>2. Main sidebar → **Payroll**. | Payroll Hub loads with sub-navigation including **Audit Log**. | | | | |
| NAV-02 | Sub-tabs by permission | Payroll Admin | 1. As Payroll Admin — verify all tabs.<br>2. As user without attendance.read — **Attendance** hidden.<br>3. Without leave.read — **Leave Management** hidden. | Tabs match RBAC; Audit Log visible to users with payroll access. | | | | |
| NAV-03 | Mobile section picker | Payroll Admin | 1. Viewport <768px.<br>2. Use top **Payroll** dropdown to switch sections. | All permitted sections listed; content updates. | | | | |

---

## 2. Dashboard (enhanced)

| ID | Test case | Persona | UI guide | Expected | Result | Tester | Date | Notes |
|----|-----------|---------|----------|----------|--------|--------|------|-------|
| DASH-01 | KPI cards | Payroll Admin | Payroll → **Dashboard**. Review cards: Active employees, Payroll runs, Pending approval, Approved runs, Unpaid payslips, Payroll cost this month, Paid YTD, Outstanding liability. | Eight KPI cards with counts/currency; values match underlying data. | | | | |
| DASH-02 | Awaiting approval banner | Payroll Admin | 1. Create GENERATED run (not approved).<br>2. Dashboard → **Awaiting Approval** panel. | Banner shows count of GENERATED runs needing independent approver. | | | | |
| DASH-03 | Ready to pay banner | Payroll Admin | 1. Approve a run (second user).<br>2. Dashboard → **Ready to Pay** panel. | Banner shows approved run count; directs to disburse from Processing. | | | | |
| DASH-04 | Unpaid liability banner | Payroll Admin | Leave approved-but-unpaid payslips → Dashboard. | Outstanding liability shows sum of unpaid payslip balances. | | | | |

---

## 3. Settings & configuration

| ID | Test case | Persona | UI guide | Expected | Result | Tester | Date | Notes |
|----|-----------|---------|----------|----------|--------|--------|------|-------|
| SET-01 | Create department | Payroll Admin | Payroll → **Settings** → Departments → **+ Add Department** → Save. | Department listed with staff count 0. | | | | |
| SET-02 | Create grade | Payroll Admin | Settings → Grade Levels → **+ Add Grade** → min/max salary → Save. | Grade shows BASE and MULTIPLIER badges. | | | | |
| SET-03 | Work week | Payroll Admin | Settings → **Work Week** → set Mon–Fri working → Save. | Wizard LOP/attendance uses configured week. | | | | |
| SET-04 | Leave type | Payroll Admin | Settings → **Leave Types** → Add type → Save. Verify in Leave Management. | Type available for new leave requests. | | | | |

---

## 4. Employees (workforce)

| ID | Test case | Persona | UI guide | Expected | Result | Tester | Date | Notes |
|----|-----------|---------|----------|----------|--------|--------|------|-------|
| EMP-01 | Add employee | Payroll Admin | Employees → **+ Add Employee** → personal, job, salary, allocations → **Save Employee**. | Employee in virtualized workforce table. | | | | |
| EMP-02 | Server search | Payroll Admin | Employees → **Search workforce...** (API mode) → type name; wait debounce. | Paginated API search returns matches (<2s on LAN). | | | | |
| EMP-03 | Employee ledger | Payroll Admin | Processing → select employee → filter **Ledger** OR Employee Profile ledger. | Virtualized ledger; payable/advance balance correct. | | | | |

---

## 5. Attendance & leave

| ID | Test case | Persona | UI guide | Expected | Result | Tester | Date | Notes |
|----|-----------|---------|----------|----------|--------|--------|------|-------|
| ATT-01 | Daily attendance | Payroll Admin | Attendance → **Daily** → **+ Add** → employee, status → Save. | Row saved; dashboard counts update. | | | | |
| ATT-02 | Bulk attendance | Payroll Admin | Daily → **Bulk** modal → apply status to multiple employees. | All rows created/updated. | | | | |
| LVE-01 | Approve leave | Payroll Admin | Leave Management → Requests → create → **Approvals** → Approve. | APPROVED; attendance days auto-created. | | | | |

---

## 6. Payroll Wizard

| ID | Test case | Persona | UI guide | Expected | Result | Tester | Date | Notes |
|----|-----------|---------|----------|----------|--------|--------|------|-------|
| WIZ-01 | Full wizard flow | Payroll Admin | Wizard: Period → **Continue** → Attendance → LOP → Preview → **Generate summaries** → **Process payslips** → Approval step. | Run reaches GENERATED with payslips; step 7 shows approval panel. | | | | |
| WIZ-02 | Past period entry | Payroll Admin | Processing → **Payroll wizard (past period)** → pick month/year → Open wizard. | Wizard opens at step 1 with selected period. | | | | |
| WIZ-03 | Force override summaries | Payroll Admin | Step Generate → check **Admin override** → **Generate summaries**. | Summaries regenerated for existing period. | | | | |

---

## 7. Segregation of duties (SoD) — approval

| ID | Test case | Persona | UI guide | Expected | Result | Tester | Date | Notes |
|----|-----------|---------|----------|----------|--------|--------|------|-------|
| SOD-01 | Creator cannot approve (Wizard) | Preparer (created the run) | 1. User A creates & processes run to step 7.<br>2. User A on Approval step — observe **Waiting For Approver** (disabled Approve).<br>3. Message cites company SoD policy. | Approve disabled; amber policy text shown; no API approve success. | | | | |
| SOD-02 | Independent approver (Wizard) | Approver (different user) | 1. User B (not creator) opens Wizard step 7 OR Processing approval banner.<br>2. Click **Approve Payroll Run**. | Run status APPROVED; approved_by / approved_at populated. | | | | |
| SOD-03 | In-cycle approval panel | Payroll Admin | Processing → select period with GENERATED run → violet **approval banner** at top of right panel.<br>Verify checklist: Payroll generated ✓, Payslips processed ✓, Ready for approval. | PayrollRunApprovalPanel shows creator, requirements, approve action. | | | | |
| SOD-04 | Unapprove (revert) | Approver | Approved run with **no payments** → Approval panel → **Revert to generated**. | Run returns to GENERATED; approved_by cleared. | | | | |
| SOD-05 | Unapprove blocked when paid | Payroll Admin | Approved run with paid payslip → attempt **Revert to generated**. | Error: cannot unapprove when payslips have payments. | | | | |

---

## 8. Payroll Processing & payments

| ID | Test case | Persona | UI guide | Expected | Result | Tester | Date | Notes |
|----|-----------|---------|----------|----------|--------|--------|------|-------|
| CYC-01 | Employee tree payable | Payroll Admin | Processing → left tree — **Payable** column per employee. | Unpaid net minus payments; **Adv** if overpaid. | | | | |
| CYC-02 | Pay single salary | Payroll Admin | APPROVED run → payslip row → **Pay** → **Pay Salary** modal → account, amount → **Confirm Payment**. | GL expense transaction; payslip paid/remaining updated. | | | | |
| CYC-03 | Bulk pay | Payroll Admin | Select checkboxes on unpaid payslips → toolbar **Pay (N)** → Bulk Pay modal → Confirm. | All selected payslips paid in one API call. | | | | |
| CYC-04 | Pay before approve blocked | Payroll Admin | GENERATED (not APPROVED) run → click **Pay**. | Blocked: run must be APPROVED. | | | | |
| CYC-05 | Edit payslip | Payroll Admin | Payslip row → **Edit** → adjust amounts → Save. | Net recalculated; audit event payroll.payslip.edited. | | | | |
| CYC-06 | Delete unpaid payslip | Payroll Admin | Unpaid payslip → **Delete** → confirm dialog. | Payslip removed; run totals updated. | | | | |
| CYC-07 | Void fully paid payslip | Payroll Admin | Fully paid payslip → **Void** (not Delete).<br>1. Enter **reason** (required).<br>2. Read payment reversal warning.<br>3. **Void Payslip**. | Payslip removed; toast reminds to reverse payment in Accounting; audit payroll.payslip.voided/deleted. | | | | |
| CYC-08 | Edit payment record | Payroll Admin | Record filter **Payments** → row **Edit** → LinkedTransactionWarningModal if linked → save. | Payment updated; linked payslip state consistent. | | | | |

---

## 9. Audit Log (new)

| ID | Test case | Persona | UI guide | Expected | Result | Tester | Date | Notes |
|----|-----------|---------|----------|----------|--------|--------|------|-------|
| AUD-01 | Open audit log | Payroll Admin | Payroll → **Audit Log**. | Table: When, Event, Who, Entity, Summary, Diff. (API mode only) | | | | |
| AUD-02 | Filter by event | Payroll Admin | Audit Log → **All events** dropdown → select e.g. **Run Approved** → refresh. | Only matching payroll audit events shown. | | | | |
| AUD-03 | Run approved event | Payroll Admin | After SoD approval → Audit Log → find **Run Approved**. | Shows approver name, run entity id, timestamp. | | | | |
| AUD-04 | Payslip paid event | Payroll Admin | After salary payment → filter **Payslip Paid**. | Event with summary and optional Before/After diff. | | | | |
| AUD-05 | Diff viewer | Payroll Admin | Row with data → expand **Before** / **After** under Diff column. | JSON diff displays old/new values. | | | | |

---

## 10. Reports, payslips, history

| ID | Test case | Persona | UI guide | Expected | Result | Tester | Date | Notes |
|----|-----------|---------|----------|----------|--------|--------|------|-------|
| RPT-01 | Payslips register | Payroll Admin | Payroll → **Payslips** → year filter. | All payslips; paid/remaining columns correct. | | | | |
| RPT-02 | Analytics & LOP | Payroll Admin | Reports → charts + LOP report + Attendance impact. | Totals match wizard/processing data. | | | | |
| RPT-03 | Payment history | Payroll Admin | Payment History → search/filter PAID runs. | Completed batches only. | | | | |

---

## 11. RBAC & real-time

| ID | Test case | Persona | UI guide | Expected | Result | Tester | Date | Notes |
|----|-----------|---------|----------|----------|--------|--------|------|-------|
| SEC-01 | No payroll.read | Payroll Admin | User without payroll.read — main sidebar. | Payroll module hidden. | | | | |
| SEC-02 | Operator cannot approve | Payroll Admin | User with runs.create but not runs.approve at step 7. | Permission message; approve blocked. | | | | |
| SYNC-01 | Real-time payslip pay | Payroll Admin | Browser A pays; Browser B on Processing same tenant. | B updates Paid/Remaining without F5. | | | | |

---

## 12. Negative & edge cases

| ID | Test case | Persona | UI guide | Expected | Result | Tester | Date | Notes |
|----|-----------|---------|----------|----------|--------|--------|------|-------|
| NEG-01 | Void without reason | Payroll Admin | Void modal → leave reason empty → **Void Payslip**. | Validation: reason required. | | | | |
| NEG-02 | Approve missing summaries | Payroll Admin | Attempt approve before Generate summaries. | Blocked with attendance summary error. | | | | |
| NEG-03 | Concurrent run lock | Payroll Admin | Two users edit same payslip simultaneously. | 409 LOCK_HELD on second save. | | | | |

---

## End-to-end happy path (with SoD)

| Step | Action | UI guide | Verification | Result |
|------|--------|----------|--------------|--------|
| 1 | Configure Settings (dept, grade, work week, leave type) | Payroll → Settings — complete all configuration cards. | Settings persist after refresh | |
| 2 | Add 2 employees with salary + project allocation | Employees → + Add Employee (×2). | Both in workforce list | |
| 3 | Enter attendance + approve leave for payroll month | Attendance Daily + Leave Approvals. | Monthly sheet and LOP inputs complete | |
| 4 | User A: Wizard through Process (GENERATED) | Payroll Wizard — full flow to step 6; do NOT approve. | Run GENERATED; payslips exist | |
| 5 | User B: Approve run (SoD) | User B → Processing approval banner OR Wizard step 7 → Approve. | APPROVED; User A cannot self-approve | |
| 6 | Pay all payslips (bulk) | Processing → select payables → Pay (N) → Confirm. | GL transactions; Remaining = 0 | |
| 7 | Verify Dashboard, Audit Log, Reports | Dashboard KPIs; Audit Log events; Reports totals. | Consistent figures across views | |
| 8 | Second session sync check | Browser B observes pay/approve without refresh. | Real-time updates | |

---

## API smoke checks

| Endpoint | Method | Expect | Related UI | Result |
|----------|--------|--------|------------|--------|
| /api/v1/payroll/departments | GET | 200 | Settings load | |
| /api/v1/payroll/employees?page=1&pageSize=50 | GET | 200 paginated | Employees tab | |
| /api/v1/payroll/runs | GET | 200 | Processing | |
| /api/v1/payroll/runs/:id/approve | POST | 200 or 403 SoD | Approval (Approver only) | |
| /api/v1/payroll/runs/:id/unapprove | POST | 200 or 400 if paid | Revert approval | |
| /api/v1/audit/events?module=payroll | GET | 200 items[] | Audit Log tab | |

---

## Acceptance criteria

- [ ] E2E path passes with two-user SoD approval
- [ ] Audit Log shows run approve, pay, void events
- [ ] Dashboard KPIs match Processing data
- [ ] Void vs Delete payslip rules verified
- [ ] Real-time sync on pay/approve

---

## Sign-off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| QA / UAT Lead | | | |
| HR / Payroll Owner | | | |
| Engineering | | | |
