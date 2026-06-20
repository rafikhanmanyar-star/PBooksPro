# A5.1.6B — Executive Acceptance Sign-Off

**Phase:** A5.1.6B.1 — Staging Validation Closure · **Gate 9** (Production)  
**Organization:** test company (`test-company`)  
**Environment:** Staging (`pBookspro_Staging`, port 3001)  
**Package:** `[A5_1_6C_EXECUTIVE_SIGNOFF_PACKAGE.md](./A5_1_6C_EXECUTIVE_SIGNOFF_PACKAGE.md)`  
**Date:** 2026-06-19  

---

## Purpose

Formal acceptance of RBAC V2 staging cutover outcomes prior to **A5.1.6C Phase 1 Pilot Tenant Rollout**.

Supporting evidence index:


| Document                                                                                 | Purpose                                        |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `[A5_1_6B_1_VALIDATION_REPORT.md](./A5_1_6B_1_VALIDATION_REPORT.md)`                     | Staging validation closure (E2E results)       |
| `[A5_1_6B_SOAK_REPORT.md](./A5_1_6B_SOAK_REPORT.md)`                                     | 14-day soak (0 P1 incidents)                   |
| `[A5_1_6B_STAGING_EXECUTION_REPORT.md](./A5_1_6B_STAGING_EXECUTION_REPORT.md)`           | Staged flag enablement log                     |
| `[A5_1_6C_0_PRODUCTION_READINESS_REPORT.md](./A5_1_6C_0_PRODUCTION_READINESS_REPORT.md)` | Production schema readiness (no flags enabled) |
| `[staging-evidence/closure-validation.json](./staging-evidence/closure-validation.json)` | Raw automated E2E JSON                         |


---

## Acceptance items (15)

Each item below must be checked by the signing authority. Evidence columns link to the authoritative source used during staging validation.

### 1. Role split acceptance


| #   | Item                                                                    | Evidence Source                | Document Reference                                                                                                                            | Validation Date | Accepted |
| --- | ----------------------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | -------- |
| 1.1 | Preparer roles (`company_admin`, `accountant`) stripped of approve keys | SoD remediation output         | `[A5_1_6B_SOD_RESULTS.md](./A5_1_6B_SOD_RESULTS.md)` § Remediation actions                                                                    | 2026-06-19      | ☑        |
| 1.2 | Dedicated `finance_approver` role seeded with approve-only keys         | SoD script + matrix assignment | `[A5_1_6B_SOD_RESULTS.md](./A5_1_6B_SOD_RESULTS.md)` · `[A5_1_6B_STAGING_EXECUTION_REPORT.md](./A5_1_6B_STAGING_EXECUTION_REPORT.md)` Stage 5 | 2026-06-19      | ☑        |
| 1.3 | `super_admin` exception documented (Rafi retains full catalog)          | Parity + SoD review            | `[A5_1_6B_PARITY_RESULTS.md](./A5_1_6B_PARITY_RESULTS.md)` · `[A5_1_6B_SOD_RESULTS.md](./A5_1_6B_SOD_RESULTS.md)`                             | 2026-06-19      | ☑        |


### 2. Approval workflow acceptance


| #   | Item                                                     | Evidence Source                 | Document Reference                                                                                                           | Validation Date | Accepted |
| --- | -------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------- | -------- |
| 2.1 | Approval matrix enabled (`RBAC_V2_APPROVAL_MATRIX=true`) | Staging execution Stage 5       | `[A5_1_6B_STAGING_EXECUTION_REPORT.md](./A5_1_6B_STAGING_EXECUTION_REPORT.md)` § Stage 5                                     | 2026-06-19      | ☑        |
| 2.2 | Manual journal requires approval before GL post          | Journal submit 202 + unit tests | `[A5_1_6B_1_VALIDATION_REPORT.md](./A5_1_6B_1_VALIDATION_REPORT.md)` § Deliverable 5 · `approvalEnforcement.test.ts` (33/33) | 2026-06-19      | ☑        |
| 2.3 | Empty approver pool fail-closed (no silent bypass)       | Security closure tests          | `[A5_1_5_1_IMPLEMENTATION_REPORT.md](./A5_1_5_1_IMPLEMENTATION_REPORT.md)` · `approvalSecurityClosure.test.ts`               | 2026-06-19      | ☑        |


### 3. Journal approval acceptance


| #   | Item                                                                        | Evidence Source              | Document Reference                                                                                                                                                              | Validation Date | Accepted |
| --- | --------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | -------- |
| 3.1 | Draft → submit path returns 202 with `draftId` / `approvalRequestId`        | Automated E2E (Iht preparer) | `[A5_1_6B_1_VALIDATION_REPORT.md](./A5_1_6B_1_VALIDATION_REPORT.md)` § Deliverable 5 · `[staging-evidence/closure-validation.json](./staging-evidence/closure-validation.json)` | 2026-06-19      | ☑        |
| 3.2 | Approver SoD enforcement at post (403 when create+approve conflict)         | Live API + expected 403      | `[A5_1_6B_1_VALIDATION_REPORT.md](./A5_1_6B_1_VALIDATION_REPORT.md)` § Deliverable 5 (M3)                                                                                       | 2026-06-19      | ☑        |
| 3.3 | GL posting on approve validated (unit-test fallback for live approve route) | Unit test suite              | `[A5_1_6B_1_VALIDATION_REPORT.md](./A5_1_6B_1_VALIDATION_REPORT.md)` § Deliverable 5 · `approvalEnforcement.test.ts` + `approvalSecurityClosure.test.ts`                        | 2026-06-19      | ☑        |


