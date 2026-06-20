# A5.1.4.1 — Data Scope Coverage Closure Report

**Phase:** A5.1.4.1 — RBAC 2.0 Data Scope Coverage Closure  
**Date:** 2026-06-19  
**Authority:** Claude A5.1.4 Review · [`A5_1_4_IMPLEMENTATION_REPORT.md`](./A5_1_4_IMPLEMENTATION_REPORT.md) · [`RBAC_2_ARCHITECTURE_V2.md`](./RBAC_2_ARCHITECTURE_V2.md) §5

---

## Summary

Closes all findings from the A5.1.4 review (H1, M1–M5). No new RBAC features, no approval matrix, no migration. Repository- and report-level scope enforcement only.

**Production enablement stack (unchanged):**

```env
RBAC_V2_ROLE_MANAGEMENT=true
RBAC_V2_AUTHORIZATION_ENGINE=true
RBAC_V2_DATA_SCOPE=true
VITE_RBAC_V2_DATA_SCOPE=true
```

---

## Resolved Findings

| ID | Finding | Resolution |
|----|---------|------------|
| **H1** | Financial, construction, payroll reports unscoped | Scope SQL / `scopeCtx` wired on all report domains (see matrices below) |
| **M1** | `RBAC_V2_DATA_SCOPE` without engine fails open | `failClosed` in `applyDataScope()`; global `503 CONFIGURATION_ERROR` middleware; flag gate in `dataScopeRoutes` |
| **M2** | Payroll runs unscoped | `PayrollRunRepository` + `PayslipRepository` department scope via payslip/employee join |
| **M3** | Rental agreements unscoped | `RentalAgreementRepository` property + owner scope; routes pass `dataScopeContextFromRequest` |
| **M4** | Purchase orders unscoped | `PurchaseOrderRepository` project + department scope; list/get routes wired |
| **M5** | Union precedence undocumented | Documented in `dataScopeResolver.ts`; tests for user ALL + role ASSIGNED |

---

## Repository Coverage Matrix

| Module | Repository | Dimensions | Routes / services |
|--------|------------|------------|-------------------|
| Projects | `ProjectRepository` | project | `projectsRoutes` |
| Properties | `PropertyRepository` | property, owner | properties routes |
| Payroll employees | `PayrollEmployeeRepository` | department | `payrollRoutes` |
| **Payroll runs** | `PayrollRunRepository` | department (via payslips) | `/payroll/runs`, `/payroll/runs/:id` |
| **Payslips** | `PayslipRepository` | department (via employee join) | `/payroll/runs/:runId/payslips` |
| **Rental agreements** | `RentalAgreementRepository` | property, owner | `rentalAgreementsRoutes` |
| **Purchase orders** | `PurchaseOrderRepository` | project, department | `purchaseOrdersRoutes` |
| Transactions (reports) | `TransactionRepository` | project, property | `loadBalanceSheetStateInput` |
| Bills (reports) | `BillRepository` | project, property | `loadBalanceSheetStateInput` |
| Invoices (reports) | `InvoiceRepository` | project, property | `loadBalanceSheetStateInput` |
| Journal ledger (reports) | `JournalRepository` | project, property | balance sheet, P&L, cash flow, trial balance |

---

## Report Coverage Matrix

| Domain | Service / path | Enforcement mechanism |
|--------|----------------|----------------------|
| Rental | `rentalReportingService.ts` | `mergeReportScopeIntoFilter` (property, owner) |
| **Construction** | `constructionReportingService.ts` | `mergeReportScopeIntoFilter` (project on bills/contracts) |
| **Financial — Balance Sheet** | `balanceSheetReportService.ts` | `scopeCtx` → journal + transactional loaders |
| **Financial — P&L** | `profitLossReportService.ts` | `scopeCtx` → shared state loader |
| **Financial — Cash Flow** | `cashFlowReportService.ts`, `cashFlowJournalReportService.ts` | `appendFinancialRbacScopeSql` on journal queries |
| **Financial — Trial Balance** | `trialBalanceReportService.ts` | `rbacScopeCtx` on `aggregateTrialBalanceRows` |
| **Payroll** | `payrollConfig.departmentStats` | scoped `listEmployees` + department filter |

