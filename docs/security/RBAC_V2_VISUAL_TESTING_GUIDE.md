# RBAC V2 — Visual Testing Guide

**Purpose:** Step-by-step manual UI test plan for everything implemented in RBAC V2 (Phases A5.1.1–A5.1.5).  
**Audience:** QA, finance leads, security admins, implementers  
**Status:** Covers code shipped through staging cutover (June 2026)  
**Related:** [`RBAC_V2_STAGING_CUTOVER_PLAN.md`](./RBAC_V2_STAGING_CUTOVER_PLAN.md) · [`RBAC_V2_ENGINE_ENABLEMENT.md`](./RBAC_V2_ENGINE_ENABLEMENT.md)

---

## How to use this guide

1. Work through **Part 0** (environment) once per machine.
2. Execute **Part 1–7** in order — each part depends on flags from the prior stage (same as staging cutover).
3. For each scenario: log in as the listed persona → follow steps → compare **Expected (visual)** → mark **Pass / Fail / N/A**.
4. Run **Part 8** (automated pre-flight) before and after a test session.
5. Record results in the **Test log template** at the end.

**Legend**

| Symbol | Meaning |
|--------|---------|
| ✅ | Expected success — UI visible, action completes |
| 🚫 | Expected denial — hidden UI, disabled control, or error toast |
| 🔄 | Requires logout/login or new session after role/scope change |
| ⚠️ | Known partial implementation — see notes |

---

## Part 0 — Environment setup

### 0.1 Database and API

| Step | Action | Pass when |
|------|--------|-----------|
| 0.1.1 | PostgreSQL running; staging DB `pBookspro_Staging` or local `pbookspro` | DB accepts connections |
| 0.1.2 | `npm run db:migrate:staging` (or `:production` / `:lan`) | Migrations through **137** applied (`131`–`137` RBAC) |
| 0.1.3 | `npm run verify:rbac-v2` | All checks **PASS** (154 catalog keys, 11 SoD pairs) |

### 0.2 Feature flags (full V2 stack)

Add to **`.env.staging`** (API, port **3001**):

```env
RBAC_V2_ROLE_MANAGEMENT=true
RBAC_V2_SOD=true
RBAC_V2_BREAK_GLASS=true
RBAC_V2_AUTHORIZATION_ENGINE=true
RBAC_V2_DATA_SCOPE=true
RBAC_V2_APPROVAL_MATRIX=true
```

Add matching **client build flags** (Vite — rebuild client after change):

```env
VITE_RBAC_V2_ROLE_MANAGEMENT=true
VITE_RBAC_V2_BREAK_GLASS=true
VITE_RBAC_V2_DATA_SCOPE=true
VITE_RBAC_V2_APPROVAL_MATRIX=true
```

| Step | Action | Pass when |
|------|--------|-----------|
| 0.2.1 | Restart API after env change | `GET http://127.0.0.1:3001/health` → 200 |
| 0.2.2 | `npm run test:staging` (or rebuild + launch client) | Client loads against `:3001` |
| 0.2.3 | All users **log out and log back in** after enabling `RBAC_V2_AUTHORIZATION_ENGINE` | Login succeeds; no immediate redirect loop |

### 0.3 Bootstrap RBAC assignments (before engine testing)

```powershell
node --import tsx scripts/rbac-assess-tenant.mjs --tenant <tenant-id-or-name> --env staging --bootstrap --dry-run
node --import tsx scripts/rbac-assess-tenant.mjs --tenant <tenant-id-or-name> --env staging --bootstrap
```

| Step | Action | Pass when |
|------|--------|-----------|
| 0.3.1 | Dry run | `unmapped: 0`; expected inserts only |
| 0.3.2 | Execute bootstrap | Every active user has ≥1 `rbac_user_roles` row |
| 0.3.3 | Re-run bootstrap | Idempotent: `inserted=0`, `skipped=N` |

### 0.4 Recommended test personas

Use your tenant’s users or staging **`test-company`** personas (from A5.1.6B.1 validation):

