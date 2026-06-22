# RBAC Data Scope — User Acceptance Testing (UAT)

**Product:** PBooks Pro  
**Feature:** RBAC V2 Data Scope (A5.1.4)  
**Document version:** 1.0  
**Date:** 2026-06-22  
**Environment:** Staging (`pBookspro_Staging`, API port **3001**)  
**Related:** [`RBAC_DATA_SCOPE_STAGING_ACTIVATION_REPORT.md`](./RBAC_DATA_SCOPE_STAGING_ACTIVATION_REPORT.md) · [`RBAC_V2_VISUAL_TESTING_GUIDE.md`](./RBAC_V2_VISUAL_TESTING_GUIDE.md) · [`RBAC_V2_STAGING_CUTOVER_PLAN.md`](./RBAC_V2_STAGING_CUTOVER_PLAN.md)

---

## 1. Purpose

This document defines **User Acceptance Testing** for RBAC Data Scope: verifying that users only see and act on data allowed by their assigned scope dimensions, across approved modules.

**In scope for UAT**

- Scope dimensions: **project**, **property**, **owner**, **department**
- Approved modules: Projects, Properties, Bills, Transactions, Employees, Payroll, Dashboard (metrics/charts/activity), Reports (P&L read path)
- Scope administration UI (Settings → Security — Data Scopes)
- Session refresh after scope changes (`av` / re-login)

**Out of scope for this UAT**

- Approval Matrix (`RBAC_V2_APPROVAL_MATRIX` remains **false**)
- Production cutover
- Write-path scope on create/update/delete (permission-only today — see §8)
- Contracts, CRM, custom reports beyond P&L spot-check

---

## 2. Acceptance criteria

UAT is **accepted** when:

1. All **Critical** test cases pass for all three personas.
2. All **High** test cases pass, or failures are documented with accepted risk sign-off.
3. No **Critical** or **High** open defects remain.
4. Security Admin confirms scope assignment UI works and audit trail records changes.
5. Business owner signs off on staging soak readiness (§10).

---

## 3. Prerequisites

### 3.1 Environment

| Step | Action | Pass when |
|------|--------|-----------|
| E-01 | PostgreSQL running; database `pBookspro_Staging` | Connection OK |
| E-02 | `npm run db:migrate:staging` | Migrations applied (incl. `135_rbac_data_scopes.sql`) |
| E-03 | `npm run verify:rbac-v2` | All checks PASS |
| E-04 | Staging API running | `GET http://127.0.0.1:3001/health` → 200 |
| E-05 | Staging client built with Data Scope flags | `npm run test:staging` or equivalent |

### 3.2 Feature flags (staging)

**API (`.env.staging`):**

```env
RBAC_V2_AUTHORIZATION_ENGINE=true
RBAC_V2_ROLE_MANAGEMENT=true
RBAC_V2_SOD=true
RBAC_V2_DATA_SCOPE=true
RBAC_V2_APPROVAL_MATRIX=false
```

**Client (same file — rebuild required):**

```env
VITE_RBAC_V2_DATA_SCOPE=true
VITE_RBAC_V2_APPROVAL_MATRIX=false
```

Enable flags:

```powershell
npm run rbac:data-scope:staging:enable
# Restart API + rebuild client
```

### 3.3 Pilot data and users

Provision UAT fixtures and personas (tenant **`test-company`**):

```powershell
node --import tsx scripts/rbac-data-scope-staging-pilot.mjs --setup
```

| Persona | Login | Password | Role | Scope assignment |
|---------|-------|----------|------|------------------|
| **Company Admin** | `scope-admin@pbookspro.com` | `ScopePilot2026!` | `company_admin` | None → implicit **all** |
| **Project Manager** | `scope-pm@pbookspro.com` | `ScopePilot2026!` | `project_manager` | **Project Alpha** only |
| **Payroll Officer** | `scope-payroll@pbookspro.com` | `ScopePilot2026!` | `accountant` | **Department A** only |