Export and print paths use the same route handlers and services — no separate bypass.

---

## CI Gate Status

**Command:** `npm run verify:rbac-v2`

**Section 10 (added in A5.1.4.1):** Greps required report files for scope enforcement symbols (`applyDataScope`, `mergeReportScopeIntoFilter`, `appendFinancialRbacScopeSql`, `departmentScopeRunExistsClause`, or `scopeCtx` parameter).

| Check | Status |
|-------|--------|
| Catalog / bundle / SoD (sections 1–9) | Unchanged |
| Report scope grep (section 10) | **Implemented — passes when all report files scoped** |

---

## Flag Dependency Enforcement (M1)

| Condition | Behavior |
|-----------|----------|
| `RBAC_V2_DATA_SCOPE=false` | No repository filters; `dataScopeContextFromRequest` returns `{ enabled: false }` |
| `RBAC_V2_DATA_SCOPE=true` + `RBAC_V2_AUTHORIZATION_ENGINE=false` | **503 `CONFIGURATION_ERROR`** on all `/api/v1/*` requests via `requireRbacDataScopeConfiguration` |
| Data scope enabled, engine on, no `req.effectiveAccess` | `failClosed: true` → `applyDataScope` emits `1=0`; `rowMatchesScope` returns false |
| Valid stack (both flags on, engine populated context) | Normal scoped enforcement |

---

## Scope Precedence Rules (M5)

Per dimension, user-level and role-level rows are **unioned** (OR semantics — least restrictive wins):

1. **No rows** for a dimension → implicit `mode: all` (migration-safe default).
2. **Any row** with `entity_id IS NULL` (all marker), from user **or** role → `mode: all` for that dimension.
3. Otherwise → `mode: assigned` with union of distinct `entity_id` values from user and role grants.

**Example:** User-level ALL on `department` + role-level ASSIGNED to `dept_a` → effective **`all`** (user ALL wins).

Documented in `backend/src/auth/dataScopeResolver.ts` (`mergeDimensionScopes` / exported `mergeEffectiveDataScopeGrants`).

---

## Tests

`backend/src/auth/dataScopeEnforcement.test.ts` — extended with:

- Union precedence (M5)
- Fail-closed / deny-all (M1)
- Configuration error when flags misaligned (M1)

Run:

```powershell
node --import tsx --test backend/src/auth/dataScopeEnforcement.test.ts
npm run verify:rbac-v2
npm run build:backend
```

---

## Files Added / Modified (closure)

| File | Change |
|------|--------|
| `backend/src/auth/rbacDataScopeFeatureFlag.ts` | Engine dependency + `assertRbacV2DataScopeConfiguration` |
| `backend/src/middleware/rbacDataScopeConfigMiddleware.ts` | **New** — 503 on misconfiguration |
| `backend/src/auth/tenantRepositoryScope.ts` | `failClosed` + engine-aware context |
| `backend/src/auth/dataScopeResolver.ts` | M5 documentation + export `mergeEffectiveDataScopeGrants` |
| `backend/src/modules/accounting/services/financialReportScope.ts` | **New** — journal/transaction scope SQL |
| `backend/src/modules/reporting/services/constructionReportingService.ts` | Project scope on all report queries |
| Financial report services + routes | `scopeCtx` / `appendFinancialRbacScopeSql` |
| `PayrollRunRepository`, `PayslipRepository` | Department scope |
| `RentalAgreementRepository`, `PurchaseOrderRepository` | Property/owner and project/department scope |
| `scripts/verify-rbac-v2.mjs` | Section 10 report scope grep |
| `backend/src/auth/dataScopeEnforcement.test.ts` | M1, M5 tests |

---

## Re-Review Readiness

| Criterion | Status |
|-----------|--------|
| All report domains scoped | Yes |
| Payroll runs scoped | Yes |
| Rental agreements scoped | Yes |
| Purchase orders scoped | Yes |
| CI gate verified | Yes (section 10) |
| Fail-open risk removed | Yes (M1) |
| Scope precedence documented | Yes (M5) |
| Ready for production `RBAC_V2_DATA_SCOPE=true` | **Yes** (after migration 135 + engine stack) |