| Persona | Typical login | Enterprise role | Use for |
|---------|---------------|-----------------|---------|
| **Super Admin** | e.g. `rafi@company.local` | `super_admin` | Full access, break-glass capability, admin screens |
| **Security Admin** | Security user | `security_administrator` | RBAC admin without full tenant sovereign |
| **Company Admin** | Admin/manager user | `company_admin` | Delegation ceiling tests |
| **Preparer** | e.g. `iht@company.local` | Custom / accountant subset | Journal submit, payroll scope |
| **Approver** | e.g. Sales1 → `finance_approver` | Approver-only role | Journal approve, SoD separation |
| **Read Only** | Viewer user | `read_only` | Negative visibility tests |
| **Project Manager** | PM user | `project_manager` | Project scope, procurement subset |
| **Sales User** | Sales user | `sales_user` | Project selling gates |

> **Note:** Staging validation used password `StagingVal2026!` for Iht, Sales1, Security, Test — rotate in production; use your env’s credentials locally.

---

## Part 1 — Settings navigation map

Open **Settings** (gear). RBAC-related entries appear under two groups:

### Security & users

| Nav item | Visible when | Permission / flag |
|----------|--------------|-------------------|
| **User Management** | `users.read` or `users.manage` | — |
| **Permission Matrix** | `permissions.read` / `permissions.view` | Legacy v1 matrix |
| **Audit Trail** | `audit_logs.read` | — |

### Administration (RBAC V2)

| Nav item | Visible when | Flag |
|----------|--------------|------|
| **Security — Roles** | `roles.view` + | `VITE_RBAC_V2_ROLE_MANAGEMENT=true` |
| **Security — Data Scopes** | `users.read` or `administration.scopes.edit` + | `VITE_RBAC_V2_DATA_SCOPE=true` |
| **Security — Approval Matrix** | `users.read` or `administration.approvals.final` + | `VITE_RBAC_V2_APPROVAL_MATRIX=true` |
| **Role Management** | `roles.view` | Legacy `/rbac/roles` UI |
| **Permission Catalog** | `permissions.view` / `permissions.read` | Legacy catalog UI |

### Scenario 1.1 — Navigation visibility by persona

| ID | Persona | Steps | Expected (visual) |
|----|---------|-------|-------------------|
| 1.1.1 | Super Admin | Open Settings → scan left nav | ✅ User Management, Permission Matrix, all **Security —** items, Role Management, Permission Catalog, Audit Trail |
| 1.1.2 | Read Only | Open Settings | 🚫 No Administration section; 🚫 no Permission Matrix |
| 1.1.3 | Security Admin | Open Settings | ✅ Security — Roles, Role Management, Permission Catalog; 🚫 or limited Permission Matrix per role |
| 1.1.4 | Any user | Set all `VITE_RBAC_V2_*=false`, rebuild client | 🚫 Security — Roles / Data Scopes / Approval Matrix hidden; legacy items may remain |

---

## Part 2 — Phase 1: Permission catalog (A5.1.1)

**Scope:** Read-only metadata — 154 keys, bundles, 11 SoD pairs. No authorization behavior change.

### Scenario 2.1 — Permission Catalog UI

| ID | Persona | Steps | Expected (visual) |
|----|---------|-------|-------------------|
| 2.1.1 | Super Admin | Settings → **Permission Catalog** | Page loads; module groups listed |
| 2.1.2 | Super Admin | Search box → type `journal` | Filters to journal-related permissions |
| 2.1.3 | Super Admin | Module filter → select a module | Only that module’s permissions shown |
| 2.1.4 | Read Only | Navigate to Permission Catalog (direct URL if needed) | 🚫 Amber banner: no permission to view |
| 2.1.5 | Super Admin | Settings → **Permission Matrix** | Grid: permissions × enterprise roles with ✓/empty cells |

### Scenario 2.2 — V2 catalog API (optional DevTools)

| ID | Steps | Expected |
|----|-------|----------|
| 2.2.1 | Authenticated `GET /api/v1/security/permissions/catalog` | 200; payload includes `permissions`, `bundles`, `sodPairs` |
| 2.2.2 | Count SoD pairs in response | **11** pairs (6 mandatory + 5 extended) |

---

## Part 3 — Phase 2: Security — Roles (A5.1.2)

**Path:** Settings → Administration → **Security — Roles**  
**Backend:** `/api/v1/security/roles`, templates, audit  
**Enforcement:** Delegation, privilege ceiling, SoD (when `RBAC_V2_SOD=true`)

### Scenario 3.1 — Roles tab