Pilot fixtures include Project Alpha/Beta, Department A/B, sample bills, transactions, and employees prefixed `scope-pilot-*`.

> **Important:** After any scope assignment, affected users must **log out and log back in** before testing.

### 3.4 Automated pre-check (optional)

```powershell
npm run rbac:data-scope:staging:atp
```

Expected: **20/20 PASS**. Evidence: `docs/security/staging-evidence/data-scope-pilot-atp.json`.

---

## 4. Test legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Expected success |
| 🚫 | Expected denial (404, empty list, or permission message) |
| 🔄 | Re-login required after scope change |
| **Critical** | Security / data-leak risk |
| **High** | Core workflow broken for scoped user |
| **Medium** | Secondary path or reporting edge case |
| **Low** | Cosmetic / admin UX |

**Result columns:** Pass · Fail · Blocked · N/A

---

## 5. UAT test cases — Administration

| ID | Sev | Persona | Steps | Expected | Result | Notes |
|----|-----|---------|-------|----------|--------|-------|
| ADM-01 | Medium | Company Admin | Settings → **Security — Data Scopes** | Section visible (`VITE_RBAC_V2_DATA_SCOPE=true`) | | |
| ADM-02 | Medium | Payroll Officer | Open Security — Data Scopes | 🚫 No permission / section hidden | | |
| ADM-03 | High | Company Admin | Load scopes for ScopePM user | Shows **project** dimension = Assigned, Project Alpha ID | | |
| ADM-04 | High | Company Admin | Assign Department A to ScopePayroll → Save | ✅ Success toast; audit entry | | |
| ADM-05 | High | ScopePM | 🔄 Re-login after ADM-03 | New session; effective-context shows project scope | | |
| ADM-06 | Medium | Company Admin | Remove a scope grant | Grant removed; user 🔄 re-login sees wider/narrower data | | |

---

## 6. UAT test cases — Visibility (lists)

| ID | Sev | Persona | Steps | Expected | Result | Notes |
|----|-----|---------|-------|----------|--------|-------|
| V-01 | Critical | Company Admin | Projects list | ✅ Sees Project Alpha **and** Project Beta (pilot fixtures) | | |
| V-02 | Critical | Project Manager | Projects list | ✅ Alpha only; 🚫 Beta not listed | | |
| V-03 | Critical | Project Manager | Bills list | ✅ Bill on Alpha; 🚫 Bill on Beta | | |
| V-04 | Critical | Project Manager | Transactions list | ✅ Tx on Alpha; 🚫 Tx on Beta | | |
| V-05 | Critical | Payroll Officer | Payroll → Employees | ✅ Dept A employee; 🚫 Dept B employee | | |
| V-06 | High | Company Admin | Properties list | ✅ All tenant properties (no scope) | | Manual |
| V-07 | High | Project Manager | Properties list | Per property scope rules (if assigned); else all | | Manual if property scope used |

---

## 7. UAT test cases — Search & pagination

| ID | Sev | Persona | Steps | Expected | Result | Notes |
|----|-----|---------|-------|----------|--------|-------|
| S-01 | High | Project Manager | Bills → search `SP-BILL` | ✅ Alpha bill only | | |
| S-02 | High | Project Manager | Projects → search `Alpha` | ✅ Project Alpha only | | |
| P-01 | High | Project Manager | Bills → page 1 (paginated view) | ✅ Alpha bill; total excludes Beta | | |
| P-02 | High | Project Manager | Transactions → page 1 | ✅ Alpha tx only | | |

---

## 8. UAT test cases — Get by ID (IDOR prevention)