### 4. Break glass acceptance


| #   | Item                                                                    | Evidence Source             | Document Reference                                                                                                                                                              | Validation Date | Accepted |
| --- | ----------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | -------- |
| 4.1 | MFA required before break-glass activation                              | Break-glass E2E             | `[A5_1_6B_1_VALIDATION_REPORT.md](./A5_1_6B_1_VALIDATION_REPORT.md)` § Deliverable 6 · `[staging-evidence/closure-validation.json](./staging-evidence/closure-validation.json)` | 2026-06-19      | ☑        |
| 4.2 | Session + expiry reflected in effective context (`breakGlassExpiresAt`) | Effective-context API       | `[A5_1_6B_1_VALIDATION_REPORT.md](./A5_1_6B_1_VALIDATION_REPORT.md)` § Deliverable 6                                                                                            | 2026-06-19      | ☑        |
| 4.3 | Audit `BREAK_GLASS_ACTIVATED` and deactivate recorded                   | `rbac_audit_log`            | `[A5_1_6B_1_VALIDATION_REPORT.md](./A5_1_6B_1_VALIDATION_REPORT.md)` § Deliverable 6 · `[A5_1_6B_SOAK_REPORT.md](./A5_1_6B_SOAK_REPORT.md)`                                     | 2026-06-19      | ☑        |
| 4.4 | Client break-glass banner flag enabled in staging build                 | Staging client build config | `[A5_1_6B_STAGING_EXECUTION_REPORT.md](./A5_1_6B_STAGING_EXECUTION_REPORT.md)` · `VITE_RBAC_V2_BREAK_GLASS=true`                                                                | 2026-06-19      | ☑        |


### 5. Data scope acceptance


| #   | Item                                                                       | Evidence Source             | Document Reference                                                                                                                                                              | Validation Date | Accepted |
| --- | -------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | -------- |
| 5.1 | Department dimension enforced (Dept A visible; Dept B excluded from list)  | Payroll scope E2E (Iht)     | `[A5_1_6B_1_VALIDATION_REPORT.md](./A5_1_6B_1_VALIDATION_REPORT.md)` § Deliverable 4 · `[staging-evidence/closure-validation.json](./staging-evidence/closure-validation.json)` | 2026-06-19      | ☑        |
| 5.2 | Scope grant bumps access path (`rbac_user_data_scopes` + filtered API 200) | Scope grant + employee list | `[A5_1_6B_1_VALIDATION_REPORT.md](./A5_1_6B_1_VALIDATION_REPORT.md)` § Deliverable 4                                                                                            | 2026-06-19      | ☑        |


---

## Staging validation attestation (pre-signature)

Executed automatically on **2026-06-19** (`scripts/rbac-staging-closure-validation.mjs`):


| Deliverable                        | Automated result                                                      |
| ---------------------------------- | --------------------------------------------------------------------- |
| Smoke test                         | **22/22 PASS**                                                        |
| Payroll scope E2E                  | **PASS**                                                              |
| Break-glass E2E                    | **PASS**                                                              |
| Bootstrap `security_administrator` | **PASS**                                                              |
| Journal submit                     | **PASS** (202)                                                        |
| Journal approve → GL               | **Partial** — SoD blocks standing approver post; unit tests **33/33** |


**Production schema (no flags):** Local and cloud migrations 133–138 applied; schema verified **2026-06-20** — see `[A5_1_6C_0_PRODUCTION_READINESS_REPORT.md](./A5_1_6C_0_PRODUCTION_READINESS_REPORT.md)`.

---

## Final approval — signatures (Gate 9)

Complete all 15 acceptance checkboxes above, then sign below. Signature closes **Gate 9** and authorizes **A5.1.6C Phase 1** pilot rollout (single tenant; flags enabled per rollout plan).

### Finance Lead

I confirm that staging validation evidence satisfies finance controls for RBAC V2 role split, journal approval workflow, and payroll department scope enforcement, subject to the journal approve-route note (M3) in the validation report.


| Field     | Value                                   |
| --------- | --------------------------------------- |
| Name      | **Rafi Ullah**_________________________ |
| Title     | Finance Lead                            |
| Signature | **afi Ullah**_________________          |
| Date      | ***2026-06-20***___________             |


### Executive Sponsor

I authorize progression to **A5.1.6C Phase 1 Pilot Tenant Rollout** based on the staging package, soak report (0 P1 authorization incidents), and production schema readiness (A5.1.6C.0).


| Field     | Value                           |
| --------- | ------------------------------- |
| Name      | ***Rafi Ullah***______________  |
| Title     | Executive Sponsor               |
| Signature | ***Rafi Ullah***___________     |
| Date      | **2026-06-20**_________________ |


---

**Gate 9 status:** **PENDING SIGNATURES** — see `[A5_1_6C_GATE9_CLOSURE_REPORT.md](./A5_1_6C_GATE9_CLOSURE_REPORT.md)`.