| ID | Persona | Steps | Expected (visual) |
|----|---------|-------|-------------------|
| 3.1.1 | Super Admin | Open Security — Roles → **Roles** tab | Table: system + custom roles; columns Name, Type, Status, Users, Actions |
| 3.1.2 | Super Admin | Click a role name | Modal: slug, version, roleVersionHash, permission list |
| 3.1.3 | Super Admin | Find `super_admin` / `SYSTEM_OWNER` | ✅ Listed; 🚫 Archive button hidden (protected) |
| 3.1.4 | Super Admin | Custom role (non-protected) → **Archive** | Toast “Role archived”; status → archived |
| 3.1.5 | Super Admin | Archived role → **Restore** | Toast “Role restored”; status → active |
| 3.1.6 | User without `roles.view` | Open section | 🚫 “You do not have permission to view roles.” |
| 3.1.7 | Flags off | Open section | 🚫 Message to set `VITE_RBAC_V2_ROLE_MANAGEMENT=true` |

### Scenario 3.2 — Templates tab (10 industry templates)

| ID | Persona | Steps | Expected (visual) |
|----|---------|-------|-------------------|
| 3.2.1 | Super Admin | **Templates** tab | Cards for: Accountant, Property Manager, Project Manager, HR Manager, Payroll Officer, Procurement Officer, Sales Executive, Inventory Controller, Company Admin, Security Administrator |
| 3.2.2 | Super Admin | Click **Instantiate** on “Payroll Officer” | Modal: name field pre-filled “Payroll Officer Copy” |
| 3.2.3 | Super Admin | Confirm instantiate | ✅ Toast “Role created from template”; new role in Roles tab |
| 3.2.4 | Super Admin | Open new role detail | Permissions list has **no** `payroll.runs.approve` (SoD-safe template) |
| 3.2.5 | Company Admin (no delegate) | Try instantiate | 🚫 API/UI error: delegation denied or privilege ceiling |

### Scenario 3.3 — Audit tab

| ID | Persona | Steps | Expected (visual) |
|----|---------|-------|-------------------|
| 3.3.1 | Super Admin | Perform 3.2.3 then open **Audit** tab | Row: `TEMPLATE_INSTANTIATED` with timestamp |
| 3.3.2 | Super Admin | Archive a role (3.1.4) | Audit row: `ROLE_ARCHIVED` |
| 3.3.3 | User without `audit_logs.rbac.read` | Audit tab | May load empty or 403 depending on API — document actual behavior |

### Scenario 3.4 — Legacy Role Management (parallel UI)

| ID | Persona | Steps | Expected (visual) |
|----|---------|-------|-------------------|
| 3.4.1 | Super Admin | Settings → **Role Management** | Role list + create/edit modal with permission checkboxes by module |
| 3.4.2 | Super Admin | Edit custom role → add permission → Save | ✅ Saved; real-time sync on other clients (if multi-user) |
| 3.4.3 | Super Admin | Edit `super_admin` permissions | 🚫 Checkboxes disabled / immutable |
| 3.4.4 | Super Admin | Create role with **both** `accounting.journals.create` and `accounting.journals.approve` (when SoD on) | 🚫 Error toast: SoD violation (409) |

### Scenario 3.5 — User role assignment

| ID | Persona | Steps | Expected (visual) |
|----|---------|-------|-------------------|
| 3.5.1 | Super Admin | Settings → **User Management** | User list loads |
| 3.5.2 | Super Admin | Assign RBAC role to test user | ✅ Assignment saved |
| 3.5.3 | Assigned user | 🔄 Log out → log in | Menu/Settings reflect new role |
| 3.5.4 | Super Admin | Assign conflicting SoD pair to same user (two roles) | 🚫 SoD violation on assign |

---

## Part 4 — Phase 2.5: Authorization engine (A5.1.3)

**Scope:** JWT `av` claim, `EffectiveAccessContext`, `TOKEN_STALE` on role change.

### Scenario 4.1 — Session and stale token

| ID | Persona | Steps | Expected (visual) |
|----|---------|-------|-------------------|
| 4.1.1 | Any user | Log in with engine **on** | Normal app load; no errors |
| 4.1.2 | Super Admin | Change user’s role assignment while they stay logged in | Target user’s **next API action** → redirect to login or “session expired” (401 `TOKEN_STALE`) |
| 4.1.3 | Super Admin | Deactivate a user (`is_active=false`) while logged in | 🚫 Next request: logged out / unauthorized |
| 4.1.4 | Super Admin | DevTools: decode JWT after login | Payload includes `av` claim |