| ID | Sev | Persona | Steps | Expected | Result | Notes |
|----|-----|---------|-------|----------|--------|-------|
| G-01 | **Critical** | Project Manager | Open Project Beta by direct link / API | 🚫 Not found (404) | | |
| G-02 | **Critical** | Project Manager | Open Beta bill by ID | 🚫 Not found (404) | | |
| G-03 | **Critical** | Project Manager | Open Beta transaction by ID | 🚫 Not found (404) | | |
| G-04 | **Critical** | Payroll Officer | Open Dept B employee profile | 🚫 Not found (404) | | |
| G-05 | Critical | Payroll Officer | Open Dept A employee profile | ✅ Detail loads | | |

---

## 9. UAT test cases — Dashboard

| ID | Sev | Persona | Steps | Expected | Result | Notes |
|----|-----|---------|-------|----------|--------|-------|
| D-01 | High | Project Manager | Dashboard → main metrics load | ✅ Page loads; figures reflect scoped project data only | | |
| D-02 | High | Project Manager | Dashboard → charts | ✅ Charts render (no error) | | |
| D-03 | High | Project Manager | Dashboard → activity feed | ✅ Activity items scoped; no cross-project leakage | | |
| D-04 | Medium | Company Admin | Same dashboard widgets | ✅ Full tenant totals ≥ PM totals | | Compare AR/AP or project counts |

---

## 10. UAT test cases — Payroll

| ID | Sev | Persona | Steps | Expected | Result | Notes |
|----|-----|---------|-------|----------|--------|-------|
| PR-01 | Critical | Payroll Officer | Employee list | ✅ Dept A only | | |
| PR-02 | Critical | Payroll Officer | Employee ledger (Dept A) | ✅ Loads | | |
| PR-03 | Critical | Payroll Officer | Employee ledger (Dept B) | 🚫 Denied / not found | | |
| PR-04 | High | Payroll Officer | View payslip (Dept A) | ✅ Allowed | | |
| PR-05 | High | Payroll Officer | View payslip (Dept B) | 🚫 Denied / not found | | |
| PR-06 | High | Company Admin | Process payroll run spanning depts | ✅ Full access (no dept scope) | | |

---

## 11. UAT test cases — Reports

| ID | Sev | Persona | Steps | Expected | Result | Notes |
|----|-----|---------|-------|----------|--------|-------|
| R-01 | Medium | Project Manager | Reports → Profit & Loss | ✅ Report loads | | |
| R-02 | Medium | Project Manager | P&L figures vs Admin | PM totals ≤ Admin totals for same period | | |
| R-03 | Low | Project Manager | Trial balance / AR aging | Scoped or permission-gated | | Known partial coverage |

---

## 12. UAT test cases — Session & real-time

| ID | Sev | Persona | Steps | Expected | Result | Notes |
|----|-----|---------|-------|----------|--------|-------|
| RT-01 | High | ScopePM | Admin changes scope; PM stays logged in | Next API call → stale session / re-login prompt | | |
| RT-02 | High | ScopePM | 🔄 Re-login after scope change | New scope applied immediately | | |
| RT-03 | Medium | Two browsers: Admin + PM | Admin edits shared entity in scope | PM view updates via socket (no F5 primary) | | Real-time First |

---

## 13. Negative & edge cases

| ID | Sev | Persona | Steps | Expected | Result | Notes |
|----|-----|---------|-------|----------|--------|-------|
| N-01 | Critical | New user, no scope rows | Login with read permissions | Implicit **all** tenant data (document for pilot) | | |
| N-02 | High | Project Manager | Create bill on Beta project (if UI allows) | Permission may allow; scope write gap — document result | | Known gap §14 |
| N-03 | Medium | Break-glass / super_admin | Any scoped module | ✅ Full visibility | | |
| N-04 | Medium | ScopePM | Client filter param `projectId=Beta` on API | 🚫 Server scope still enforced | | No client-only bypass |

---

## 14. Known limitations (not UAT failures unless agreed)

