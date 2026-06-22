# Payroll Sprint 4 — Reports & Exports

**Document ID:** PAYROLL-SPRINT4-001  
**Last updated:** 2026-06-22  
**Depends on:** Sprint 2 accounting, Sprint 3 audit/void controls

---

## 1. Report catalog

| Report | API | UI tab |
|--------|-----|--------|
| Payroll Summary | `GET /api/v1/payroll/reports/summary` | Summary |
| Payroll Register | `GET /api/v1/payroll/reports/register` | Register |
| Payment History | `GET /api/v1/payroll/reports/payment-history` | Payment History |
| Payroll Liability | `GET /api/v1/payroll/reports/liability` | Liability |
| Payroll Journal | `GET /api/v1/payroll/reports/journal` | Journal |
| Attendance Impact | `GET /api/v1/payroll/reports/attendance-impact-v2` | Attendance Impact |
| Leave Impact | `GET /api/v1/payroll/reports/leave-impact` | Leave Impact |
| LOP | `GET /api/v1/payroll/reports/lop` (existing) | LOP |
| Analytics (charts) | Client storage sync | Analytics |

**Navigation:** Payroll → **Reports** → tab bar.

**Shared filters:** `month` (1–12), `year`, optional `departmentId`, `employeeId`, `status`, `runId`, `fromDate`, `toDate`.

---

## 2. Payroll Register

Master period reconciliation — one row per payslip.

| Column | Source |
|--------|--------|
| Employee Code / Name / Dept / Designation | `payroll_employees` |
| Payroll Period | `payroll_runs.month` + `year` |
| Basic / Allowances / Overtime / Gross | `payslips` + adjustment JSON |
| Deductions / Leave (LOP) / Advance recovery | `payslips` + deduction JSON |
| Net / Paid / Remaining / Status | `payslips` |

**Formula:** `remaining = net_pay - paid_amount`; status Paid | Partial | Unpaid.

---

## 3. Payment History

Transaction-level payroll settlements (`transactions.payslip_id`).

Columns: Employee, Payment Date, Reference, Payment Method (bank account), Amount, Created By, Period, Status.

---

## 4. Payroll Liability (Sprint 2 accrual)

Per approved/paid run:

```
Outstanding Liability = Approved Payroll − Payments Made
```

`Approved Payroll` = `payroll_runs.total_amount`  
`Payments Made` = SUM(`payslips.paid_amount`)

Totals row on report matches sum of per-run outstanding.

---

## 5. Payroll Journal

Links `journal_entries` (`source_module = payroll_run`) to run approval and settlement.

| Column | Meaning |
|--------|---------|
| Expense Amount | Dr `sys-acc-expense-summary` on accrual journal |
| Liability Amount | Cr `sys-acc-ap` on accrual journal |
| Payments Settled | Sum payslip payments |
| Remaining Liability | Liability − settled (0 if journal reversed) |

---

## 6. Attendance & Leave impact

- **Attendance Impact (v2):** present, absent, leave, half day, late, LOP from `payroll_attendance_summaries`.
- **Leave Impact:** leave type (from approved `leave_requests` when available), leave days, LOP impact from payslip `lop_deduction`.
- **LOP:** existing endpoint; employees with `lop_days > 0`.

All support **Print** and **CSV** via `PayrollReportShell`.

---

## 7. Payroll Summary (management)

KPIs: employees processed, gross, deductions, net, paid, outstanding, average salary, department breakdown.

Uses `shared/report-engines/payrollReportsCore.ts` aggregation (compiled into backend bundle).

---

## 8. Export standardization

**Utility:** `components/payroll/utils/payrollReportExport.ts`

| Rule | Implementation |
|------|----------------|
| File naming | `payroll-{reportKey}_{YYYY-MM-DD}.csv` or with period suffix |
| Headers | Human-readable column titles in CSV |
| Currency | `formatCurrency` / numeric in CSV for Excel |
| Dates | `toLocalDateString` / ISO date slice |
| Print | `usePrintReport` + `ReportHeader` / `ReportFooter` |

---

## 9. ATP (REP-01 – REP-10)

| ID | Test | Evidence |
|----|------|----------|
| REP-01 | Payroll Register | Screenshot + CSV + API `register` rows match payslips |
| REP-02 | Payment History | Transaction rows match Accounting payslip payments |
| REP-03 | Liability | Outstanding = approved − paid per run |
| REP-04 | Journal | Accrual journal ID + amounts match GL |
| REP-05 | Attendance Impact | Rows match attendance summaries |
| REP-06 | Leave Impact | LOP amounts match payslip deductions |
| REP-07 | CSV Export | Open CSV; headers and row count match grid |
| REP-08 | Print | Print preview shows header, table, footer |
| REP-09 | Filters | Change month/year; row set updates |
| REP-10 | Large dataset | 500+ employees; report loads < 30s |

---

## 10. Finance reporting review checklist

- [ ] Register net total = sum of payslip `net_pay` for period
- [ ] Liability outstanding = AP payroll payable (approved runs)
- [ ] Journal expense = accrual Dr expense summary
- [ ] Payment history sum = payslip `paid_amount` aggregate
- [ ] No direct DB queries required for reconciliation

---

## 11. Files changed (Sprint 4)

| Area | Path |
|------|------|
| Report engine | `shared/report-engines/payrollReportsCore.ts` |
| Repository | `backend/.../PayrollReportingRepository.ts` |
| Service | `backend/.../payrollReportingService.ts` |
| Routes | `backend/.../payrollReportingRoutes.ts` |
| API client | `services/api/payrollReportsApi.ts` |
| Export utils | `components/payroll/utils/payrollReportExport.ts` |
| UI shell | `components/payroll/reports/PayrollReportShell.tsx` |
| Reports hub | `components/payroll/reports/PayrollReportsHub.tsx` |
| Report tabs | `PayrollRegisterReport.tsx`, `PayrollPaymentHistoryReport.tsx`, etc. |

---

## Exit criteria

- [x] Report APIs implemented under `/api/v1/payroll/reports/*`
- [x] UI hub with grid, print, CSV
- [x] Liability aligns with Sprint 2 accrual model
- [x] Journal report for finance verification
- [ ] ATP executed on staging (manual QA)
- [ ] Finance sign-off

**Next:** Sprint 5 — Employee Self-Service & Final Production Readiness.