### Scenario 4.2 — Effective context (API sanity)

| ID | Steps | Expected |
|----|-------|----------|
| 4.2.1 | `GET /api/v1/rbac/effective-context` (own user only) | 200; `permissions[]`, `roleVersionHash` |
| 4.2.2 | Request another user’s context | 🚫 403 (current-user-only policy) |
| 4.2.3 | After scope assignment (Part 5) | Response includes `scopes` with 4 dimensions |

---

## Part 5 — Phase 4: Data scopes (A5.1.4)

**Path:** Settings → **Security — Data Scopes**  
**Dimensions:** project, property, owner, department

### Scenario 5.1 — Admin UI

| ID | Persona | Steps | Expected (visual) |
|----|---------|-------|-------------------|
| 5.1.1 | Super Admin | Open Security — Data Scopes | Title “Data Scopes”; user ID field; dimension tabs |
| 5.1.2 | Super Admin | Enter target user UUID → **Load scopes** | Summary of current grants per dimension |
| 5.1.3 | Super Admin | Dimension **Department** → mode **Assigned** → enter dept entity IDs → **Assign** | ✅ Toast “Data scope updated” |
| 5.1.4 | Super Admin | Same user, mode **All** for a dimension | Clears restriction for that dimension |
| 5.1.5 | User with `users.read` only | Open section | ✅ View-only; 🚫 assign controls disabled or hidden |
| 5.1.6 | Read Only | Open section | 🚫 “You do not have permission to view data scopes.” |

### Scenario 5.2 — Department scope (payroll) — **critical E2E**

Setup: User **Preparer** scoped to **Dept A only** (admin assigns via 5.1.3).

| ID | Persona | Steps | Expected (visual) |
|----|---------|-------|-------------------|
| 5.2.1 | Preparer | 🔄 Re-login after scope assign | Session fresh |
| 5.2.2 | Preparer | Navigate **Payroll → Employees** (or equivalent list) | List loads (200) |
| 5.2.3 | Preparer | Scan employee list | ✅ Employees in **Dept A** visible |
| 5.2.4 | Preparer | Look for **Dept B** employees | 🚫 Not listed |
| 5.2.5 | Preparer | Direct URL/API to Dept B employee ID | 🚫 Empty or 403/404 |

### Scenario 5.3 — Project scope

Setup: Assign **project** scope to PM user for **Project A** only.

| ID | Persona | Steps | Expected (visual) |
|----|---------|-------|-------------------|
| 5.3.1 | PM (scoped) | Open **Projects** list | Only Project A (and unscoped global items if any) |
| 5.3.2 | PM (scoped) | Open Project B detail via bookmark/URL | 🚫 Not found or access denied |
| 5.3.3 | Super Admin (no scope) | Same project list | ✅ All tenant projects |

### Scenario 5.4 — Property / owner scope

| ID | Persona | Steps | Expected (visual) |
|----|---------|-------|-------------------|
| 5.4.1 | Scoped property user | **Properties** list | Only assigned properties/buildings |
| 5.4.2 | Scoped owner user | Rental / owner reports filtered | Data limited to assigned owner contacts |
| 5.4.3 | Scoped user | Rental report with out-of-scope filter param | 🚫 Cannot widen beyond scope |

### Scenario 5.5 — Scope change invalidates session

| ID | Steps | Expected |
|----|-------|----------|
| 5.5.1 | Admin changes user’s scope; user stays logged in | 🔄 User gets `TOKEN_STALE` on next request — must re-login |

---

## Part 6 — Phase 5: Approval matrix (A5.1.5)

**Path:** Settings → **Security — Approval Matrix**  
**Entity types:** manual_journal, journal_reversal, bill, payment, purchase_order, payroll_run, rental_agreement

### Scenario 6.1 — Matrix admin UI

| ID | Persona | Steps | Expected (visual) |
|----|---------|-------|-------------------|
| 6.1.1 | Super Admin | Open Security — Approval Matrix | Rules table: Entity, Level, Permission, Min approvers, Mandatory |
| 6.1.2 | Super Admin | Find `manual_journal` rule | **Mandatory = Yes** (cannot be disabled) |
| 6.1.3 | Super Admin | Capabilities section | Lists capability keys per entity type |
| 6.1.4 | Super Admin | Create assignment: assignee type **role**, pick approver role | ✅ Toast “Approval assignment created” |
| 6.1.5 | Super Admin | Enter user ID → load **capabilities** | Table of what that user can approve |
| 6.1.6 | User without `administration.approvals.final` | Try edit assignment | 🚫 Read-only or permission message |