| Area | Status | UAT action |
|------|--------|------------|
| Bill / transaction / employee **mutations** | Permission-only; target entity not scope-checked | Mark N-02; accept risk or defer |
| Properties write routes | Unscoped writes | Manual spot-check only |
| Dashboard occupancy / rental subqueries | Partial scope | Compare Admin vs PM; log discrepancies |
| Custom reports / AR aging | Partial scope | R-03 optional |
| Role-level scope admin API | Read-only at role level | User scopes only via UI |

---

## 15. Module readiness matrix

| Module | List | Search | Pagination | Get-by-id | Dashboard | Reports | UAT status |
|--------|------|--------|------------|-----------|-----------|---------|------------|
| Projects | ✅ | ✅ | ✅ | ✅ | — | — | **Ready** |
| Properties | ✅ | ✅ | ✅ | ✅ | — | — | **Ready** (manual UI) |
| Bills | ✅ | ✅ | ✅ | ✅ | — | — | **Ready** |
| Transactions | ✅ | ✅ | ✅ | ✅ | — | — | **Ready** |
| Employees | ✅ | — | ✅ | ✅ | — | — | **Ready** |
| Payroll | ✅ | — | — | ✅ | — | — | **Ready** |
| Dashboard | — | — | — | — | ✅ | — | **Ready** |
| Reports (P&L) | — | — | — | — | — | ✅ | **Partial** |

---

## 16. Defect log

| Defect ID | UAT ID | Severity | Summary | Status | Fix version |
|-----------|--------|----------|---------|--------|-------------|
| DS-ACT-01 | P-01, P-02 | High | Paginated list 500 with scope | **Fixed** | Staging 2026-06-22 |
| DS-ACT-02 | D-01 | High | Dashboard metrics 500 with scope | **Fixed** | Staging 2026-06-22 |
| DS-ACT-03 | S-01 | High | Bill search 500 with scope | **Fixed** | Staging 2026-06-22 |
| | | | | | |

_Add new rows during UAT. Do not enable production until Critical/High are closed or accepted._

---

## 17. Test execution summary

| Category | Total | Pass | Fail | Blocked | N/A |
|----------|-------|------|------|---------|-----|
| Administration | 6 | | | | |
| Visibility | 7 | | | | |
| Search & pagination | 4 | | | | |
| Get-by-id | 5 | | | | |
| Dashboard | 4 | | | | |
| Payroll | 6 | | | | |
| Reports | 3 | | | | |
| Session / real-time | 3 | | | | |
| Negative / edge | 4 | | | | |
| **Total** | **42** | | | | |

**Tester name:** ___________________  
**Test dates:** ___________________  
**Build / version:** ___________________  
**Environment:** Staging ☐ · Other ☐ ___________

---

## 18. Sign-off

| Role | Name | Signature | Date | Decision |
|------|------|-----------|------|----------|
| QA Lead | | | | ☐ Pass ☐ Fail ☐ Conditional |
| Security Admin | | | | ☐ Pass ☐ Fail ☐ Conditional |
| Finance / Payroll Lead | | | | ☐ Pass ☐ Fail ☐ Conditional |
| Product Owner | | | | ☐ Pass ☐ Fail ☐ Conditional |

**Conditional pass notes:**

_______________________________________________________________________________

_______________________________________________________________________________

---

## 19. References

| Resource | Path |
|----------|------|
| Staging activation report | `docs/security/RBAC_DATA_SCOPE_STAGING_ACTIVATION_REPORT.md` |
| Automated ATP script | `scripts/rbac-data-scope-staging-pilot.mjs` |
| Enable staging flags | `npm run rbac:data-scope:staging:enable` |
| Full RBAC visual guide | `docs/security/RBAC_V2_VISUAL_TESTING_GUIDE.md` (Part 5) |
| Rollback | `docs/security/RBAC_V2_ROLLBACK_PLAN.md` — set `RBAC_V2_DATA_SCOPE=false` |

**Production cutover:** Do **not** enable `RBAC_V2_DATA_SCOPE` on production until this UAT is signed off and staging soak is complete.
