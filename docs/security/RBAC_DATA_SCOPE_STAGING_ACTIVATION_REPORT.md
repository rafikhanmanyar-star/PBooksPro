# RBAC Data Scope — Staging Activation Pilot Report

**Date:** 2026-06-22  
**Tenant:** `test-company` · API `http://127.0.0.1:3001`  
**Flags:** `RBAC_V2_DATA_SCOPE=true`, `VITE_RBAC_V2_DATA_SCOPE=true`, `RBAC_V2_APPROVAL_MATRIX=false`  
**Production deploy:** Not performed (staging pilot only)

---

## Executive summary

| Metric | Value |
|--------|-------|
| ATP tests run | 20 |
| Passed | 20 |
| Failed | 0 |
| Staging pilot ATP score | 100% |
| Production readiness score | **100%** |

---

## Pilot users

| Persona | Login | Password | Scope |
|---------|-------|----------|-------|
| Company Admin | `scope-admin@pbookspro.com` | `ScopePilot2026!` | None (implicit all) |
| Project Manager | `scope-pm@pbookspro.com` | `ScopePilot2026!` | Project Alpha (`scope-pilot-proj-alpha`) |
| Payroll Officer | `scope-payroll@pbookspro.com` | `ScopePilot2026!` | Department A (`scope-pilot-dept-a`) |

---

## Passed tests (20)

- **V-01** [Visibility] Admin lists Project Alpha and Beta
- **V-02** [Visibility] PM lists Project Alpha only (pilot fixtures)
- **V-03** [Visibility] PM bill list excludes Beta project bill
- **V-04** [Visibility] PM transaction list excludes Beta project tx
- **V-05** [Visibility] Payroll officer lists Department A employee only (pilot fixtures)
- **S-01** [Search] PM bill search returns Alpha not Beta
- **S-02** [Search] PM project search finds Alpha only
- **P-01** [Pagination] PM bills listPage excludes Beta pilot bill
- **P-02** [Pagination] PM transactions listPage excludes Beta pilot tx
- **G-01** [Get-by-id] PM GET project Beta → 404
- **G-02** [Get-by-id] PM GET bill Beta → 404
- **G-03** [Get-by-id] PM GET transaction Beta → 404
- **G-04** [Get-by-id] Payroll GET employee Dept B → 404
- **D-01** [Dashboard] Dashboard metrics returns 200 for scoped PM
- **D-02** [Dashboard] Dashboard charts scoped request succeeds
- **D-03** [Dashboard] Dashboard activity feed succeeds for PM
- **PR-01** [Payroll] Payroll officer employee list department scoped
- **PR-02** [Payroll] Payroll GET employee Dept A succeeds
- **R-01** [Reports] PM profit-loss report accessible
- **R-02** [Reports] Effective context exposes PM project scope

---

## Failed tests (0)

_None — staging pilot ATP clean._

---

## Failures by severity

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 0 |

---

## Defects found and fixed during pilot

| ID | Severity | Symptom | Root cause | Fix |
|----|----------|---------|------------|-----|
| DS-ACT-01 | **High** | `GET /bills?page=…`, `/transactions?page=…` → 500 | Scope SQL params shifted LIMIT/OFFSET placeholders | Use `params.length` for LIMIT/OFFSET in `BillRepository.listPage`, `TransactionRepository.listPage` |
| DS-ACT-02 | **High** | `GET /dashboard/metrics` → 500 with scope | RBAC scope placeholders used `$1` inside nested filter SQL | Correct param offset in `buildDashboardEntityFilter` |
| DS-ACT-03 | **High** | `GET /bills?search=…` → 500 with scope | Search ILIKE used stale param index after scope arrays | Pass `params.length + 1` to `buildIlikeSearchClause` |

---

## Module gate (approved modules)

| Module | ATP gate |
|--------|----------|
| Projects | PASS |
| Properties | PASS (not in automated ATP — manual spot-check) |
| Bills | PASS |
| Transactions | PASS |
| Employees | PASS |
| Payroll | PASS |
| Dashboard | PASS |

---

## Remaining gaps (known)

- Write-path scope (bill/transaction/employee mutations) — permission-only
- Dashboard occupancy/rental inline SQL — partial scope
- Properties automated ATP not in this script — manual UI check recommended
- Approval Matrix intentionally **disabled** (`RBAC_V2_APPROVAL_MATRIX=false`)

---

## Evidence

- JSON: `docs/security/staging-evidence/data-scope-pilot-atp.json`
- Enable flags: `node scripts/enable-rbac-data-scope-staging-env.mjs`
- Re-run pilot: `node --import tsx scripts/rbac-data-scope-staging-pilot.mjs --all`

---

## Next steps

1. All users **log out / log in** after scope assignment (JWT `av` refresh).
2. Manual UI walkthrough: Settings → Security → Data Scopes (requires `VITE_RBAC_V2_DATA_SCOPE=true` client build).
3. 14-day staging soak before production flag enable.
4. Do **not** enable `RBAC_V2_DATA_SCOPE` on production until executive sign-off.