### Scenario 6.2 — Manual journal approval flow

Setup:

- **Preparer:** role with `accounting.journals.create`, **without** `accounting.journals.approve`
- **Approver:** role with `accounting.journals.approve` only (e.g. `finance_approver`) — **no** create permission (SoD)
- Matrix assignment links approver role to journal capability

| ID | Persona | Steps | Expected (visual) |
|----|---------|-------|-------------------|
| 6.2.1 | Preparer | Create manual journal entry (Accounting → Journal / GL) | Draft saved |
| 6.2.2 | Preparer | **Submit for approval** | ✅ Status **Pending Approval**; not posted to GL |
| 6.2.3 | Preparer | Try approve own journal | 🚫 Approve action hidden or error (SoD) |
| 6.2.4 | Approver | 🔄 Login → open approval queue / journal pending list | Pending item visible |
| 6.2.5 | Approver | **Approve** | ✅ Journal posts to GL; balanced lines in ledger |
| 6.2.6 | Approver | **Reject** (alternate run) | Returns to preparer; no GL post |

> ⚠️ **Staging note (M3):** Submit path was validated live; approve → GL may require a clean SoD approver role. If approve fails with 403, verify approver lacks `financial.write` expansion and create permissions.

### Scenario 6.3 — Journal reversal

| ID | Persona | Steps | Expected (visual) |
|----|---------|-------|-------------------|
| 6.3.1 | Preparer | Submit journal reversal for approval | Pending state |
| 6.3.2 | Approver | Approve reversal | GL reversal posted |
| 6.3.3 | Preparer | Holds both `accounting.journals.reverse` and `accounting.journals.approve` | 🚫 SoD block on role assign or approve |

### Scenario 6.4 — Workflow integration

| ID | Persona | Steps | Expected (visual) |
|----|---------|-------|-------------------|
| 6.4.1 | Preparer | Settings → Preferences → **Workflow** tab | Workflow settings + **Approval Queue** panel |
| 6.4.2 | Approver | Approval Queue | Pending items from matrix-driven workflows |
| 6.4.3 | User without `workflow.approve` | Approval Queue | 🚫 Empty or read-only |

---

## Part 7 — Break-glass (A5.1.2 / C2)

**UI locations:** Security — Roles panel (activate) · app-wide **BreakGlassBanner** (when active)

### Scenario 7.1 — Activation

Prerequisites: User on platform break-glass allow list; MFA enrolled.

| ID | Persona | Steps | Expected (visual) |
|----|---------|-------|-------------------|
| 7.1.1 | Eligible Super Admin | Security — Roles → Break-glass card | Amber card with TOTP field + **Activate break-glass** |
| 7.1.2 | Eligible Super Admin | Enter valid 6-digit TOTP → Activate | ✅ Toast “Break-glass session activated” |
| 7.1.3 | Any screen | Top of app | ✅ **Break-glass active** amber banner with expiry time + **End session** |
| 7.1.4 | Same session | Perform sensitive action (e.g. role view) | Action succeeds; audited as `system_owner` |
| 7.1.5 | Same session | `GET /api/v1/rbac/effective-context` | `breakGlassExpiresAt` present |

### Scenario 7.2 — Deactivation

| ID | Persona | Steps | Expected (visual) |
|----|---------|-------|-------------------|
| 7.2.1 | Active break-glass | Click **End session** on banner | Banner disappears |
| 7.2.2 | After deactivate | Try previous elevated action | 🚫 Normal permissions apply |
| 7.2.3 | Security — Roles audit / enterprise audit | Review logs | `BREAK_GLASS_ACTIVATED` / deactivate entries |

### Scenario 7.3 — Negative cases

| ID | Steps | Expected |
|----|-------|----------|
| 7.3.1 | Invalid TOTP | 🚫 Error alert “Activation failed” |
| 7.3.2 | `VITE_RBAC_V2_BREAK_GLASS=false` | 🚫 Break-glass card hidden |
| 7.3.3 | Wait until session expiry (~15 min default) | 🚫 Banner gone; 401 on API |

---

## Part 8 — Separation of duties (SoD) — visual matrix

When `RBAC_V2_SOD=true`, attempting to grant **both** permissions in a pair to one user/role must fail.

### Mandatory pairs (must test at least one)

| ID | Permission A | Permission B | Test action | Expected |
|----|--------------|--------------|-------------|----------|
| SoD-1 | `payroll.runs.create` | `payroll.runs.approve` | Add both to one role in Role Management | 🚫 SoD error |
| SoD-2 | `procurement.purchase_orders.create` | `procurement.purchase_orders.approve` | Same | 🚫 SoD error |
| SoD-3 | `procurement.bills.create` | `procurement.bills.approve` | Same | 🚫 SoD error |
| SoD-4 | `accounting.transactions.create` | `approve.payments` | Same | 🚫 SoD error |
| SoD-5 | `accounting.journals.create` | `accounting.journals.approve` | Same | 🚫 SoD error |
| SoD-6 | `accounting.journals.reverse` | `accounting.journals.approve` | Same | 🚫 SoD error |

### Extended pairs (sample)

| ID | Pair | Expected on combined assign |
|----|------|----------------------------|
| SoD-7 | `rental.agreements.create` + `rental.agreements.approve` | 🚫 |
| SoD-8 | `goods_receipt.create` + `goods_receipt.post` | 🚫 |
| SoD-9 | `pev.create` + `pev.approve` | 🚫 |

---

## Part 9 — Privilege ceiling — visual matrix

| ID | Actor | Action | Expected |
|----|-------|--------|----------|
| PC-1 | `company_admin` (no delegate) | Instantiate Security Administrator template | 🚫 Delegation denied |
| PC-2 | `company_admin` + `permissions.delegate` | Instantiate Company Admin template | ✅ (within ceiling) |
| PC-3 | `company_admin` | Grant `roles.manage` to custom role | 🚫 Restricted registry |
| PC-4 | `security_administrator` | Create role with RBAC admin permissions | ✅ Within T2 bundle |
| PC-5 | `security_administrator` | Grant `billing.manage` | 🚫 Privilege ceiling |
| PC-6 | `super_admin` | Grant restricted permission | ✅ |
| PC-7 | Accountant user | Security — Roles → Instantiate | 🚫 No `roles.manage` |

---

## Part 10 — Cross-module permission smoke (sidebar & actions)

Quick visual pass per persona after RBAC changes.

### Scenario 10.1 — Super Admin

| Module | Navigate to | Expected |
|--------|-------------|----------|
| Reports | Trial Balance, P&L, Balance Sheet | ✅ Opens |
| Payroll | Employees, runs | ✅ Full access |
| Procurement | PO, bills, quotations | ✅ Create + approve controls where applicable |
| Project Selling | Marketing, agreements | ✅ Full |
| Settings | Backups, Workflow admin | ✅ Manage controls enabled |
| Accounting | Manual journal | ✅ Create + submit |

### Scenario 10.2 — Read Only

| Module | Expected |
|--------|----------|
| Reports | ✅ Read |
| Payroll | ✅ Read lists; 🚫 no Save/Create |
| Procurement | 🚫 No create buttons |
| Settings → User Management | 🚫 Hidden |
| GL / journals | 🚫 No post/create |

### Scenario 10.3 — Sales User

| Module | Expected |
|--------|----------|
| Project Selling | ✅ Catalog, marketing, agreements |
| Procurement / Payroll | 🚫 Hidden or read-only per matrix |
| Financial reports (non-selling) | 🚫 Limited |

### Scenario 10.4 — Project Manager

| Module | Expected |
|--------|----------|
| Projects | ✅ Assigned projects (respect scope if set) |
| PEV | ✅ Create; 🚫 approve if not granted |
| PO / quotations | ✅ Create/view per bundle; 🚫 approve if SoD split |

---

## Part 11 — Real-time sync (multi-user)

| ID | Steps | Expected (visual) |
|----|-------|-------------------|
| 11.1 | User A: change role permission; User B: same tenant, open Role Management | B’s list updates without F5 (socket + React Query) |
| 11.2 | User A: assign scope to User C; User C re-login | C sees filtered data immediately after login |
| 11.3 | User A: archive role; User B viewing role list | Role status updates live |

---

## Part 12 — Automated pre-flight & regression commands

Run before/after manual sessions:

```powershell
# Catalog + bundle + SoD integrity
npm run verify:rbac-v2

# RBAC V2 unit tests
npm --prefix backend test -- --test-path-pattern="rbacV2|approvalEnforcement|approvalSecurityClosure|dataScopeEnforcement|effectiveContextPolicy"

# Staging API validation (needs running API + credentials)
node scripts/rbac-staging-api-validation.mjs

# Full closure E2E (staging tenant)
node scripts/rbac-staging-closure-validation.mjs

# Tenant health
node --import tsx scripts/rbac-assess-tenant.mjs --tenant <id> --env staging --parity --sod-report
```

Expected baselines:

| Command | Pass criteria |
|---------|---------------|
| `verify:rbac-v2` | All sections OK |
| Approval tests | **33/33** pass |
| Staging smoke | **22/22** modules 200 |
| Parity | `NO_RBAC_ASSIGNMENT = 0` |

---

## Part 13 — Known gaps & ⚠️ partial coverage

Document these as **N/A** or **expected partial** until follow-up ships:

| Area | Status | Workaround |
|------|--------|------------|
| Journal approve → GL (live UI) | ⚠️ Partial in staging (SoD on approver) | Use dedicated `finance_approver` role; unit tests 33/33 |
| Procurement PO/rental scope | ⚠️ Planned follow-up repos | Test project/property/payroll paths |
| Production pilot (A5.1.6C) | Pending executive sign-off | Staging only until flags enabled per tenant |
| `security_administrator` UI vs Security — Roles | Both exist | Test both paths |
| 14-day production soak | Not started for prod | Staging soak report available |

---

## Test log template

Copy for each test run:

```text
Run ID: ___________
Date: ___________
Tester: ___________
Environment: [ ] Staging :3001  [ ] Local :3000  [ ] Cloud
Tenant: ___________
Flags: ROLE_MGMT [ ]  SOD [ ]  ENGINE [ ]  DATA_SCOPE [ ]  APPROVAL [ ]  BREAK_GLASS [ ]
Client VITE flags rebuilt: [ ] Yes

| Part | Scenario ID | Pass | Fail | N/A | Notes |
|------|-------------|------|------|-----|-------|
| 1    |             |      |      |     |       |
| 2    |             |      |      |     |       |
| 3    |             |      |      |     |       |
| 4    |             |      |      |     |       |
| 5    |             |      |      |     |       |
| 6    |             |      |      |     |       |
| 7    |             |      |      |     |       |
| 8    | SoD         |      |      |     |       |
| 9    | Ceiling     |      |      |     |       |
| 10   | Smoke       |      |      |     |       |
| 11   | Real-time   |      |      |     |       |

Automated: verify:rbac-v2 [ ]  approval tests [ ]  parity [ ]
Blockers: ___________
Sign-off: ___________
```

---

## Quick reference — implementation phases

| Phase | Doc | Feature flag(s) | Primary UI |
|-------|-----|-----------------|------------|
| A5.1.1 | Permission catalog | — | Permission Catalog, Permission Matrix |
| A5.1.2 | Role management | `RBAC_V2_ROLE_MANAGEMENT`, `RBAC_V2_SOD`, `RBAC_V2_BREAK_GLASS` | Security — Roles, Role Management |
| A5.1.3 | Authorization engine | `RBAC_V2_AUTHORIZATION_ENGINE` | (session behavior; effective-context API) |
| A5.1.4 | Data scopes | `RBAC_V2_DATA_SCOPE` | Security — Data Scopes |
| A5.1.5 | Approval matrix | `RBAC_V2_APPROVAL_MATRIX` | Security — Approval Matrix, Workflow queue |

---

## Related documents

- [`RBAC_V2_STAGING_CUTOVER_PLAN.md`](./RBAC_V2_STAGING_CUTOVER_PLAN.md) — staged rollout order
- [`RBAC_V2_ENGINE_ENABLEMENT.md`](./RBAC_V2_ENGINE_ENABLEMENT.md) — operator enablement
- [`PRIVILEGE_CEILING.md`](./PRIVILEGE_CEILING.md) — delegation tiers
- [`SoD_MATRIX.md`](./SoD_MATRIX.md) — full SoD rationale
- [`A5_1_6B_1_VALIDATION_REPORT.md`](./A5_1_6B_1_VALIDATION_REPORT.md) — staging E2E evidence
- [`docs/rbac/rbac-v2-specification.md`](../rbac/rbac-v2-specification.md) — enterprise spec

---

*End of RBAC V2 Visual Testing Guide.*
