# PBooksPro Master User Acceptance Testing (UAT) Manual

| Field | Value |
|-------|-------|
| Document ID | UAT-MASTER-001 |
| Version | 1.1 |
| Product Build | 1.2.463+ |
| Last Updated | 2026-06-22 |
| Total Test Cases | 600 |

> Regenerate: `node scripts/generate-master-uat.mjs`

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.1 | 2026-06-22 | PBooks Pro QA | Removed Inventory Management chapter; added Procurement Management (Ch.7) and Investment Management (Ch.8); renumbered Ch.9–12; aligned to core product modules. |
| 1.0 | 2026-06-22 | PBooks Pro QA | Initial master UAT manual — 550 test cases across 11 chapters; aligned to Architecture v2.1 UI labels. |

## Test Execution Guidelines

- This is a tester-facing document. Do not read source code or query the database unless explicitly instructed in a test case.
- Execute chapters in order (1 → 12). Later chapters depend on master data created in earlier chapters.
- Record Actual Result, Status (Pass / Fail / Blocked / Not Tested), Screenshot Reference, and Remarks for every case.
- For cases marked NOT IMPLEMENTED: set Status to Blocked or N/A and note in Remarks — do not force a Pass.
- Use staging environment for destructive tests (backup/restore, void, factory reset).
- SoD (Segregation of Duties) tests require two browser sessions with different users.
- Capture screenshots at Expected Result verification points; name files UAT-XXX-description.png.
- If navigation labels differ slightly from this document, match the live UI and note the variance in Remarks.

## Test Environment

| Item | Value |
|------|-------|
| stack | npm run test:staging (PostgreSQL pBookspro_Staging, API :3001, Electron client) |
| altStack | Cloud Edition: https://app.pbookspro.com (production) or staging Render URL |
| login | Company email + Username + Password (or staging seed: test company / Rafi / Rafi1234) |
| sodUsers | Two users required for payroll approval and workflow SoD tests |
| database | Fresh tenant recommended for Chapter 1; reuse tenant for Chapters 2–11 |

## UAT Coverage Summary

| Chapter | Title | ID Range | Cases | NOT IMPLEMENTED | Modules |
|---------|-------|----------|-------|-----------------|---------|
| 1 | System Initialization & Basic Setup | UAT-001 – UAT-030 | 30 | 0 | System, Settings, RBAC |
| 2 | Master Data Foundation | UAT-031 – UAT-090 | 60 | 1 | Settings, Accounting, Procurement |
| 3 | Payroll | UAT-091 – UAT-150 | 60 | 3 | Payroll |
| 4 | Project Selling | UAT-151 – UAT-210 | 60 | 1 | Project Selling |
| 5 | Project Construction | UAT-211 – UAT-280 | 70 | 2 | Project Construction |
| 6 | Rental Management | UAT-281 – UAT-350 | 70 | 1 | Rental |
| 7 | Procurement Management | UAT-351 – UAT-405 | 55 | 1 | Procurement |
| 8 | Investment Management | UAT-406 – UAT-450 | 45 | 0 | Investment Management |
| 9 | PM Cycle | UAT-451 – UAT-480 | 30 | 1 | PM Cycle, Construction |
| 10 | Budget Management | UAT-481 – UAT-510 | 30 | 1 | Budget, Construction |
| 11 | Personal Transactions | UAT-511 – UAT-540 | 30 | 0 | Personal |
| 12 | Advanced Administration | UAT-541 – UAT-600 | 60 | 2 | Administration |

**Total test cases:** 600
**Implemented scenarios:** 587
**NOT IMPLEMENTED markers:** 13
**Modules covered:** Accounting, Administration, Budget, Construction, Investment Management, PM Cycle, Payroll, Personal, Procurement, Project Construction, Project Selling, RBAC, Rental, Settings, System

## Features Excluded / Not Implemented

| Feature | Reason |
|---------|--------|
| Standalone Inventory Management module | Not a product module — stock tracking via Procurement GRN + bill line items only; see Inventory Module Audit Report |
| SKU / item master / warehouses / stock transfers / issues / adjustments | Not implemented; PO/GRN use free-text line descriptions |
| Purchase Requests module | Not implemented — procurement starts at Quotation or PO |
| Blocks (project selling towers/blocks entity) | No Block entity in UI; units use Floor field only |
| BOQ module (standalone) | Architecture domain only; contract line items and quotation BOQ attachments used instead |
| IPC Bills module | Not implemented in UI or API routes |
| WarehouseManagement UI (orphan component) | components/settings/WarehouseManagement.tsx not mounted; no /warehouses backend module |
| Company Management settings section | Component exists but not mounted; use Setup Wizard + Preferences instead |
| Void Payroll Run UI | API exists; VoidPayrollRunModal not wired in PayrollHub |
| Configurable Approval Matrix (payroll) | SoD hard-coded: creator ≠ approver |
| Statutory payroll (tax, EOBI, PF) | No statutory compliance engine |
| Login with Google | Button shows Coming Soon |
| Executive Mobile — Inventory / CRM | Inventory disabled Coming soon; CRM hidden from executive app |
| Platform admin (Subscriptions, System Health) | Separate admin/ portal only |
| Dedicated Owner Settlement menu | Use Rental → Payouts |
| Dedicated Customer menu | Use Settings → Contacts (Owners/Leads) and Marketing Client field |
| Dedicated Receipts module | Receipts are invoice payment records under Project selling → Invoices |
| Variation Orders (standalone UI) | Workflow type exists; backend stub on contracts table |
| Personal transactions (non-admin users) | Admin-only by design |
| Notifications settings page | Notifications via header bell panel only |

---

# Chapter 1 — System Initialization & Basic Setup

**Test Case Range:** UAT-001 – UAT-030

## Purpose
Create a new company (tenant) from scratch and verify core administration: users, roles, permissions, audit, backup, and general settings.

## Business Flow
```text
Register Tenant → Login → Setup Wizard → Settings (Users, RBAC, Preferences) → Backup → Audit verification
```

## Required Test Data
- New company email (e.g. uat-demo@example.com)
- Admin username and password (min 8 characters)
- Second user for RBAC/SoD tests (e.g. approver1)

## Dependencies
- Empty PostgreSQL tenant or new registration allowed
- API server running (staging :3001 or production :3000)

## Expected Outputs
- Tenant registered and admin can log in
- Setup Wizard completed
- At least two users with distinct roles
- Audit Trail shows login and configuration events
- Backup created successfully

## Test Cases

### UAT-001 — Application Launch

| Field | Value |
|-------|-------|
| Module | System |
| Feature | Application Launch |
| Objective | Verify application loads and shows login screen |
| Navigation Path | Application launch → Login screen |
| Prerequisites | API server running; client installed or browser open |
| Test Data | None |
| Step-by-Step Instructions | 1. Launch PBooks Pro (Electron) or open cloud URL.<br>2. Wait for login screen to appear. |
| Expected Result | Login screen displays Company email, Username, and Password fields. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-002 — Tenant Registration

| Field | Value |
|-------|-------|
| Module | System |
| Feature | Tenant Registration |
| Objective | Register a new company tenant |
| Navigation Path | Login screen → Register / Start trial link |
| Prerequisites | Registration enabled on target environment |
| Test Data | Company: UAT Demo Co<br>Email: uat-demo@example.com<br>Admin: admin / Admin@1234<br>Phone: +92-300-0000000 |
| Step-by-Step Instructions | 1. On login screen, click register / start trial.<br>2. Enter company name, email, phone, address.<br>3. Enter admin username, password, and display name.<br>4. Accept legal terms.<br>5. Submit registration. |
| Expected Result | Registration succeeds; admin is logged in or prompted to log in. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-003 — Login

| Field | Value |
|-------|-------|
| Module | System |
| Feature | Login |
| Objective | Log in with company email and username |
| Navigation Path | Application launch → Login screen |
| Prerequisites | Valid tenant and user credentials |
| Test Data | Company email: uat-demo@example.com<br>Username: admin<br>Password: Admin@1234 |
| Step-by-Step Instructions | 1. Enter company email.<br>2. Enter username.<br>3. Enter password.<br>4. Click Sign In. |
| Expected Result | User authenticated; Dashboard loads; company name visible in header. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-004 — Login — Invalid credentials

| Field | Value |
|-------|-------|
| Module | System |
| Feature | Login — Invalid credentials |
| Objective | Verify login fails with wrong password |
| Navigation Path | Application launch → Login screen |
| Prerequisites | Valid username |
| Test Data | Password: wrongpassword |
| Step-by-Step Instructions | 1. Enter valid company email and username.<br>2. Enter incorrect password.<br>3. Click Sign In. |
| Expected Result | Error message displayed; user remains on login screen. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-005 — Setup Wizard — Open

| Field | Value |
|-------|-------|
| Module | System |
| Feature | Setup Wizard — Open |
| Objective | Open Setup Wizard from Settings |
| Navigation Path | Sidebar → System → Settings → Setup Wizard |
| Prerequisites | Logged in as admin/onboarding manager |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Settings from sidebar.<br>2. Click Setup Wizard in General section.<br>3. Review wizard steps displayed. |
| Expected Result | Setup Wizard opens with guided onboarding steps. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-006 — Setup Wizard — Company profile

| Field | Value |
|-------|-------|
| Module | System |
| Feature | Setup Wizard — Company profile |
| Objective | Complete company profile step |
| Navigation Path | Settings → Setup Wizard → Company step |
| Prerequisites | Setup Wizard open |
| Test Data | Company name: UAT Demo Co<br>Currency: PKR<br>Time zone: Asia/Karachi |
| Step-by-Step Instructions | 1. Enter or confirm company name.<br>2. Select currency and time zone.<br>3. Save / Continue to next step. |
| Expected Result | Company profile saved; progress indicator advances. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-007 — Setup Wizard — Complete

| Field | Value |
|-------|-------|
| Module | System |
| Feature | Setup Wizard — Complete |
| Objective | Finish Setup Wizard |
| Navigation Path | Settings → Setup Wizard → final step |
| Prerequisites | Prior wizard steps completed |
| Test Data | None |
| Step-by-Step Instructions | 1. Complete remaining wizard steps (chart, users, etc. as shown).<br>2. Click Finish / Complete setup. |
| Expected Result | Wizard marked complete; Setup Wizard hidden or shows completed state. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-008 — Preferences — General

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Preferences — General |
| Objective | Configure general preferences |
| Navigation Path | Sidebar → System → Settings → Preferences → General tab |
| Prerequisites | Settings access |
| Test Data | Default project: (optional)<br>Enable beep on save: On<br>Display time zone: Asia/Karachi |
| Step-by-Step Instructions | 1. Open Settings → Preferences.<br>2. Select General tab.<br>3. Adjust display options (beep, color coding, date preservation).<br>4. Click Save. |
| Expected Result | Preferences saved; toast or confirmation shown. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-009 — Preferences — Procurement

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Preferences — Procurement |
| Objective | Review procurement settings |
| Navigation Path | Sidebar → System → Settings → Preferences → Procurement tab |
| Prerequisites | Settings access |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Preferences → Procurement tab.<br>2. Review PO/GRN/quotation defaults.<br>3. Save if changes made. |
| Expected Result | Procurement settings panel loads without error. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-010 — Preferences — Workflow

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Preferences — Workflow |
| Objective | Review workflow settings |
| Navigation Path | Sidebar → System → Settings → Preferences → Workflow tab |
| Prerequisites | Settings access |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Preferences → Workflow tab.<br>2. Review enabled workflow types (contracts, agreements, etc.). |
| Expected Result | Workflow settings displayed; toggles functional. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-011 — Preferences — ID Sequences

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Preferences — ID Sequences |
| Objective | Configure document numbering sequences |
| Navigation Path | Sidebar → System → Settings → Preferences → ID Sequences tab |
| Prerequisites | Settings access |
| Test Data | Invoice prefix: INV-<br>PO prefix: PO- |
| Step-by-Step Instructions | 1. Open ID Sequences tab.<br>2. Review or edit sequence prefixes.<br>3. Save changes. |
| Expected Result | Sequences saved; new documents use configured prefixes. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-012 — Preferences — Communication

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Preferences — Communication |
| Objective | Configure messaging and print templates |
| Navigation Path | Sidebar → System → Settings → Preferences → Communication tab |
| Prerequisites | Settings access |
| Test Data | WhatsApp mode: (default)<br>Print template: default |
| Step-by-Step Instructions | 1. Open Communication tab.<br>2. Review WhatsApp and print template sections.<br>3. Save any template changes. |
| Expected Result | Communication settings load; templates editable. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-013 — User Management — Add user

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | User Management — Add user |
| Objective | Create a second application user |
| Navigation Path | Sidebar → System → Settings → User Management → Add User |
| Prerequisites | Admin with user management permission |
| Test Data | Username: approver1<br>Name: UAT Approver<br>Password: Approver@1234<br>Role: (assign appropriate role) |
| Step-by-Step Instructions | 1. Open User Management.<br>2. Click Add User.<br>3. Enter username, name, password.<br>4. Assign role(s).<br>5. Save. |
| Expected Result | New user appears in user list; can log in independently. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-014 — User Management — Edit user

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | User Management — Edit user |
| Objective | Edit existing user details |
| Navigation Path | Sidebar → System → Settings → User Management → select user → Edit |
| Prerequisites | At least one user exists |
| Test Data | Update display name to: UAT Approver Updated |
| Step-by-Step Instructions | 1. Select approver1 from list.<br>2. Click Edit.<br>3. Change display name.<br>4. Save. |
| Expected Result | User record updated; changes visible in list. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-015 — User Management — Deactivate user

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | User Management — Deactivate user |
| Objective | Deactivate a user account |
| Navigation Path | Sidebar → System → Settings → User Management → select user → Deactivate |
| Prerequisites | Test user not currently logged in |
| Test Data | User: (create temp testuser if needed) |
| Step-by-Step Instructions | 1. Select a non-critical test user.<br>2. Deactivate or disable account.<br>3. Confirm action. |
| Expected Result | User marked inactive; cannot log in. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-016 — Permission Matrix

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Permission Matrix |
| Objective | View permission matrix |
| Navigation Path | Sidebar → System → Settings → Permission Matrix |
| Prerequisites | RBAC enabled; admin access |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Permission Matrix.<br>2. Review roles vs permissions grid.<br>3. Search for payroll or financial permissions. |
| Expected Result | Matrix loads; role-permission assignments visible. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-017 — Permission Matrix — Assign

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Permission Matrix — Assign |
| Objective | Assign permission to role |
| Navigation Path | Sidebar → System → Settings → Permission Matrix |
| Prerequisites | Admin with permission management |
| Test Data | Role: Payroll Admin<br>Permission: payroll.read |
| Step-by-Step Instructions | 1. Locate Payroll Admin role.<br>2. Toggle or assign payroll.read.<br>3. Save changes. |
| Expected Result | Permission saved; affected users gain/lose access on re-login. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-018 — Role Management

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Role Management |
| Objective | Create custom role |
| Navigation Path | Sidebar → System → Settings → Role Management → Add Role |
| Prerequisites | Role management enabled |
| Test Data | Role name: UAT Tester<br>Description: UAT read-only role |
| Step-by-Step Instructions | 1. Open Role Management.<br>2. Click Add Role.<br>3. Enter name and description.<br>4. Assign base permissions.<br>5. Save. |
| Expected Result | Custom role created and listed. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-019 — Security — Roles

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Security — Roles |
| Objective | View security roles (RBAC v2) |
| Navigation Path | Sidebar → System → Settings → Administration → Security — Roles |
| Prerequisites | VITE_RBAC_V2 enabled |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Security — Roles section.<br>2. Review system and custom roles. |
| Expected Result | Security roles panel loads (or section hidden if RBAC v2 UI disabled — note in Remarks). |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-020 — Security — Data Scopes

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Security — Data Scopes |
| Objective | View data scope rules |
| Navigation Path | Sidebar → System → Settings → Security — Data Scopes |
| Prerequisites | VITE_RBAC_V2_DATA_SCOPE enabled |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Security — Data Scopes.<br>2. Review scope definitions. |
| Expected Result | Data scopes UI loads or is disabled per feature flag — document actual state. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-021 — Security — Approval Matrix

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Security — Approval Matrix |
| Objective | View approval matrix |
| Navigation Path | Sidebar → System → Settings → Security — Approval Matrix |
| Prerequisites | VITE_RBAC_V2_APPROVAL_MATRIX enabled |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Security — Approval Matrix.<br>2. Review workflow approval rules. |
| Expected Result | Approval matrix UI loads or is disabled per feature flag. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-022 — Menu visibility — Admin

| Field | Value |
|-------|-------|
| Module | RBAC |
| Feature | Menu visibility — Admin |
| Objective | Verify admin sees full sidebar |
| Navigation Path | Main sidebar after login as admin |
| Prerequisites | Admin user logged in |
| Test Data | User: admin |
| Step-by-Step Instructions | 1. Log in as admin.<br>2. Review sidebar groups: Overview, Financials, Selling, Construction, Rental, People, System. |
| Expected Result | Admin sees permitted modules per license (real_estate, rental, etc.). |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-023 — Menu visibility — Restricted user

| Field | Value |
|-------|-------|
| Module | RBAC |
| Feature | Menu visibility — Restricted user |
| Objective | Verify restricted user hides admin modules |
| Navigation Path | Login as restricted user → sidebar |
| Prerequisites | User with sales_user or limited role |
| Test Data | User: sales-only test account |
| Step-by-Step Instructions | 1. Log in as restricted user.<br>2. Verify Financials, Construction, People sections hidden or reduced.<br>3. Verify Personal transactions hidden for non-admin. |
| Expected Result | Sidebar matches role; unauthorized modules not shown. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-024 — Audit Trail — View

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Audit Trail — View |
| Objective | View enterprise audit log |
| Navigation Path | Sidebar → System → Settings → Audit Trail |
| Prerequisites | Admin access; prior login events exist |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Audit Trail.<br>2. Review recent events (login, settings changes).<br>3. Expand a row for details if available. |
| Expected Result | Audit events listed with timestamp, user, action summary. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-025 — Audit Trail — Filter

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Audit Trail — Filter |
| Objective | Filter audit events by module |
| Navigation Path | Sidebar → System → Settings → Audit Trail → filter |
| Prerequisites | Audit events from multiple modules |
| Test Data | Filter: auth or settings |
| Step-by-Step Instructions | 1. Apply module or event type filter.<br>2. Verify filtered results. |
| Expected Result | Only matching events shown. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-026 — Backup Center — Create backup

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Backup Center — Create backup |
| Objective | Create tenant backup |
| Navigation Path | Sidebar → System → Settings → Backup Center → Backup and Restore → Create Backup |
| Prerequisites | Non-sales admin; backup permission |
| Test Data | Backup label: UAT-Initial-Backup |
| Step-by-Step Instructions | 1. Open Backup Center.<br>2. Go to Backup and Restore tab.<br>3. Click Create Backup.<br>4. Enter label if prompted.<br>5. Wait for completion. |
| Expected Result | Backup succeeds; appears in Backup History. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-027 — Backup Center — History

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Backup Center — History |
| Objective | View backup history |
| Navigation Path | Sidebar → System → Settings → Backup Center → Backup History |
| Prerequisites | At least one backup exists (UAT-026) |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Backup History tab.<br>2. Verify UAT-Initial-Backup listed with date/size. |
| Expected Result | Backup history shows prior backup record. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-028 — Backup Center — Tenant Restore preview

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Backup Center — Tenant Restore preview |
| Objective | Open tenant restore wizard (dry run) |
| Navigation Path | Sidebar → System → Settings → Backup Center → Tenant Restore |
| Prerequisites | Backup file available; use staging only |
| Test Data | Restore target: staging test tenant |
| Step-by-Step Instructions | 1. Open Tenant Restore tab.<br>2. Select backup file or snapshot.<br>3. Review restore preview/warnings.<br>4. Cancel without executing on production. |
| Expected Result | Restore wizard loads; warnings displayed; no unintended restore on production. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-029 — Data Management

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Data Management |
| Objective | View data management tools |
| Navigation Path | Sidebar → System → Settings → Data Management |
| Prerequisites | Admin access |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Data Management.<br>2. Review available tools (import, transaction log, clear data).<br>3. Open View Transaction Log if available. |
| Expected Result | Data Management panel loads; transaction log accessible. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-030 — Notifications & Logout

| Field | Value |
|-------|-------|
| Module | System |
| Feature | Notifications & Logout |
| Objective | Verify notifications panel and logout |
| Navigation Path | Header → Notifications bell; User menu → Logout |
| Prerequisites | Logged in user |
| Test Data | None |
| Step-by-Step Instructions | 1. Click Notifications bell in header.<br>2. Review notification list.<br>3. Log out from user menu.<br>4. Verify returned to login screen.<br>5. Log back in as admin. |
| Expected Result | Notifications panel opens; logout clears session; re-login succeeds. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

## Chapter Completion Checklist

- [ ] Admin login works
- [ ] Setup Wizard completed
- [ ] User Management: 2+ users exist
- [ ] Permission Matrix reviewed
- [ ] Audit Trail shows events
- [ ] Backup Center: backup recorded
- [ ] Preferences saved

| Pass Count | Fail Count | Blocked/N/A | Observations |
|------------|------------|-------------|--------------|
| | | | |

---

# Chapter 2 — Master Data Foundation

**Test Case Range:** UAT-031 – UAT-090

## Purpose
Prepare all foundational ERP master data required by downstream modules: chart of accounts, banks, contacts, projects, units, vendors, and rental assets.

## Business Flow
```text
Settings → Chart of Accounts → Banks → Contacts → Assets (Projects/Units) → Vendors → Rental master data
```

## Required Test Data
- Project: Sunrise Towers
- Unit: ST-101 (Floor 1)
- Vendor: ABC Supplies Ltd
- Owner/Client: Ahmed Khan
- Bank: HBL Current Account
- Rental Building: Marina Heights

## Dependencies
- Chapter 1 complete — admin logged in
- Setup Wizard chart bootstrap (or manual COA)

## Expected Outputs
- Chart of accounts with income, expense, bank, equity categories
- At least one bank/cash account
- Vendors and contacts created
- Project and units in Assets
- Rental buildings/properties configured

## Test Cases

### UAT-031 — Chart of Accounts — View

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Chart of Accounts — View |
| Objective | View chart of accounts tree |
| Navigation Path | Sidebar → System → Settings → Financial → Chart of Accounts |
| Prerequisites | Settings financial access |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Chart of Accounts.<br>2. Expand account type groups (Assets, Liabilities, Income, Expense). |
| Expected Result | Full COA tree loads with system and custom accounts. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-032 — Chart of Accounts — Income category

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Chart of Accounts — Income category |
| Objective | Add income category |
| Navigation Path | Sidebar → System → Settings → Chart of Accounts → Add → Income |
| Prerequisites | COA write access |
| Test Data | Name: Unit Sales Income<br>Type: Revenue |
| Step-by-Step Instructions | 1. Click Add under Income section.<br>2. Enter category name and classification.<br>3. Save. |
| Expected Result | Income category created; appears in tree. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-033 — Chart of Accounts — Expense category

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Chart of Accounts — Expense category |
| Objective | Add expense category |
| Navigation Path | Sidebar → System → Settings → Chart of Accounts → Add → Expense |
| Prerequisites | COA write access |
| Test Data | Name: Construction Materials<br>Type: Operating expense |
| Step-by-Step Instructions | 1. Add expense category Construction Materials.<br>2. Save. |
| Expected Result | Expense category created. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-034 — Chart of Accounts — Edit category

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Chart of Accounts — Edit category |
| Objective | Edit existing category |
| Navigation Path | Sidebar → System → Settings → Chart of Accounts → select category → Edit |
| Prerequisites | Category from UAT-033 exists |
| Test Data | Rename to: Construction Material Cost |
| Step-by-Step Instructions | 1. Select Construction Materials.<br>2. Edit name.<br>3. Save. |
| Expected Result | Category renamed successfully. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-035 — Account Categories — P&L classification

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Account Categories — P&L classification |
| Objective | Verify P&L sub-type on category |
| Navigation Path | Sidebar → System → Settings → Chart of Accounts → category detail |
| Prerequisites | Income/expense categories exist |
| Test Data | Classification: Cost of sales |
| Step-by-Step Instructions | 1. Open a cost category.<br>2. Verify P&L classification field.<br>3. Update if needed and save. |
| Expected Result | Classification saved; reports group category correctly. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-036 — Chart of Accounts — Bank account

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Chart of Accounts — Bank account |
| Objective | Create bank/cash account |
| Navigation Path | Sidebar → System → Settings → Chart of Accounts → Add → Bank Accounts |
| Prerequisites | COA write access |
| Test Data | Name: HBL Current Account<br>Type: Bank<br>Opening balance: 1,000,000 |
| Step-by-Step Instructions | 1. Add new Bank account.<br>2. Enter name and opening balance.<br>3. Save. |
| Expected Result | Bank account created; appears under Bank Accounts group. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-037 — Chart of Accounts — Cash account

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Chart of Accounts — Cash account |
| Objective | Create petty cash account |
| Navigation Path | Sidebar → System → Settings → Chart of Accounts → Add → Bank Accounts |
| Prerequisites | COA write access |
| Test Data | Name: Office Petty Cash<br>Type: Bank/Cash |
| Step-by-Step Instructions | 1. Add petty cash account.<br>2. Save. |
| Expected Result | Cash account listed; usable in payment modals. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-038 — Bank Accounts report

| Field | Value |
|-------|-------|
| Module | Accounting |
| Feature | Bank Accounts report |
| Objective | Verify bank account on report |
| Navigation Path | Sidebar → Accounting → Reports → Bank Accounts |
| Prerequisites | Bank account UAT-036 exists |
| Test Data | Account: HBL Current Account |
| Step-by-Step Instructions | 1. Open Accounting module.<br>2. Navigate to Bank Accounts report.<br>3. Locate HBL Current Account row. |
| Expected Result | Bank account appears with balance column. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-039 — Accounting Periods — View

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Accounting Periods — View |
| Objective | View accounting periods |
| Navigation Path | Sidebar → System → Settings → Financial → Accounting Periods |
| Prerequisites | Financial settings access |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Accounting Periods.<br>2. Review open/closed periods list. |
| Expected Result | Accounting periods displayed; current period identifiable. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-040 — Accounting Periods — Open period

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Accounting Periods — Open period |
| Objective | Ensure current period is open |
| Navigation Path | Sidebar → System → Settings → Accounting Periods |
| Prerequisites | Admin access |
| Test Data | Current month/year period |
| Step-by-Step Instructions | 1. Verify current month period status is Open.<br>2. Open period if closed (staging only). |
| Expected Result | Current period open for transactions. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-041 — Contacts — Add vendor contact

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Contacts — Add vendor contact |
| Objective | Create vendor contact |
| Navigation Path | Sidebar → System → Settings → Contacts → Add |
| Prerequisites | Contacts access |
| Test Data | Name: ABC Supplies Ltd<br>Type: Vendor<br>Phone: +92-21-1111111 |
| Step-by-Step Instructions | 1. Open Contacts.<br>2. Click Add.<br>3. Select Vendor type.<br>4. Enter details.<br>5. Save. |
| Expected Result | Vendor contact created; searchable in Procurement. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-042 — Contacts — Add owner/client

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Contacts — Add owner/client |
| Objective | Create owner/client contact |
| Navigation Path | Sidebar → System → Settings → Contacts → Add |
| Prerequisites | Contacts access |
| Test Data | Name: Ahmed Khan<br>Type: Owner (Client)<br>CNIC: 35202-1234567-1 |
| Step-by-Step Instructions | 1. Add contact Ahmed Khan as Owner/Client.<br>2. Save. |
| Expected Result | Owner contact created for agreements/marketing. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-043 — Contacts — Add lead

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Contacts — Add lead |
| Objective | Create sales lead contact |
| Navigation Path | Sidebar → System → Settings → Contacts → Add |
| Prerequisites | Contacts access |
| Test Data | Name: Sara Malik<br>Type: Lead<br>Source: Walk-in |
| Step-by-Step Instructions | 1. Add lead Sara Malik.<br>2. Save. |
| Expected Result | Lead appears in Marketing client/lead selectors. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-044 — Contacts — Add broker

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Contacts — Add broker |
| Objective | Create broker contact |
| Navigation Path | Sidebar → System → Settings → Contacts → Add |
| Prerequisites | Contacts access |
| Test Data | Name: Broker One<br>Type: Broker<br>Commission %: 2 |
| Step-by-Step Instructions | 1. Add broker contact.<br>2. Save. |
| Expected Result | Broker available in selling agreements and payouts. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-045 — Contacts — Edit contact

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Contacts — Edit contact |
| Objective | Edit contact phone number |
| Navigation Path | Sidebar → System → Settings → Contacts → Ahmed Khan → Edit |
| Prerequisites | Ahmed Khan exists |
| Test Data | Phone: +92-300-9999999 |
| Step-by-Step Instructions | 1. Edit Ahmed Khan.<br>2. Update phone.<br>3. Save. |
| Expected Result | Contact updated in list. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-046 — Contacts — Search

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Contacts — Search |
| Objective | Search contacts by name |
| Navigation Path | Sidebar → System → Settings → Contacts → search box |
| Prerequisites | Multiple contacts exist |
| Test Data | Search: Ahmed |
| Step-by-Step Instructions | 1. Type Ahmed in search.<br>2. Verify filtered results. |
| Expected Result | Matching contacts displayed. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-047 — Assets — Add project

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Assets — Add project |
| Objective | Create construction/selling project |
| Navigation Path | Sidebar → System → Settings → Assets → Project Selling & Construction → Project → Add |
| Prerequisites | Assets access |
| Test Data | Name: Sunrise Towers<br>Location: Karachi<br>Status: Active |
| Step-by-Step Instructions | 1. Open Assets → Project group.<br>2. Click Add Project.<br>3. Enter project details.<br>4. Save. |
| Expected Result | Project Sunrise Towers created. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-048 — Assets — Add unit

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Assets — Add unit |
| Objective | Create project unit |
| Navigation Path | Sidebar → System → Settings → Assets → Unit → Add |
| Prerequisites | Project Sunrise Towers exists |
| Test Data | Unit #: ST-101<br>Floor: 1<br>Area: 1200 sqft<br>Project: Sunrise Towers |
| Step-by-Step Instructions | 1. Add Unit under project.<br>2. Link to Sunrise Towers.<br>3. Save. |
| Expected Result | Unit ST-101 created and linked to project. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-049 — Assets — Edit unit status

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Assets — Edit unit status |
| Objective | Update unit availability status |
| Navigation Path | Sidebar → System → Settings → Assets → Unit ST-101 → Edit |
| Prerequisites | Unit ST-101 exists |
| Test Data | Status: Available |
| Step-by-Step Instructions | 1. Edit unit ST-101.<br>2. Set status Available.<br>3. Save. |
| Expected Result | Unit status updated; reflected in Marketing/Units view. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-050 — Assets — KPI strip

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Assets — KPI strip |
| Objective | View assets summary KPIs |
| Navigation Path | Sidebar → System → Settings → Assets |
| Prerequisites | Projects and units exist |
| Test Data | None |
| Step-by-Step Instructions | 1. Review KPI strip: Total assets, Inventory value, Available units, Open POs. |
| Expected Result | KPI values load without error (API mode). |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-051 — Assets — Rental building

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Assets — Rental building |
| Objective | Create rental building asset |
| Navigation Path | Sidebar → System → Settings → Assets → Rental → Rental Building → Add |
| Prerequisites | Rental license enabled |
| Test Data | Name: Marina Heights<br>City: Karachi |
| Step-by-Step Instructions | 1. Switch to Rental asset group.<br>2. Add Rental Building Marina Heights.<br>3. Save. |
| Expected Result | Rental building asset created. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-052 — Assets — Rental property/unit

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Assets — Rental property/unit |
| Objective | Create rental property unit |
| Navigation Path | Sidebar → System → Settings → Assets → Rental Properties → Add |
| Prerequisites | Marina Heights exists |
| Test Data | Unit: MH-201<br>Building: Marina Heights<br>Beds: 2 |
| Step-by-Step Instructions | 1. Add rental property/unit MH-201.<br>2. Link to Marina Heights.<br>3. Save. |
| Expected Result | Rental unit created. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-053 — Vendor directory — Auto from contact

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | Vendor directory — Auto from contact |
| Objective | Verify vendor appears in Procurement |
| Navigation Path | Sidebar → Construction → Procurement → Vendor directory |
| Prerequisites | Vendor ABC Supplies Ltd exists |
| Test Data | Vendor: ABC Supplies Ltd |
| Step-by-Step Instructions | 1. Open Procurement → Vendor directory.<br>2. Search ABC Supplies Ltd. |
| Expected Result | Vendor listed with Ledger/Bills/Quotations tabs. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-054 — Contacts — Employee type

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Contacts — Employee type |
| Objective | Create employee contact for payroll |
| Navigation Path | Sidebar → System → Settings → Contacts (or Payroll will create employee) |
| Prerequisites | Payroll module access |
| Test Data | Name: Ali Khan<br>Type: Employee |
| Step-by-Step Instructions | 1. Add employee-type contact OR note employee created via Payroll → Employees in Ch.3.<br>2. Save if creating here. |
| Expected Result | Employee master ready for Payroll chapter. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-055 — Assets — Second unit

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Assets — Second unit |
| Objective | Create second unit for selling tests |
| Navigation Path | Sidebar → System → Settings → Assets → Unit → Add |
| Prerequisites | Sunrise Towers exists |
| Test Data | Unit #: ST-102<br>Floor: 1 |
| Step-by-Step Instructions | 1. Add unit ST-102.<br>2. Save. |
| Expected Result | Second unit available for marketing/agreements. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-056 — Chart of Accounts — Equity account

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Chart of Accounts — Equity account |
| Objective | Create equity/investor account |
| Navigation Path | Sidebar → System → Settings → Chart of Accounts → Equity → Add |
| Prerequisites | COA access |
| Test Data | Name: Investor Capital |
| Step-by-Step Instructions | 1. Add equity account.<br>2. Save. |
| Expected Result | Equity account available for investment module. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-057 — Chart of Accounts — Internal clearing

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Chart of Accounts — Internal clearing |
| Objective | Verify internal clearing account exists |
| Navigation Path | Sidebar → System → Settings → Chart of Accounts |
| Prerequisites | System bootstrap complete |
| Test Data | Account: Internal Clearing |
| Step-by-Step Instructions | 1. Search for Internal Clearing account.<br>2. Verify system account present. |
| Expected Result | Internal Clearing account exists (system). |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-058 — Preferences — Tools tab

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Preferences — Tools tab |
| Objective | Review import/export tools |
| Navigation Path | Sidebar → System → Settings → Preferences → Tools |
| Prerequisites | Settings access |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Preferences → Tools tab.<br>2. Review Import/Export wizard link. |
| Expected Result | Tools section loads; import wizard accessible. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-059 — Import Data wizard — Open

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Import Data wizard — Open |
| Objective | Open import data wizard |
| Navigation Path | Sidebar → System → Settings → Preferences → Tools → Import |
| Prerequisites | Admin access |
| Test Data | None |
| Step-by-Step Instructions | 1. Launch Import Data wizard.<br>2. Review available import types (contacts, budgets, etc.).<br>3. Cancel without importing. |
| Expected Result | Import wizard opens; templates downloadable. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-060 — Contacts — Tenant contact type

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Contacts — Tenant contact type |
| Objective | Create tenant contact for rental |
| Navigation Path | Sidebar → System → Settings → Contacts → Add |
| Prerequisites | Rental module enabled |
| Test Data | Name: Fatima Tenant<br>Type: Tenant |
| Step-by-Step Instructions | 1. Add tenant contact Fatima Tenant.<br>2. Save. |
| Expected Result | Tenant contact ready for Rental agreements chapter. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-061 — Assets — Project second

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Assets — Project second |
| Objective | Create second project |
| Navigation Path | Sidebar → System → Settings → Assets → Project → Add |
| Prerequisites | Assets access |
| Test Data | Name: Green Valley |
| Step-by-Step Instructions | 1. Add project Green Valley.<br>2. Save. |
| Expected Result | Second project for construction/budget tests. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-062 — Chart of Accounts — Delete guard

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Chart of Accounts — Delete guard |
| Objective | Attempt delete of used category |
| Navigation Path | Sidebar → System → Settings → Chart of Accounts |
| Prerequisites | Category linked to transaction |
| Test Data | Category with transactions |
| Step-by-Step Instructions | 1. Select category used in a transaction.<br>2. Attempt delete.<br>3. Observe error. |
| Expected Result | System prevents delete or warns of dependencies. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-063 — Vendor — Ledger tab empty

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | Vendor — Ledger tab empty |
| Objective | View new vendor empty ledger |
| Navigation Path | Procurement → Vendor directory → ABC Supplies → Ledger |
| Prerequisites | Vendor exists; no bills yet |
| Test Data | Vendor: ABC Supplies Ltd |
| Step-by-Step Instructions | 1. Open vendor ABC Supplies.<br>2. Click Ledger tab. |
| Expected Result | Empty ledger or zero balance displayed. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-064 — Assets — Unit link validation

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Assets — Unit link validation |
| Objective | Verify unit requires project |
| Navigation Path | Sidebar → System → Settings → Assets → Unit → Add |
| Prerequisites | Assets access |
| Test Data | Unit without project |
| Step-by-Step Instructions | 1. Attempt to save unit without selecting project.<br>2. Observe validation. |
| Expected Result | Validation requires project selection. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-065 — Contacts — Duplicate check

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Contacts — Duplicate check |
| Objective | Attempt duplicate vendor name |
| Navigation Path | Sidebar → System → Settings → Contacts → Add |
| Prerequisites | ABC Supplies Ltd exists |
| Test Data | Same name: ABC Supplies Ltd |
| Step-by-Step Instructions | 1. Try adding duplicate vendor name.<br>2. Save. |
| Expected Result | Warning or duplicate handling per system rules. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-066 — Chart of Accounts — Search

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Chart of Accounts — Search |
| Objective | Search accounts by name |
| Navigation Path | Sidebar → System → Settings → Chart of Accounts → search |
| Prerequisites | Multiple accounts exist |
| Test Data | Search: HBL |
| Step-by-Step Instructions | 1. Search for HBL.<br>2. Verify HBL Current Account found. |
| Expected Result | Search filters COA tree. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-067 — Assets — Rental owner link

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Assets — Rental owner link |
| Objective | Link owner to rental building |
| Navigation Path | Rental → Rental setup OR Assets |
| Prerequisites | Owner Ahmed Khan + Marina Heights exist |
| Test Data | Owner: Ahmed Khan |
| Step-by-Step Instructions | 1. In Rental setup or Assets, associate owner to building if field available.<br>2. Save. |
| Expected Result | Owner linked to rental asset (or documented in Rental setup Ch.6). |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-068 — Chart of Accounts — Retained earnings

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Chart of Accounts — Retained earnings |
| Objective | Verify retained earnings system account |
| Navigation Path | Sidebar → System → Settings → Chart of Accounts → Equity |
| Prerequisites | System bootstrap |
| Test Data | Account: Retained Earnings |
| Step-by-Step Instructions | 1. Locate Retained Earnings under Equity. |
| Expected Result | System equity account present. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-069 — Assets — Unit area validation

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Assets — Unit area validation |
| Objective | Enter unit area and price fields |
| Navigation Path | Sidebar → System → Settings → Assets → Unit ST-101 → Edit |
| Prerequisites | Unit ST-101 exists |
| Test Data | Area: 1200<br>Price: 5,000,000 |
| Step-by-Step Instructions | 1. Edit unit.<br>2. Enter area and base price if fields exist.<br>3. Save. |
| Expected Result | Unit financial fields saved for selling. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-070 — Master data — Global search

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Master data — Global search |
| Objective | Find Contacts via global search |
| Navigation Path | Header → Global search → Contacts |
| Prerequisites | Contacts exist |
| Test Data | Search: Ahmed |
| Step-by-Step Instructions | 1. Open global search (Ctrl+K or search icon).<br>2. Type Ahmed.<br>3. Navigate to Contacts result. |
| Expected Result | Global search opens Contacts with context. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-071 — Master data — Global search Assets

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Master data — Global search Assets |
| Objective | Find Assets via global search |
| Navigation Path | Global search → Assets / Settings Assets |
| Prerequisites | Projects exist |
| Test Data | Search: Sunrise |
| Step-by-Step Instructions | 1. Search Sunrise in global search.<br>2. Open Assets result. |
| Expected Result | Navigates to Assets management. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-072 — Contacts — Owner for rental

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Contacts — Owner for rental |
| Objective | Create property owner for rental |
| Navigation Path | Sidebar → System → Settings → Contacts → Add |
| Prerequisites | Rental enabled |
| Test Data | Name: Owner Ali<br>Type: Owner |
| Step-by-Step Instructions | 1. Add owner for rental payouts.<br>2. Save. |
| Expected Result | Owner ready for rental module. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-073 — Chart of Accounts — AP account

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Chart of Accounts — AP account |
| Objective | Verify accounts payable category |
| Navigation Path | Sidebar → System → Settings → Chart of Accounts → Liabilities |
| Prerequisites | System bootstrap |
| Test Data | Accounts Payable |
| Step-by-Step Instructions | 1. Locate Accounts Payable or vendor liability category. |
| Expected Result | AP category available for vendor bills. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-074 — Chart of Accounts — AR account

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Chart of Accounts — AR account |
| Objective | Verify accounts receivable category |
| Navigation Path | Sidebar → System → Settings → Chart of Accounts → Assets |
| Prerequisites | System bootstrap |
| Test Data | Accounts Receivable |
| Step-by-Step Instructions | 1. Locate AR or receivable category. |
| Expected Result | AR category available for invoices. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-075 — Assets — Delete unit guard

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Assets — Delete unit guard |
| Objective | Attempt delete unit with dependencies |
| Navigation Path | Sidebar → System → Settings → Assets → Unit |
| Prerequisites | Unit may have agreements later |
| Test Data | Unit: ST-102 (no dependencies yet) |
| Step-by-Step Instructions | 1. Select ST-102.<br>2. Delete if no dependencies.<br>3. Or note blocked after Ch.4 linkage. |
| Expected Result | Delete succeeds when no dependencies; blocked when linked. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-076 — Contacts — Vendor payment terms

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Contacts — Vendor payment terms |
| Objective | Set vendor payment terms if available |
| Navigation Path | Sidebar → System → Settings → Contacts → ABC Supplies → Edit |
| Prerequisites | Vendor exists |
| Test Data | Terms: Net 30 |
| Step-by-Step Instructions | 1. Edit vendor.<br>2. Set payment terms field if present.<br>3. Save. |
| Expected Result | Payment terms saved on vendor record. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-077 — Assets — Project status inactive

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Assets — Project status inactive |
| Objective | Mark test project inactive |
| Navigation Path | Sidebar → System → Settings → Assets → Green Valley → Edit |
| Prerequisites | Green Valley exists |
| Test Data | Status: Inactive |
| Step-by-Step Instructions | 1. Set Green Valley inactive.<br>2. Save.<br>3. Verify hidden from active pickers. |
| Expected Result | Inactive project excluded from active selectors. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-078 — Chart of Accounts — COA export

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Chart of Accounts — COA export |
| Objective | Export or print COA if available |
| Navigation Path | Sidebar → System → Settings → Chart of Accounts |
| Prerequisites | COA populated |
| Test Data | None |
| Step-by-Step Instructions | 1. Look for Export/Print action on COA.<br>2. Export if available. |
| Expected Result | Export produces file or print preview. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-079 — Contacts — Bulk count verification

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Contacts — Bulk count verification |
| Objective | Verify contact list count |
| Navigation Path | Sidebar → System → Settings → Contacts |
| Prerequisites | Multiple contacts created |
| Test Data | Expected: 6+ contacts |
| Step-by-Step Instructions | 1. Count contacts in list.<br>2. Match against created records. |
| Expected Result | All master contacts visible. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-080 — Assets — Unit valuation KPI

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Assets — Unit valuation KPI |
| Objective | Verify unit valuation KPI on Assets page |
| Navigation Path | Sidebar → System → Settings → Assets → KPI strip |
| Prerequisites | Units with prices set |
| Test Data | None |
| Step-by-Step Instructions | 1. Review Inventory value KPI label on Assets (unit sale-price aggregate, not warehouse stock). |
| Expected Result | KPI reflects unsold unit valuation; procurement stock is tracked via GRN in Chapter 7. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-081 — Master data audit

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Master data audit |
| Objective | Verify asset creation in audit trail |
| Navigation Path | Sidebar → System → Settings → Audit Trail |
| Prerequisites | Project/unit created in this chapter |
| Test Data | Entity: project or unit |
| Step-by-Step Instructions | 1. Filter audit for asset/project creation events. |
| Expected Result | Audit shows create events for master data. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-082 — Chart of Accounts — Category for payroll

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Chart of Accounts — Category for payroll |
| Objective | Create payroll expense category |
| Navigation Path | Sidebar → System → Settings → Chart of Accounts → Expense → Add |
| Prerequisites | For Ch.3 payroll GL |
| Test Data | Name: Salaries Expense |
| Step-by-Step Instructions | 1. Add Salaries Expense category.<br>2. Save. |
| Expected Result | Category ready for payroll GL defaults. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-083 — Chart of Accounts — Payroll liability

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Chart of Accounts — Payroll liability |
| Objective | Create payroll liability category |
| Navigation Path | Sidebar → System → Settings → Chart of Accounts → Liabilities → Add |
| Prerequisites | For Ch.3 |
| Test Data | Name: Salaries Payable |
| Step-by-Step Instructions | 1. Add Salaries Payable liability category.<br>2. Save. |
| Expected Result | Liability category for payroll accrual. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-084 — Contacts — CNIC/ID field

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Contacts — CNIC/ID field |
| Objective | Enter national ID on contact |
| Navigation Path | Sidebar → System → Settings → Contacts → Ahmed Khan → Edit |
| Prerequisites | Contact exists |
| Test Data | CNIC: 35202-1234567-1 |
| Step-by-Step Instructions | 1. Enter CNIC/ID field.<br>2. Save. |
| Expected Result | ID stored on contact record. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-085 — Assets — Unit floor field

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Assets — Unit floor field |
| Objective | Verify floor field on unit (no Blocks module) |
| Navigation Path | Sidebar → System → Settings → Assets → Unit ST-101 |
| Prerequisites | Unit exists |
| Test Data | Floor: 1 |
| Step-by-Step Instructions | 1. Open unit ST-101.<br>2. Confirm Floor field used (Blocks module NOT IMPLEMENTED). |
| Expected Result | Floor field present; no separate Blocks entity. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-086 — Blocks entity **[NOT IMPLEMENTED]**

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Blocks entity |
| Objective | Verify Blocks module not available |
| Navigation Path | Sidebar → System → Settings → Assets |
| Prerequisites | None |
| Test Data | None |
| Step-by-Step Instructions | 1. Search UI for Block entity or Blocks menu.<br>2. Confirm not present. |
| Expected Result | NOT IMPLEMENTED — no Blocks menu; document N/A in Status. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks | NOT IMPLEMENTED — feature not available in current product build. |

### UAT-087 — Chart of Accounts — Investor equity

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Chart of Accounts — Investor equity |
| Objective | Create investor equity account for Inv Mgmt |
| Navigation Path | Sidebar → System → Settings → Chart of Accounts → Equity → Add |
| Prerequisites | For Ch.8 Investment Management |
| Test Data | Name: Investor — Ali Capital<br>Type: Equity |
| Step-by-Step Instructions | 1. Add equity account for investor capital tracking.<br>2. Save. |
| Expected Result | Equity account ready for Investment Management chapter. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-088 — Employees master via Payroll

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Employees master via Payroll |
| Objective | Cross-check employee not in Settings |
| Navigation Path | Sidebar → System → Settings → Contacts |
| Prerequisites | None |
| Test Data | None |
| Step-by-Step Instructions | 1. Confirm full employee HR record is in Payroll → Employees (Ch.3), not Settings. |
| Expected Result | Employee HR records managed under Payroll module. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-089 — Assets — Unsold units KPI

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Assets — Unsold units KPI |
| Objective | View available units KPI on Assets |
| Navigation Path | Sidebar → System → Settings → Assets → KPI strip |
| Prerequisites | Units with prices from Ch.2 |
| Test Data | None |
| Step-by-Step Instructions | 1. Review Available units and unit valuation KPIs (not a standalone Inventory module). |
| Expected Result | Assets KPI strip shows unit-based metrics; full procurement flow is Chapter 7. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-090 — Master data chapter sign-off

| Field | Value |
|-------|-------|
| Module | Settings |
| Feature | Master data chapter sign-off |
| Objective | Review all master data ready for downstream |
| Navigation Path | Settings modules review |
| Prerequisites | Ch.2 cases executed |
| Test Data | Checklist from chapter intro |
| Step-by-Step Instructions | 1. Verify COA, bank, vendors, clients, project/units, rental assets exist.<br>2. Complete chapter checklist. |
| Expected Result | All required master data present for Chapters 3–12. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

## Chapter Completion Checklist

- [ ] Chart of Accounts complete
- [ ] Bank account created
- [ ] Vendor and client contacts exist
- [ ] Project + unit created
- [ ] Rental building + unit created
- [ ] Employee contact (if needed for payroll) ready

| Pass Count | Fail Count | Blocked/N/A | Observations |
|------------|------------|-------------|--------------|
| | | | |

---

# Chapter 3 — Payroll

**Test Case Range:** UAT-091 – UAT-150

## Purpose
Execute payroll end-to-end: settings, employees, attendance, leave, wizard, processing, SoD approval, payslips, payments, ledger, reports, void/reversal, and audit.

## Business Flow
```text
Payroll Settings → Employees → Attendance/Leave → Payroll Wizard → SoD Approval → Payroll Processing → Pay → Reports → Audit
```

## Required Test Data
- Employees: Ali Khan (Finance, 50,000), Sara Ahmed (HR, 45,000)
- Department: Finance; Grade: G1
- Bank: HBL Current Account (from Ch.2)
- Users: admin (Preparer) + approver1 (Approver, different from run creator)

## Dependencies
- Chapter 2 — bank account, salary expense categories
- Two users for SoD approval tests

## Expected Outputs
- Payroll run processed and approved
- Payslips paid from bank account
- Employee ledger reflects accrual and payment
- Audit log shows payroll events

## Test Cases

### UAT-091 — Open Payroll Hub

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Open Payroll Hub |
| Objective | Navigate to Payroll module |
| Navigation Path | Sidebar → People → Payroll |
| Prerequisites | User with payroll access |
| Test Data | None |
| Step-by-Step Instructions | 1. Log in.<br>2. Sidebar → People → Payroll. |
| Expected Result | Payroll Hub loads with sub-navigation tabs. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-092 — Dashboard KPIs

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Dashboard KPIs |
| Objective | Review payroll dashboard KPI cards |
| Navigation Path | Sidebar → People → Payroll → Dashboard |
| Prerequisites | Payroll access |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Dashboard tab.<br>2. Review 8 KPI cards: Active employees, Payroll runs, Pending approval, etc. |
| Expected Result | KPI cards display counts/currency. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-093 — Settings — Department

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Settings — Department |
| Objective | Create payroll department |
| Navigation Path | Sidebar → People → Payroll → Settings → Departments → + Add Department |
| Prerequisites | Payroll write access |
| Test Data | Name: Finance |
| Step-by-Step Instructions | 1. Open Payroll → Settings.<br>2. Departments → Add Department Finance.<br>3. Save. |
| Expected Result | Department listed with staff count. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-094 — Settings — Grade

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Settings — Grade |
| Objective | Create grade level |
| Navigation Path | Sidebar → People → Payroll → Settings → Grade Levels → + Add Grade |
| Prerequisites | Payroll settings access |
| Test Data | Name: G1<br>Min: 40000<br>Max: 80000 |
| Step-by-Step Instructions | 1. Add Grade G1 with salary range.<br>2. Save. |
| Expected Result | Grade shows BASE and MULTIPLIER badges. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-095 — Settings — Work Week

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Settings — Work Week |
| Objective | Configure working days |
| Navigation Path | Sidebar → People → Payroll → Settings → Work Week |
| Prerequisites | Payroll settings access |
| Test Data | Working days: Mon–Fri |
| Step-by-Step Instructions | 1. Set Mon–Fri as working days.<br>2. Save. |
| Expected Result | Work week saved for LOP calculation. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-096 — Settings — Leave Type

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Settings — Leave Type |
| Objective | Create leave type |
| Navigation Path | Sidebar → People → Payroll → Settings → Leave Types |
| Prerequisites | Payroll settings access |
| Test Data | Name: Annual Leave<br>Paid: Yes |
| Step-by-Step Instructions | 1. Add leave type Annual Leave.<br>2. Save. |
| Expected Result | Leave type available in Leave Management. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-097 — Settings — Earning Type

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Settings — Earning Type |
| Objective | Create earning type |
| Navigation Path | Sidebar → People → Payroll → Settings → Salary Component Types → Earning |
| Prerequisites | Payroll settings access |
| Test Data | Name: Housing Allowance<br>Taxable: No |
| Step-by-Step Instructions | 1. Add earning type Housing Allowance.<br>2. Save. |
| Expected Result | Earning type listed. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-098 — Settings — Deduction Type

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Settings — Deduction Type |
| Objective | Create deduction type |
| Navigation Path | Sidebar → People → Payroll → Settings → Salary Component Types → Deduction |
| Prerequisites | Payroll settings access |
| Test Data | Name: Loan Deduction |
| Step-by-Step Instructions | 1. Add deduction type Loan Deduction.<br>2. Save. |
| Expected Result | Deduction type listed. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-099 — Settings — GL Defaults

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Settings — GL Defaults |
| Objective | Configure payroll GL defaults |
| Navigation Path | Sidebar → People → Payroll → Settings → Payroll GL Defaults |
| Prerequisites | COA from Ch.2 |
| Test Data | Salary expense: Salaries Expense<br>Payable: Salaries Payable<br>Bank: HBL Current Account |
| Step-by-Step Instructions | 1. Open GL Defaults.<br>2. Map expense, payable, and bank accounts.<br>3. Save. |
| Expected Result | GL defaults saved. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-100 — Employees — Add

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Employees — Add |
| Objective | Add employee Ali Khan |
| Navigation Path | Sidebar → People → Payroll → Employees → + Add Employee |
| Prerequisites | Dept Finance, Grade G1 exist |
| Test Data | Name: Ali Khan<br>Dept: Finance<br>Salary: 50,000<br>Allowance: Housing 5,000 |
| Step-by-Step Instructions | 1. Add Employee.<br>2. Enter personal, job, salary details.<br>3. Save Employee. |
| Expected Result | Ali Khan in workforce table. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-101 — Employees — Add second

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Employees — Add second |
| Objective | Add employee Sara Ahmed |
| Navigation Path | Sidebar → People → Payroll → Employees → + Add Employee |
| Prerequisites | Dept HR or Finance |
| Test Data | Name: Sara Ahmed<br>Salary: 45,000 |
| Step-by-Step Instructions | 1. Add Sara Ahmed.<br>2. Save. |
| Expected Result | Second employee in list. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-102 — Employees — Search

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Employees — Search |
| Objective | Search workforce |
| Navigation Path | Sidebar → People → Payroll → Employees → Search workforce |
| Prerequisites | 2+ employees |
| Test Data | Search: Ali |
| Step-by-Step Instructions | 1. Type Ali in search box.<br>2. Wait for results. |
| Expected Result | Ali Khan returned in paginated search. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-103 — Employees — Profile

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Employees — Profile |
| Objective | View employee profile tabs |
| Navigation Path | Sidebar → People → Payroll → Employees → Ali Khan → Profile |
| Prerequisites | Ali Khan exists |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Ali Khan profile.<br>2. Review tabs: Summary, Payslips, Ledger, Attendance, Leave, History. |
| Expected Result | All profile tabs load. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-104 — Attendance — Daily entry

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Attendance — Daily entry |
| Objective | Record daily attendance |
| Navigation Path | Sidebar → People → Payroll → Attendance → Daily → + Add |
| Prerequisites | attendance.read permission |
| Test Data | Employee: Ali Khan<br>Date: today<br>Status: Present |
| Step-by-Step Instructions | 1. Open Attendance → Daily.<br>2. Add attendance for Ali Khan Present.<br>3. Save. |
| Expected Result | Attendance row saved. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-105 — Attendance — Bulk

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Attendance — Bulk |
| Objective | Bulk attendance entry |
| Navigation Path | Sidebar → People → Payroll → Attendance → Daily → Bulk |
| Prerequisites | Multiple employees |
| Test Data | Status: Present for all |
| Step-by-Step Instructions | 1. Open Bulk modal.<br>2. Apply Present to multiple employees.<br>3. Save. |
| Expected Result | Bulk rows created/updated. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-106 — Attendance — Monthly sheet

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Attendance — Monthly sheet |
| Objective | View monthly attendance sheet |
| Navigation Path | Sidebar → People → Payroll → Attendance → Monthly sheet |
| Prerequisites | Attendance records exist |
| Test Data | Month: current |
| Step-by-Step Instructions | 1. Open Monthly sheet tab.<br>2. Review grid for current month. |
| Expected Result | Monthly sheet displays employee attendance grid. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-107 — Leave — Request

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Leave — Request |
| Objective | Create leave request |
| Navigation Path | Sidebar → People → Payroll → Leave Management → Requests → New |
| Prerequisites | leave.read permission |
| Test Data | Employee: Sara Ahmed<br>Type: Annual Leave<br>Days: 2 |
| Step-by-Step Instructions | 1. Create leave request for Sara.<br>2. Submit. |
| Expected Result | Request status Pending. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-108 — Leave — Approve

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Leave — Approve |
| Objective | Approve leave request |
| Navigation Path | Sidebar → People → Payroll → Leave Management → Approvals |
| Prerequisites | Pending request from UAT-107 |
| Test Data | Request: Sara Annual Leave |
| Step-by-Step Instructions | 1. Open Approvals tab.<br>2. Approve Sara request. |
| Expected Result | Status APPROVED; attendance days auto-created. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-109 — Leave — Balances

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Leave — Balances |
| Objective | View leave balances |
| Navigation Path | Sidebar → People → Payroll → Leave Management → Balances |
| Prerequisites | Approved leave exists |
| Test Data | Employee: Sara Ahmed |
| Step-by-Step Instructions | 1. Open Balances tab.<br>2. Verify Sara balance updated. |
| Expected Result | Leave balance reflects approved days. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-110 — Wizard — Step 1 Period

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Wizard — Step 1 Period |
| Objective | Start payroll wizard period |
| Navigation Path | Sidebar → People → Payroll → Payroll Wizard |
| Prerequisites | Employees and attendance exist |
| Test Data | Month: current<br>Year: current |
| Step-by-Step Instructions | 1. Open Payroll Wizard.<br>2. Select current month/year.<br>3. Continue. |
| Expected Result | Wizard advances to Attendance step. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-111 — Wizard — Step 2 Attendance

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Wizard — Step 2 Attendance |
| Objective | Review attendance in wizard |
| Navigation Path | Sidebar → People → Payroll → Payroll Wizard → Attendance |
| Prerequisites | Wizard at step 2 |
| Test Data | None |
| Step-by-Step Instructions | 1. Review attendance summary.<br>2. Next: LOP review. |
| Expected Result | Attendance items displayed. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-112 — Wizard — Step 3 LOP

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Wizard — Step 3 LOP |
| Objective | Review loss-of-pay |
| Navigation Path | Sidebar → People → Payroll → Payroll Wizard → LOP |
| Prerequisites | Wizard at step 3 |
| Test Data | None |
| Step-by-Step Instructions | 1. Review LOP calculations.<br>2. Next: Preview. |
| Expected Result | LOP amounts shown per employee. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-113 — Wizard — Step 4 Preview

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Wizard — Step 4 Preview |
| Objective | Preview payroll impact |
| Navigation Path | Sidebar → People → Payroll → Payroll Wizard → Preview |
| Prerequisites | Wizard at step 4 |
| Test Data | None |
| Step-by-Step Instructions | 1. Review gross/net preview.<br>2. Continue to Generate. |
| Expected Result | Preview totals match employee salaries. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-114 — Wizard — Step 5 Generate

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Wizard — Step 5 Generate |
| Objective | Generate attendance summaries |
| Navigation Path | Sidebar → People → Payroll → Payroll Wizard → Generate |
| Prerequisites | Wizard at step 5 |
| Test Data | None |
| Step-by-Step Instructions | 1. Click Generate summaries.<br>2. Wait for completion. |
| Expected Result | Summaries generated successfully. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-115 — Wizard — Step 6 Process

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Wizard — Step 6 Process |
| Objective | Process payslips |
| Navigation Path | Sidebar → People → Payroll → Payroll Wizard → Process |
| Prerequisites | Summaries generated |
| Test Data | None |
| Step-by-Step Instructions | 1. Click Process payslips.<br>2. Wait for run status GENERATED. |
| Expected Result | Payslips created; run status GENERATED. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-116 — Wizard — Step 7 SoD block

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Wizard — Step 7 SoD block |
| Objective | Creator cannot approve own run |
| Navigation Path | Sidebar → People → Payroll → Payroll Wizard → Approval |
| Prerequisites | User A created run; same user on step 7 |
| Test Data | User: admin (creator) |
| Step-by-Step Instructions | 1. As run creator on Approval step.<br>2. Observe Approve button disabled.<br>3. Read SoD policy message. |
| Expected Result | Approve disabled; Waiting For Approver shown. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-117 — SoD — Independent approve

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | SoD — Independent approve |
| Objective | Second user approves run |
| Navigation Path | Sidebar → People → Payroll → Payroll Wizard → Approval OR Payroll Processing banner |
| Prerequisites | approver1 logged in; not run creator |
| Test Data | User: approver1 |
| Step-by-Step Instructions | 1. Log in as approver1.<br>2. Open Wizard step 7 or Processing approval banner.<br>3. Click Approve Payroll Run. |
| Expected Result | Run status APPROVED. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-118 — Processing — Open cycle

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Processing — Open cycle |
| Objective | Open Payroll Processing view |
| Navigation Path | Sidebar → People → Payroll → Payroll Processing |
| Prerequisites | Approved run exists |
| Test Data | Period: current month |
| Step-by-Step Instructions | 1. Open Payroll Processing.<br>2. Select current period/run. |
| Expected Result | Employee tree and payslip table load. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-119 — Processing — Pay single

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Processing — Pay single |
| Objective | Pay single payslip |
| Navigation Path | Sidebar → People → Payroll → Payroll Processing → Pay |
| Prerequisites | APPROVED run; unpaid payslip |
| Test Data | Employee: Ali Khan<br>Account: HBL Current Account<br>Amount: net pay |
| Step-by-Step Instructions | 1. Select Ali Khan payslip.<br>2. Click Pay → Pay Salary modal.<br>3. Select bank account.<br>4. Confirm Payment. |
| Expected Result | Payslip marked paid; GL transaction posted. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-120 — Processing — Bulk pay

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Processing — Bulk pay |
| Objective | Bulk pay remaining payslips |
| Navigation Path | Sidebar → People → Payroll → Payroll Processing → Pay (N) |
| Prerequisites | APPROVED run; unpaid payslips |
| Test Data | Account: HBL Current Account |
| Step-by-Step Instructions | 1. Select unpaid payslip checkboxes.<br>2. Click Pay (N) toolbar.<br>3. Confirm bulk payment. |
| Expected Result | All selected payslips paid. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-121 — Processing — Pay before approve blocked

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Processing — Pay before approve blocked |
| Objective | Verify pay blocked on unapproved run |
| Navigation Path | Sidebar → People → Payroll → Payroll Processing |
| Prerequisites | GENERATED (not APPROVED) run |
| Test Data | New test run if needed |
| Step-by-Step Instructions | 1. Create new run without approval.<br>2. Attempt Pay on payslip. |
| Expected Result | Payment blocked: run must be APPROVED. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-122 — Processing — Edit payslip

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Processing — Edit payslip |
| Objective | Edit payslip amounts |
| Navigation Path | Sidebar → People → Payroll → Payroll Processing → Edit |
| Prerequisites | Unpaid or approved run per rules |
| Test Data | Adjust allowance +500 |
| Step-by-Step Instructions | 1. Click Edit on payslip.<br>2. Adjust amount.<br>3. Save. |
| Expected Result | Net recalculated; audit event recorded. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-123 — Processing — Delete unpaid payslip

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Processing — Delete unpaid payslip |
| Objective | Delete unpaid payslip |
| Navigation Path | Sidebar → People → Payroll → Payroll Processing → Delete |
| Prerequisites | Unpaid payslip on test run |
| Test Data | Test employee payslip |
| Step-by-Step Instructions | 1. Delete unpaid payslip.<br>2. Confirm. |
| Expected Result | Payslip removed; totals updated. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-124 — Processing — Employee ledger

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Processing — Employee ledger |
| Objective | View employee ledger in processing |
| Navigation Path | Sidebar → People → Payroll → Payroll Processing → filter Ledger |
| Prerequisites | Paid payslip exists |
| Test Data | Employee: Ali Khan |
| Step-by-Step Instructions | 1. Select Ali Khan.<br>2. Filter Ledger.<br>3. Review transactions. |
| Expected Result | Ledger shows accrual and payment entries. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-125 — Payslips — Register

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Payslips — Register |
| Objective | View payslips register |
| Navigation Path | Sidebar → People → Payroll → Payslips |
| Prerequisites | Paid payslips exist |
| Test Data | Year: current |
| Step-by-Step Instructions | 1. Open Payslips tab.<br>2. Filter by year.<br>3. Locate Ali Khan payslip. |
| Expected Result | Payslip listed in register. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-126 — Payslips — View/Print

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Payslips — View/Print |
| Objective | View and print payslip |
| Navigation Path | Sidebar → People → Payroll → Payslips OR Employee Profile → Payslips |
| Prerequisites | Paid payslip |
| Test Data | Employee: Ali Khan |
| Step-by-Step Instructions | 1. Open payslip detail.<br>2. Click Print/View. |
| Expected Result | Payslip PDF or print preview displays. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-127 — Payment History

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Payment History |
| Objective | View payment history |
| Navigation Path | Sidebar → People → Payroll → Payment History |
| Prerequisites | Completed payments exist |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Payment History tab.<br>2. Review completed payment records. |
| Expected Result | Payment history lists paid runs/transactions. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-128 — Reports — Summary

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Reports — Summary |
| Objective | Run payroll summary report |
| Navigation Path | Sidebar → People → Payroll → Reports → Summary |
| Prerequisites | Processed run exists |
| Test Data | Period: current month |
| Step-by-Step Instructions | 1. Open Reports → Summary tab.<br>2. Run/export report. |
| Expected Result | Summary report displays run totals. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-129 — Reports — Register

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Reports — Register |
| Objective | Run payroll register report |
| Navigation Path | Sidebar → People → Payroll → Reports → Register |
| Prerequisites | Processed run |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Register tab.<br>2. Export CSV if available. |
| Expected Result | Register lists all payslips for period. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-130 — Reports — Liability

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Reports — Liability |
| Objective | Run liability report |
| Navigation Path | Sidebar → People → Payroll → Reports → Liability |
| Prerequisites | Unpaid/paid mix |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Liability tab.<br>2. Review outstanding amounts. |
| Expected Result | Liability report balances correctly. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-131 — Reports — Journal

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Reports — Journal |
| Objective | Run payroll journal report |
| Navigation Path | Sidebar → People → Payroll → Reports → Journal |
| Prerequisites | Approved/paid run |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Journal tab.<br>2. Verify accrual and payment entries. |
| Expected Result | Journal mirrors GL postings. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-132 — Reports — LOP

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Reports — LOP |
| Objective | Run LOP report |
| Navigation Path | Sidebar → People → Payroll → Reports → LOP |
| Prerequisites | LOP data exists |
| Test Data | None |
| Step-by-Step Instructions | 1. Open LOP tab.<br>2. Review loss-of-pay details. |
| Expected Result | LOP report displays deductions. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-133 — Audit Log — View

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Audit Log — View |
| Objective | View payroll audit log |
| Navigation Path | Sidebar → People → Payroll → Audit Log |
| Prerequisites | API mode; payroll mutations done |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Audit Log tab.<br>2. Review columns: When, Event, Who, Entity, Summary. |
| Expected Result | Payroll audit events listed. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-134 — Audit Log — Run Approved

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Audit Log — Run Approved |
| Objective | Verify run approved event |
| Navigation Path | Sidebar → People → Payroll → Audit Log → filter |
| Prerequisites | Run approved in UAT-117 |
| Test Data | Event: Run Approved |
| Step-by-Step Instructions | 1. Filter Run Approved.<br>2. Locate approval event. |
| Expected Result | Shows approver name and timestamp. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-135 — Void — Unpaid payslip delete

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Void — Unpaid payslip delete |
| Objective | Delete vs void distinction |
| Navigation Path | Sidebar → People → Payroll → Payroll Processing |
| Prerequisites | Unpaid payslip on test run |
| Test Data | Unpaid payslip |
| Step-by-Step Instructions | 1. Delete unpaid payslip (not Void).<br>2. Confirm removed. |
| Expected Result | Unpaid payslip deleted (not voided). |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-136 — Void — Paid payslip void

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Void — Paid payslip void |
| Objective | Void fully paid payslip |
| Navigation Path | Sidebar → People → Payroll → Payroll Processing → Void |
| Prerequisites | Fully paid test payslip |
| Test Data | Reason: UAT test void |
| Step-by-Step Instructions | 1. Select fully paid payslip.<br>2. Click Void (not Delete).<br>3. Enter required reason.<br>4. Confirm void warning. |
| Expected Result | Payslip voided; toast warns to reverse payment in Accounting. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-137 — Reverse — Payment reversal

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Reverse — Payment reversal |
| Objective | Reverse payroll payment |
| Navigation Path | Sidebar → People → Payroll → Payroll Processing → Reverse Payment |
| Prerequisites | Paid transaction to reverse |
| Test Data | Transaction from void test |
| Step-by-Step Instructions | 1. Open Reverse Payroll Payment modal.<br>2. Confirm reversal. |
| Expected Result | Payment reversed; payslip state updated. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-138 — Unapprove — Revert approved run

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Unapprove — Revert approved run |
| Objective | Revert APPROVED run to GENERATED |
| Navigation Path | Sidebar → People → Payroll → Payroll Processing → Revert to generated |
| Prerequisites | Approved run with NO payments |
| Test Data | Test run without payments |
| Step-by-Step Instructions | 1. Click Revert to generated on approval panel.<br>2. Confirm. |
| Expected Result | Run returns to GENERATED status. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-139 — Unapprove blocked when paid

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Unapprove blocked when paid |
| Objective | Unapprove blocked if payslips paid |
| Navigation Path | Sidebar → People → Payroll → Payroll Processing |
| Prerequisites | Approved run WITH payments |
| Test Data | Run from UAT-119/120 |
| Step-by-Step Instructions | 1. Attempt Revert to generated.<br>2. Observe error. |
| Expected Result | Error: cannot unapprove when payslips have payments. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-140 — Past period wizard

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Past period wizard |
| Objective | Open past period payroll wizard |
| Navigation Path | Sidebar → People → Payroll → Payroll Processing → Payroll wizard (past period) |
| Prerequisites | Payroll admin |
| Test Data | Prior month/year |
| Step-by-Step Instructions | 1. Click Payroll wizard (past period).<br>2. Select prior month.<br>3. Open wizard. |
| Expected Result | Wizard opens at step 1 with selected period. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-141 — Dashboard — Awaiting approval banner

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Dashboard — Awaiting approval banner |
| Objective | Verify awaiting approval banner |
| Navigation Path | Sidebar → People → Payroll → Dashboard |
| Prerequisites | GENERATED unapproved run |
| Test Data | None |
| Step-by-Step Instructions | 1. Create unapproved run.<br>2. Check Dashboard Awaiting Approval panel. |
| Expected Result | Banner shows count needing approver. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-142 — Dashboard — Ready to pay

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Dashboard — Ready to pay |
| Objective | Verify ready to pay banner |
| Navigation Path | Sidebar → People → Payroll → Dashboard |
| Prerequisites | APPROVED run exists |
| Test Data | None |
| Step-by-Step Instructions | 1. After approval, check Ready to Pay panel. |
| Expected Result | Banner directs to Processing for disbursement. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-143 — RBAC — Attendance tab hidden

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | RBAC — Attendance tab hidden |
| Objective | Verify attendance tab permission |
| Navigation Path | Sidebar → People → Payroll |
| Prerequisites | User without attendance.read |
| Test Data | Restricted user |
| Step-by-Step Instructions | 1. Log in as user without attendance.read.<br>2. Verify Attendance tab hidden. |
| Expected Result | Attendance tab not shown without permission. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-144 — RBAC — Leave tab hidden

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | RBAC — Leave tab hidden |
| Objective | Verify leave tab permission |
| Navigation Path | Sidebar → People → Payroll |
| Prerequisites | User without leave.read |
| Test Data | Restricted user |
| Step-by-Step Instructions | 1. Log in without leave.read.<br>2. Verify Leave Management hidden. |
| Expected Result | Leave tab hidden per RBAC. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-145 — Void Payroll Run UI **[NOT IMPLEMENTED]**

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Void Payroll Run UI |
| Objective | Verify void entire run UI |
| Navigation Path | Sidebar → People → Payroll → Payroll Processing |
| Prerequisites | None |
| Test Data | None |
| Step-by-Step Instructions | 1. Search for Void Payroll Run action on run level. |
| Expected Result | NOT IMPLEMENTED — API exists; UI modal not wired in PayrollHub. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks | NOT IMPLEMENTED — feature not available in current product build. |

### UAT-146 — Approval Matrix config **[NOT IMPLEMENTED]**

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Approval Matrix config |
| Objective | Verify configurable approval matrix for payroll |
| Navigation Path | Settings → Security — Approval Matrix |
| Prerequisites | None |
| Test Data | None |
| Step-by-Step Instructions | 1. Check if payroll uses approval matrix vs hard-coded SoD. |
| Expected Result | NOT IMPLEMENTED — SoD hard-coded: creator ≠ approver. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks | NOT IMPLEMENTED — feature not available in current product build. |

### UAT-147 — Statutory tax / EOBI **[NOT IMPLEMENTED]**

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Statutory tax / EOBI |
| Objective | Verify statutory payroll compliance |
| Navigation Path | Sidebar → People → Payroll |
| Prerequisites | None |
| Test Data | None |
| Step-by-Step Instructions | 1. Search for tax/EOBI/PF statutory modules. |
| Expected Result | NOT IMPLEMENTED — no statutory compliance engine. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks | NOT IMPLEMENTED — feature not available in current product build. |

### UAT-148 — Employee self-service full hub

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Employee self-service full hub |
| Objective | Verify employee role limited access |
| Navigation Path | Sidebar → People → Payroll |
| Prerequisites | Employee-role user |
| Test Data | Employee user account |
| Step-by-Step Instructions | 1. Log in as employee role.<br>2. Verify limited to self profile only. |
| Expected Result | Employee sees profile only; not full admin hub (partial by design). |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-149 — Attendance informational note

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Attendance informational note |
| Objective | Confirm attendance feeds wizard |
| Navigation Path | Sidebar → People → Payroll → Attendance |
| Prerequisites | Attendance page loaded |
| Test Data | None |
| Step-by-Step Instructions | 1. Read attendance page guidance.<br>2. Cross-check wizard step 2 uses attendance summaries. |
| Expected Result | Attendance data flows to wizard despite informational label. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-150 — Chapter completion

| Field | Value |
|-------|-------|
| Module | Payroll |
| Feature | Chapter completion |
| Objective | Payroll chapter sign-off |
| Navigation Path | Payroll module review |
| Prerequisites | Ch.3 cases executed |
| Test Data | Chapter checklist |
| Step-by-Step Instructions | 1. Verify settings, employees, run approved, paid, reports, audit.<br>2. Complete checklist. |
| Expected Result | Payroll E2E path complete for regression baseline. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

## Chapter Completion Checklist

- [ ] Payroll settings configured
- [ ] 2+ employees with salary
- [ ] Attendance/leave recorded
- [ ] Wizard run GENERATED then APPROVED (SoD)
- [ ] Salaries paid
- [ ] Reports and audit verified

| Pass Count | Fail Count | Blocked/N/A | Observations |
|------------|------------|-------------|--------------|
| | | | |

---

# Chapter 4 — Project Selling

**Test Case Range:** UAT-151 – UAT-210

## Purpose
Sell a project unit end-to-end: marketing/installment plans, agreements, invoices, collections, receipts, customer ledger, and selling reports.

## Business Flow
```text
Marketing (Installment Plan) → Agreement → Invoice → Receive Payment → Collections → Owner Ledger Report
```

## Required Test Data
- Project: Sunrise Towers; Unit: ST-101
- Client: Ahmed Khan; Broker: Broker One
- Installment plan: 20% down, 24 monthly installments
- Bank: HBL Current Account

## Dependencies
- Chapter 2 — project, unit, client, broker, bank account
- real_estate license or project-selling permission

## Expected Outputs
- Approved installment plan converted to agreement
- Installment invoices generated
- Down payment received
- Client ledger shows balance

## Test Cases

### UAT-151 — Open module

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Open module |
| Objective | Navigate to Project selling |
| Navigation Path | Sidebar → Selling → Project selling |
| Prerequisites | real_estate license + permission |
| Test Data | None |
| Step-by-Step Instructions | 1. Sidebar → Selling → Project selling. |
| Expected Result | Project selling shell loads with sub-navigation. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-152 — Selling Analytics

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Selling Analytics |
| Objective | View selling analytics dashboard |
| Navigation Path | Sidebar → Selling → Project selling → Operations → Selling Analytics |
| Prerequisites | Selling access |
| Test Data | None |
| Step-by-Step Instructions | 1. Click Selling Analytics. |
| Expected Result | Analytics dashboard loads with KPIs/charts. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-153 — Marketing — Open

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Marketing — Open |
| Objective | Open installment plans (Marketing) |
| Navigation Path | Sidebar → Selling → Project selling → Operations → Marketing |
| Prerequisites | Unit ST-101 available |
| Test Data | None |
| Step-by-Step Instructions | 1. Click Marketing sub-tab.<br>2. Page title: Installment Plans (Marketing). |
| Expected Result | Marketing page loads with plan list. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-154 — Marketing — New Plan

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Marketing — New Plan |
| Objective | Create new installment plan |
| Navigation Path | Sidebar → Selling → Project selling → Marketing → New Plan |
| Prerequisites | Unit ST-101, client Ahmed Khan |
| Test Data | Client: Ahmed Khan<br>Unit: ST-101<br>Price: 5,000,000<br>Down: 20%<br>Installments: 24 |
| Step-by-Step Instructions | 1. Click New Plan.<br>2. Select client and unit.<br>3. Enter price and payment schedule.<br>4. Save as Draft. |
| Expected Result | Plan created in Draft status. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-155 — Marketing — Submit approval

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Marketing — Submit approval |
| Objective | Submit plan for approval |
| Navigation Path | Sidebar → Selling → Project selling → Marketing → plan → Submit |
| Prerequisites | Draft plan from UAT-154 |
| Test Data | None |
| Step-by-Step Instructions | 1. Open draft plan.<br>2. Submit for Pending Approval. |
| Expected Result | Status changes to Pending Approval. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-156 — Marketing — Approve plan

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Marketing — Approve plan |
| Objective | Approve installment plan |
| Navigation Path | Sidebar → Selling → Project selling → Marketing → Approve |
| Prerequisites | Workflow approver access |
| Test Data | Plan: Ahmed/ST-101 |
| Step-by-Step Instructions | 1. Approve pending plan.<br>2. Status becomes Approved. |
| Expected Result | Plan approved; ready for sale recognition. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-157 — Marketing — Sale recognized

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Marketing — Sale recognized |
| Objective | Recognize sale from plan |
| Navigation Path | Sidebar → Selling → Project selling → Marketing → Recognize Sale |
| Prerequisites | Approved plan |
| Test Data | None |
| Step-by-Step Instructions | 1. Execute Sale Recognized action on approved plan. |
| Expected Result | Sale recognized; unit status updated. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-158 — Marketing — Configuration

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Marketing — Configuration |
| Objective | Open marketing configuration |
| Navigation Path | Sidebar → Selling → Project selling → Marketing → Configuration |
| Prerequisites | Marketing access |
| Test Data | None |
| Step-by-Step Instructions | 1. Click Configuration button.<br>2. Review default plan settings. |
| Expected Result | Configuration modal/page opens. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-159 — Agreements — Open

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Agreements — Open |
| Objective | Navigate to Agreements |
| Navigation Path | Sidebar → Selling → Project selling → Operations → Agreements |
| Prerequisites | Plan or agreement data |
| Test Data | None |
| Step-by-Step Instructions | 1. Click Agreements sub-tab. |
| Expected Result | Agreements tree by Owner/Unit loads. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-160 — Agreements — New

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Agreements — New |
| Objective | Create project agreement manually |
| Navigation Path | Sidebar → Selling → Project selling → Agreements → New Project Agreement |
| Prerequisites | Unit ST-102, client Sara Malik |
| Test Data | Client: Sara Malik<br>Unit: ST-102<br>Installment plan section filled |
| Step-by-Step Instructions | 1. Click New Project Agreement.<br>2. Enter agreement details and installment plan.<br>3. Save. |
| Expected Result | Agreement created and listed. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-161 — Agreements — Convert from plan

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Agreements — Convert from plan |
| Objective | Verify agreement from marketing plan |
| Navigation Path | Sidebar → Selling → Project selling → Agreements |
| Prerequisites | Sale recognized plan UAT-157 |
| Test Data | Agreement: Ahmed Khan / ST-101 |
| Step-by-Step Instructions | 1. Locate agreement linked to marketing plan.<br>2. Open agreement detail. |
| Expected Result | Agreement reflects plan terms. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-162 — Agreements — Edit

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Agreements — Edit |
| Objective | Edit agreement terms |
| Navigation Path | Sidebar → Selling → Project selling → Agreements → Edit Agreement |
| Prerequisites | Draft or editable agreement |
| Test Data | Adjust installment date |
| Step-by-Step Instructions | 1. Edit agreement.<br>2. Modify installment schedule.<br>3. Save. |
| Expected Result | Agreement updated. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-163 — Invoices — Open

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Invoices — Open |
| Objective | Navigate to project invoices |
| Navigation Path | Sidebar → Selling → Project selling → Operations → Invoices |
| Prerequisites | Active agreement |
| Test Data | None |
| Step-by-Step Instructions | 1. Click Invoices sub-tab. |
| Expected Result | Installment invoices list loads (InvoiceType.INSTALLMENT filter). |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-164 — Invoices — Generate

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Invoices — Generate |
| Objective | Generate invoices from agreement |
| Navigation Path | Sidebar → Selling → Project selling → Invoices → Generate |
| Prerequisites | Agreement with schedule |
| Test Data | Agreement: Ahmed/ST-101 |
| Step-by-Step Instructions | 1. Generate invoices from agreement if not auto-generated.<br>2. Verify invoice list populated. |
| Expected Result | Installment invoices created per schedule. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-165 — Invoices — Receive Payment

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Invoices — Receive Payment |
| Objective | Receive down payment (receipt) |
| Navigation Path | Sidebar → Selling → Project selling → Invoices → Receive Payment |
| Prerequisites | Unpaid down payment invoice |
| Test Data | Amount: down payment<br>Account: HBL Current Account |
| Step-by-Step Instructions | 1. Select down payment invoice.<br>2. Click Receive Payment.<br>3. Enter amount and bank account.<br>4. Confirm. |
| Expected Result | Payment recorded; invoice balance reduced; receipt generated. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-166 — Invoices — Partial payment

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Invoices — Partial payment |
| Objective | Receive partial installment payment |
| Navigation Path | Sidebar → Selling → Project selling → Invoices → Receive Payment |
| Prerequisites | Unpaid installment invoice |
| Test Data | Partial amount: 50% of installment |
| Step-by-Step Instructions | 1. Receive partial payment on installment.<br>2. Save. |
| Expected Result | Invoice shows partial paid balance. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-167 — Invoices — Bulk payment

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Invoices — Bulk payment |
| Objective | Bulk receive payments if available |
| Navigation Path | Sidebar → Selling → Project selling → Invoices → Bulk Payment |
| Prerequisites | Multiple unpaid invoices |
| Test Data | Select 2 invoices |
| Step-by-Step Instructions | 1. Select multiple invoices.<br>2. Bulk payment modal.<br>3. Confirm. |
| Expected Result | Multiple invoices updated. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-168 — Collections Analytics

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Collections Analytics |
| Objective | View collections dashboard |
| Navigation Path | Sidebar → Selling → Project selling → Operations → Collections |
| Prerequisites | Payments recorded |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Collections Analytics. |
| Expected Result | Collections KPIs reflect received payments. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-169 — Assets — Received assets

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Assets — Received assets |
| Objective | Record received asset from client |
| Navigation Path | Sidebar → Selling → Project selling → Operations → Assets |
| Prerequisites | Agreement exists |
| Test Data | Asset type per form |
| Step-by-Step Instructions | 1. Open Assets sub-tab.<br>2. Record client-received asset if applicable.<br>3. Save. |
| Expected Result | Asset recorded against selling context. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-170 — Sales Returns

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Sales Returns |
| Objective | Process sales return |
| Navigation Path | Sidebar → Selling → Project selling → Operations → Returns |
| Prerequisites | Completed sale scenario |
| Test Data | Return: test case unit |
| Step-by-Step Instructions | 1. Open Sales Returns.<br>2. Initiate return workflow if applicable.<br>3. Document result. |
| Expected Result | Return workflow executes or N/A if no eligible sale. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-171 — Broker Payouts

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Broker Payouts |
| Objective | View broker payout screen |
| Navigation Path | Sidebar → Selling → Project selling → Payouts → Brokers |
| Prerequisites | Broker on agreement |
| Test Data | Broker: Broker One |
| Step-by-Step Instructions | 1. Open Brokers payout tab.<br>2. Review commission entries. |
| Expected Result | Broker payout list loads. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-172 — Visual Layout

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Visual Layout |
| Objective | View project visual layout |
| Navigation Path | Sidebar → Selling → Project selling → Project views → Visual |
| Prerequisites | Units with floor data |
| Test Data | Project: Sunrise Towers |
| Step-by-Step Instructions | 1. Open Visual Layout report.<br>2. Review floor-grouped units. |
| Expected Result | Visual layout displays units by floor (no Blocks entity). |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-173 — Tabular View — Units

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Tabular View — Units |
| Objective | View units tabular report |
| Navigation Path | Sidebar → Selling → Project selling → Project views → Units |
| Prerequisites | Units exist |
| Test Data | Project: Sunrise Towers |
| Step-by-Step Instructions | 1. Open Tabular View (Units).<br>2. Review unit status columns. |
| Expected Result | Unit grid shows availability and agreement links. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-174 — Report — Financial Position

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Report — Financial Position |
| Objective | Run Project Financial Position |
| Navigation Path | Sidebar → Selling → Project selling → Reports → Financial → Project Financial Position |
| Prerequisites | Project transactions exist |
| Test Data | Project: Sunrise Towers |
| Step-by-Step Instructions | 1. Open report.<br>2. Select project.<br>3. Run. |
| Expected Result | Financial position report generates. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-175 — Report — Profitability

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Report — Profitability |
| Objective | Run Project Profitability |
| Navigation Path | Sidebar → Selling → Project selling → Reports → Financial → Project Profitability |
| Prerequisites | Selling data exists |
| Test Data | Project: Sunrise Towers |
| Step-by-Step Instructions | 1. Open Project Profitability.<br>2. Run for Sunrise Towers. |
| Expected Result | Profitability analytics display. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-176 — Report — Cash Flow

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Report — Cash Flow |
| Objective | Run Project Cash Flow |
| Navigation Path | Sidebar → Selling → Project selling → Reports → Financial → Project Cash Flow |
| Prerequisites | Payments exist |
| Test Data | Project: Sunrise Towers |
| Step-by-Step Instructions | 1. Open Project Cash Flow report.<br>2. Run. |
| Expected Result | Cash flow report displays inflows/outflows. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-177 — Report — Project Summary

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Report — Project Summary |
| Objective | Run Project Summary |
| Navigation Path | Sidebar → Selling → Project selling → Reports → Operations → Project Summary |
| Prerequisites | Project data |
| Test Data | Project: Sunrise Towers |
| Step-by-Step Instructions | 1. Open Project Summary.<br>2. Run. |
| Expected Result | Summary report lists project metrics. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-178 — Report — Marketing Activity

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Report — Marketing Activity |
| Objective | Run Marketing Activity report |
| Navigation Path | Sidebar → Selling → Project selling → Reports → Operations → Marketing Activity |
| Prerequisites | Marketing plans exist |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Marketing Activity report.<br>2. Run. |
| Expected Result | Report shows plan funnel/activity. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-179 — Report — Revenue Analysis

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Report — Revenue Analysis |
| Objective | Run Revenue Analysis |
| Navigation Path | Sidebar → Selling → Project selling → Reports → Operations → Revenue Analysis |
| Prerequisites | Invoices/payments exist |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Revenue Analysis.<br>2. Run. |
| Expected Result | Revenue breakdown displayed. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-180 — Report — Owner Ledger

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Report — Owner Ledger |
| Objective | Run Owner Ledger (customer ledger) |
| Navigation Path | Sidebar → Selling → Project selling → Reports → Operations → Owner Ledger |
| Prerequisites | Client Ahmed Khan with invoices |
| Test Data | Client: Ahmed Khan |
| Step-by-Step Instructions | 1. Open Owner Ledger report.<br>2. Select Ahmed Khan.<br>3. Run. |
| Expected Result | Client ledger shows invoices, payments, balance. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-181 — Report — Broker Report

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Report — Broker Report |
| Objective | Run Broker Report |
| Navigation Path | Sidebar → Selling → Project selling → Reports → Operations → Broker Report |
| Prerequisites | Broker commissions exist |
| Test Data | Broker: Broker One |
| Step-by-Step Instructions | 1. Open Broker Report.<br>2. Run. |
| Expected Result | Broker commissions summarized. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-182 — Report — Income by Category

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Report — Income by Category |
| Objective | Run income by category |
| Navigation Path | Sidebar → Selling → Project selling → Reports → Operations → Income by Category |
| Prerequisites | Income transactions |
| Test Data | Project: Sunrise Towers |
| Step-by-Step Instructions | 1. Open Income by Category.<br>2. Run. |
| Expected Result | Income grouped by COA category. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-183 — Report — Expense by Category

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Report — Expense by Category |
| Objective | Run expense by category |
| Navigation Path | Sidebar → Selling → Project selling → Reports → Operations → Expense by Category |
| Prerequisites | Project expenses if any |
| Test Data | Project: Sunrise Towers |
| Step-by-Step Instructions | 1. Open Expense by Category.<br>2. Run. |
| Expected Result | Expenses grouped by category. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-184 — Cross-ref Investment Management

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Cross-ref Investment Management |
| Objective | Confirm investor workflows are in Chapter 8 |
| Navigation Path | Chapter 8 — Sidebar → Selling → Inv Mgmt |
| Prerequisites | Admin user |
| Test Data | None |
| Step-by-Step Instructions | 1. Verify investor/equity workflows are NOT under Project selling sub-nav.<br>2. Investor features are tested in Chapter 8 — Investment Management. |
| Expected Result | Project selling and Inv Mgmt are separate sidebar modules. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-185 — General Ledger cross-check

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | General Ledger cross-check |
| Objective | Verify selling payment in GL |
| Navigation Path | Sidebar → Financials → General Ledger |
| Prerequisites | Payment from UAT-165 |
| Test Data | Client payment transaction |
| Step-by-Step Instructions | 1. Open General Ledger.<br>2. Search payment transaction.<br>3. Verify bank debit and AR credit. |
| Expected Result | GL reflects invoice payment. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-186 — WhatsApp receipt template

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | WhatsApp receipt template |
| Objective | Verify communication template for receipt |
| Navigation Path | Settings → Preferences → Communication |
| Prerequisites | WhatsApp configured optional |
| Test Data | Template: Invoice Payment Receipt |
| Step-by-Step Instructions | 1. Open Communication templates.<br>2. Locate Invoice Payment Receipt template. |
| Expected Result | Receipt template exists for customer communication. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-187 — Marketing — Reject plan

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Marketing — Reject plan |
| Objective | Reject installment plan in workflow |
| Navigation Path | Sidebar → Selling → Project selling → Marketing → Reject |
| Prerequisites | Pending Approval plan |
| Test Data | Plan: draft for rejection test |
| Step-by-Step Instructions | 1. Submit a plan for approval.<br>2. As approver, reject with reason. |
| Expected Result | Plan status shows Rejected; not available for sale recognition. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-188 — Invoices — Full payment

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Invoices — Full payment |
| Objective | Receive full installment payment |
| Navigation Path | Sidebar → Selling → Project selling → Invoices → Receive Payment |
| Prerequisites | Partially paid installment from UAT-166 |
| Test Data | Remaining balance amount |
| Step-by-Step Instructions | 1. Open partially paid installment.<br>2. Receive remaining balance.<br>3. Confirm. |
| Expected Result | Invoice marked fully paid; balance zero. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-189 — Unit status after sale

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Unit status after sale |
| Objective | Verify unit status after agreement |
| Navigation Path | Sidebar → Selling → Project selling → Project views → Units |
| Prerequisites | Agreement on ST-101 |
| Test Data | Unit: ST-101 |
| Step-by-Step Instructions | 1. Check ST-101 status in Units view. |
| Expected Result | Unit shows sold/booked status per agreement. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-190 — Agreement workflow submit

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Agreement workflow submit |
| Objective | Submit agreement for workflow approval |
| Navigation Path | Sidebar → Selling → Project selling → Agreements → Submit |
| Prerequisites | Workflow enabled in Settings |
| Test Data | Agreement: Sara/ST-102 |
| Step-by-Step Instructions | 1. Submit agreement for approval if workflow required. |
| Expected Result | Workflow status updates per Settings → Preferences → Workflow. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-191 — Blocks entity **[NOT IMPLEMENTED]**

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Blocks entity |
| Objective | Verify Blocks not in selling UI |
| Navigation Path | Sidebar → Selling → Project selling |
| Prerequisites | None |
| Test Data | None |
| Step-by-Step Instructions | 1. Search Project selling for Blocks menu. |
| Expected Result | NOT IMPLEMENTED — use Unit Floor field and Visual Layout. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks | NOT IMPLEMENTED — feature not available in current product build. |

### UAT-192 — Dedicated Customers menu

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Dedicated Customers menu |
| Objective | Verify no standalone Customers menu |
| Navigation Path | Sidebar and Settings |
| Prerequisites | None |
| Test Data | None |
| Step-by-Step Instructions | 1. Search for Customers top-level menu. |
| Expected Result | NOT IMPLEMENTED — clients are Settings → Contacts and Marketing Client field. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-193 — Dedicated Receipts module

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Dedicated Receipts module |
| Objective | Verify receipts via invoice payments |
| Navigation Path | Sidebar → Selling → Project selling → Invoices |
| Prerequisites | Payment UAT-165 |
| Test Data | None |
| Step-by-Step Instructions | 1. Confirm receipts are payment records on Invoices, not separate module. |
| Expected Result | Receipts embedded in Receive Payment flow. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-194 — Dedicated Payment Plans menu

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Dedicated Payment Plans menu |
| Objective | Verify payment plans = installment plans |
| Navigation Path | Sidebar → Selling → Project selling → Marketing |
| Prerequisites | None |
| Test Data | None |
| Step-by-Step Instructions | 1. Confirm no separate Payment Plans menu; Marketing holds installment plans. |
| Expected Result | Installment plans and payment plans are same Marketing feature. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-195 — Custom Reports hidden nav

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Custom Reports hidden nav |
| Objective | Verify custom reports routable but hidden |
| Navigation Path | Global search → Custom Reports selling |
| Prerequisites | None |
| Test Data | None |
| Step-by-Step Instructions | 1. Search Custom Reports for project selling.<br>2. Confirm not in sub-nav but accessible. |
| Expected Result | Custom Reports hidden from sub-nav per NAV_HIDDEN_REPORTS. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-196 — Global search — Project Invoices

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Global search — Project Invoices |
| Objective | Navigate via global search |
| Navigation Path | Global search → Project Invoices |
| Prerequisites | None |
| Test Data | None |
| Step-by-Step Instructions | 1. Search Project Invoices.<br>2. Open result. |
| Expected Result | Navigates to Project selling → Invoices view. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-197 — KPI panel shortcut

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | KPI panel shortcut |
| Objective | Open Project Invoices from KPI panel |
| Navigation Path | Dashboard → KPI panel → Project Inv. |
| Prerequisites | None |
| Test Data | None |
| Step-by-Step Instructions | 1. Open KPI panel chart icon.<br>2. Click Project Inv. shortcut. |
| Expected Result | Navigates to project invoices. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-198 — Lead to client conversion

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Lead to client conversion |
| Objective | Use lead in marketing plan |
| Navigation Path | Sidebar → Selling → Project selling → Marketing → New Plan |
| Prerequisites | Lead Sara Malik from Ch.2 |
| Test Data | Client: Select Lead Sara Malik |
| Step-by-Step Instructions | 1. Create plan using lead as client.<br>2. Convert through approval flow. |
| Expected Result | Lead usable in marketing; may convert to owner on sale. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-199 — Audit — agreement created

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Audit — agreement created |
| Objective | Verify agreement in audit trail |
| Navigation Path | Settings → Audit Trail |
| Prerequisites | Agreement created |
| Test Data | Entity: agreement |
| Step-by-Step Instructions | 1. Filter audit for agreement creation. |
| Expected Result | Audit event recorded for agreement. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-200 — Audit — payment received

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Audit — payment received |
| Objective | Verify payment in audit trail |
| Navigation Path | Settings → Audit Trail |
| Prerequisites | Payment UAT-165 |
| Test Data | Invoice payment |
| Step-by-Step Instructions | 1. Filter audit for invoice payment event. |
| Expected Result | Payment mutation audited. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-201 — Real-time sync

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Real-time sync |
| Objective | Verify second session sees payment |
| Navigation Path | Sidebar → Selling → Project selling → Invoices (second browser) |
| Prerequisites | Multi-user tenant |
| Test Data | Second user session |
| Step-by-Step Instructions | 1. User A receives payment.<br>2. User B refreshes Invoices view (or wait for socket sync). |
| Expected Result | Invoice balance updates without manual F5 (real-time sync). |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-202 — Mobile sub-nav

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Mobile sub-nav |
| Objective | Verify selling sub-nav on mobile |
| Navigation Path | Sidebar → Selling → Project selling |
| Prerequisites | Viewport <768px |
| Test Data | None |
| Step-by-Step Instructions | 1. Resize to mobile width.<br>2. Use Operations dropdown for Marketing/Agreements/Invoices. |
| Expected Result | Mobile dropdown groups functional. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-203 — Agreement — Installment plan section

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Agreement — Installment plan section |
| Objective | Verify installment plan on agreement form |
| Navigation Path | Sidebar → Selling → Project selling → Agreements → New |
| Prerequisites | None |
| Test Data | Schedule: 24 months |
| Step-by-Step Instructions | 1. On agreement form locate Installment Plan section.<br>2. Enter schedule. |
| Expected Result | Installment Plan section present on agreement form. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-204 — Invoice print

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Invoice print |
| Objective | Print invoice document |
| Navigation Path | Sidebar → Selling → Project selling → Invoices → Print |
| Prerequisites | Generated invoice |
| Test Data | Invoice: down payment |
| Step-by-Step Instructions | 1. Select invoice.<br>2. Print/Export. |
| Expected Result | Print preview or PDF generates. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-205 — Collections — overdue view

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Collections — overdue view |
| Objective | Review overdue collections if shown |
| Navigation Path | Sidebar → Selling → Project selling → Collections |
| Prerequisites | Past-due invoice optional |
| Test Data | None |
| Step-by-Step Instructions | 1. Review overdue/overdue KPIs in Collections Analytics. |
| Expected Result | Overdue metrics display when applicable. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-206 — Report export

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Report export |
| Objective | Export Owner Ledger |
| Navigation Path | Sidebar → Selling → Project selling → Reports → Owner Ledger → Export |
| Prerequisites | Ledger data exists |
| Test Data | Client: Ahmed Khan |
| Step-by-Step Instructions | 1. Run Owner Ledger.<br>2. Export CSV/Excel if available. |
| Expected Result | Export file downloads. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-207 — Broker payout — Record

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Broker payout — Record |
| Objective | Record broker commission payout |
| Navigation Path | Sidebar → Selling → Project selling → Payouts → Brokers |
| Prerequisites | Broker on agreement |
| Test Data | Broker: Broker One<br>Commission amount |
| Step-by-Step Instructions | 1. Open Brokers payout tab.<br>2. Record or pay broker commission if action available. |
| Expected Result | Broker payout recorded or listed. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-208 — Sales user restriction

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Sales user restriction |
| Objective | Verify sales_user sidebar limits |
| Navigation Path | Login as sales_user |
| Prerequisites | sales_user role |
| Test Data | None |
| Step-by-Step Instructions | 1. Log in as sales_user.<br>2. Verify Financials/Construction/People hidden. |
| Expected Result | Sales user sees limited sidebar per RBAC. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-209 — License gate

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | License gate |
| Objective | Verify real_estate license gate |
| Navigation Path | Sidebar Selling section |
| Prerequisites | Tenant without real_estate license |
| Test Data | None |
| Step-by-Step Instructions | 1. Test on tenant without license OR verify licensed tenant shows Project selling. |
| Expected Result | Project selling hidden without real_estate license. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-210 — Chapter completion

| Field | Value |
|-------|-------|
| Module | Project Selling |
| Feature | Chapter completion |
| Objective | Project selling sign-off |
| Navigation Path | Selling module review |
| Prerequisites | Ch.4 executed |
| Test Data | Chapter checklist |
| Step-by-Step Instructions | 1. Verify plan → agreement → invoice → payment → ledger report.<br>2. Complete checklist. |
| Expected Result | Project selling E2E complete. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

## Chapter Completion Checklist

- [ ] Marketing plan created and approved
- [ ] Agreement active
- [ ] Invoices generated
- [ ] Payment received (receipt)
- [ ] Owner Ledger report verified

| Pass Count | Fail Count | Blocked/N/A | Observations |
|------------|------------|-------------|--------------|
| | | | |

---

# Chapter 5 — Project Construction

**Test Case Range:** UAT-211 – UAT-280

## Purpose
Manage construction lifecycle: contracts, contractor bills, petty cash, PM fee log, material reporting, and construction reports. Procurement is covered in Chapter 7.

## Business Flow
```text
Contracts → Contractor Bills → Petty Cash → PM Fee Log → Material Report → Budget vs Actual (cross-ref Ch.10)
```

## Required Test Data
- Project: Sunrise Towers
- Vendor: ABC Supplies Ltd
- Contract: Civil Works — 2,000,000 with retention

## Dependencies
- Chapter 2 — project, vendor, COA expense categories
- Chapter 7 — procurement PO/GRN for material bills optional
- Budget from Ch.10 may cross-reference

## Expected Outputs
- Contract created and bills posted
- Contractor bill paid from construction Bills view
- Budget vs Actual reflects spend (cross-ref Ch.10)

## Test Cases

### UAT-211 — Open module

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Open module |
| Objective | Navigate to Project construction |
| Navigation Path | Sidebar → Construction → Project construction |
| Prerequisites | real_estate + financial write |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Project construction. |
| Expected Result | Construction shell loads; default view Contracts. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-212 — Expense Analytics

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Expense Analytics |
| Objective | View expense analytics |
| Navigation Path | Project construction → Operations → Expense Analytics |
| Prerequisites | Construction access |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Expense Analytics. |
| Expected Result | Expense dashboard loads. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-213 — Contracts — New

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Contracts — New |
| Objective | Create project contract |
| Navigation Path | Project construction → Operations → Contracts → New |
| Prerequisites | Project Sunrise Towers, vendor |
| Test Data | Vendor: ABC Supplies Ltd<br>Project: Sunrise Towers<br>Title: Civil Works<br>Amount: 2,000,000<br>Retention: 10% |
| Step-by-Step Instructions | 1. Click Contracts.<br>2. New contract.<br>3. Enter header and line items (category, qty, price).<br>4. Save. |
| Expected Result | Contract created in draft/active state. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-214 — Contracts — Line items

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Contracts — Line items |
| Objective | Add contract line items with quantity |
| Navigation Path | Contracts → contract → line items |
| Prerequisites | Contract from UAT-213 |
| Test Data | Item: Cement supply<br>Qty: 100<br>Rate: 500 |
| Step-by-Step Instructions | 1. Add line item with quantity and expense category.<br>2. Save. |
| Expected Result | Line items saved (BOQ-like structure on contract, not standalone BOQ module). |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-215 — Contracts — Retention

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Contracts — Retention |
| Objective | Configure contract retention |
| Navigation Path | Contracts → contract → retention |
| Prerequisites | Contract UAT-213 |
| Test Data | Retention: 10% |
| Step-by-Step Instructions | 1. Set retention percentage on contract.<br>2. Save. |
| Expected Result | Retention settings saved for retention register. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-216 — Contracts — Workflow submit

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Contracts — Workflow submit |
| Objective | Submit contract for approval |
| Navigation Path | Contracts → Submit |
| Prerequisites | Workflow enabled |
| Test Data | Contract: Civil Works |
| Step-by-Step Instructions | 1. Submit contract for workflow approval. |
| Expected Result | Workflow status updates. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-217 — Bills — New contractor bill

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Bills — New contractor bill |
| Objective | Create bill against contract |
| Navigation Path | Project construction → Operations → Bills → Add |
| Prerequisites | Contract UAT-213 |
| Test Data | Bill amount: 500,000<br>Linked to contract |
| Step-by-Step Instructions | 1. Open Bills (project context).<br>2. Add bill linked to contract.<br>3. Enter line items.<br>4. Save/post. |
| Expected Result | Contractor bill created. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-218 — Bills — Pay bill

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Bills — Pay bill |
| Objective | Pay contractor bill |
| Navigation Path | Bills → Pay → VendorBillPaymentModal |
| Prerequisites | Posted bill UAT-217 |
| Test Data | Account: HBL Current Account<br>Amount: 500,000 |
| Step-by-Step Instructions | 1. Select bill.<br>2. Click Pay.<br>3. Select bank account.<br>4. Confirm payment. |
| Expected Result | Bill marked paid; GL posted; vendor ledger updated. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-219 — Bills — Retention hold

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Bills — Retention hold |
| Objective | Verify retention on bill payment |
| Navigation Path | Bills → bill detail |
| Prerequisites | Contract with 10% retention |
| Test Data | None |
| Step-by-Step Instructions | 1. Review retention held amount on bill. |
| Expected Result | Retention amount calculated per contract settings. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-220 — Petty Cash — New voucher

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Petty Cash — New voucher |
| Objective | Create expense voucher |
| Navigation Path | Project construction → Operations → Petty Cash |
| Prerequisites | Project and categories exist |
| Test Data | Project: Sunrise Towers<br>Amount: 5,000<br>Category: Construction Material Cost |
| Step-by-Step Instructions | 1. Open Petty Cash (Expense Vouchers).<br>2. New voucher.<br>3. Save. |
| Expected Result | Petty cash voucher recorded. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-221 — PM Fee Log

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | PM Fee Log |
| Objective | View PM payout log |
| Navigation Path | Project construction → Payouts → PM Fee Log |
| Prerequisites | PM config may exist |
| Test Data | None |
| Step-by-Step Instructions | 1. Open PM Fee Log.<br>2. Review PM fee entries (full PM cycle in Chapter 9). |
| Expected Result | PM payout log displays. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-222 — Cross-ref Procurement

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Cross-ref Procurement |
| Objective | Confirm procurement is Chapter 7 |
| Navigation Path | Sidebar → Construction → Procurement |
| Prerequisites | None |
| Test Data | None |
| Step-by-Step Instructions | 1. Verify PO/GRN/vendor bill procurement flow is tested in Chapter 7 — Procurement Management.<br>2. Project construction Bills handles project-scoped contractor bills separately. |
| Expected Result | Procurement lifecycle is Chapter 7; construction Bills is project contract billing. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-223 — Contracts — View tree

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Contracts — View tree |
| Objective | Browse contracts tree/list |
| Navigation Path | Project construction → Operations → Contracts |
| Prerequisites | Contract UAT-213 |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Contracts view.<br>2. Browse contract list/tree by vendor/project. |
| Expected Result | Contracts listed with status and amounts. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-224 — Contracts — Status filter

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Contracts — Status filter |
| Objective | Filter contracts by status |
| Navigation Path | Contracts → filter |
| Prerequisites | Multiple contracts |
| Test Data | Status: Active |
| Step-by-Step Instructions | 1. Apply status filter on contracts list. |
| Expected Result | Filtered contracts displayed. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-225 — Bills — Edit bill

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Bills — Edit bill |
| Objective | Edit draft contractor bill |
| Navigation Path | Project construction → Bills → Edit |
| Prerequisites | Unposted bill |
| Test Data | Adjust line amount |
| Step-by-Step Instructions | 1. Edit bill line item amount.<br>2. Save. |
| Expected Result | Bill updated; totals recalculated. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-226 — Bills — Delete draft

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Bills — Delete draft |
| Objective | Delete unpaid draft bill |
| Navigation Path | Project construction → Bills → Delete |
| Prerequisites | Draft bill without payments |
| Test Data | Test draft bill |
| Step-by-Step Instructions | 1. Delete draft bill.<br>2. Confirm. |
| Expected Result | Draft bill removed from list. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-227 — Bills — Unlinked to contract

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Bills — Unlinked to contract |
| Objective | Create bill without contract link |
| Navigation Path | Project construction → Bills → Add |
| Prerequisites | Vendor and project |
| Test Data | No contract link |
| Step-by-Step Instructions | 1. Create standalone project bill without contract.<br>2. Save. |
| Expected Result | Bill created without contract reference if allowed. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-228 — Petty Cash — Edit voucher

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Petty Cash — Edit voucher |
| Objective | Edit expense voucher |
| Navigation Path | Project construction → Petty Cash → Edit |
| Prerequisites | Voucher UAT-220 |
| Test Data | Amount: 5,500 |
| Step-by-Step Instructions | 1. Edit petty cash voucher amount.<br>2. Save. |
| Expected Result | Voucher updated. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-229 — Petty Cash — Delete voucher

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Petty Cash — Delete voucher |
| Objective | Delete expense voucher |
| Navigation Path | Project construction → Petty Cash → Delete |
| Prerequisites | Deletable test voucher |
| Test Data | Create temp voucher then delete |
| Step-by-Step Instructions | 1. Delete test voucher.<br>2. Confirm. |
| Expected Result | Voucher removed. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-230 — Expense Analytics — Project filter

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Expense Analytics — Project filter |
| Objective | Filter expense analytics by project |
| Navigation Path | Project construction → Expense Analytics |
| Prerequisites | Multi-project expenses |
| Test Data | Project: Sunrise Towers |
| Step-by-Step Instructions | 1. Filter analytics to Sunrise Towers. |
| Expected Result | Analytics scoped to selected project. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-231 — Expense Analytics — Export

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Expense Analytics — Export |
| Objective | Export expense analytics if available |
| Navigation Path | Expense Analytics → Export |
| Prerequisites | Expense data |
| Test Data | None |
| Step-by-Step Instructions | 1. Export analytics report if available. |
| Expected Result | Export downloads or N/A if not available. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-232 — Contract — Multi-vendor

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Contract — Multi-vendor |
| Objective | Create second contract different vendor |
| Navigation Path | Contracts → New |
| Prerequisites | Second vendor XYZ Traders |
| Test Data | Vendor: XYZ Traders<br>Project: Sunrise Towers |
| Step-by-Step Instructions | 1. Create second contract with different vendor.<br>2. Save. |
| Expected Result | Multiple contracts listed per project. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-233 — Bills — Sort and search

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Bills — Sort and search |
| Objective | Search/filter construction bills |
| Navigation Path | Project construction → Bills |
| Prerequisites | Multiple bills |
| Test Data | Search: Civil |
| Step-by-Step Instructions | 1. Use search/filter on bills table. |
| Expected Result | Bills filtered by search term. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-234 — Contract — Approved status

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Contract — Approved status |
| Objective | Verify approved contract status |
| Navigation Path | Contracts → contract detail |
| Prerequisites | Workflow-approved contract UAT-216 |
| Test Data | None |
| Step-by-Step Instructions | 1. Open approved contract.<br>2. Verify status badge/field. |
| Expected Result | Approved status displayed correctly. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-235 — GL — retention entry

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | GL — retention entry |
| Objective | Verify retention in GL or bill detail |
| Navigation Path | Bills → bill with retention OR GL |
| Prerequisites | Contract 10% retention UAT-215 |
| Test Data | None |
| Step-by-Step Instructions | 1. Review retention held amount on bill payment.<br>2. Cross-check Retention Register report. |
| Expected Result | Retention amount tracked per contract settings. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-236 — Report — Budget vs Actual

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Report — Budget vs Actual |
| Objective | Run Budget vs Actual report |
| Navigation Path | Project construction → Reports → Operations → Budget vs Actual |
| Prerequisites | Budget set in Ch.10 |
| Test Data | Project: Sunrise Towers |
| Step-by-Step Instructions | 1. Open Budget vs Actual.<br>2. Select project.<br>3. Run. |
| Expected Result | Report shows budgeted vs spent by category. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-237 — Report — Contract Report

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Report — Contract Report |
| Objective | Run Contract Report |
| Navigation Path | Reports → Operations → Contract Report |
| Prerequisites | Contract UAT-213 |
| Test Data | None |
| Step-by-Step Instructions | 1. Run Contract Report. |
| Expected Result | Contract values and status summarized. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-238 — Report — Retention Register

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Report — Retention Register |
| Objective | Run Retention Register |
| Navigation Path | Reports → Operations → Retention Register |
| Prerequisites | Retention bills exist |
| Test Data | None |
| Step-by-Step Instructions | 1. Run Retention Register. |
| Expected Result | Retention held/released amounts listed. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-239 — Report — PM Cost Report

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Report — PM Cost Report |
| Objective | Run PM Cost Report |
| Navigation Path | Reports → Operations → PM Cost Report |
| Prerequisites | PM fees may exist |
| Test Data | None |
| Step-by-Step Instructions | 1. Run PM Cost Report. |
| Expected Result | PM costs summarized. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-240 — Report — Material Report

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Report — Material Report |
| Objective | Run Material Report |
| Navigation Path | Reports → Operations → Material Report |
| Prerequisites | Bills with material line items |
| Test Data | None |
| Step-by-Step Instructions | 1. Run Material Report. |
| Expected Result | Material quantities/amounts from bill lines (proxy for inventory consumption). |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-241 — Report — Vendor Ledger

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Report — Vendor Ledger |
| Objective | Run Vendor Ledger report |
| Navigation Path | Reports → Operations → Vendor Ledger |
| Prerequisites | Vendor transactions |
| Test Data | Vendor: ABC Supplies |
| Step-by-Step Instructions | 1. Run Vendor Ledger (Project context). |
| Expected Result | Vendor ledger report generates. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-242 — Report — Petty cash report

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Report — Petty cash report |
| Objective | Run Petty cash report |
| Navigation Path | Reports → Operations → Petty cash report |
| Prerequisites | Voucher UAT-220 |
| Test Data | None |
| Step-by-Step Instructions | 1. Run Petty cash report. |
| Expected Result | Petty cash vouchers listed. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-243 — Report — Project Summary

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Report — Project Summary |
| Objective | Run construction Project Summary |
| Navigation Path | Reports → Operations → Project Summary |
| Prerequisites | Construction data |
| Test Data | Project: Sunrise Towers |
| Step-by-Step Instructions | 1. Run Project Summary. |
| Expected Result | Project construction summary displays. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-244 — Report — Financial Position

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Report — Financial Position |
| Objective | Run Project Financial Position |
| Navigation Path | Reports → Financial → Project Financial Position |
| Prerequisites | GL data |
| Test Data | Project: Sunrise Towers |
| Step-by-Step Instructions | 1. Run financial position for project. |
| Expected Result | Financial position includes construction spend. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-245 — Settings — Procurement prefs

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Settings — Procurement prefs |
| Objective | Review procurement settings (cross-ref Ch.7) |
| Navigation Path | Settings → Preferences → Procurement |
| Prerequisites | Settings access |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Procurement preferences.<br>2. Note defaults used by Chapter 7 Procurement module. |
| Expected Result | Procurement settings accessible; applied in Ch.7. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-246 — BOQ module **[NOT IMPLEMENTED]**

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | BOQ module |
| Objective | Verify standalone BOQ module |
| Navigation Path | Project construction menus |
| Prerequisites | None |
| Test Data | None |
| Step-by-Step Instructions | 1. Search for BOQ menu/screen. |
| Expected Result | NOT IMPLEMENTED — use contract line items and quotation BOQ attachments. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks | NOT IMPLEMENTED — feature not available in current product build. |

### UAT-247 — IPC Bills module **[NOT IMPLEMENTED]**

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | IPC Bills module |
| Objective | Verify IPC Bills module |
| Navigation Path | Project construction menus |
| Prerequisites | None |
| Test Data | None |
| Step-by-Step Instructions | 1. Search for IPC Bills. |
| Expected Result | NOT IMPLEMENTED — not in UI or API routes. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks | NOT IMPLEMENTED — feature not available in current product build. |

### UAT-248 — Material consumption note

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Material consumption note |
| Objective | Confirm material tracking via bill lines |
| Navigation Path | Reports → Material Report |
| Prerequisites | Bills with qty lines from Ch.5/7 |
| Test Data | None |
| Step-by-Step Instructions | 1. Run Material Report.<br>2. Confirm quantities come from bill/GRN line items, not a standalone Inventory module. |
| Expected Result | Material tracking is via procurement GRN and construction/procurement bill lines — see Inventory Audit Report. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-249 — Variation Orders UI

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Variation Orders UI |
| Objective | Verify variation orders standalone UI |
| Navigation Path | Settings → Preferences → Workflow |
| Prerequisites | Workflow type Variation Orders |
| Test Data | None |
| Step-by-Step Instructions | 1. Check for standalone Variations screen. |
| Expected Result | NOT IMPLEMENTED — workflow type exists; backend stub on contracts. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-250 — Dedicated Construction Payments menu

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Dedicated Construction Payments menu |
| Objective | Verify payments via bills/GL |
| Navigation Path | Project construction menus |
| Prerequisites | None |
| Test Data | None |
| Step-by-Step Instructions | 1. Confirm no single Construction Payments menu; payments via Bills, Petty Cash, GL. |
| Expected Result | Payments distributed across Bills, PM Fee Log, General Ledger. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-251 — Budget utilization KPI

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Budget utilization KPI |
| Objective | Verify budget spend in Budget Planner |
| Navigation Path | Sidebar → Financials → Budget Planner |
| Prerequisites | Budget from Ch.10 |
| Test Data | Project: Sunrise Towers |
| Step-by-Step Instructions | 1. Open Budget Planner (Ch.10).<br>2. Review Spent and Progress % for categories. |
| Expected Result | Budget utilization visible (cross-chapter with Ch.10). |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-252 — Global search — Bills

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Global search — Bills |
| Objective | Navigate to Bills via search |
| Navigation Path | Global search → Bill Management |
| Prerequisites | None |
| Test Data | None |
| Step-by-Step Instructions | 1. Search Bill Management.<br>2. Open result. |
| Expected Result | Navigates to construction Bills view. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-253 — Real-time — bill paid sync

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Real-time — bill paid sync |
| Objective | Verify bill payment syncs to second user |
| Navigation Path | Bills view second session |
| Prerequisites | Two users |
| Test Data | None |
| Step-by-Step Instructions | 1. User A pays bill.<br>2. User B sees updated bill status without F5. |
| Expected Result | Real-time invalidation updates bill list. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-254 — Contract — Edit line item

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Contract — Edit line item |
| Objective | Edit contract line quantity |
| Navigation Path | Contracts → Edit |
| Prerequisites | Contract UAT-213 |
| Test Data | Qty: 120 |
| Step-by-Step Instructions | 1. Edit line item quantity.<br>2. Save. |
| Expected Result | Contract updated; audit recorded. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-255 — Bills — Project filter

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Bills — Project filter |
| Objective | Verify bills filtered to project |
| Navigation Path | Project construction → Bills |
| Prerequisites | Multi-project tenant |
| Test Data | Project: Sunrise Towers |
| Step-by-Step Instructions | 1. Confirm bills show project context filter. |
| Expected Result | Only project-scoped bills shown. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-256 — Contract — Print/export

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Contract — Print/export |
| Objective | Print or export contract |
| Navigation Path | Contracts → contract → Print/Export |
| Prerequisites | Contract UAT-213 |
| Test Data | None |
| Step-by-Step Instructions | 1. Print or export contract document if available. |
| Expected Result | Contract document generates. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-257 — Expense Analytics — drill

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Expense Analytics — drill |
| Objective | Drill expense analytics by category |
| Navigation Path | Expense Analytics dashboard |
| Prerequisites | Bills posted |
| Test Data | None |
| Step-by-Step Instructions | 1. Use analytics drill-down if available. |
| Expected Result | Analytics reflects posted construction expenses. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-258 — Report — Income by Category

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Report — Income by Category |
| Objective | Run income by category (construction) |
| Navigation Path | Reports → Operations → Income by Category |
| Prerequisites | Project income if any |
| Test Data | None |
| Step-by-Step Instructions | 1. Run report. |
| Expected Result | Income categories displayed. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-259 — Report — Expense by Category

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Report — Expense by Category |
| Objective | Run expense by category |
| Navigation Path | Reports → Operations → Expense by Category |
| Prerequisites | Construction expenses |
| Test Data | None |
| Step-by-Step Instructions | 1. Run expense by category. |
| Expected Result | Construction expenses grouped. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-260 — Audit — contract created

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Audit — contract created |
| Objective | Audit trail for contract |
| Navigation Path | Settings → Audit Trail |
| Prerequisites | Contract UAT-213 |
| Test Data | None |
| Step-by-Step Instructions | 1. Filter audit for contract creation. |
| Expected Result | Contract mutation audited. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-261 — Audit — bill payment

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Audit — bill payment |
| Objective | Audit trail for bill payment |
| Navigation Path | Settings → Audit Trail |
| Prerequisites | Payment UAT-218 |
| Test Data | None |
| Step-by-Step Instructions | 1. Filter audit for bill payment. |
| Expected Result | Payment event in audit trail. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-262 — Contract — Duplicate name guard

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Contract — Duplicate name guard |
| Objective | Attempt duplicate contract title |
| Navigation Path | Contracts → New |
| Prerequisites | Civil Works contract exists |
| Test Data | Same title: Civil Works |
| Step-by-Step Instructions | 1. Try creating contract with duplicate title.<br>2. Observe handling. |
| Expected Result | Warning or duplicate allowed per system rules. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-263 — Bills — Print

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Bills — Print |
| Objective | Print contractor bill |
| Navigation Path | Project construction → Bills → Print |
| Prerequisites | Posted bill |
| Test Data | None |
| Step-by-Step Instructions | 1. Print bill document. |
| Expected Result | Bill print preview generates. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-264 — Mobile construction nav

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Mobile construction nav |
| Objective | Construction sub-nav on mobile |
| Navigation Path | Project construction mobile dropdown |
| Prerequisites | Viewport <768px |
| Test Data | None |
| Step-by-Step Instructions | 1. Use mobile dropdown for Contracts/Bills. |
| Expected Result | Mobile navigation functional. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-265 — Custom Reports hidden

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Custom Reports hidden |
| Objective | Custom construction reports hidden from nav |
| Navigation Path | Global search |
| Prerequisites | None |
| Test Data | None |
| Step-by-Step Instructions | 1. Search Custom Reports construction. |
| Expected Result | Hidden from sub-nav but routable. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-266 — Workflow — Approval queue

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Workflow — Approval queue |
| Objective | View approval queue for contracts |
| Navigation Path | Settings → Preferences → Workflow OR approval panel |
| Prerequisites | Pending contract approval |
| Test Data | None |
| Step-by-Step Instructions | 1. Open approval queue if contracts pending. |
| Expected Result | Approval queue shows pending contract. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-267 — GL — bill expense entry

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | GL — bill expense entry |
| Objective | Verify bill in General Ledger |
| Navigation Path | Sidebar → General Ledger |
| Prerequisites | Bill UAT-217 posted |
| Test Data | None |
| Step-by-Step Instructions | 1. Search bill transaction in GL. |
| Expected Result | Expense and AP entries visible. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-268 — Retention release

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Retention release |
| Objective | Release retention if workflow exists |
| Navigation Path | Bills / Retention Register |
| Prerequisites | Retention held |
| Test Data | None |
| Step-by-Step Instructions | 1. Attempt retention release per system workflow.<br>2. Document outcome. |
| Expected Result | Retention release per contract retention rules. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-269 — Report — Vendor Ledger export

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Report — Vendor Ledger export |
| Objective | Export Vendor Ledger report |
| Navigation Path | Reports → Vendor Ledger → Export |
| Prerequisites | Vendor data |
| Test Data | None |
| Step-by-Step Instructions | 1. Export vendor ledger report. |
| Expected Result | Export downloads. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-270 — Bill — LWW conflict

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Bill — LWW conflict |
| Objective | Test concurrent bill edit conflict |
| Navigation Path | Bills → Edit (two users) |
| Prerequisites | Versioned bill entity |
| Test Data | Two sessions |
| Step-by-Step Instructions | 1. User A and B edit same bill.<br>2. Second save may get 409 conflict. |
| Expected Result | Conflict handled with server version message if LWW enabled. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-271 — Contract report export

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Contract report export |
| Objective | Export Contract Report |
| Navigation Path | Reports → Contract Report → Export |
| Prerequisites | Contract data |
| Test Data | None |
| Step-by-Step Instructions | 1. Export report if available. |
| Expected Result | Export downloads successfully. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-272 — Material report — no stock ledger

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Material report — no stock ledger |
| Objective | Confirm material report is bill-based |
| Navigation Path | Reports → Material Report |
| Prerequisites | None |
| Test Data | None |
| Step-by-Step Instructions | 1. Run Material Report.<br>2. Confirm no warehouse stock columns. |
| Expected Result | Report uses bill line items, not stock ledger. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-273 — Contract — Line item category

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Contract — Line item category |
| Objective | Verify expense category on contract line |
| Navigation Path | Contracts → line items |
| Prerequisites | Contract UAT-213 |
| Test Data | Category: Construction Material Cost |
| Step-by-Step Instructions | 1. Verify each line item has expense category.<br>2. Save. |
| Expected Result | Line items categorized for budget/report rollup. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-274 — Petty cash — approve

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Petty cash — approve |
| Objective | Approve petty cash voucher if workflow |
| Navigation Path | Petty Cash → voucher |
| Prerequisites | Workflow on vouchers |
| Test Data | Voucher UAT-220 |
| Step-by-Step Instructions | 1. Submit/approve voucher if required. |
| Expected Result | Voucher approved per workflow settings. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-275 — Expense voucher report filter

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Expense voucher report filter |
| Objective | Filter petty cash report by project |
| Navigation Path | Reports → Petty cash report |
| Prerequisites | Multiple projects |
| Test Data | Project: Sunrise Towers |
| Step-by-Step Instructions | 1. Filter report by Sunrise Towers. |
| Expected Result | Filtered vouchers shown. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-276 — KPI panel — Bills shortcut

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | KPI panel — Bills shortcut |
| Objective | Open Bills from KPI panel |
| Navigation Path | Dashboard → KPI → Bills |
| Prerequisites | None |
| Test Data | None |
| Step-by-Step Instructions | 1. Use KPI panel Bills shortcut. |
| Expected Result | Navigates to construction Bills. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-277 — License gate construction

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | License gate construction |
| Objective | Verify construction license gate |
| Navigation Path | Sidebar Construction group |
| Prerequisites | Tenant licensing |
| Test Data | None |
| Step-by-Step Instructions | 1. Verify Project construction visible with real_estate license. |
| Expected Result | Construction modules gated by license + RBAC. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-278 — Audit — petty cash voucher

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Audit — petty cash voucher |
| Objective | Audit petty cash voucher creation |
| Navigation Path | Settings → Audit Trail |
| Prerequisites | Voucher UAT-220 |
| Test Data | None |
| Step-by-Step Instructions | 1. Filter audit for petty cash voucher event. |
| Expected Result | Voucher mutation audited if applicable. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-279 — Material report — procurement link

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Material report — procurement link |
| Objective | Material report reflects procurement bill lines |
| Navigation Path | Reports → Material Report |
| Prerequisites | GRN/bill from Ch.7 |
| Test Data | None |
| Step-by-Step Instructions | 1. Run Material Report after Ch.7 procurement bills.<br>2. Verify line qty from procurement posts. |
| Expected Result | Material report includes quantities from procurement and construction bill lines. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-280 — Chapter completion

| Field | Value |
|-------|-------|
| Module | Project Construction |
| Feature | Chapter completion |
| Objective | Construction chapter sign-off |
| Navigation Path | Construction module review |
| Prerequisites | Ch.5 executed |
| Test Data | Checklist |
| Step-by-Step Instructions | 1. Verify contract, bill, petty cash, material report.<br>2. Complete checklist. Procurement tested in Ch.7. |
| Expected Result | Project construction E2E complete. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

## Chapter Completion Checklist

- [ ] Contract with line items created
- [ ] Contractor bill paid
- [ ] Petty cash voucher recorded
- [ ] Material Report run
- [ ] Budget vs Actual report run (Ch.10)

| Pass Count | Fail Count | Blocked/N/A | Observations |
|------------|------------|-------------|--------------|
| | | | |

---

# Chapter 6 — Rental Management

**Test Case Range:** UAT-281 – UAT-350

## Purpose
Manage rental operations: setup, agreements, invoices, payments, service charges, bills, payouts (owner settlement), and rental reports.

## Business Flow
```text
Rental setup → Agreement → Invoice → Payment → Payouts (Owner Income) → Owner Rental Income Report
```

## Required Test Data
- Building: Marina Heights; Unit: MH-201
- Owner: Owner Ali; Tenant: Fatima Tenant
- Monthly rent: 50,000; Security deposit: 100,000
- Bank: HBL Current Account

## Dependencies
- Chapter 2 — rental assets and contacts
- rental license module enabled

## Expected Outputs
- Rental agreement active
- Rent invoices generated and paid
- Owner payout recorded
- Tenant ledger balanced

## Test Cases

### UAT-281 — Open module

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Open module |
| Objective | Navigate to Rental management |
| Navigation Path | Sidebar → Rental → Rental |
| Prerequisites | rental license |
| Test Data | None |
| Step-by-Step Instructions | 1. Sidebar → Rental → Rental. |
| Expected Result | Rental shell loads with sub-navigation. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-282 — Rental setup — Buildings

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Rental setup — Buildings |
| Objective | Configure rental building |
| Navigation Path | Sidebar → Rental → Rental → Operations → Rental setup → Buildings |
| Prerequisites | Rental access |
| Test Data | Building: Marina Heights |
| Step-by-Step Instructions | 1. Open Rental setup.<br>2. Buildings tab → verify/add Marina Heights. |
| Expected Result | Building listed in rental setup. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-283 — Rental setup — Properties (Units)

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Rental setup — Properties (Units) |
| Objective | Configure rental unit |
| Navigation Path | Sidebar → Rental → Rental → Rental setup → Properties (Units) |
| Prerequisites | Building exists |
| Test Data | Unit: MH-201<br>Building: Marina Heights |
| Step-by-Step Instructions | 1. Add or verify unit MH-201.<br>2. Link to building.<br>3. Save. |
| Expected Result | Rental unit configured. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-284 — Rental setup — Owners

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Rental setup — Owners |
| Objective | Configure rental owner |
| Navigation Path | Sidebar → Rental → Rental → Rental setup → Owners |
| Prerequisites | Contact Owner Ali |
| Test Data | Owner: Owner Ali |
| Step-by-Step Instructions | 1. Add/link owner in rental setup.<br>2. Save. |
| Expected Result | Owner available for agreements/payouts. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-285 — Rental setup — Tenants

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Rental setup — Tenants |
| Objective | Configure tenant |
| Navigation Path | Sidebar → Rental → Rental → Rental setup → Tenants |
| Prerequisites | Contact Fatima Tenant |
| Test Data | Tenant: Fatima Tenant |
| Step-by-Step Instructions | 1. Add tenant Fatima Tenant.<br>2. Save. |
| Expected Result | Tenant listed. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-286 — Rental setup — Brokers

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Rental setup — Brokers |
| Objective | Configure rental broker |
| Navigation Path | Sidebar → Rental → Rental → Rental setup → Brokers |
| Prerequisites | Broker contact exists |
| Test Data | Broker: Broker One |
| Step-by-Step Instructions | 1. Add broker if separate from selling.<br>2. Save. |
| Expected Result | Broker available for rental agreements. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-287 — Analytics

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Analytics |
| Objective | View rental analytics |
| Navigation Path | Sidebar → Rental → Rental → Operations → Analytics |
| Prerequisites | Rental data |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Analytics. |
| Expected Result | Rental analytics dashboard loads. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-288 — Agreements — New

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Agreements — New |
| Objective | Create rental agreement |
| Navigation Path | Sidebar → Rental → Rental → Operations → Agreements → New |
| Prerequisites | Unit MH-201, tenant, owner |
| Test Data | Tenant: Fatima Tenant<br>Unit: MH-201<br>Rent: 50,000/month<br>Start: 1st of next month<br>Deposit: 100,000 |
| Step-by-Step Instructions | 1. Open Agreements.<br>2. New rental agreement.<br>3. Enter terms.<br>4. Save/activate. |
| Expected Result | Rental agreement created. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-289 — Agreements — Edit

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Agreements — Edit |
| Objective | Edit rental agreement |
| Navigation Path | Sidebar → Rental → Rental → Agreements → Edit |
| Prerequisites | Agreement UAT-288 |
| Test Data | Rent: 52,000 |
| Step-by-Step Instructions | 1. Edit agreement rent amount.<br>2. Save. |
| Expected Result | Agreement updated. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-290 — Agreements — Expiry

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Agreements — Expiry |
| Objective | Set agreement end date |
| Navigation Path | Sidebar → Rental → Rental → Agreements |
| Prerequisites | Agreement UAT-288 |
| Test Data | End date: +12 months |
| Step-by-Step Instructions | 1. Set agreement expiry/end date.<br>2. Save. |
| Expected Result | End date saved for expiry report. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-291 — Invoices — Generate

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Invoices — Generate |
| Objective | Generate rent invoices |
| Navigation Path | Sidebar → Rental → Rental → Operations → Invoices |
| Prerequisites | Active agreement |
| Test Data | Monthly rent invoices |
| Step-by-Step Instructions | 1. Open Invoices.<br>2. Generate invoices from agreement schedule.<br>3. Verify invoice list. |
| Expected Result | Rent invoices created. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-292 — Invoices — Receive payment

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Invoices — Receive payment |
| Objective | Record tenant rent payment |
| Navigation Path | Sidebar → Rental → Rental → Invoices → Rental Payment |
| Prerequisites | Unpaid rent invoice |
| Test Data | Amount: 50,000<br>Account: HBL Current Account |
| Step-by-Step Instructions | 1. Select rent invoice.<br>2. Rental Payment / Receive Payment.<br>3. Confirm. |
| Expected Result | Invoice paid; tenant balance updated. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-293 — Invoices — Bulk payment

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Invoices — Bulk payment |
| Objective | Bulk rent payment |
| Navigation Path | Sidebar → Rental → Rental → Invoices → Bulk Payment |
| Prerequisites | Multiple unpaid invoices |
| Test Data | Select 2 invoices |
| Step-by-Step Instructions | 1. Bulk pay selected invoices. |
| Expected Result | Multiple invoices marked paid. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-294 — Collections Analytics

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Collections Analytics |
| Objective | View rental collections |
| Navigation Path | Sidebar → Rental → Rental → Operations → Collections |
| Prerequisites | Payments UAT-292 |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Collections Analytics. |
| Expected Result | Collections KPIs reflect payments. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-295 — Monthly Service Charges

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Monthly Service Charges |
| Objective | Configure service charges |
| Navigation Path | Sidebar → Rental → Rental → Operations → Monthly Service Charges |
| Prerequisites | Building/units exist |
| Test Data | Service charge: 5,000/month |
| Step-by-Step Instructions | 1. Open Monthly Service Charges.<br>2. Configure charge for building/unit.<br>3. Save. |
| Expected Result | Service charges configured. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-296 — Service charge invoice

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Service charge invoice |
| Objective | Generate service charge invoice |
| Navigation Path | Sidebar → Rental → Rental → Invoices or Service Charges |
| Prerequisites | Service charge UAT-295 |
| Test Data | Amount: 5,000 |
| Step-by-Step Instructions | 1. Generate service charge invoice.<br>2. Verify on Invoices list. |
| Expected Result | Service charge invoice created. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-297 — Bills — Rental expense bill

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Bills — Rental expense bill |
| Objective | Record rental property expense bill |
| Navigation Path | Sidebar → Rental → Rental → Operations → Bills |
| Prerequisites | Vendor for maintenance |
| Test Data | Vendor: ABC Supplies<br>Amount: 10,000<br>Building: Marina Heights |
| Step-by-Step Instructions | 1. Add rental context bill.<br>2. Save/post. |
| Expected Result | Rental expense bill recorded. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-298 — Expense Analytics

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Expense Analytics |
| Objective | View rental expense analytics |
| Navigation Path | Sidebar → Rental → Rental → Operations → Expense Analytics |
| Prerequisites | Bills exist |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Expense Analytics. |
| Expected Result | Rental expense dashboard loads. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-299 — Payouts — Owner Income

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Payouts — Owner Income |
| Objective | Process owner income payout |
| Navigation Path | Sidebar → Rental → Rental → Operations → Payouts → Owner Income |
| Prerequisites | Rent collected |
| Test Data | Owner: Owner Ali<br>Amount: net after deductions |
| Step-by-Step Instructions | 1. Open Payouts.<br>2. Owner Income chip/tab.<br>3. Pay owner share.<br>4. Confirm. |
| Expected Result | Owner payout recorded (owner settlement via Payouts). |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-300 — Payouts — Broker Commission

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Payouts — Broker Commission |
| Objective | Process broker commission payout |
| Navigation Path | Sidebar → Rental → Rental → Payouts → Broker Commission |
| Prerequisites | Broker on agreement |
| Test Data | Broker: Broker One |
| Step-by-Step Instructions | 1. Process broker commission payout. |
| Expected Result | Broker commission paid. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-301 — Payouts — Security Deposit

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Payouts — Security Deposit |
| Objective | Process security deposit payout/receipt |
| Navigation Path | Sidebar → Rental → Rental → Payouts → Security Deposit |
| Prerequisites | Deposit on agreement |
| Test Data | Deposit: 100,000 |
| Step-by-Step Instructions | 1. Record security deposit receive/payout as applicable. |
| Expected Result | Security deposit transaction recorded. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-302 — Payouts — Ledger expand

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Payouts — Ledger expand |
| Objective | View owner rental income ledger |
| Navigation Path | Sidebar → Rental → Rental → Payouts → expand row → Rental Income Ledger |
| Prerequisites | Payout UAT-299 |
| Test Data | Owner: Owner Ali |
| Step-by-Step Instructions | 1. Expand payout row.<br>2. Review Rental Income Ledger detail. |
| Expected Result | Owner income ledger entries visible. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-303 — Visual layout

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Visual layout |
| Objective | View rental visual layout |
| Navigation Path | Sidebar → Rental → Rental → Property views → Visual layout |
| Prerequisites | Units exist |
| Test Data | Building: Marina Heights |
| Step-by-Step Instructions | 1. Open Visual layout. |
| Expected Result | Visual property layout displays units. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-304 — Tabular layout

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Tabular layout |
| Objective | View rental tabular layout |
| Navigation Path | Sidebar → Rental → Rental → Property views → Tabular layout |
| Prerequisites | Units exist |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Tabular layout. |
| Expected Result | Tabular unit grid displays. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-305 — Report — Agreement Expiry

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Report — Agreement Expiry |
| Objective | Run Agreement Expiry report |
| Navigation Path | Sidebar → Rental → Rental → Reports → Analysis → Agreement Expiry |
| Prerequisites | Agreement with end date |
| Test Data | None |
| Step-by-Step Instructions | 1. Run Agreement Expiry report. |
| Expected Result | Expiring agreements listed. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-306 — Report — Building Analysis

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Report — Building Analysis |
| Objective | Run Building Analysis |
| Navigation Path | Sidebar → Rental → Rental → Reports → Analysis → Building Analysis |
| Prerequisites | Building data |
| Test Data | Building: Marina Heights |
| Step-by-Step Instructions | 1. Run Building Analysis. |
| Expected Result | Building metrics displayed. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-307 — Report — BM Analysis

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Report — BM Analysis |
| Objective | Run BM Analysis report |
| Navigation Path | Sidebar → Rental → Rental → Reports → Analysis → BM Analysis |
| Prerequisites | Rental data |
| Test Data | None |
| Step-by-Step Instructions | 1. Run BM Analysis. |
| Expected Result | BM analysis report generates. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-308 — Report — Invoice & Payment Analysis

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Report — Invoice & Payment Analysis |
| Objective | Run Invoice & Payment Analysis |
| Navigation Path | Sidebar → Rental → Rental → Reports → Analysis → Invoice & Payment Analysis |
| Prerequisites | Invoices/payments |
| Test Data | None |
| Step-by-Step Instructions | 1. Run report. |
| Expected Result | Invoice and payment analysis displayed. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-309 — Report — Owner Rental Income

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Report — Owner Rental Income |
| Objective | Run Owner Rental Income ledger report |
| Navigation Path | Sidebar → Rental → Rental → Reports → Ledgers → Owner Rental Income |
| Prerequisites | Owner payouts |
| Test Data | Owner: Owner Ali |
| Step-by-Step Instructions | 1. Run Owner Rental Income.<br>2. Select owner. |
| Expected Result | Owner rental income ledger report generates. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-310 — Report — Owner Income Summary

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Report — Owner Income Summary |
| Objective | Run Owner Rental Income Summary |
| Navigation Path | Sidebar → Rental → Rental → Reports → Ledgers → Owner Rental Income Summary |
| Prerequisites | Owner data |
| Test Data | None |
| Step-by-Step Instructions | 1. Run summary report. |
| Expected Result | Summary totals by owner. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-311 — Report — Service Charges Deduction

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Report — Service Charges Deduction |
| Objective | Run Service Charges Deduction |
| Navigation Path | Sidebar → Rental → Rental → Reports → Ledgers → Service Charges Deduction |
| Prerequisites | Service charges |
| Test Data | None |
| Step-by-Step Instructions | 1. Run report. |
| Expected Result | Service charge deductions listed. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-312 — Report — Tenant Ledger

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Report — Tenant Ledger |
| Objective | Run Tenant Ledger |
| Navigation Path | Sidebar → Rental → Rental → Reports → Ledgers → Tenant Ledger |
| Prerequisites | Tenant Fatima |
| Test Data | Tenant: Fatima Tenant |
| Step-by-Step Instructions | 1. Run Tenant Ledger for Fatima. |
| Expected Result | Tenant invoices/payments/balance shown. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-313 — Report — Rental Receivable

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Report — Rental Receivable |
| Objective | Run Rental Receivable |
| Navigation Path | Sidebar → Rental → Rental → Reports → Ledgers → Rental Receivable |
| Prerequisites | Unpaid invoices optional |
| Test Data | None |
| Step-by-Step Instructions | 1. Run Rental Receivable report. |
| Expected Result | Outstanding receivables listed. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-314 — Report — Vendor Ledger

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Report — Vendor Ledger |
| Objective | Run Vendor Ledger (rental) |
| Navigation Path | Sidebar → Rental → Rental → Reports → Ledgers → Vendor Ledger |
| Prerequisites | Rental bills |
| Test Data | Vendor: ABC Supplies |
| Step-by-Step Instructions | 1. Run Vendor Ledger rental context. |
| Expected Result | Vendor ledger for rental expenses. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-315 — Report — Security Deposit

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Report — Security Deposit |
| Objective | Run Security Deposit report |
| Navigation Path | Sidebar → Rental → Rental → Reports → Ledgers → Security Deposit |
| Prerequisites | Deposit UAT-301 |
| Test Data | None |
| Step-by-Step Instructions | 1. Run Security Deposit report. |
| Expected Result | Security deposit balances listed. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-316 — Report — Broker Fees

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Report — Broker Fees |
| Objective | Run Broker Fees report |
| Navigation Path | Sidebar → Rental → Rental → Reports → Ledgers → Broker Fees |
| Prerequisites | Broker payouts |
| Test Data | None |
| Step-by-Step Instructions | 1. Run Broker Fees report. |
| Expected Result | Broker fees summarized. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-317 — Owner settlement menu **[NOT IMPLEMENTED]**

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Owner settlement menu |
| Objective | Verify no dedicated Owner Settlement menu |
| Navigation Path | Sidebar → Rental → Rental |
| Prerequisites | None |
| Test Data | None |
| Step-by-Step Instructions | 1. Search for Owner Settlement menu item. |
| Expected Result | NOT IMPLEMENTED as menu name — use Payouts for owner settlement. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks | Use Rental → Payouts → Owner Income instead. |

### UAT-318 — Dedicated rental payments page

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Dedicated rental payments page |
| Objective | Verify payments on Invoices not separate page |
| Navigation Path | Sidebar → Rental → Rental → Invoices |
| Prerequisites | None |
| Test Data | None |
| Step-by-Step Instructions | 1. Confirm no top-level Rental Payments menu. |
| Expected Result | Payments embedded in Invoices sub-tab. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-319 — Ownership transfers

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Ownership transfers |
| Objective | Verify ownership transfers removed |
| Navigation Path | Sidebar → Rental → Rental |
| Prerequisites | None |
| Test Data | None |
| Step-by-Step Instructions | 1. Search Ownership transfers in rental nav. |
| Expected Result | NOT IMPLEMENTED — removed; redirects to Agreements. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-320 — Legacy deep links

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Legacy deep links |
| Objective | Test global search rental deep links |
| Navigation Path | Global search → Rental Invoices |
| Prerequisites | None |
| Test Data | None |
| Step-by-Step Instructions | 1. Search Rental Invoices, Rental Agreements, Owner Payouts, Rental Setup. |
| Expected Result | Each opens correct Rental sub-view. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-321 — Settings Assets — Rental group

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Settings Assets — Rental group |
| Objective | Cross-check Settings → Assets rental |
| Navigation Path | Settings → Assets → Rental |
| Prerequisites | Assets from Ch.2 |
| Test Data | Rental Building/Properties |
| Step-by-Step Instructions | 1. Verify rental assets in Settings mirror Rental setup. |
| Expected Result | Consistent master data between Settings and Rental setup. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-322 — Agreement — Deposit invoice

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Agreement — Deposit invoice |
| Objective | Generate security deposit invoice |
| Navigation Path | Sidebar → Rental → Rental → Invoices |
| Prerequisites | Agreement with deposit |
| Test Data | Deposit: 100,000 |
| Step-by-Step Instructions | 1. Generate deposit invoice if separate from rent. |
| Expected Result | Deposit invoice on invoice list. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-323 — Invoice print

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Invoice print |
| Objective | Print rental invoice |
| Navigation Path | Sidebar → Rental → Rental → Invoices → Print |
| Prerequisites | Rent invoice |
| Test Data | None |
| Step-by-Step Instructions | 1. Print rental invoice. |
| Expected Result | Print preview/PDF generates. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-324 — Real-time invoice sync

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Real-time invoice sync |
| Objective | Verify invoice payment sync |
| Navigation Path | Sidebar → Rental → Rental → Invoices (2nd session) |
| Prerequisites | Two users |
| Test Data | None |
| Step-by-Step Instructions | 1. User A records payment.<br>2. User B sees updated balance. |
| Expected Result | Real-time sync updates invoice status. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-325 — Audit — agreement

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Audit — agreement |
| Objective | Audit rental agreement creation |
| Navigation Path | Settings → Audit Trail |
| Prerequisites | Agreement UAT-288 |
| Test Data | None |
| Step-by-Step Instructions | 1. Filter audit for rental agreement. |
| Expected Result | Agreement creation audited. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-326 — GL — rent payment

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | GL — rent payment |
| Objective | Verify rent payment in GL |
| Navigation Path | Sidebar → General Ledger |
| Prerequisites | Payment UAT-292 |
| Test Data | None |
| Step-by-Step Instructions | 1. Locate rent payment in GL. |
| Expected Result | Bank debit and AR credit posted. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-327 — Custom Reports hidden

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Custom Reports hidden |
| Objective | Rental custom reports hidden from nav |
| Navigation Path | Global search |
| Prerequisites | None |
| Test Data | None |
| Step-by-Step Instructions | 1. Search Custom Reports rental. |
| Expected Result | Hidden from sub-nav but routable. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-328 — Mobile rental nav

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Mobile rental nav |
| Objective | Rental sub-nav on mobile |
| Navigation Path | Sidebar → Rental → Rental |
| Prerequisites | Viewport <768px |
| Test Data | None |
| Step-by-Step Instructions | 1. Use mobile dropdown for Operations/Reports. |
| Expected Result | Mobile navigation works. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-329 — License gate rental

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | License gate rental |
| Objective | Verify rental license gate |
| Navigation Path | Sidebar Rental item |
| Prerequisites | Tenant licensing |
| Test Data | None |
| Step-by-Step Instructions | 1. Verify Rental sidebar requires rental license. |
| Expected Result | Rental hidden without rental license. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-330 — Payouts — Receive action

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Payouts — Receive action |
| Objective | Use Receive on payout row |
| Navigation Path | Sidebar → Rental → Rental → Payouts → Receive |
| Prerequisites | Applicable payout type |
| Test Data | None |
| Step-by-Step Instructions | 1. Click Receive where shown on payout row. |
| Expected Result | Receive action processes inbound payout. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-331 — Agreement renewal

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Agreement renewal |
| Objective | Renew or extend agreement |
| Navigation Path | Sidebar → Rental → Rental → Agreements |
| Prerequisites | Expiring agreement |
| Test Data | Extend 12 months |
| Step-by-Step Instructions | 1. Extend agreement end date or renew.<br>2. Save. |
| Expected Result | Agreement extended; new invoices may generate. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-332 — Vacant unit status

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Vacant unit status |
| Objective | Mark unit vacant after agreement ends |
| Navigation Path | Sidebar → Rental → Rental → Rental setup → Properties |
| Prerequisites | Ended agreement test |
| Test Data | Unit: test vacant |
| Step-by-Step Instructions | 1. Update unit occupancy status if field exists. |
| Expected Result | Unit status reflects vacancy. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-333 — Report export — Tenant Ledger

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Report export — Tenant Ledger |
| Objective | Export Tenant Ledger |
| Navigation Path | Sidebar → Rental → Rental → Reports → Tenant Ledger → Export |
| Prerequisites | Ledger data |
| Test Data | None |
| Step-by-Step Instructions | 1. Export tenant ledger. |
| Expected Result | Export file downloads. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-334 — Collections — overdue

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Collections — overdue |
| Objective | Review overdue rent in collections |
| Navigation Path | Sidebar → Rental → Rental → Collections |
| Prerequisites | Past due invoice optional |
| Test Data | None |
| Step-by-Step Instructions | 1. Review overdue metrics. |
| Expected Result | Overdue rent highlighted when applicable. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-335 — Bills — Pay rental bill

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Bills — Pay rental bill |
| Objective | Pay rental maintenance bill |
| Navigation Path | Sidebar → Rental → Rental → Bills → Pay |
| Prerequisites | Bill UAT-297 |
| Test Data | Account: HBL |
| Step-by-Step Instructions | 1. Pay rental expense bill. |
| Expected Result | Bill paid; expense posted. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-336 — WhatsApp rent reminder

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | WhatsApp rent reminder |
| Objective | Communication template for rent |
| Navigation Path | Settings → Preferences → Communication |
| Prerequisites | Templates configured |
| Test Data | Rent reminder template |
| Step-by-Step Instructions | 1. Review rent-related WhatsApp/print templates. |
| Expected Result | Communication templates available. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-337 — Workflow — agreement approval

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Workflow — agreement approval |
| Objective | Submit rental agreement for approval |
| Navigation Path | Sidebar → Rental → Rental → Agreements → Submit |
| Prerequisites | Workflow enabled |
| Test Data | New agreement |
| Step-by-Step Instructions | 1. Submit agreement for workflow if required. |
| Expected Result | Workflow status updates. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-338 — Multi-building owner

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Multi-building owner |
| Objective | Owner with multiple buildings |
| Navigation Path | Sidebar → Rental → Rental → Rental setup |
| Prerequisites | Second building optional |
| Test Data | Owner: Owner Ali |
| Step-by-Step Instructions | 1. Assign same owner to multiple buildings if applicable. |
| Expected Result | Owner linked across buildings. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-339 — Report — Owner ledger cross-check

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Report — Owner ledger cross-check |
| Objective | Cross-check payout vs Owner Rental Income report |
| Navigation Path | Sidebar → Rental → Rental → Payouts + Reports |
| Prerequisites | Payout UAT-299 |
| Test Data | Owner: Owner Ali |
| Step-by-Step Instructions | 1. Compare payout amount to Owner Rental Income report totals. |
| Expected Result | Figures reconcile between payout and report. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-340 — Tenant portal N/A

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Tenant portal N/A |
| Objective | Verify no tenant self-service portal |
| Navigation Path | Application menus |
| Prerequisites | None |
| Test Data | None |
| Step-by-Step Instructions | 1. Search for tenant portal/login. |
| Expected Result | NOT IMPLEMENTED — tenant management is admin-side only. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-341 — KPI panel — Rental Inv.

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | KPI panel — Rental Inv. |
| Objective | KPI shortcut to rental invoices |
| Navigation Path | Dashboard → KPI → Rental Inv. |
| Prerequisites | None |
| Test Data | None |
| Step-by-Step Instructions | 1. Use KPI panel Rental Inv. shortcut. |
| Expected Result | Navigates to rental invoices view. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-342 — Invoice partial payment

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Invoice partial payment |
| Objective | Partial rent payment |
| Navigation Path | Sidebar → Rental → Rental → Invoices → Payment |
| Prerequisites | Unpaid invoice |
| Test Data | Pay 50% of rent |
| Step-by-Step Instructions | 1. Record partial payment. |
| Expected Result | Invoice shows partial paid balance. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-343 — Agreement — Broker link

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Agreement — Broker link |
| Objective | Link broker on rental agreement |
| Navigation Path | Sidebar → Rental → Rental → Agreements → Edit |
| Prerequisites | Broker One exists |
| Test Data | Broker: Broker One<br>Commission: 1 month |
| Step-by-Step Instructions | 1. Add broker to agreement.<br>2. Save. |
| Expected Result | Broker commission rules on agreement. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-344 — Payouts — Security Deposit Ledger

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Payouts — Security Deposit Ledger |
| Objective | View Security Deposit Ledger expand |
| Navigation Path | Sidebar → Rental → Rental → Payouts → expand |
| Prerequisites | Deposit transactions |
| Test Data | None |
| Step-by-Step Instructions | 1. Expand row → Security Deposit Ledger. |
| Expected Result | Deposit ledger entries visible. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-345 — Expense Analytics drill

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Expense Analytics drill |
| Objective | Drill rental expenses by building |
| Navigation Path | Sidebar → Rental → Rental → Expense Analytics |
| Prerequisites | Bills posted |
| Test Data | Building: Marina Heights |
| Step-by-Step Instructions | 1. Filter/drill by building if available. |
| Expected Result | Expenses attributed to building. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-346 — Settings — Rental invoice settings

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Settings — Rental invoice settings |
| Objective | Review rental invoice settings |
| Navigation Path | Settings → Preferences (rental invoice defaults if present) |
| Prerequisites | None |
| Test Data | None |
| Step-by-Step Instructions | 1. Review rental invoice numbering/defaults in Settings. |
| Expected Result | Rental invoice settings accessible. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-347 — Agreement inactive

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Agreement inactive |
| Objective | Deactivate/cancel agreement |
| Navigation Path | Sidebar → Rental → Rental → Agreements |
| Prerequisites | Test agreement |
| Test Data | Cancel test agreement |
| Step-by-Step Instructions | 1. Cancel or mark agreement inactive.<br>2. Confirm invoice generation stops. |
| Expected Result | Agreement cancelled per system rules. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-348 — Report — BM Analysis filter

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Report — BM Analysis filter |
| Objective | Filter BM Analysis by building |
| Navigation Path | Sidebar → Rental → Rental → Reports → BM Analysis |
| Prerequisites | Multi-building |
| Test Data | Building: Marina Heights |
| Step-by-Step Instructions | 1. Run with building filter. |
| Expected Result | Filtered analysis displayed. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-349 — Audit — owner payout

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Audit — owner payout |
| Objective | Audit owner payout event |
| Navigation Path | Settings → Audit Trail |
| Prerequisites | Payout UAT-299 |
| Test Data | None |
| Step-by-Step Instructions | 1. Filter audit for owner payout. |
| Expected Result | Payout mutation audited. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-350 — Chapter completion

| Field | Value |
|-------|-------|
| Module | Rental |
| Feature | Chapter completion |
| Objective | Rental chapter sign-off |
| Navigation Path | Rental module review |
| Prerequisites | Ch.6 executed |
| Test Data | Checklist |
| Step-by-Step Instructions | 1. Verify setup → agreement → invoice → payment → payout → reports.<br>2. Complete checklist. |
| Expected Result | Rental management E2E complete. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

## Chapter Completion Checklist

- [ ] Rental setup complete (building, unit, owner, tenant)
- [ ] Agreement signed/active
- [ ] Invoice paid
- [ ] Owner payout processed
- [ ] Ledger reports verified

| Pass Count | Fail Count | Blocked/N/A | Observations |
|------------|------------|-------------|--------------|
| | | | |

---

# Chapter 7 — Procurement Management

**Test Case Range:** UAT-351 – UAT-405

## Purpose
Verify the full procurement lifecycle: vendor setup, quotations, purchase orders, goods receipts, vendor bills, payments, and accounting impact.

## Business Flow
```text
Vendor → Quotation → Purchase Order → Goods Receipt → Vendor Bill → Payment → General Ledger
```

## Required Test Data
- Vendor: ABC Supplies Ltd (from Ch.2)
- Second vendor: XYZ Traders (optional, for compare tests)
- Project: Sunrise Towers
- Bank: HBL Current Account
- Sample line: Steel bars 12mm, Qty 50, Rate 1,200

## Dependencies
- Chapter 2 — vendor contact, COA expense categories, bank account
- Procurement read/write permissions

## Expected Outputs
- Vendor visible in Vendor directory
- PO created, approved, and received via GRN
- Vendor bill posted and paid
- Vendor ledger and GL reflect payment

## Test Cases

### UAT-351 — Open module

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | Open module |
| Objective | Navigate to Procurement |
| Navigation Path | Sidebar → Construction → Procurement |
| Prerequisites | Procurement read permission |
| Test Data | None |
| Step-by-Step Instructions | 1. Sidebar → Construction → Procurement. |
| Expected Result | Procurement shell loads with sub-navigation: Analytics, Vendor directory, All Quotations, Compare, Price history, Purchase order, Goods receipts, All bills. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-352 — Vendor directory — Add vendor

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | Vendor directory — Add vendor |
| Objective | Create vendor from directory |
| Navigation Path | Sidebar → Construction → Procurement → Vendor directory → + Add Vendor |
| Prerequisites | Procurement write access |
| Test Data | Name: XYZ Traders<br>Phone: +92-21-2222222<br>Type: Vendor |
| Step-by-Step Instructions | 1. Open Vendor directory.<br>2. Click Add Vendor.<br>3. Enter vendor details in ContactForm.<br>4. Save. |
| Expected Result | Vendor appears in directory sidebar list. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-353 — Vendor directory — Search

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | Vendor directory — Search |
| Objective | Search vendors in directory |
| Navigation Path | Sidebar → Construction → Procurement → Vendor directory → search |
| Prerequisites | Multiple vendors |
| Test Data | Search: ABC |
| Step-by-Step Instructions | 1. Type ABC in vendor search.<br>2. Wait for debounced results. |
| Expected Result | Matching vendors displayed in paginated list. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-354 — Vendor — Ledger tab

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | Vendor — Ledger tab |
| Objective | View vendor ledger (empty/new) |
| Navigation Path | Sidebar → Construction → Procurement → Vendor directory → XYZ Traders → Ledger |
| Prerequisites | New vendor XYZ Traders |
| Test Data | None |
| Step-by-Step Instructions | 1. Select XYZ Traders.<br>2. Click Ledger tab. |
| Expected Result | Empty ledger or zero balance for new vendor. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-355 — Vendor — Bills tab

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | Vendor — Bills tab |
| Objective | View vendor bills tab |
| Navigation Path | Sidebar → Construction → Procurement → Vendor directory → ABC Supplies → Bills |
| Prerequisites | Vendor ABC Supplies |
| Test Data | None |
| Step-by-Step Instructions | 1. Open ABC Supplies.<br>2. Click Bills tab. |
| Expected Result | Vendor bills list loads (may be empty or show prior bills). |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-356 — Vendor — Quotations tab

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | Vendor — Quotations tab |
| Objective | View vendor quotations tab |
| Navigation Path | Sidebar → Construction → Procurement → Vendor directory → ABC Supplies → Quotations |
| Prerequisites | Vendor exists |
| Test Data | None |
| Step-by-Step Instructions | 1. Click Quotations tab on vendor record. |
| Expected Result | Vendor-scoped quotations table loads. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-357 — Vendor categories

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | Vendor categories |
| Objective | Verify vendor type via Contacts (no separate category module) |
| Navigation Path | Settings → Contacts → vendor record |
| Prerequisites | Vendor ABC Supplies |
| Test Data | Type: Vendor |
| Step-by-Step Instructions | 1. Open vendor in Settings → Contacts.<br>2. Confirm contact Type is Vendor (no separate Vendor Categories menu). |
| Expected Result | Vendor classification is contact type Vendor — no standalone vendor category module. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-358 — Purchase Requests **[NOT IMPLEMENTED]**

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | Purchase Requests |
| Objective | Verify Purchase Request feature |
| Navigation Path | Sidebar → Construction → Procurement |
| Prerequisites | None |
| Test Data | None |
| Step-by-Step Instructions | 1. Search Procurement and global search for Purchase Request. |
| Expected Result | NOT IMPLEMENTED — no Purchase Request screen or menu; flow starts at Quotation or PO. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks | NOT IMPLEMENTED — feature not available in current product build. |

### UAT-359 — Analytics — Open

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | Analytics — Open |
| Objective | View vendor analytics dashboard |
| Navigation Path | Sidebar → Construction → Procurement → Analytics |
| Prerequisites | Vendor/PO data |
| Test Data | None |
| Step-by-Step Instructions | 1. Click Analytics sub-tab. |
| Expected Result | Vendor analytics dashboard loads with KPIs/charts. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-360 — Analytics — Open PO metrics

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | Analytics — Open PO metrics |
| Objective | Review open PO value in analytics |
| Navigation Path | Sidebar → Construction → Procurement → Analytics |
| Prerequisites | Open PO from later tests |
| Test Data | None |
| Step-by-Step Instructions | 1. After creating PO, review open PO count/value in Analytics. |
| Expected Result | Analytics reflects procurement pipeline metrics. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-361 — Quotation — New

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | Quotation — New |
| Objective | Create vendor quotation |
| Navigation Path | Sidebar → Construction → Procurement → Vendor directory → ABC Supplies → Quotations → New |
| Prerequisites | Vendor ABC Supplies |
| Test Data | Item: Steel bars 12mm<br>Qty: 50<br>Rate: 1,200<br>Project: Sunrise Towers |
| Step-by-Step Instructions | 1. Create new quotation.<br>2. Add line items with description, qty, rate.<br>3. Save. |
| Expected Result | Quotation saved and listed. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-362 — All Quotations — List

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | All Quotations — List |
| Objective | View all quotations table |
| Navigation Path | Sidebar → Construction → Procurement → All Quotations |
| Prerequisites | Quotation UAT-361 |
| Test Data | None |
| Step-by-Step Instructions | 1. Open All Quotations sub-tab.<br>2. Locate quotation from UAT-361. |
| Expected Result | Quotation appears in global quotations table. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-363 — Quotation — Second vendor

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | Quotation — Second vendor |
| Objective | Create second vendor quotation for compare |
| Navigation Path | Sidebar → Construction → Procurement → Vendor directory → XYZ Traders → Quotations → New |
| Prerequisites | XYZ Traders vendor |
| Test Data | Same item: Steel bars 12mm<br>Rate: 1,150 |
| Step-by-Step Instructions | 1. Create quotation from XYZ Traders with same item description.<br>2. Save. |
| Expected Result | Second quotation available for comparison. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-364 — Compare quotations

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | Compare quotations |
| Objective | Compare vendor quotations side-by-side |
| Navigation Path | Sidebar → Construction → Procurement → Compare |
| Prerequisites | 2+ quotations for same item |
| Test Data | Select ABC and XYZ quotations |
| Step-by-Step Instructions | 1. Open Compare sub-tab.<br>2. Select quotations to compare.<br>3. Review side-by-side table. |
| Expected Result | Comparison displays line descriptions, qty, rates per vendor. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-365 — Price history

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | Price history |
| Objective | View price history by item name |
| Navigation Path | Sidebar → Construction → Procurement → Price history |
| Prerequisites | Quotations with Steel bars |
| Test Data | Item: Steel bars 12mm |
| Step-by-Step Instructions | 1. Open Price history.<br>2. Filter/search Steel bars 12mm. |
| Expected Result | Historical prices from quotations shown (item name based, not SKU master). |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-366 — Quotation — BOQ attachment

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | Quotation — BOQ attachment |
| Objective | Attach BOQ file on quotation |
| Navigation Path | Sidebar → Construction → Procurement → Quotation form → attachment |
| Prerequisites | Quotation open |
| Test Data | Attachment type: BOQ<br>File: spec.pdf |
| Step-by-Step Instructions | 1. Add BOQ attachment type if available.<br>2. Upload sample file.<br>3. Save. |
| Expected Result | BOQ attachment stored on quotation record. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-367 — Purchase Order — Create

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | Purchase Order — Create |
| Objective | Create purchase order |
| Navigation Path | Sidebar → Construction → Procurement → Purchase order → New |
| Prerequisites | Vendor ABC Supplies |
| Test Data | From quotation UAT-361 or manual lines<br>Amount: 60,000<br>Project: Sunrise Towers |
| Step-by-Step Instructions | 1. Open Purchase order sub-tab.<br>2. Create PO from quotation or manually.<br>3. Save/submit. |
| Expected Result | PO created in Draft or Submitted state. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-368 — Purchase Order — Approve

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | Purchase Order — Approve |
| Objective | Approve purchase order |
| Navigation Path | Sidebar → Construction → Procurement → Purchase order → Approve |
| Prerequisites | Workflow/approval enabled |
| Test Data | PO from UAT-367 |
| Step-by-Step Instructions | 1. Submit PO for approval if required.<br>2. Approve as approver user. |
| Expected Result | PO status becomes Approved (or active per workflow). |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-369 — PO — ID sequence

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | PO — ID sequence |
| Objective | Verify PO number uses ID sequence |
| Navigation Path | Settings → Preferences → ID Sequences + new PO |
| Prerequisites | PO prefix configured Ch.1 |
| Test Data | None |
| Step-by-Step Instructions | 1. Create new PO.<br>2. Verify PO number uses configured prefix from ID Sequences. |
| Expected Result | PO number follows Settings → Preferences → ID Sequences prefix. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-370 — PO — Cancel draft

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | PO — Cancel draft |
| Objective | Cancel/delete draft PO |
| Navigation Path | Sidebar → Construction → Procurement → Purchase order |
| Prerequisites | Draft PO only |
| Test Data | New draft PO |
| Step-by-Step Instructions | 1. Create draft PO.<br>2. Cancel or delete before approval. |
| Expected Result | Draft PO removed without GRN/bill linkage. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-371 — Goods Receipt — Create Draft

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | Goods Receipt — Create Draft |
| Objective | Create GRN as Draft |
| Navigation Path | Sidebar → Construction → Procurement → Goods receipts → New |
| Prerequisites | Approved PO UAT-368 |
| Test Data | Partial qty if testing partial receipt |
| Step-by-Step Instructions | 1. Create GRN against PO.<br>2. Enter received quantities.<br>3. Save as Draft. |
| Expected Result | GRN saved in Draft status. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-372 — Goods Receipt — Post

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | Goods Receipt — Post |
| Objective | Post goods receipt |
| Navigation Path | Sidebar → Construction → Procurement → Goods receipts → Post |
| Prerequisites | Draft GRN UAT-371 |
| Test Data | None |
| Step-by-Step Instructions | 1. Post draft GRN. |
| Expected Result | GRN status changes to Posted; PO received qty updated. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-373 — GRN — Partial receipt

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | GRN — Partial receipt |
| Objective | Partial quantity on first GRN |
| Navigation Path | Sidebar → Construction → Procurement → Goods receipts |
| Prerequisites | PO qty 100 |
| Test Data | Receive qty: 60 |
| Step-by-Step Instructions | 1. Create/post GRN with 60 of 100 qty.<br>2. Verify PO shows partial receipt. |
| Expected Result | Partial receipt recorded; PO balance remaining. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-374 — GRN — Second receipt

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | GRN — Second receipt |
| Objective | Complete PO with second GRN |
| Navigation Path | Sidebar → Construction → Procurement → Goods receipts → New |
| Prerequisites | Partial GRN UAT-373 |
| Test Data | Receive qty: 40 |
| Step-by-Step Instructions | 1. Create second GRN for remaining qty.<br>2. Post and close. |
| Expected Result | PO fully received across GRNs. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-375 — GRN — Close

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | GRN — Close |
| Objective | Close GRN lifecycle |
| Navigation Path | Sidebar → Construction → Procurement → Goods receipts → Close |
| Prerequisites | Posted GRN complete |
| Test Data | GRN from UAT-372/374 |
| Step-by-Step Instructions | 1. Close GRN when receipt complete. |
| Expected Result | GRN status Closed. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-376 — GRN Status widget

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | GRN Status widget |
| Objective | Review GRN status summary |
| Navigation Path | Sidebar → Construction → Procurement → Goods receipts → GRN Status |
| Prerequisites | Multiple GRNs |
| Test Data | None |
| Step-by-Step Instructions | 1. Open GRN Status widget/report. |
| Expected Result | Summary shows Draft/Posted/Closed counts. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-377 — GRN — Over-receipt guard

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | GRN — Over-receipt guard |
| Objective | Block receive qty exceeding PO |
| Navigation Path | Sidebar → Construction → Procurement → Goods receipts → New |
| Prerequisites | PO with fixed qty |
| Test Data | Receive qty: PO + 10 |
| Step-by-Step Instructions | 1. Attempt GRN qty exceeding PO line qty.<br>2. Observe validation error. |
| Expected Result | System warns or blocks over-receipt. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-378 — GRN — Closed edit guard

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | GRN — Closed edit guard |
| Objective | Verify closed GRN not editable |
| Navigation Path | Sidebar → Construction → Procurement → Goods receipts |
| Prerequisites | Closed GRN |
| Test Data | None |
| Step-by-Step Instructions | 1. Attempt edit closed GRN.<br>2. Observe guard. |
| Expected Result | Closed GRN locked from edits. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-379 — GRN — Print/export

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | GRN — Print/export |
| Objective | Print or export GRN |
| Navigation Path | Sidebar → Construction → Procurement → Goods receipts → Print |
| Prerequisites | Posted GRN |
| Test Data | None |
| Step-by-Step Instructions | 1. Print or export GRN document. |
| Expected Result | GRN document generates. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-380 — All bills — Create from GRN

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | All bills — Create from GRN |
| Objective | Create vendor bill from GRN |
| Navigation Path | Sidebar → Construction → Procurement → All bills → New |
| Prerequisites | Posted GRN UAT-372 |
| Test Data | Link GRN/PO to bill |
| Step-by-Step Instructions | 1. Create bill from GRN or PO.<br>2. Enter/post bill. |
| Expected Result | Vendor bill created in procurement context. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-381 — Bill approval workflow

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | Bill approval workflow |
| Objective | Submit bill for workflow approval |
| Navigation Path | Sidebar → Construction → Procurement → All bills → Submit |
| Prerequisites | Workflow enabled in Settings |
| Test Data | Bill UAT-380 |
| Step-by-Step Instructions | 1. Submit bill for approval if workflow required.<br>2. Approve as approver. |
| Expected Result | Bill workflow status updates per Settings → Preferences → Workflow. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-382 — All bills — Pay

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | All bills — Pay |
| Objective | Pay vendor bill from All bills |
| Navigation Path | Sidebar → Construction → Procurement → All bills → Pay |
| Prerequisites | Posted unpaid bill |
| Test Data | Account: HBL Current Account |
| Step-by-Step Instructions | 1. Select unpaid bill.<br>2. Click Pay → VendorBillPaymentModal.<br>3. Select bank account.<br>4. Confirm payment. |
| Expected Result | Bill marked paid; GL expense/AP entries posted. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-383 — Supplier advance

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | Supplier advance |
| Objective | Record supplier advance payment |
| Navigation Path | Sidebar → Construction → Procurement → Vendor directory → Record supplier advance |
| Prerequisites | Vendor ABC Supplies; prepaid asset account in COA |
| Test Data | Amount: 25,000<br>Prepaid asset account |
| Step-by-Step Instructions | 1. Open vendor ABC Supplies.<br>2. Record supplier advance (RecordSupplierAdvanceModal).<br>3. Select prepaid asset account.<br>4. Save. |
| Expected Result | Supplier advance recorded on vendor; available for bill allocation. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-384 — Vendor Ledger — After payment

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | Vendor Ledger — After payment |
| Objective | Verify vendor ledger after bill payment |
| Navigation Path | Sidebar → Construction → Procurement → Vendor directory → ABC Supplies → Ledger |
| Prerequisites | Payment UAT-382 |
| Test Data | Vendor: ABC Supplies |
| Step-by-Step Instructions | 1. Open Ledger tab after payment.<br>2. Review debit/credit entries and balance. |
| Expected Result | Vendor ledger balances correctly after bill payment. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-385 — GL — Bill payment impact

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | GL — Bill payment impact |
| Objective | Verify bill payment in General Ledger |
| Navigation Path | Sidebar → Financials → General Ledger |
| Prerequisites | Payment UAT-382 |
| Test Data | Bill payment transaction |
| Step-by-Step Instructions | 1. Search bill payment in GL.<br>2. Verify expense debit and bank credit (or AP clearing). |
| Expected Result | GL reflects vendor bill payment. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-386 — Settings — Procurement preferences

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | Settings — Procurement preferences |
| Objective | Review procurement settings |
| Navigation Path | Settings → Preferences → Procurement |
| Prerequisites | Settings access |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Procurement tab in Preferences.<br>2. Review PO/GRN/bill defaults.<br>3. Save if changed. |
| Expected Result | Procurement settings panel loads and saves. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-387 — PO — Cancel with GRN guard

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | PO — Cancel with GRN guard |
| Objective | Prevent invalid PO cancel after GRN |
| Navigation Path | Sidebar → Construction → Procurement → Purchase order |
| Prerequisites | PO with posted GRN |
| Test Data | PO from UAT-368 |
| Step-by-Step Instructions | 1. Attempt cancel/delete PO that has GRN.<br>2. Observe error. |
| Expected Result | System prevents invalid PO cancellation. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-388 — Line items — Text description

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | Line items — Text description |
| Objective | Verify PO lines use text not SKU |
| Navigation Path | Sidebar → Construction → Procurement → Purchase order → lines |
| Prerequisites | None |
| Test Data | Description: Cement bags 50kg |
| Step-by-Step Instructions | 1. Add PO line with free-text description.<br>2. No SKU picker required.<br>3. Save. |
| Expected Result | Line items are free-text descriptions per product design. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-389 — Real-time — bill paid sync

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | Real-time — bill paid sync |
| Objective | Verify bill payment syncs to second user |
| Navigation Path | Sidebar → Construction → Procurement → All bills (2nd session) |
| Prerequisites | Two users same tenant |
| Test Data | None |
| Step-by-Step Instructions | 1. User A pays bill.<br>2. User B sees updated bill status without F5. |
| Expected Result | Real-time invalidation updates bill list. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-390 — Audit — GRN posted

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | Audit — GRN posted |
| Objective | Audit GRN posting event |
| Navigation Path | Settings → Audit Trail |
| Prerequisites | GRN UAT-372 |
| Test Data | None |
| Step-by-Step Instructions | 1. Filter audit for GRN post event. |
| Expected Result | GRN mutation recorded in audit trail. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-391 — Audit — bill payment

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | Audit — bill payment |
| Objective | Audit vendor bill payment |
| Navigation Path | Settings → Audit Trail |
| Prerequisites | Payment UAT-382 |
| Test Data | None |
| Step-by-Step Instructions | 1. Filter audit for bill payment event. |
| Expected Result | Payment mutation audited. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-392 — Assets KPI — Open POs

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | Assets KPI — Open POs |
| Objective | Cross-check Open POs KPI on Assets |
| Navigation Path | Settings → Assets → KPI strip |
| Prerequisites | Open PO exists |
| Test Data | None |
| Step-by-Step Instructions | 1. Review Open POs KPI on Settings → Assets.<br>2. Match count to procurement open POs. |
| Expected Result | Assets KPI Open POs reflects procurement state. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-393 — Global search — Procurement

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | Global search — Procurement |
| Objective | Navigate Procurement via global search |
| Navigation Path | Global search → Procurement / Vendor directory |
| Prerequisites | None |
| Test Data | None |
| Step-by-Step Instructions | 1. Search Procurement or Vendor directory.<br>2. Open result. |
| Expected Result | Navigates to Procurement module. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-394 — Mobile procurement nav

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | Mobile procurement nav |
| Objective | Procurement sub-nav on mobile |
| Navigation Path | Sidebar → Construction → Procurement |
| Prerequisites | Viewport <768px |
| Test Data | None |
| Step-by-Step Instructions | 1. Resize to mobile.<br>2. Use dropdown for PO/GRN/Bills tabs. |
| Expected Result | Mobile procurement navigation functional. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-395 — RBAC — Procurement access

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | RBAC — Procurement access |
| Objective | Verify procurement permission gate |
| Navigation Path | Sidebar → Construction → Procurement |
| Prerequisites | User without procurement.read |
| Test Data | Restricted user |
| Step-by-Step Instructions | 1. Log in as user without procurement permission.<br>2. Verify Procurement sidebar hidden or access denied. |
| Expected Result | Procurement gated by RBAC + license. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-396 — Compare — Three vendors

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | Compare — Three vendors |
| Objective | Compare three vendor quotations |
| Navigation Path | Sidebar → Construction → Procurement → Compare |
| Prerequisites | 3 quotations |
| Test Data | None |
| Step-by-Step Instructions | 1. Select three quotations in Compare view. |
| Expected Result | Three-way comparison table displays. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-397 — Bill — Line detail

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | Bill — Line detail |
| Objective | Review bill line qty and category |
| Navigation Path | Sidebar → Construction → Procurement → All bills → bill detail |
| Prerequisites | Bill UAT-380 |
| Test Data | None |
| Step-by-Step Instructions | 1. Open bill detail.<br>2. Review line qty, description, expense category. |
| Expected Result | Bill lines show qty, description, category for Material Report cross-check in Ch.5. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-398 — End-to-end happy path

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | End-to-end happy path |
| Objective | Full Vendor → PO → GRN → Bill → Pay |
| Navigation Path | Sidebar → Construction → Procurement |
| Prerequisites | Fresh vendor or ABC Supplies |
| Test Data | Complete flow in one session |
| Step-by-Step Instructions | 1. 1. Create/verify vendor.<br>2. 2. Create quotation.<br>3. 3. Create and approve PO.<br>4. 4. Post GRN.<br>5. 5. Create and post bill.<br>6. 6. Pay bill.<br>7. 7. Verify ledger and GL. |
| Expected Result | Complete procurement lifecycle succeeds; accounting impact correct. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-399 — Construction cross-link

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | Construction cross-link |
| Objective | Verify construction Bills separate from Procurement All bills |
| Navigation Path | Project construction → Bills AND Procurement → All bills |
| Prerequisites | Bills from Ch.5 and Ch.7 |
| Test Data | None |
| Step-by-Step Instructions | 1. Compare project-scoped construction Bills vs Procurement All bills.<br>2. Note both paths for vendor payments. |
| Expected Result | Construction Bills are project-context; Procurement All bills is vendor-centric — both valid payment paths. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-400 — WhatsApp vendor comms

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | WhatsApp vendor comms |
| Objective | Review vendor WhatsApp templates if configured |
| Navigation Path | Settings → Preferences → Communication |
| Prerequisites | WhatsApp optional |
| Test Data | PO/Bill templates |
| Step-by-Step Instructions | 1. Review procurement-related communication templates. |
| Expected Result | Communication templates available for vendor messaging. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-401 — Infinite scroll — Vendor list

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | Infinite scroll — Vendor list |
| Objective | Verify paginated vendor directory |
| Navigation Path | Sidebar → Construction → Procurement → Vendor directory |
| Prerequisites | Many vendors optional |
| Test Data | None |
| Step-by-Step Instructions | 1. Scroll vendor sidebar list.<br>2. Verify load-more or pagination if 50+ vendors. |
| Expected Result | Vendor directory uses server pagination/infinite scroll in API mode. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-402 — Infinite scroll — All bills

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | Infinite scroll — All bills |
| Objective | Verify paginated All bills table |
| Navigation Path | Sidebar → Construction → Procurement → All bills |
| Prerequisites | Multiple bills |
| Test Data | None |
| Step-by-Step Instructions | 1. Scroll All bills table.<br>2. Verify load-more row in API mode. |
| Expected Result | All bills table paginates correctly. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-403 — Import vendors

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | Import vendors |
| Objective | Review vendor import via Import wizard |
| Navigation Path | Settings → Import Data wizard |
| Prerequisites | Admin access |
| Test Data | Contacts/vendors import type |
| Step-by-Step Instructions | 1. Open Import wizard.<br>2. Check vendor/contact import option.<br>3. Download template if available. |
| Expected Result | Vendor master can be imported via Contacts import path. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-404 — KPI panel — Vendors shortcut

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | KPI panel — Vendors shortcut |
| Objective | Open vendors from KPI panel |
| Navigation Path | Dashboard → KPI panel → Vendors |
| Prerequisites | None |
| Test Data | None |
| Step-by-Step Instructions | 1. Use KPI panel Vendors shortcut. |
| Expected Result | Navigates to vendor/procurement context. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-405 — Chapter completion

| Field | Value |
|-------|-------|
| Module | Procurement |
| Feature | Chapter completion |
| Objective | Procurement chapter sign-off |
| Navigation Path | Procurement module review |
| Prerequisites | Ch.7 executed |
| Test Data | Chapter checklist |
| Step-by-Step Instructions | 1. Verify vendor → PO → GRN → bill → pay → GL.<br>2. Complete checklist. |
| Expected Result | Procurement Management E2E complete. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

## Chapter Completion Checklist

- [ ] Vendor created or verified in directory
- [ ] Quotation and PO workflow complete
- [ ] GRN posted and closed
- [ ] Bill created from GRN and paid
- [ ] Vendor Analytics and audit verified

| Pass Count | Fail Count | Blocked/N/A | Observations |
|------------|------------|-------------|--------------|
| | | | |

---

# Chapter 8 — Investment Management

**Test Case Range:** UAT-406 – UAT-450

## Purpose
Verify investor accounting and investment lifecycle: equity accounts, capital contributions, profit allocation, distributions, withdrawals, and investment reports.

## Business Flow
```text
Investor Equity Account → Capital Contribution → Profit Allocation → Profit Distribution → Ledger Update → Reports
```

## Required Test Data
- Project: Sunrise Towers
- Investor equity account: Investor — Ali Capital (from Ch.2 UAT-087)
- Second investor: Investor — Sara Capital
- Bank: HBL Current Account
- Sample contribution: 1,000,000 PKR

## Dependencies
- Chapter 2 — equity account in Chart of Accounts
- Admin user (Inv Mgmt is admin-only)
- real_estate license

## Expected Outputs
- Investor equity accounts with balances
- Capital contribution recorded via transfer
- Profit distribution cycle executed
- Investor ledger and reports reconcile

## Test Cases

### UAT-406 — Open module

| Field | Value |
|-------|-------|
| Module | Investment Management |
| Feature | Open module |
| Objective | Navigate to Inv Mgmt |
| Navigation Path | Sidebar → Selling → Inv Mgmt |
| Prerequisites | Admin + real_estate license |
| Test Data | User: admin |
| Step-by-Step Instructions | 1. Sidebar → Selling → Inv Mgmt. |
| Expected Result | Investment Management page loads; sub-nav: Overview, Equity & ledger (Ledger, Profit Distribution, Equity Transfer), Reports. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-407 — Access denied — non-admin

| Field | Value |
|-------|-------|
| Module | Investment Management |
| Feature | Access denied — non-admin |
| Objective | Verify non-admin blocked from Inv Mgmt |
| Navigation Path | Sidebar → Selling → Inv Mgmt |
| Prerequisites | Non-admin user |
| Test Data | User: restricted (not Admin) |
| Step-by-Step Instructions | 1. Log in as non-admin.<br>2. Verify Inv Mgmt not in sidebar or shows access denied. |
| Expected Result | Inv Mgmt is administrator-only per InvestmentManagementPage. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-408 — Overview dashboard

| Field | Value |
|-------|-------|
| Module | Investment Management |
| Feature | Overview dashboard |
| Objective | Review investment overview KPIs |
| Navigation Path | Sidebar → Selling → Inv Mgmt → Overview |
| Prerequisites | Admin access |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Overview tab.<br>2. Review KPI cards: total capital, investor count, allocation charts, recent activity. |
| Expected Result | Overview dashboard displays investor capital metrics and charts. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-409 — Investor — Create equity account

| Field | Value |
|-------|-------|
| Module | Investment Management |
| Feature | Investor — Create equity account |
| Objective | Create second investor equity account |
| Navigation Path | Settings → Chart of Accounts → Equity → Add |
| Prerequisites | COA write access |
| Test Data | Name: Investor — Sara Capital<br>Type: Equity (Investor) |
| Step-by-Step Instructions | 1. Add equity account Investor — Sara Capital.<br>2. Save. |
| Expected Result | Second investor equity account created in COA. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-410 — Investor — Link to project

| Field | Value |
|-------|-------|
| Module | Investment Management |
| Feature | Investor — Link to project |
| Objective | Associate investor with project context |
| Navigation Path | Sidebar → Selling → Inv Mgmt → Ledger |
| Prerequisites | Project Sunrise Towers |
| Test Data | Investor: Ali Capital<br>Project: Sunrise Towers |
| Step-by-Step Instructions | 1. In Ledger or equity forms, select project Sunrise Towers for investor transactions. |
| Expected Result | Investor transactions can be scoped to project. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-411 — Capital contribution — Transfer in

| Field | Value |
|-------|-------|
| Module | Investment Management |
| Feature | Capital contribution — Transfer in |
| Objective | Record investor capital contribution |
| Navigation Path | Sidebar → Selling → Inv Mgmt → Ledger → Add Transfer OR General Ledger → Transfer |
| Prerequisites | Bank and equity accounts exist |
| Test Data | From: HBL Current Account<br>To: Investor — Ali Capital<br>Amount: 1,000,000<br>Project: Sunrise Towers |
| Step-by-Step Instructions | 1. Record Transfer from bank to investor equity account.<br>2. Enter amount and project.<br>3. Save/post. |
| Expected Result | Capital contribution recorded; investor equity balance increases. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-412 — Capital contribution — Second investor

| Field | Value |
|-------|-------|
| Module | Investment Management |
| Feature | Capital contribution — Second investor |
| Objective | Record contribution for second investor |
| Navigation Path | Sidebar → Selling → Inv Mgmt → Ledger |
| Prerequisites | Sara Capital account UAT-409 |
| Test Data | To: Investor — Sara Capital<br>Amount: 500,000 |
| Step-by-Step Instructions | 1. Record transfer to Sara Capital equity account.<br>2. Save. |
| Expected Result | Second investor balance updated. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-413 — Ledger — View

| Field | Value |
|-------|-------|
| Module | Investment Management |
| Feature | Ledger — View |
| Objective | View investor ledger |
| Navigation Path | Sidebar → Selling → Inv Mgmt → Equity & ledger → Ledger |
| Prerequisites | Contributions UAT-411/412 |
| Test Data | Project: Sunrise Towers |
| Step-by-Step Instructions | 1. Open Ledger tab.<br>2. Select project filter if available.<br>3. Review transaction rows: date, type, amount, balance. |
| Expected Result | Investor ledger lists contributions with running balance. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-414 — Ledger — Filter by investor

| Field | Value |
|-------|-------|
| Module | Investment Management |
| Feature | Ledger — Filter by investor |
| Objective | Filter ledger by investor account |
| Navigation Path | Sidebar → Selling → Inv Mgmt → Ledger → investor filter |
| Prerequisites | Multiple investors |
| Test Data | Investor: Ali Capital |
| Step-by-Step Instructions | 1. Filter ledger to Ali Capital only.<br>2. Verify transactions and balance. |
| Expected Result | Filtered ledger shows single investor activity. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-415 — Ledger — Export

| Field | Value |
|-------|-------|
| Module | Investment Management |
| Feature | Ledger — Export |
| Objective | Export investor ledger |
| Navigation Path | Sidebar → Selling → Inv Mgmt → Ledger → Export |
| Prerequisites | Ledger data exists |
| Test Data | None |
| Step-by-Step Instructions | 1. Click Export (Excel/CSV if available). |
| Expected Result | Ledger export file downloads. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-416 — Profit Distribution — Open

| Field | Value |
|-------|-------|
| Module | Investment Management |
| Feature | Profit Distribution — Open |
| Objective | Open profit distribution screen |
| Navigation Path | Sidebar → Selling → Inv Mgmt → Equity & ledger → Profit Distribution |
| Prerequisites | Project with profit data |
| Test Data | Project: Sunrise Towers |
| Step-by-Step Instructions | 1. Open Profit Distribution tab. |
| Expected Result | Profit distribution wizard/form loads with project picker and investor allocation grid. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-417 — Profit Allocation — Calculate

| Field | Value |
|-------|-------|
| Module | Investment Management |
| Feature | Profit Allocation — Calculate |
| Objective | Calculate profit allocation by share |
| Navigation Path | Sidebar → Selling → Inv Mgmt → Profit Distribution |
| Prerequisites | Contributions recorded; project P&L exists |
| Test Data | Distribution cycle: current period |
| Step-by-Step Instructions | 1. Select project Sunrise Towers.<br>2. Run calculate / preview allocation.<br>3. Review per-investor profit share %. |
| Expected Result | Profit shares calculated based on equity balances or configured percentages. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-418 — Profit Distribution — Execute

| Field | Value |
|-------|-------|
| Module | Investment Management |
| Feature | Profit Distribution — Execute |
| Objective | Execute profit distribution |
| Navigation Path | Sidebar → Selling → Inv Mgmt → Profit Distribution → Distribute |
| Prerequisites | Allocation preview UAT-417 |
| Test Data | Investors: Ali + Sara |
| Step-by-Step Instructions | 1. Confirm and execute profit distribution.<br>2. Wait for GL posting. |
| Expected Result | Distribution posted; expense and equity entries created; batch ID dist-cycle* in GL. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-419 — Profit Distribution — Verify GL

| Field | Value |
|-------|-------|
| Module | Investment Management |
| Feature | Profit Distribution — Verify GL |
| Objective | Verify distribution in General Ledger |
| Navigation Path | Sidebar → General Ledger |
| Prerequisites | Distribution UAT-418 |
| Test Data | Search: Profit Distribution |
| Step-by-Step Instructions | 1. Search GL for Profit Distribution transactions.<br>2. Verify debit expense / credit equity pattern. |
| Expected Result | GL shows profit distribution journal entries. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-420 — Equity Transfer

| Field | Value |
|-------|-------|
| Module | Investment Management |
| Feature | Equity Transfer |
| Objective | Transfer equity between investors |
| Navigation Path | Sidebar → Selling → Inv Mgmt → Equity & ledger → Equity Transfer |
| Prerequisites | Two investors with balances |
| Test Data | From: Ali Capital<br>To: Sara Capital<br>Amount: 100,000 |
| Step-by-Step Instructions | 1. Open Equity Transfer tab.<br>2. Select from/to investors.<br>3. Enter transfer amount.<br>4. Execute transfer. |
| Expected Result | Equity transferred; both investor balances updated. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-421 — Withdrawal — Validate

| Field | Value |
|-------|-------|
| Module | Investment Management |
| Feature | Withdrawal — Validate |
| Objective | Record investor withdrawal with validation |
| Navigation Path | Sidebar → Selling → Inv Mgmt → Ledger → Withdrawal OR Profit Distribution |
| Prerequisites | Investor with balance; fund availability rules |
| Test Data | Investor: Ali Capital<br>Amount: 50,000 |
| Step-by-Step Instructions | 1. Attempt investor withdrawal.<br>2. System validates against fund availability (validateWithdrawal).<br>3. Complete if allowed. |
| Expected Result | Withdrawal recorded or blocked with clear message if insufficient available funds. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-422 — Report — Investor Distribution

| Field | Value |
|-------|-------|
| Module | Investment Management |
| Feature | Report — Investor Distribution |
| Objective | Run Investor Distribution report |
| Navigation Path | Sidebar → Selling → Inv Mgmt → Reports → Investor Distribution |
| Prerequisites | Distribution UAT-418 |
| Test Data | Project: Sunrise Towers |
| Step-by-Step Instructions | 1. Open Investor Distribution report.<br>2. Run for project. |
| Expected Result | Report shows capital invested, profits received, equity balance per investor. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-423 — Report — Undistributed funds

| Field | Value |
|-------|-------|
| Module | Investment Management |
| Feature | Report — Undistributed funds |
| Objective | Run Undistributed funds report |
| Navigation Path | Sidebar → Selling → Inv Mgmt → Reports → Undistributed funds |
| Prerequisites | Project with undistributed profit |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Undistributed funds report.<br>2. Run. |
| Expected Result | Report lists undistributed profit amounts by project/investor. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-424 — Report — Profitability

| Field | Value |
|-------|-------|
| Module | Investment Management |
| Feature | Report — Profitability |
| Objective | Run Profitability report |
| Navigation Path | Sidebar → Selling → Inv Mgmt → Reports → Profitability |
| Prerequisites | Project financial data |
| Test Data | Project: Sunrise Towers |
| Step-by-Step Instructions | 1. Open Profitability tab (ProjectProfitabilityAnalytics).<br>2. Review project profitability metrics and unsold unit context. |
| Expected Result | Profitability analytics display project-level returns. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-425 — Report — Investor Fund Availability

| Field | Value |
|-------|-------|
| Module | Investment Management |
| Feature | Report — Investor Fund Availability |
| Objective | Run Investor Fund Availability report |
| Navigation Path | Sidebar → Selling → Inv Mgmt → Reports → Investor Fund Availability |
| Prerequisites | Investors with balances |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Investor Fund Availability (FundAvailabilityPage).<br>2. Review available vs committed funds per investor. |
| Expected Result | Fund availability report shows withdrawable balances. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-426 — GL cross-check — equity balance

| Field | Value |
|-------|-------|
| Module | Investment Management |
| Feature | GL cross-check — equity balance |
| Objective | Reconcile ledger balance to COA |
| Navigation Path | Inv Mgmt Ledger + Settings → Chart of Accounts |
| Prerequisites | Contributions and distributions |
| Test Data | Investor: Ali Capital |
| Step-by-Step Instructions | 1. Compare Ali Capital balance in Ledger to COA account balance. |
| Expected Result | Investor ledger balance matches equity account balance in COA. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-427 — Audit — contribution

| Field | Value |
|-------|-------|
| Module | Investment Management |
| Feature | Audit — contribution |
| Objective | Audit capital contribution event |
| Navigation Path | Settings → Audit Trail |
| Prerequisites | Contribution UAT-411 |
| Test Data | None |
| Step-by-Step Instructions | 1. Filter audit for transfer/contribution event. |
| Expected Result | Contribution mutation audited. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-428 — Audit — distribution

| Field | Value |
|-------|-------|
| Module | Investment Management |
| Feature | Audit — distribution |
| Objective | Audit profit distribution event |
| Navigation Path | Settings → Audit Trail |
| Prerequisites | Distribution UAT-418 |
| Test Data | None |
| Step-by-Step Instructions | 1. Filter audit for profit distribution event. |
| Expected Result | Distribution mutation audited. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-429 — Mobile Inv Mgmt nav

| Field | Value |
|-------|-------|
| Module | Investment Management |
| Feature | Mobile Inv Mgmt nav |
| Objective | Investment sub-nav on mobile |
| Navigation Path | Sidebar → Selling → Inv Mgmt |
| Prerequisites | Viewport <768px |
| Test Data | None |
| Step-by-Step Instructions | 1. Resize to mobile.<br>2. Use dropdown for Overview/Ledger/Reports groups. |
| Expected Result | Mobile navigation groups functional. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-430 — Global search — Inv Mgmt

| Field | Value |
|-------|-------|
| Module | Investment Management |
| Feature | Global search — Inv Mgmt |
| Objective | Find Inv Mgmt via global search |
| Navigation Path | Global search → Inv Mgmt / Investment |
| Prerequisites | Admin user |
| Test Data | None |
| Step-by-Step Instructions | 1. Search Investment or Inv Mgmt.<br>2. Open result. |
| Expected Result | Navigates to Investment Management module. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-431 — License gate

| Field | Value |
|-------|-------|
| Module | Investment Management |
| Feature | License gate |
| Objective | Verify real_estate license for Inv Mgmt |
| Navigation Path | Sidebar Selling section |
| Prerequisites | Tenant licensing |
| Test Data | None |
| Step-by-Step Instructions | 1. Verify Inv Mgmt requires real_estate license + admin role. |
| Expected Result | Inv Mgmt hidden without license or for non-admin. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-432 — Profit Distribution — Print

| Field | Value |
|-------|-------|
| Module | Investment Management |
| Feature | Profit Distribution — Print |
| Objective | Print profit distribution summary |
| Navigation Path | Sidebar → Selling → Inv Mgmt → Profit Distribution → Print |
| Prerequisites | Completed distribution |
| Test Data | None |
| Step-by-Step Instructions | 1. Print distribution summary if available. |
| Expected Result | Print preview generates. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-433 — Ledger — Deposit type

| Field | Value |
|-------|-------|
| Module | Investment Management |
| Feature | Ledger — Deposit type |
| Objective | Verify deposit/contribution row type |
| Navigation Path | Sidebar → Selling → Inv Mgmt → Ledger |
| Prerequisites | Contribution UAT-411 |
| Test Data | None |
| Step-by-Step Instructions | 1. Locate contribution row in ledger.<br>2. Verify payment type shows deposit/contribution styling. |
| Expected Result | Ledger row classified as deposit with correct amount and balance. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-434 — Ledger — Withdrawal type

| Field | Value |
|-------|-------|
| Module | Investment Management |
| Feature | Ledger — Withdrawal type |
| Objective | Verify withdrawal row type |
| Navigation Path | Sidebar → Selling → Inv Mgmt → Ledger |
| Prerequisites | Withdrawal UAT-421 if completed |
| Test Data | None |
| Step-by-Step Instructions | 1. Locate withdrawal row.<br>2. Verify withdrawal styling and negative impact on balance. |
| Expected Result | Withdrawal rows display correctly with balance reduction. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-435 — Overview — Trend chart

| Field | Value |
|-------|-------|
| Module | Investment Management |
| Feature | Overview — Trend chart |
| Objective | Review capital activity trend on Overview |
| Navigation Path | Sidebar → Selling → Inv Mgmt → Overview |
| Prerequisites | Multiple contributions over time |
| Test Data | None |
| Step-by-Step Instructions | 1. Review trend chart on Overview (last 6 months activity). |
| Expected Result | Trend chart reflects equity account activity. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-436 — Overview — Allocation pie

| Field | Value |
|-------|-------|
| Module | Investment Management |
| Feature | Overview — Allocation pie |
| Objective | Review investor allocation chart |
| Navigation Path | Sidebar → Selling → Inv Mgmt → Overview |
| Prerequisites | Two investors with balances |
| Test Data | None |
| Step-by-Step Instructions | 1. Review allocation pie/bar chart by investor. |
| Expected Result | Allocation chart shows proportional capital by investor. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-437 — Real-time sync

| Field | Value |
|-------|-------|
| Module | Investment Management |
| Feature | Real-time sync |
| Objective | Verify ledger updates across sessions |
| Navigation Path | Sidebar → Selling → Inv Mgmt → Ledger (2nd session) |
| Prerequisites | Two admin users |
| Test Data | None |
| Step-by-Step Instructions | 1. User A records contribution.<br>2. User B sees updated ledger without F5. |
| Expected Result | Real-time sync updates investor ledger. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-438 — Help — Investor equity docs

| Field | Value |
|-------|-------|
| Module | Investment Management |
| Feature | Help — Investor equity docs |
| Objective | Review in-app help for investor equity |
| Navigation Path | Settings → Customer Success OR module help |
| Prerequisites | None |
| Test Data | Search: investor equity |
| Step-by-Step Instructions | 1. Open help content for Investor Equity & Profit Distribution. |
| Expected Result | Help section documents equity accounts and distribution workflow. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-439 — COA — Equity account type

| Field | Value |
|-------|-------|
| Module | Investment Management |
| Feature | COA — Equity account type |
| Objective | Verify equity accounts use AccountType.EQUITY |
| Navigation Path | Settings → Chart of Accounts → investor accounts |
| Prerequisites | Investor accounts exist |
| Test Data | Type: Equity |
| Step-by-Step Instructions | 1. Open investor equity accounts in COA.<br>2. Verify type is Equity (Capital, Drawings, Investors). |
| Expected Result | Investor accounts correctly typed as Equity in COA. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-440 — Cross-report reconcile

| Field | Value |
|-------|-------|
| Module | Investment Management |
| Feature | Cross-report reconcile |
| Objective | Reconcile Investor Distribution vs Ledger |
| Navigation Path | Sidebar → Selling → Inv Mgmt → Reports + Ledger |
| Prerequisites | Distribution UAT-418 |
| Test Data | Investor: Ali Capital |
| Step-by-Step Instructions | 1. Compare Investor Distribution report totals to Ledger balance for Ali Capital. |
| Expected Result | Report figures reconcile with ledger within rounding tolerance. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-441 — Undistributed — After distribution

| Field | Value |
|-------|-------|
| Module | Investment Management |
| Feature | Undistributed — After distribution |
| Objective | Verify undistributed reduces after distribution |
| Navigation Path | Sidebar → Selling → Inv Mgmt → Reports → Undistributed funds |
| Prerequisites | After UAT-418 |
| Test Data | None |
| Step-by-Step Instructions | 1. Run Undistributed funds before and after distribution.<br>2. Compare amounts. |
| Expected Result | Undistributed amount decreases after profit distribution. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-442 — Fund Availability — Withdrawal block

| Field | Value |
|-------|-------|
| Module | Investment Management |
| Feature | Fund Availability — Withdrawal block |
| Objective | Verify withdrawal blocked when unavailable |
| Navigation Path | Sidebar → Selling → Inv Mgmt → Ledger / Fund Availability |
| Prerequisites | Investor with low availability |
| Test Data | Amount exceeding available |
| Step-by-Step Instructions | 1. Attempt withdrawal exceeding fund availability.<br>2. Observe validation message. |
| Expected Result | validateWithdrawal blocks excessive withdrawal with clear error. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-443 — Equity Transfer — Zero guard

| Field | Value |
|-------|-------|
| Module | Investment Management |
| Feature | Equity Transfer — Zero guard |
| Objective | Attempt zero amount equity transfer |
| Navigation Path | Sidebar → Selling → Inv Mgmt → Equity Transfer |
| Prerequisites | Transfer form open |
| Test Data | Amount: 0 |
| Step-by-Step Instructions | 1. Attempt transfer with zero amount.<br>2. Observe validation. |
| Expected Result | Validation prevents zero or invalid transfer. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-444 — Report export — Investor Distribution

| Field | Value |
|-------|-------|
| Module | Investment Management |
| Feature | Report export — Investor Distribution |
| Objective | Export Investor Distribution report |
| Navigation Path | Sidebar → Selling → Inv Mgmt → Reports → Investor Distribution → Export |
| Prerequisites | Report data |
| Test Data | None |
| Step-by-Step Instructions | 1. Export report if available. |
| Expected Result | Export file downloads. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-445 — Multiple projects

| Field | Value |
|-------|-------|
| Module | Investment Management |
| Feature | Multiple projects |
| Objective | Investor balances across projects |
| Navigation Path | Sidebar → Selling → Inv Mgmt → Ledger |
| Prerequisites | Two projects with contributions |
| Test Data | Projects: Sunrise Towers + Green Valley |
| Step-by-Step Instructions | 1. Record contributions on two projects for same investor.<br>2. Filter ledger by each project. |
| Expected Result | Investor balances tracked per project scope. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-446 — Profit category resolution

| Field | Value |
|-------|-------|
| Module | Investment Management |
| Feature | Profit category resolution |
| Objective | Verify profit distribution expense category |
| Navigation Path | Settings → Chart of Accounts |
| Prerequisites | Profit Share or Dividend category |
| Test Data | Category: Profit Share |
| Step-by-Step Instructions | 1. Verify Profit Share / Dividend expense category exists for distributions.<br>2. Used by resolveProfitDistributionExpenseCategory. |
| Expected Result | Canonical profit distribution expense category available in COA. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-447 — Legacy tab migration

| Field | Value |
|-------|-------|
| Module | Investment Management |
| Feature | Legacy tab migration |
| Objective | Verify legacy tab names redirect |
| Navigation Path | Sidebar → Selling → Inv Mgmt |
| Prerequisites | None |
| Test Data | None |
| Step-by-Step Instructions | 1. If localStorage has old tab names (Equity & ledger, Profit), verify auto-redirect to Ledger/Profitability. |
| Expected Result | Legacy Inv Mgmt tab names migrate to current labels. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-448 — End-to-end happy path

| Field | Value |
|-------|-------|
| Module | Investment Management |
| Feature | End-to-end happy path |
| Objective | Full investor lifecycle in one session |
| Navigation Path | Sidebar → Selling → Inv Mgmt |
| Prerequisites | Admin; fresh equity accounts |
| Test Data | Ali Capital full flow |
| Step-by-Step Instructions | 1. 1. Create equity account.<br>2. 2. Record capital contribution.<br>3. 3. Run profit distribution.<br>4. 4. Execute equity transfer.<br>5. 5. Run all four reports.<br>6. 6. Verify GL and audit. |
| Expected Result | Complete investor lifecycle succeeds; reports and GL reconcile. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-449 — Accounting verification summary

| Field | Value |
|-------|-------|
| Module | Investment Management |
| Feature | Accounting verification summary |
| Objective | Cross-module accounting verification |
| Navigation Path | Inv Mgmt + Accounting → Trial Balance |
| Prerequisites | Full Ch.8 data |
| Test Data | None |
| Step-by-Step Instructions | 1. Run Trial Balance.<br>2. Verify equity and profit distribution accounts balance correctly. |
| Expected Result | Trial Balance includes investor equity and distribution entries correctly. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-450 — Chapter completion

| Field | Value |
|-------|-------|
| Module | Investment Management |
| Feature | Chapter completion |
| Objective | Investment Management sign-off |
| Navigation Path | Inv Mgmt module review |
| Prerequisites | Ch.8 executed |
| Test Data | Chapter checklist |
| Step-by-Step Instructions | 1. Verify contribution → distribution → transfer → reports → GL.<br>2. Complete checklist. |
| Expected Result | Investment Management E2E complete. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

## Chapter Completion Checklist

- [ ] Inv Mgmt Overview dashboard reviewed
- [ ] Capital contributions recorded
- [ ] Profit distribution executed
- [ ] Equity Transfer tested
- [ ] Investment reports run
- [ ] GL cross-check complete

| Pass Count | Fail Count | Blocked/N/A | Observations |
|------------|------------|-------------|--------------|
| | | | |

---

# Chapter 9 — PM Cycle

**Test Case Range:** UAT-451 – UAT-480

## Purpose
Verify Project Management fee cycle: project PM configuration, cycle allocation, fee ledger, payouts, and expense base calculations.

## Business Flow
```text
Select Project → Configure PM % → Run Cycle Allocation → Fee Ledger → Record Payout
```

## Required Test Data
- Project: Sunrise Towers with construction expenses
- PM fee percentage: e.g. 5%
- Excluded cost categories configured

## Dependencies
- Chapter 5 — project expenses/bills posted
- real_estate license + financial write

## Expected Outputs
- PM cycle allocation run creates fee bills
- Fee ledger shows allocated/paid/balance
- Payout recorded against allocation

## Test Cases

### UAT-451 — Open PM cycle

| Field | Value |
|-------|-------|
| Module | PM Cycle |
| Feature | Open PM cycle |
| Objective | Navigate to PM cycle module |
| Navigation Path | Sidebar → Construction → PM cycle |
| Prerequisites | real_estate + financial write |
| Test Data | None |
| Step-by-Step Instructions | 1. Sidebar → Construction → PM cycle. |
| Expected Result | Project PM Manager screen loads. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-452 — Select project

| Field | Value |
|-------|-------|
| Module | PM Cycle |
| Feature | Select project |
| Objective | Select project for PM management |
| Navigation Path | Sidebar → Construction → PM cycle → Select Project |
| Prerequisites | Project Sunrise Towers with expenses |
| Test Data | Project: Sunrise Towers |
| Step-by-Step Instructions | 1. Use Select Project picker.<br>2. Choose Sunrise Towers. |
| Expected Result | Project context loaded; stats panel visible. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-453 — Configure PM fee

| Field | Value |
|-------|-------|
| Module | PM Cycle |
| Feature | Configure PM fee |
| Objective | Open PM configuration |
| Navigation Path | Sidebar → Construction → PM cycle → Configure |
| Prerequisites | Project selected |
| Test Data | PM fee %: 5<br>Cycle: Monthly |
| Step-by-Step Instructions | 1. Click Configure button.<br>2. Set PM fee percentage and cycle frequency.<br>3. Save. |
| Expected Result | PM configuration saved on project. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-454 — View expense stats

| Field | Value |
|-------|-------|
| Module | PM Cycle |
| Feature | View expense stats |
| Objective | Review Total Expense and Net Cost Base |
| Navigation Path | Sidebar → Construction → PM cycle |
| Prerequisites | Project with posted bills from Ch.5 |
| Test Data | None |
| Step-by-Step Instructions | 1. Review stats: Total Expense, Excluded Cost, Net Cost Base, Balance Due. |
| Expected Result | Expense stats reflect project posted expenses minus exclusions. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-455 — Excluded cost categories

| Field | Value |
|-------|-------|
| Module | PM Cycle |
| Feature | Excluded cost categories |
| Objective | Configure excluded categories in PM config |
| Navigation Path | Sidebar → Construction → PM cycle → Configure → exclusions |
| Prerequisites | PM config open |
| Test Data | Exclude: Land cost category if present |
| Step-by-Step Instructions | 1. Mark categories excluded from PM fee base.<br>2. Save. |
| Expected Result | Excluded Cost stat updates on recalculation. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-456 — Run Cycle Allocation

| Field | Value |
|-------|-------|
| Module | PM Cycle |
| Feature | Run Cycle Allocation |
| Objective | Execute cycle allocation |
| Navigation Path | Sidebar → Construction → PM cycle → Run Cycle Allocation |
| Prerequisites | PM config saved; expenses exist |
| Test Data | Cycle: current month |
| Step-by-Step Instructions | 1. Click Run Cycle Allocation.<br>2. Confirm Refresh Cycle Allocation modal if shown.<br>3. Wait for completion. |
| Expected Result | PM fee bills/allocation rows created; Fee Ledger populated. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-457 — Fee Ledger — view

| Field | Value |
|-------|-------|
| Module | PM Cycle |
| Feature | Fee Ledger — view |
| Objective | Review Fee Ledger table |
| Navigation Path | Sidebar → Construction → PM cycle → Fee Ledger |
| Prerequisites | Allocation UAT-456 |
| Test Data | None |
| Step-by-Step Instructions | 1. Review Fee Ledger columns: Type, Cycle/Ref, Date, Allocated, Paid, Balance, Action. |
| Expected Result | Ledger rows show allocation entries with balances. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-458 — Fee Ledger — allocated amount

| Field | Value |
|-------|-------|
| Module | PM Cycle |
| Feature | Fee Ledger — allocated amount |
| Objective | Verify allocated PM fee amount |
| Navigation Path | Sidebar → Construction → PM cycle → Fee Ledger |
| Prerequisites | 5% PM on net cost base |
| Test Data | Expected: 5% of Net Cost Base |
| Step-by-Step Instructions | 1. Calculate expected fee manually.<br>2. Compare to Allocated column. |
| Expected Result | Allocated amount matches PM % × Net Cost Base. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-459 — Record Payout

| Field | Value |
|-------|-------|
| Module | PM Cycle |
| Feature | Record Payout |
| Objective | Record PM fee payout |
| Navigation Path | Sidebar → Construction → PM cycle → Record Payout |
| Prerequisites | Outstanding allocation balance |
| Test Data | Account: HBL Current Account<br>Amount: allocation balance |
| Step-by-Step Instructions | 1. Click Record Payout on ledger row.<br>2. Enter payment details.<br>3. Confirm. |
| Expected Result | Paid column updated; Balance Due reduced. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-460 — Balance Due zero

| Field | Value |
|-------|-------|
| Module | PM Cycle |
| Feature | Balance Due zero |
| Objective | Verify Balance Due after full payout |
| Navigation Path | Sidebar → Construction → PM cycle |
| Prerequisites | Full payout UAT-459 |
| Test Data | None |
| Step-by-Step Instructions | 1. Review Balance Due stat after payout. |
| Expected Result | Balance Due approaches zero when fully paid. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-461 — Re-run allocation

| Field | Value |
|-------|-------|
| Module | PM Cycle |
| Feature | Re-run allocation |
| Objective | Refresh cycle allocation |
| Navigation Path | Sidebar → Construction → PM cycle → Run Cycle Allocation (again) |
| Prerequisites | Prior allocation exists |
| Test Data | Same cycle period |
| Step-by-Step Instructions | 1. Run allocation again for same cycle.<br>2. Confirm refresh/replace behavior in modal. |
| Expected Result | Allocation refreshed per system rules; no duplicate orphan bills. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-462 — Delete allocation

| Field | Value |
|-------|-------|
| Module | PM Cycle |
| Feature | Delete allocation |
| Objective | Delete PM cycle allocation if supported |
| Navigation Path | Sidebar → Construction → PM cycle → Fee Ledger → Delete/Action |
| Prerequisites | Test allocation row |
| Test Data | None |
| Step-by-Step Instructions | 1. Use delete/recalculate action on allocation if available. |
| Expected Result | Allocation removed or recalculated per UI action. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-463 — Weekly cycle

| Field | Value |
|-------|-------|
| Module | PM Cycle |
| Feature | Weekly cycle |
| Objective | Configure weekly PM cycle |
| Navigation Path | Sidebar → Construction → PM cycle → Configure |
| Prerequisites | PM config |
| Test Data | Cycle: Weekly |
| Step-by-Step Instructions | 1. Change cycle frequency to Weekly.<br>2. Save.<br>3. Run allocation. |
| Expected Result | Weekly cycle ID appears in ledger. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-464 — Yearly cycle

| Field | Value |
|-------|-------|
| Module | PM Cycle |
| Feature | Yearly cycle |
| Objective | Configure yearly PM cycle |
| Navigation Path | Sidebar → Construction → PM cycle → Configure |
| Prerequisites | PM config |
| Test Data | Cycle: Yearly |
| Step-by-Step Instructions | 1. Change to Yearly cycle.<br>2. Save. |
| Expected Result | Yearly cycle configuration saved. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-465 — Monthly cycle default

| Field | Value |
|-------|-------|
| Module | PM Cycle |
| Feature | Monthly cycle default |
| Objective | Revert to monthly cycle |
| Navigation Path | Sidebar → Construction → PM cycle → Configure |
| Prerequisites | None |
| Test Data | Cycle: Monthly |
| Step-by-Step Instructions | 1. Set cycle back to Monthly.<br>2. Save. |
| Expected Result | Monthly cycle restored. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-466 — PM Fee Log cross-check

| Field | Value |
|-------|-------|
| Module | Construction |
| Feature | PM Fee Log cross-check |
| Objective | Cross-check PM Fee Log report |
| Navigation Path | Project construction → Payouts → PM Fee Log |
| Prerequisites | PM payout UAT-459 |
| Test Data | None |
| Step-by-Step Instructions | 1. Open PM Fee Log under Project construction.<br>2. Compare to PM cycle ledger. |
| Expected Result | PM Fee Log entries consistent with PM cycle payouts. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-467 — PM Cost Report

| Field | Value |
|-------|-------|
| Module | Construction |
| Feature | PM Cost Report |
| Objective | Run PM Cost Report |
| Navigation Path | Project construction → Reports → PM Cost Report |
| Prerequisites | PM allocations exist |
| Test Data | Project: Sunrise Towers |
| Step-by-Step Instructions | 1. Run PM Cost Report. |
| Expected Result | PM costs summarized in construction reports. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-468 — Expense distribution screen **[NOT IMPLEMENTED]**

| Field | Value |
|-------|-------|
| Module | PM Cycle |
| Feature | Expense distribution screen |
| Objective | Verify no standalone expense distribution UI |
| Navigation Path | Sidebar → Construction → PM cycle |
| Prerequisites | None |
| Test Data | None |
| Step-by-Step Instructions | 1. Search for Expense Distribution menu/report. |
| Expected Result | NOT IMPLEMENTED — expense distribution is via allocation mechanism and stats (Total/Excluded/Net Cost Base). |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks | Use PM cycle stats and Run Cycle Allocation instead. |

### UAT-469 — GL — PM fee bill

| Field | Value |
|-------|-------|
| Module | PM Cycle |
| Feature | GL — PM fee bill |
| Objective | Verify PM fee bill in General Ledger |
| Navigation Path | Sidebar → General Ledger |
| Prerequisites | Allocation UAT-456 |
| Test Data | None |
| Step-by-Step Instructions | 1. Search PM fee bill transaction in GL. |
| Expected Result | PM fee expense and liability entries posted. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-470 — Audit — allocation run

| Field | Value |
|-------|-------|
| Module | PM Cycle |
| Feature | Audit — allocation run |
| Objective | Audit cycle allocation event |
| Navigation Path | Settings → Audit Trail |
| Prerequisites | Allocation UAT-456 |
| Test Data | None |
| Step-by-Step Instructions | 1. Filter audit for PM allocation event. |
| Expected Result | Allocation mutation audited. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-471 — Project without expenses

| Field | Value |
|-------|-------|
| Module | PM Cycle |
| Feature | Project without expenses |
| Objective | Run allocation on project with zero expenses |
| Navigation Path | Sidebar → Construction → PM cycle |
| Prerequisites | Project Green Valley (inactive/minimal) |
| Test Data | Project: Green Valley |
| Step-by-Step Instructions | 1. Select project with no/minimal expenses.<br>2. Run Cycle Allocation. |
| Expected Result | Allocated fee zero or minimal; no erroneous bills. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-472 — Multiple cycles history

| Field | Value |
|-------|-------|
| Module | PM Cycle |
| Feature | Multiple cycles history |
| Objective | Review multiple cycle rows in ledger |
| Navigation Path | Sidebar → Construction → PM cycle → Fee Ledger |
| Prerequisites | 2+ allocations different months |
| Test Data | None |
| Step-by-Step Instructions | 1. Run allocation for two different months.<br>2. Review ledger history. |
| Expected Result | Multiple cycle/ref rows listed chronologically. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-473 — Partial payout

| Field | Value |
|-------|-------|
| Module | PM Cycle |
| Feature | Partial payout |
| Objective | Record partial PM payout |
| Navigation Path | Sidebar → Construction → PM cycle → Record Payout |
| Prerequisites | Allocation with balance |
| Test Data | Pay 50% of balance |
| Step-by-Step Instructions | 1. Record partial payout amount. |
| Expected Result | Paid shows partial; Balance remains. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-474 — Configure modal cancel

| Field | Value |
|-------|-------|
| Module | PM Cycle |
| Feature | Configure modal cancel |
| Objective | Cancel PM configure without saving |
| Navigation Path | Sidebar → Construction → PM cycle → Configure → Cancel |
| Prerequisites | None |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Configure.<br>2. Change values.<br>3. Cancel without save.<br>4. Reopen — verify unchanged. |
| Expected Result | Unsaved changes discarded. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-475 — Real-time sync

| Field | Value |
|-------|-------|
| Module | PM Cycle |
| Feature | Real-time sync |
| Objective | Second user sees allocation |
| Navigation Path | Sidebar → Construction → PM cycle |
| Prerequisites | Two sessions |
| Test Data | None |
| Step-by-Step Instructions | 1. User A runs allocation.<br>2. User B refreshes PM cycle view. |
| Expected Result | Fee ledger updates via real-time sync. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-476 — License gate

| Field | Value |
|-------|-------|
| Module | PM Cycle |
| Feature | License gate |
| Objective | Verify PM cycle license gate |
| Navigation Path | Sidebar Construction |
| Prerequisites | Tenant licensing |
| Test Data | None |
| Step-by-Step Instructions | 1. Verify PM cycle requires real_estate license. |
| Expected Result | PM cycle hidden without license. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-477 — Mobile PM cycle

| Field | Value |
|-------|-------|
| Module | PM Cycle |
| Feature | Mobile PM cycle |
| Objective | PM cycle on mobile viewport |
| Navigation Path | Sidebar → Construction → PM cycle |
| Prerequisites | Viewport <768px |
| Test Data | None |
| Step-by-Step Instructions | 1. Open PM cycle on mobile/tablet width. |
| Expected Result | PM cycle UI usable on smaller screens. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-478 — Global search

| Field | Value |
|-------|-------|
| Module | PM Cycle |
| Feature | Global search |
| Objective | Find PM Cycle via global search |
| Navigation Path | Global search → PM Cycle |
| Prerequisites | None |
| Test Data | None |
| Step-by-Step Instructions | 1. Search PM Cycle.<br>2. Open result. |
| Expected Result | Navigates to PM cycle page. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-479 — Excluded cost recalc

| Field | Value |
|-------|-------|
| Module | PM Cycle |
| Feature | Excluded cost recalc |
| Objective | Verify Net Cost Base after exclusion change |
| Navigation Path | Sidebar → Construction → PM cycle |
| Prerequisites | Allocation not yet run after exclusion change |
| Test Data | Add new exclusion |
| Step-by-Step Instructions | 1. Change excluded categories.<br>2. Review Net Cost Base before allocation. |
| Expected Result | Net Cost Base = Total Expense − Excluded Cost. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-480 — Chapter completion

| Field | Value |
|-------|-------|
| Module | PM Cycle |
| Feature | Chapter completion |
| Objective | PM cycle chapter sign-off |
| Navigation Path | PM cycle review |
| Prerequisites | Ch.9 executed |
| Test Data | Checklist |
| Step-by-Step Instructions | 1. Config, allocation, payout, reports verified.<br>2. Complete checklist. |
| Expected Result | PM cycle E2E complete. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

## Chapter Completion Checklist

- [ ] Project selected in PM cycle
- [ ] PM config saved
- [ ] Cycle allocation executed
- [ ] Fee ledger balanced
- [ ] Payout recorded

| Pass Count | Fail Count | Blocked/N/A | Observations |
|------------|------------|-------------|--------------|
| | | | |

---

# Chapter 10 — Budget Management

**Test Case Range:** UAT-481 – UAT-510

## Purpose
Verify project budget planning and monitoring: budget creation, revision, spend tracking, and Budget vs Actual variance reporting.

## Business Flow
```text
Budget Planner → Select Project → Set category budgets → Monitor spend → Budget vs Actual Report
```

## Required Test Data
- Project: Sunrise Towers
- Categories: Construction Material Cost, Civil Works
- Budget goals: Material 1,000,000; Civil 2,000,000

## Dependencies
- Chapter 2 — project and expense categories
- Chapter 5 — some spend posted for variance

## Expected Outputs
- Category budgets saved per project
- Spent and Remaining columns update after bills
- Budget vs Actual report shows variance

## Test Cases

### UAT-481 — Open Budget Planner

| Field | Value |
|-------|-------|
| Module | Budget |
| Feature | Open Budget Planner |
| Objective | Navigate to Budget Planner |
| Navigation Path | Sidebar → Financials → Budget Planner |
| Prerequisites | Financial write access |
| Test Data | None |
| Step-by-Step Instructions | 1. Sidebar → Financials → Budget Planner. |
| Expected Result | Project Budget Planner page loads. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-482 — Select project

| Field | Value |
|-------|-------|
| Module | Budget |
| Feature | Select project |
| Objective | Select project to configure budgets |
| Navigation Path | Sidebar → Financials → Budget Planner → Select a Project to Configure |
| Prerequisites | Sunrise Towers exists |
| Test Data | Project: Sunrise Towers |
| Step-by-Step Instructions | 1. Select Sunrise Towers from project picker. |
| Expected Result | Budget grid loads for project expense categories. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-483 — Summary cards

| Field | Value |
|-------|-------|
| Module | Budget |
| Feature | Summary cards |
| Objective | Review budget summary cards |
| Navigation Path | Sidebar → Financials → Budget Planner |
| Prerequisites | Project selected |
| Test Data | None |
| Step-by-Step Instructions | 1. Review cards: Total Budget, Total Spent, Remaining. |
| Expected Result | Summary cards display aggregate figures. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-484 — Set category budget

| Field | Value |
|-------|-------|
| Module | Budget |
| Feature | Set category budget |
| Objective | Enter budget goal for category |
| Navigation Path | Sidebar → Financials → Budget Planner → Category row → Budget Goal |
| Prerequisites | Category: Construction Material Cost |
| Test Data | Budget Goal: 1,000,000 |
| Step-by-Step Instructions | 1. Enter 1,000,000 in Budget Goal for Construction Material Cost.<br>2. Save if explicit save or auto-save. |
| Expected Result | Budget goal saved; Remaining = Goal − Spent. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-485 — Set second category budget

| Field | Value |
|-------|-------|
| Module | Budget |
| Feature | Set second category budget |
| Objective | Enter budget for second category |
| Navigation Path | Sidebar → Financials → Budget Planner |
| Prerequisites | Project selected |
| Test Data | Category: Civil Works<br>Budget: 2,000,000 |
| Step-by-Step Instructions | 1. Enter 2,000,000 for Civil Works category.<br>2. Save. |
| Expected Result | Second category budget saved; Total Budget updates. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-486 — Spent column

| Field | Value |
|-------|-------|
| Module | Budget |
| Feature | Spent column |
| Objective | Verify Spent column after construction bills |
| Navigation Path | Sidebar → Financials → Budget Planner |
| Prerequisites | Bills posted Ch.5 |
| Test Data | Category with bill spend |
| Step-by-Step Instructions | 1. Review Spent column for categories with posted bills.<br>2. Compare to known bill amounts. |
| Expected Result | Spent reflects actual posted expenses by category. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-487 — Remaining column

| Field | Value |
|-------|-------|
| Module | Budget |
| Feature | Remaining column |
| Objective | Verify Remaining calculation |
| Navigation Path | Sidebar → Financials → Budget Planner |
| Prerequisites | Budget and spend exist |
| Test Data | None |
| Step-by-Step Instructions | 1. Verify Remaining = Budget Goal − Spent for each row. |
| Expected Result | Remaining calculates correctly. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-488 — Progress bar

| Field | Value |
|-------|-------|
| Module | Budget |
| Feature | Progress bar |
| Objective | Verify progress percentage |
| Navigation Path | Sidebar → Financials → Budget Planner |
| Prerequisites | Budget goal and spend |
| Test Data | None |
| Step-by-Step Instructions | 1. Review Progress column/bar (% used).<br>2. Verify % = Spent/Goal × 100. |
| Expected Result | Progress percentage displays accurately. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-489 — Revise budget — increase

| Field | Value |
|-------|-------|
| Module | Budget |
| Feature | Revise budget — increase |
| Objective | Increase budget goal (revision) |
| Navigation Path | Sidebar → Financials → Budget Planner |
| Prerequisites | Existing budget UAT-484 |
| Test Data | New goal: 1,200,000 |
| Step-by-Step Instructions | 1. Change Construction Material Cost budget from 1M to 1.2M.<br>2. Save. |
| Expected Result | Budget revised; Remaining recalculated. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-490 — Revise budget — decrease

| Field | Value |
|-------|-------|
| Module | Budget |
| Feature | Revise budget — decrease |
| Objective | Decrease budget goal |
| Navigation Path | Sidebar → Financials → Budget Planner |
| Prerequisites | Existing budget |
| Test Data | New goal: 900,000 |
| Step-by-Step Instructions | 1. Decrease budget goal below spent if allowed.<br>2. Observe warning if spent exceeds new goal. |
| Expected Result | System handles over-budget revision per rules. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-491 — Zero budget category

| Field | Value |
|-------|-------|
| Module | Budget |
| Feature | Zero budget category |
| Objective | Set zero budget on unused category |
| Navigation Path | Sidebar → Financials → Budget Planner |
| Prerequisites | Unused category |
| Test Data | Budget Goal: 0 |
| Step-by-Step Instructions | 1. Set unused category budget to 0. |
| Expected Result | Zero budget saved; progress N/A or 0%. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-492 — Switch project

| Field | Value |
|-------|-------|
| Module | Budget |
| Feature | Switch project |
| Objective | Configure budget on second project |
| Navigation Path | Sidebar → Financials → Budget Planner |
| Prerequisites | Green Valley project |
| Test Data | Project: Green Valley |
| Step-by-Step Instructions | 1. Switch project picker to Green Valley.<br>2. Enter sample budgets. |
| Expected Result | Separate budget set per project; no cross-project leakage. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-493 — Budget vs Actual report

| Field | Value |
|-------|-------|
| Module | Construction |
| Feature | Budget vs Actual report |
| Objective | Run Budget vs Actual report |
| Navigation Path | Project construction → Reports → Operations → Budget vs Actual |
| Prerequisites | Budgets UAT-484/485; bills Ch.5 |
| Test Data | Project: Sunrise Towers |
| Step-by-Step Instructions | 1. Open Budget vs Actual report.<br>2. Select Sunrise Towers.<br>3. Run. |
| Expected Result | Report shows budgeted vs actual by category with variance. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-494 — Report variance — over budget

| Field | Value |
|-------|-------|
| Module | Budget |
| Feature | Report variance — over budget |
| Objective | Identify over-budget category in report |
| Navigation Path | Budget vs Actual report |
| Prerequisites | Category where Spent > Goal |
| Test Data | None |
| Step-by-Step Instructions | 1. Run report.<br>2. Locate category over 100% utilization. |
| Expected Result | Over-budget categories highlighted or show positive variance. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-495 — Report variance — under budget

| Field | Value |
|-------|-------|
| Module | Budget |
| Feature | Report variance — under budget |
| Objective | Identify under-budget category |
| Navigation Path | Budget vs Actual report |
| Prerequisites | Category with low spend |
| Test Data | None |
| Step-by-Step Instructions | 1. Locate under-utilized category in report. |
| Expected Result | Under-budget variance displayed. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-496 — Export Budget vs Actual

| Field | Value |
|-------|-------|
| Module | Budget |
| Feature | Export Budget vs Actual |
| Objective | Export variance report |
| Navigation Path | Budget vs Actual → Export |
| Prerequisites | Report data |
| Test Data | None |
| Step-by-Step Instructions | 1. Export report CSV/Excel if available. |
| Expected Result | Export file downloads. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-497 — Import budgets template

| Field | Value |
|-------|-------|
| Module | Budget |
| Feature | Import budgets template |
| Objective | Download budgets import template |
| Navigation Path | Settings → Import Data wizard → Download Budgets Template |
| Prerequisites | Admin access |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Import wizard.<br>2. Download Budgets Template.<br>3. Review columns. |
| Expected Result | Template downloads; import path available (note Phase 2 maturity in wizard). |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-498 — Org-wide budget N/A **[NOT IMPLEMENTED]**

| Field | Value |
|-------|-------|
| Module | Budget |
| Feature | Org-wide budget N/A |
| Objective | Verify no org-wide non-project budget |
| Navigation Path | Sidebar → Financials → Budget Planner |
| Prerequisites | None |
| Test Data | None |
| Step-by-Step Instructions | 1. Confirm Budget Planner requires project selection.<br>2. No org-level budget screen. |
| Expected Result | NOT IMPLEMENTED — budgets are project-specific only. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks | Budget Planner is project-scoped by design. |

### UAT-499 — Budget revision audit

| Field | Value |
|-------|-------|
| Module | Budget |
| Feature | Budget revision audit |
| Objective | Audit budget change |
| Navigation Path | Settings → Audit Trail |
| Prerequisites | Budget revision UAT-489 |
| Test Data | None |
| Step-by-Step Instructions | 1. Filter audit for budget update event. |
| Expected Result | Budget mutation audited if applicable. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-500 — Real-time spend update

| Field | Value |
|-------|-------|
| Module | Budget |
| Feature | Real-time spend update |
| Objective | Verify Spent updates after new bill |
| Navigation Path | Sidebar → Financials → Budget Planner |
| Prerequisites | Two sessions or after new bill |
| Test Data | New bill 50,000 in category |
| Step-by-Step Instructions | 1. Post new bill in construction.<br>2. Return to Budget Planner.<br>3. Verify Spent increased. |
| Expected Result | Spent column updates after bill posting (real-time or refresh). |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-501 — Empty project budget

| Field | Value |
|-------|-------|
| Module | Budget |
| Feature | Empty project budget |
| Objective | Open project with no budgets set |
| Navigation Path | Sidebar → Financials → Budget Planner |
| Prerequisites | Project without budgets |
| Test Data | Project: Green Valley (fresh) |
| Step-by-Step Instructions | 1. Select project with no budget goals.<br>2. Review empty grid. |
| Expected Result | Grid shows categories with zero/null goals. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-502 — Category column sort

| Field | Value |
|-------|-------|
| Module | Budget |
| Feature | Category column sort |
| Objective | Sort/filter budget grid if available |
| Navigation Path | Sidebar → Financials → Budget Planner |
| Prerequisites | Multiple categories |
| Test Data | None |
| Step-by-Step Instructions | 1. Use column sort or search if available. |
| Expected Result | Grid sorting/filtering works. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-503 — Mobile budget planner

| Field | Value |
|-------|-------|
| Module | Budget |
| Feature | Mobile budget planner |
| Objective | Budget Planner on mobile |
| Navigation Path | Sidebar → Financials → Budget Planner |
| Prerequisites | Viewport <768px |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Budget Planner on mobile width. |
| Expected Result | UI usable on smaller screens. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-504 — Global search

| Field | Value |
|-------|-------|
| Module | Budget |
| Feature | Global search |
| Objective | Find Budget Planner via search |
| Navigation Path | Global search → Budget Planner |
| Prerequisites | None |
| Test Data | None |
| Step-by-Step Instructions | 1. Search Budget Planner.<br>2. Open result. |
| Expected Result | Navigates to Budget Planner. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-505 — Sidebar label

| Field | Value |
|-------|-------|
| Module | Budget |
| Feature | Sidebar label |
| Objective | Verify sidebar label is Budget Planner |
| Navigation Path | Sidebar → Financials |
| Prerequisites | None |
| Test Data | None |
| Step-by-Step Instructions | 1. Confirm menu label is Budget Planner not Budget Management. |
| Expected Result | Exact label: Budget Planner. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-506 — Cross-chapter utilization

| Field | Value |
|-------|-------|
| Module | Budget |
| Feature | Cross-chapter utilization |
| Objective | Cross-check Ch.5 budget utilization KPI case |
| Navigation Path | Budget Planner + Ch.5 UAT-251 |
| Prerequisites | Construction bills posted |
| Test Data | None |
| Step-by-Step Instructions | 1. Compare Budget Planner progress to construction Budget vs Actual. |
| Expected Result | Figures consistent across Budget Planner and report. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-507 — Petty cash in spent

| Field | Value |
|-------|-------|
| Module | Budget |
| Feature | Petty cash in spent |
| Objective | Verify petty cash vouchers in spent |
| Navigation Path | Sidebar → Financials → Budget Planner |
| Prerequisites | Petty cash voucher Ch.5 UAT-220 |
| Test Data | Category: Construction Material Cost |
| Step-by-Step Instructions | 1. Review if petty cash voucher increased Spent in matching category. |
| Expected Result | Petty cash expenses included in spent totals. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-508 — Permission gate

| Field | Value |
|-------|-------|
| Module | Budget |
| Feature | Permission gate |
| Objective | Verify budget access by role |
| Navigation Path | Sidebar → Financials → Budget Planner |
| Prerequisites | User without financial write |
| Test Data | Restricted user |
| Step-by-Step Instructions | 1. Log in as user without budget access.<br>2. Attempt to open Budget Planner. |
| Expected Result | Access denied or read-only per RBAC. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-509 — Report print

| Field | Value |
|-------|-------|
| Module | Budget |
| Feature | Report print |
| Objective | Print Budget vs Actual |
| Navigation Path | Budget vs Actual → Print |
| Prerequisites | Report data |
| Test Data | None |
| Step-by-Step Instructions | 1. Print report. |
| Expected Result | Print preview generates. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-510 — Chapter completion

| Field | Value |
|-------|-------|
| Module | Budget |
| Feature | Chapter completion |
| Objective | Budget chapter sign-off |
| Navigation Path | Budget module review |
| Prerequisites | Ch.10 executed |
| Test Data | Checklist |
| Step-by-Step Instructions | 1. Budgets set, revised, monitored, report run.<br>2. Complete checklist. |
| Expected Result | Budget management E2E complete. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

## Chapter Completion Checklist

- [ ] Budget goals entered
- [ ] Progress % displays
- [ ] Spent matches construction bills
- [ ] Budget vs Actual report run

| Pass Count | Fail Count | Blocked/N/A | Observations |
|------------|------------|-------------|--------------|
| | | | |

---

# Chapter 11 — Personal Transactions

**Test Case Range:** UAT-511 – UAT-540

## Purpose
Verify personal finance module for administrators: personal accounts, income, expense, transfers, loans, tasks, and personal reports.

## Business Flow
```text
Personal transactions → My wallets → Transactions (Income/Expense/Transfer) → Loan manager → Settings (categories)
```

## Required Test Data
- Admin user only (company_admin or super_admin)
- Personal wallet accounts
- Sample income 10,000; expense 3,000

## Dependencies
- Chapter 1 — admin user
- Chapter 2 — bank accounts for transfers optional

## Expected Outputs
- Personal income and expense recorded
- Transfer between wallets works
- Loan manager tracks give/receive/repay

## Test Cases

### UAT-511 — Open module — admin

| Field | Value |
|-------|-------|
| Module | Personal |
| Feature | Open module — admin |
| Objective | Navigate to Personal transactions as admin |
| Navigation Path | Sidebar → Financials → Personal transactions |
| Prerequisites | company_admin or super_admin |
| Test Data | User: admin |
| Step-by-Step Instructions | 1. Log in as admin.<br>2. Sidebar → Financials → Personal transactions. |
| Expected Result | Personal transactions page loads with sub-tabs. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-462 — Access denied — non-admin

| Field | Value |
|-------|-------|
| Module | Personal |
| Feature | Access denied — non-admin |
| Objective | Verify non-admin blocked |
| Navigation Path | Sidebar → Financials → Personal transactions |
| Prerequisites | Non-admin user |
| Test Data | User: restricted (not admin) |
| Step-by-Step Instructions | 1. Log in as non-admin.<br>2. Attempt Personal transactions via URL/search. |
| Expected Result | Access denied message; module not in sidebar for non-admin. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-463 — My wallets — Add wallet

| Field | Value |
|-------|-------|
| Module | Personal |
| Feature | My wallets — Add wallet |
| Objective | Create personal wallet account |
| Navigation Path | Sidebar → Financials → Personal transactions → My wallets → Add |
| Prerequisites | Admin access |
| Test Data | Wallet: Personal Cash<br>Opening: 5,000 |
| Step-by-Step Instructions | 1. Open My wallets tab.<br>2. Add wallet Personal Cash.<br>3. Set opening balance.<br>4. Save. |
| Expected Result | Wallet created and listed. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-464 — My wallets — Second wallet

| Field | Value |
|-------|-------|
| Module | Personal |
| Feature | My wallets — Second wallet |
| Objective | Create second wallet for transfers |
| Navigation Path | Sidebar → Financials → Personal transactions → My wallets |
| Prerequisites | Admin access |
| Test Data | Wallet: Personal Bank<br>Opening: 20,000 |
| Step-by-Step Instructions | 1. Add second wallet Personal Bank.<br>2. Save. |
| Expected Result | Two wallets available for transfers. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-465 — Transactions — Record income

| Field | Value |
|-------|-------|
| Module | Personal |
| Feature | Transactions — Record income |
| Objective | Record personal income |
| Navigation Path | Sidebar → Financials → Personal transactions → Transactions → Add Income |
| Prerequisites | Wallet exists |
| Test Data | Amount: 10,000<br>Category: Personal income category<br>Wallet: Personal Cash |
| Step-by-Step Instructions | 1. Add income transaction.<br>2. Enter amount, category, wallet.<br>3. Save. |
| Expected Result | Income recorded; wallet balance increased. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-466 — Transactions — Record expense

| Field | Value |
|-------|-------|
| Module | Personal |
| Feature | Transactions — Record expense |
| Objective | Record personal expense |
| Navigation Path | Sidebar → Financials → Personal transactions → Transactions → Add Expense |
| Prerequisites | Wallet exists |
| Test Data | Amount: 3,000<br>Category: Personal expense<br>Wallet: Personal Cash |
| Step-by-Step Instructions | 1. Add expense transaction.<br>2. Save. |
| Expected Result | Expense recorded; wallet balance decreased. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-467 — Transactions — Transfer

| Field | Value |
|-------|-------|
| Module | Personal |
| Feature | Transactions — Transfer |
| Objective | Transfer between personal wallets |
| Navigation Path | Sidebar → Financials → Personal transactions → Transactions → Transfer |
| Prerequisites | Two wallets UAT-463/464 |
| Test Data | From: Personal Bank<br>To: Personal Cash<br>Amount: 5,000 |
| Step-by-Step Instructions | 1. Create transfer between wallets.<br>2. Save. |
| Expected Result | Transfer recorded; both wallet balances updated. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-468 — Transactions — Edit

| Field | Value |
|-------|-------|
| Module | Personal |
| Feature | Transactions — Edit |
| Objective | Edit personal transaction |
| Navigation Path | Sidebar → Financials → Personal transactions → Transactions → Edit |
| Prerequisites | Transaction UAT-465 |
| Test Data | Amount: 10,500 |
| Step-by-Step Instructions | 1. Edit income amount.<br>2. Save. |
| Expected Result | Transaction updated; balances recalculated. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-469 — Transactions — Delete

| Field | Value |
|-------|-------|
| Module | Personal |
| Feature | Transactions — Delete |
| Objective | Delete personal transaction |
| Navigation Path | Sidebar → Financials → Personal transactions → Transactions → Delete |
| Prerequisites | Deletable test transaction |
| Test Data | Create temp expense then delete |
| Step-by-Step Instructions | 1. Delete test transaction.<br>2. Confirm. |
| Expected Result | Transaction removed; wallet balance restored. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-470 — Settings — Personal categories

| Field | Value |
|-------|-------|
| Module | Personal |
| Feature | Settings — Personal categories |
| Objective | Manage personal income/expense categories |
| Navigation Path | Sidebar → Financials → Personal transactions → Settings |
| Prerequisites | Admin access |
| Test Data | Category: Freelance Income |
| Step-by-Step Instructions | 1. Open Settings tab.<br>2. Add personal category Freelance Income.<br>3. Save. |
| Expected Result | Category available in transaction forms. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-471 — Loan manager — Give loan

| Field | Value |
|-------|-------|
| Module | Personal |
| Feature | Loan manager — Give loan |
| Objective | Record loan given |
| Navigation Path | Sidebar → Financials → Personal transactions → Loan manager → Give |
| Prerequisites | Admin access |
| Test Data | Party: Friend A<br>Amount: 50,000<br>Wallet: Personal Bank |
| Step-by-Step Instructions | 1. Open Loan manager.<br>2. Record Give loan.<br>3. Save. |
| Expected Result | Loan given recorded; outstanding balance tracked. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-472 — Loan manager — Receive repayment

| Field | Value |
|-------|-------|
| Module | Personal |
| Feature | Loan manager — Receive repayment |
| Objective | Record loan repayment collected |
| Navigation Path | Sidebar → Financials → Personal transactions → Loan manager → Collect/Repay |
| Prerequisites | Loan UAT-471 |
| Test Data | Amount: 10,000 |
| Step-by-Step Instructions | 1. Record Collect/Repay on loan.<br>2. Save. |
| Expected Result | Outstanding loan balance reduced. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-473 — Loan manager — Receive loan

| Field | Value |
|-------|-------|
| Module | Personal |
| Feature | Loan manager — Receive loan |
| Objective | Record loan received |
| Navigation Path | Sidebar → Financials → Personal transactions → Loan manager → Receive |
| Prerequisites | Admin access |
| Test Data | Party: Friend B<br>Amount: 25,000 |
| Step-by-Step Instructions | 1. Record Receive loan.<br>2. Save. |
| Expected Result | Loan liability tracked. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-474 — Loan manager — Repay loan

| Field | Value |
|-------|-------|
| Module | Personal |
| Feature | Loan manager — Repay loan |
| Objective | Repay borrowed loan |
| Navigation Path | Sidebar → Financials → Personal transactions → Loan manager → Repay |
| Prerequisites | Loan UAT-473 |
| Test Data | Amount: 5,000 |
| Step-by-Step Instructions | 1. Record Repay on received loan.<br>2. Save. |
| Expected Result | Loan liability reduced. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-475 — My Tasks

| Field | Value |
|-------|-------|
| Module | Personal |
| Feature | My Tasks |
| Objective | View personal tasks tab |
| Navigation Path | Sidebar → Financials → Personal transactions → My Tasks |
| Prerequisites | Admin access |
| Test Data | None |
| Step-by-Step Instructions | 1. Open My Tasks tab.<br>2. Add task if feature available.<br>3. Mark complete. |
| Expected Result | Tasks tab functional for personal task tracking. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-476 — Transactions — Filter by date

| Field | Value |
|-------|-------|
| Module | Personal |
| Feature | Transactions — Filter by date |
| Objective | Filter personal transactions by date range |
| Navigation Path | Sidebar → Financials → Personal transactions → Transactions → date filter |
| Prerequisites | Multiple transactions |
| Test Data | Range: current month |
| Step-by-Step Instructions | 1. Apply date filter.<br>2. Verify filtered list. |
| Expected Result | Only transactions in range shown. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-477 — Transactions — Filter by wallet

| Field | Value |
|-------|-------|
| Module | Personal |
| Feature | Transactions — Filter by wallet |
| Objective | Filter by wallet |
| Navigation Path | Sidebar → Financials → Personal transactions → Transactions |
| Prerequisites | Multi-wallet transactions |
| Test Data | Wallet: Personal Cash |
| Step-by-Step Instructions | 1. Filter by Personal Cash wallet. |
| Expected Result | Only Personal Cash transactions shown. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-478 — Global search — Loan Manager

| Field | Value |
|-------|-------|
| Module | Personal |
| Feature | Global search — Loan Manager |
| Objective | Navigate Loan Manager via global search |
| Navigation Path | Global search → Loan Manager |
| Prerequisites | Admin access |
| Test Data | None |
| Step-by-Step Instructions | 1. Search Loan Manager under Financials.<br>2. Open — should route to personal loans or legacy deep link. |
| Expected Result | Loan Manager accessible (nested under Personal transactions in sidebar). |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-479 — Sidebar label exact

| Field | Value |
|-------|-------|
| Module | Personal |
| Feature | Sidebar label exact |
| Objective | Verify sidebar label Personal transactions |
| Navigation Path | Sidebar → Financials |
| Prerequisites | Admin logged in |
| Test Data | None |
| Step-by-Step Instructions | 1. Confirm exact label: Personal transactions (lowercase t). |
| Expected Result | Label matches: Personal transactions. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-480 — Separation from GL

| Field | Value |
|-------|-------|
| Module | Personal |
| Feature | Separation from GL |
| Objective | Verify personal transactions separate from business GL |
| Navigation Path | Personal transactions vs General Ledger |
| Prerequisites | Personal txn UAT-465 |
| Test Data | None |
| Step-by-Step Instructions | 1. Confirm personal transactions do not appear in business General Ledger OR appear in separate personal ledger per design. |
| Expected Result | Personal finance isolated from company GL per product design. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-481 — Wallet balance report

| Field | Value |
|-------|-------|
| Module | Personal |
| Feature | Wallet balance report |
| Objective | Review wallet balances on My wallets |
| Navigation Path | Sidebar → Financials → Personal transactions → My wallets |
| Prerequisites | Transactions UAT-465-467 |
| Test Data | None |
| Step-by-Step Instructions | 1. Review current balance on each wallet.<br>2. Manual reconcile with transactions. |
| Expected Result | Wallet balances match transaction history. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-482 — Income report/summary

| Field | Value |
|-------|-------|
| Module | Personal |
| Feature | Income report/summary |
| Objective | View personal income summary if shown |
| Navigation Path | Sidebar → Financials → Personal transactions → Transactions |
| Prerequisites | Income recorded |
| Test Data | None |
| Step-by-Step Instructions | 1. Review income totals/summary on transactions view. |
| Expected Result | Income totals visible. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-483 — Expense report/summary

| Field | Value |
|-------|-------|
| Module | Personal |
| Feature | Expense report/summary |
| Objective | View personal expense summary |
| Navigation Path | Sidebar → Financials → Personal transactions → Transactions |
| Prerequisites | Expenses recorded |
| Test Data | None |
| Step-by-Step Instructions | 1. Review expense totals. |
| Expected Result | Expense totals visible. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-484 — Transfer report

| Field | Value |
|-------|-------|
| Module | Personal |
| Feature | Transfer report |
| Objective | Review transfer history |
| Navigation Path | Sidebar → Financials → Personal transactions → Transactions → type Transfer |
| Prerequisites | Transfer UAT-467 |
| Test Data | None |
| Step-by-Step Instructions | 1. Filter or view transfer transactions. |
| Expected Result | Transfer history listed. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-485 — Loan outstanding report

| Field | Value |
|-------|-------|
| Module | Personal |
| Feature | Loan outstanding report |
| Objective | Review loan outstanding balances |
| Navigation Path | Sidebar → Financials → Personal transactions → Loan manager |
| Prerequisites | Loans UAT-471/473 |
| Test Data | None |
| Step-by-Step Instructions | 1. Review outstanding balances on loan list. |
| Expected Result | Outstanding amounts correct per repayments. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-486 — Category delete guard

| Field | Value |
|-------|-------|
| Module | Personal |
| Feature | Category delete guard |
| Objective | Attempt delete used personal category |
| Navigation Path | Sidebar → Financials → Personal transactions → Settings |
| Prerequisites | Category used in transaction |
| Test Data | None |
| Step-by-Step Instructions | 1. Attempt delete category with transactions.<br>2. Observe guard. |
| Expected Result | System prevents delete or warns. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-487 — Mobile personal transactions

| Field | Value |
|-------|-------|
| Module | Personal |
| Feature | Mobile personal transactions |
| Objective | Personal module on mobile |
| Navigation Path | Sidebar → Financials → Personal transactions |
| Prerequisites | Viewport <768px |
| Test Data | None |
| Step-by-Step Instructions | 1. Open on mobile width.<br>2. Switch sub-tabs via dropdown. |
| Expected Result | Mobile layout functional. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-488 — Audit personal txn N/A

| Field | Value |
|-------|-------|
| Module | Personal |
| Feature | Audit personal txn N/A |
| Objective | Verify personal txn audit scope |
| Navigation Path | Settings → Audit Trail |
| Prerequisites | Personal transactions |
| Test Data | None |
| Step-by-Step Instructions | 1. Check if personal transactions appear in enterprise audit.<br>2. Document scope. |
| Expected Result | Audit scope documented (may be separate from business audit). |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-489 — Sales user hidden

| Field | Value |
|-------|-------|
| Module | Personal |
| Feature | Sales user hidden |
| Objective | Verify sales_user cannot see Personal transactions |
| Navigation Path | Login as sales_user |
| Prerequisites | sales_user role |
| Test Data | None |
| Step-by-Step Instructions | 1. Confirm Personal transactions not in sidebar. |
| Expected Result | Hidden for sales_user and non-admin. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-540 — Chapter completion

| Field | Value |
|-------|-------|
| Module | Personal |
| Feature | Chapter completion |
| Objective | Personal transactions sign-off |
| Navigation Path | Personal module review |
| Prerequisites | Ch.11 executed |
| Test Data | Checklist |
| Step-by-Step Instructions | 1. Admin flows complete; non-admin blocked.<br>2. Complete checklist. |
| Expected Result | Personal transactions E2E complete. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

## Chapter Completion Checklist

- [ ] Admin access verified
- [ ] Wallets configured
- [ ] Income/expense/transfer recorded
- [ ] Loan manager tested
- [ ] Non-admin blocked

| Pass Count | Fail Count | Blocked/N/A | Observations |
|------------|------------|-------------|--------------|
| | | | |

---

# Chapter 12 — Advanced Administration

**Test Case Range:** UAT-541 – UAT-600

## Purpose
Verify advanced administrative controls: GL, accounting reports, backups, restore, audit, security, monitoring, and cross-module integration.

## Business Flow
```text
General Ledger → Accounting Reports → Backup/Restore → Audit → Security RBAC → Performance verification
```

## Required Test Data
- Full tenant with data from Chapters 1–11
- Admin and restricted users
- Backup from Ch.1 UAT-026

## Dependencies
- All prior chapters executed or seeded equivalent data

## Expected Outputs
- GL and financial reports reconcile
- Backup and restore wizard validated on staging
- Audit trail comprehensive
- RBAC enforcement verified

## Test Cases

### UAT-541 — General Ledger — Open

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | General Ledger — Open |
| Objective | Open General Ledger |
| Navigation Path | Sidebar → Financials → General Ledger |
| Prerequisites | Financial access |
| Test Data | None |
| Step-by-Step Instructions | 1. Sidebar → Financials → General Ledger. |
| Expected Result | Transaction ledger loads with filters. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-492 — GL — Search transaction

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | GL — Search transaction |
| Objective | Search GL by description/reference |
| Navigation Path | Sidebar → Financials → General Ledger → search |
| Prerequisites | Transactions from prior chapters |
| Test Data | Search: payment or invoice ref |
| Step-by-Step Instructions | 1. Search GL for known transaction.<br>2. Open detail. |
| Expected Result | Transaction found with correct debit/credit lines. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-493 — GL — Filter by account

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | GL — Filter by account |
| Objective | Filter GL by bank account |
| Navigation Path | Sidebar → Financials → General Ledger → account filter |
| Prerequisites | Bank transactions exist |
| Test Data | Account: HBL Current Account |
| Step-by-Step Instructions | 1. Filter by HBL Current Account.<br>2. Review entries. |
| Expected Result | Only HBL account entries shown. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-494 — GL — Filter by project

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | GL — Filter by project |
| Objective | Filter GL by project |
| Navigation Path | Sidebar → Financials → General Ledger → project filter |
| Prerequisites | Project transactions |
| Test Data | Project: Sunrise Towers |
| Step-by-Step Instructions | 1. Filter by Sunrise Towers. |
| Expected Result | Project-scoped GL entries displayed. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-495 — GL — New transaction

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | GL — New transaction |
| Objective | Create manual GL transaction |
| Navigation Path | Sidebar → Financials → General Ledger → Add Transaction |
| Prerequisites | Financial write access |
| Test Data | Type: Journal<br>Debit: Expense<br>Credit: Bank<br>Amount: 1,000 |
| Step-by-Step Instructions | 1. Add manual journal transaction.<br>2. Save/post. |
| Expected Result | Transaction posted to GL; balances update. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-496 — GL — Show system transactions

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | GL — Show system transactions |
| Objective | Toggle system transactions visibility |
| Navigation Path | Sidebar → Financials → General Ledger → settings/toggle |
| Prerequisites | System-generated entries exist |
| Test Data | Show system transactions: On |
| Step-by-Step Instructions | 1. Enable show system transactions if toggle exists.<br>2. Verify system entries visible. |
| Expected Result | System/auto-generated transactions visible when toggled. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-497 — Accounting — Open

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Accounting — Open |
| Objective | Navigate to Accounting module |
| Navigation Path | Sidebar → Financials → Accounting |
| Prerequisites | Financial access |
| Test Data | None |
| Step-by-Step Instructions | 1. Sidebar → Financials → Accounting. |
| Expected Result | Accounting reports shell loads. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-498 — Trial Balance

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Trial Balance |
| Objective | Run Trial Balance report |
| Navigation Path | Sidebar → Financials → Accounting → Reports → Trial Balance |
| Prerequisites | GL data exists |
| Test Data | Period: current |
| Step-by-Step Instructions | 1. Open Trial Balance.<br>2. Run for current period. |
| Expected Result | Debits equal credits; accounts listed. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-499 — Profit & Loss

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Profit & Loss |
| Objective | Run Profit & Loss report |
| Navigation Path | Sidebar → Financials → Accounting → Reports → Profit & Loss |
| Prerequisites | Income/expense transactions |
| Test Data | Period: current |
| Step-by-Step Instructions | 1. Run P&L report. |
| Expected Result | P&L displays revenue and expenses. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-500 — Balance Sheet

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Balance Sheet |
| Objective | Run Balance Sheet report |
| Navigation Path | Sidebar → Financials → Accounting → Reports → Balance Sheet |
| Prerequisites | GL balances |
| Test Data | As of: today |
| Step-by-Step Instructions | 1. Run Balance Sheet. |
| Expected Result | Assets = Liabilities + Equity. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-501 — Cash Flows

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Cash Flows |
| Objective | Run Cash Flows report |
| Navigation Path | Sidebar → Financials → Accounting → Reports → Cash Flows |
| Prerequisites | Cash transactions |
| Test Data | Period: current |
| Step-by-Step Instructions | 1. Run Cash Flows report. |
| Expected Result | Cash flow statement generates. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-502 — Bank Accounts report

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Bank Accounts report |
| Objective | Run accounting Bank Accounts report |
| Navigation Path | Sidebar → Financials → Accounting → Reports → Bank Accounts |
| Prerequisites | Bank accounts Ch.2 |
| Test Data | None |
| Step-by-Step Instructions | 1. Run Bank Accounts report under Accounting. |
| Expected Result | All bank accounts with balances listed. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-503 — Reconciliation

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Reconciliation |
| Objective | Open bank reconciliation |
| Navigation Path | Sidebar → Financials → Accounting → Reports → Reconciliation |
| Prerequisites | Bank account with transactions |
| Test Data | Account: HBL |
| Step-by-Step Instructions | 1. Open Reconciliation report/tool.<br>2. Review unreconciled items. |
| Expected Result | Reconciliation interface loads. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-504 — Unposted Transactions

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Unposted Transactions |
| Objective | Review unposted transactions queue |
| Navigation Path | Sidebar → Financials → Accounting → Reports → Unposted Transactions |
| Prerequisites | Any draft/unposted items |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Unposted Transactions.<br>2. Review list. |
| Expected Result | Unposted items listed or empty state shown. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-505 — Accounting Analytics

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Accounting Analytics |
| Objective | View accounting analytics dashboard |
| Navigation Path | Sidebar → Financials → Accounting → Reports → Analytics |
| Prerequisites | GL data |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Accounting Analytics. |
| Expected Result | Analytics charts/KPIs load. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-506 — Report Designer

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Report Designer |
| Objective | Open report designer if permitted |
| Navigation Path | Sidebar → Financials → Accounting → Portfolio reports → Report Designer |
| Prerequisites | Report designer permission |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Report Designer.<br>2. Review custom report builder. |
| Expected Result | Report Designer loads for authorized users. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-507 — Backup — Scheduled settings

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Backup — Scheduled settings |
| Objective | Review backup schedule settings |
| Navigation Path | Sidebar → System → Settings → Backup Center → Storage Settings |
| Prerequisites | Admin access |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Storage Settings in Backup Center.<br>2. Review schedule/retention if configured. |
| Expected Result | Backup storage settings accessible. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-508 — Backup — Selective export

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Backup — Selective export |
| Objective | Run selective export |
| Navigation Path | Sidebar → System → Settings → Backup Center → Selective Export |
| Prerequisites | Admin access |
| Test Data | Export subset: contacts |
| Step-by-Step Instructions | 1. Open Selective Export.<br>2. Choose data subset.<br>3. Export.<br>4. Verify file. |
| Expected Result | Selective export file generated. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-509 — Backup — Import

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Backup — Import |
| Objective | Review backup import tab |
| Navigation Path | Sidebar → System → Settings → Backup Center → Import |
| Prerequisites | Staging environment |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Import tab in Backup Center.<br>2. Review import options (do not import untrusted files on production). |
| Expected Result | Import interface loads with warnings. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-510 — Backup — Disaster Recovery

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Backup — Disaster Recovery |
| Objective | Review disaster recovery section |
| Navigation Path | Sidebar → System → Settings → Backup Center → Disaster Recovery |
| Prerequisites | Admin access |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Disaster Recovery tab.<br>2. Review DR procedures documented in UI. |
| Expected Result | DR guidance/controls displayed. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-511 — Backup — Security

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Backup — Security |
| Objective | Review backup security settings |
| Navigation Path | Sidebar → System → Settings → Backup Center → Backup Security |
| Prerequisites | Admin access |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Backup Security tab. |
| Expected Result | Backup encryption/security options shown. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-512 — Restore — Staging dry run

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Restore — Staging dry run |
| Objective | Execute restore dry run on staging |
| Navigation Path | Sidebar → System → Settings → Backup Center → Tenant Restore |
| Prerequisites | Staging only; backup from UAT-026 |
| Test Data | Backup: UAT-Initial-Backup |
| Step-by-Step Instructions | 1. On staging, open Tenant Restore.<br>2. Select backup.<br>3. Run preview/dry-run if available.<br>4. Complete or cancel per policy. |
| Expected Result | Restore wizard validates backup integrity on staging. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-513 — Data Management — Transaction log

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Data Management — Transaction log |
| Objective | View transaction log |
| Navigation Path | Sidebar → System → Settings → Data Management → View Transaction Log |
| Prerequisites | Admin access |
| Test Data | None |
| Step-by-Step Instructions | 1. Open View Transaction Log. |
| Expected Result | Transaction log viewer loads. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-514 — Data Management — Transaction audits

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Data Management — Transaction audits |
| Objective | View transaction audits & logs |
| Navigation Path | Sidebar → System → Settings → Data Management → Transaction Audits & Logs |
| Prerequisites | Admin access |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Transaction Audits & Logs section. |
| Expected Result | Audit log interface loads. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-515 — Data Management — Database health

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Data Management — Database health |
| Objective | Database health block (offline mode flag) |
| Navigation Path | Sidebar → System → Settings → Data Management |
| Prerequisites | features.offlineMode flag |
| Test Data | None |
| Step-by-Step Instructions | 1. Check for Database Health block inside Data Management.<br>2. Document visibility based on feature flag. |
| Expected Result | Database Health shown only when offlineMode feature enabled; otherwise N/A. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-516 — Audit Trail — Enterprise viewer

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Audit Trail — Enterprise viewer |
| Objective | Full enterprise audit export/filter |
| Navigation Path | Sidebar → System → Settings → Audit Trail |
| Prerequisites | Mutations from all chapters |
| Test Data | Date range: UAT period |
| Step-by-Step Instructions | 1. Set wide date filter.<br>2. Export audit if available.<br>3. Verify events from payroll, selling, rental, etc. |
| Expected Result | Cross-module audit events visible. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-517 — Audit Trail — Diff viewer

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Audit Trail — Diff viewer |
| Objective | Expand audit diff for mutation |
| Navigation Path | Sidebar → System → Settings → Audit Trail |
| Prerequisites | Edit mutation with diff |
| Test Data | None |
| Step-by-Step Instructions | 1. Find row with Before/After diff.<br>2. Expand diff viewer. |
| Expected Result | JSON diff shows old/new values. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-518 — Permission Catalog

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Permission Catalog |
| Objective | Browse permission catalog |
| Navigation Path | Sidebar → System → Settings → Administration → Permission Catalog |
| Prerequisites | RBAC v2 enabled |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Permission Catalog.<br>2. Search payroll permissions.<br>3. Search procurement permissions. |
| Expected Result | Full permission list browsable. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-519 — Role Management — Clone role

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Role Management — Clone role |
| Objective | Clone existing role |
| Navigation Path | Sidebar → System → Settings → Role Management |
| Prerequisites | Admin access |
| Test Data | Clone from: standard role |
| Step-by-Step Instructions | 1. Clone an existing role.<br>2. Rename clone.<br>3. Save. |
| Expected Result | Cloned role created with copied permissions. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-520 — Security — Roles assignment

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Security — Roles assignment |
| Objective | Assign security role to user |
| Navigation Path | Sidebar → System → Settings → Security — Roles |
| Prerequisites | RBAC v2 UI enabled |
| Test Data | User: approver1<br>Role: test role |
| Step-by-Step Instructions | 1. Assign security role to user.<br>2. Save.<br>3. Verify user menu access changes on re-login. |
| Expected Result | Role assignment affects user permissions. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-521 — Data Scopes — Create scope

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Data Scopes — Create scope |
| Objective | Create data scope rule |
| Navigation Path | Sidebar → System → Settings → Security — Data Scopes |
| Prerequisites | VITE_RBAC_V2_DATA_SCOPE enabled |
| Test Data | Scope: project-limited |
| Step-by-Step Instructions | 1. Create data scope restricting project access.<br>2. Assign to test user.<br>3. Verify scoped data access. |
| Expected Result | Data scope enforced OR section disabled — document in Remarks. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-522 — Approval Matrix — View rules

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Approval Matrix — View rules |
| Objective | View approval matrix rules |
| Navigation Path | Sidebar → System → Settings → Security — Approval Matrix |
| Prerequisites | VITE_RBAC_V2_APPROVAL_MATRIX enabled |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Approval Matrix.<br>2. Review workflow approval rules. |
| Expected Result | Matrix UI loads or disabled per feature flag. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-523 — User Management — Reset password

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | User Management — Reset password |
| Objective | Admin reset user password |
| Navigation Path | Sidebar → System → Settings → User Management → Reset password |
| Prerequisites | Admin access |
| Test Data | User: approver1<br>New password: NewPass@1234 |
| Step-by-Step Instructions | 1. Reset approver1 password.<br>2. Log in as approver1 with new password. |
| Expected Result | Password reset successful; user can log in. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-524 — MFA — Two-Factor Auth setup

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | MFA — Two-Factor Auth setup |
| Objective | Configure MFA for user |
| Navigation Path | Sidebar → System → Settings → Two-Factor Auth |
| Prerequisites | Admin/user access |
| Test Data | Authenticator app |
| Step-by-Step Instructions | 1. Open Two-Factor Auth.<br>2. Begin MFA setup.<br>3. Scan QR / enter code.<br>4. Verify MFA challenge on next login. |
| Expected Result | MFA enabled; login prompts for second factor. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-525 — Privacy Center

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Privacy Center |
| Objective | Review privacy center |
| Navigation Path | Sidebar → System → Settings → Privacy Center |
| Prerequisites | Admin access |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Privacy Center.<br>2. Review data privacy options. |
| Expected Result | Privacy Center loads. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-526 — License & Subscription

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | License & Subscription |
| Objective | Review license and subscription |
| Navigation Path | Sidebar → System → Settings → License & Subscription |
| Prerequisites | License permission |
| Test Data | None |
| Step-by-Step Instructions | 1. Open License & Subscription.<br>2. Review licensed modules (real_estate, rental). |
| Expected Result | License modules match sidebar visibility. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-527 — Customer Success

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Customer Success |
| Objective | Open customer success center |
| Navigation Path | Sidebar → System → Settings → Customer Success |
| Prerequisites | Settings access |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Customer Success / Help center. |
| Expected Result | Help and onboarding resources load. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-528 — About — Version

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | About — Version |
| Objective | Verify application version in About |
| Navigation Path | Sidebar → System → Settings → About |
| Prerequisites | None |
| Test Data | Expected: 1.2.463+ |
| Step-by-Step Instructions | 1. Open About section.<br>2. Record product version/build. |
| Expected Result | Version displayed matches release under test. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-529 — Notifications panel

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Notifications panel |
| Objective | Verify header notifications |
| Navigation Path | Header → Notifications bell |
| Prerequisites | User with notifications |
| Test Data | None |
| Step-by-Step Instructions | 1. Click Notifications bell.<br>2. Review notification list.<br>3. Mark read if available. |
| Expected Result | Notifications panel functional (no dedicated Settings page). |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-530 — Notifications settings page **[NOT IMPLEMENTED]**

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Notifications settings page |
| Objective | Verify no notifications settings page |
| Navigation Path | Sidebar → System → Settings |
| Prerequisites | None |
| Test Data | None |
| Step-by-Step Instructions | 1. Search Settings for Notifications configuration page. |
| Expected Result | NOT IMPLEMENTED — notifications via header panel and API only. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks | NOT IMPLEMENTED — feature not available in current product build. |

### UAT-531 — Company Management section **[NOT IMPLEMENTED]**

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Company Management section |
| Objective | Verify Company Management not mounted |
| Navigation Path | Settings sidebar + global search |
| Prerequisites | None |
| Test Data | Search: Company Management |
| Step-by-Step Instructions | 1. Search Company Management in global search.<br>2. Attempt to open — verify no content panel. |
| Expected Result | NOT IMPLEMENTED — CompanyManagementSection.tsx not mounted; use Setup Wizard + Preferences. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks | NOT IMPLEMENTED — feature not available in current product build. |

### UAT-532 — Platform admin portal N/A

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Platform admin portal N/A |
| Objective | Verify tenant client excludes platform admin |
| Navigation Path | Tenant application |
| Prerequisites | None |
| Test Data | None |
| Step-by-Step Instructions | 1. Confirm Subscription Admin / System Health NOT in tenant Settings.<br>2. Note: separate admin/ portal only. |
| Expected Result | NOT IMPLEMENTED in tenant client — platform admin is separate admin portal. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-533 — Performance — Large list load

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Performance — Large list load |
| Objective | Verify employee/vendor list performance |
| Navigation Path | Payroll → Employees OR Procurement → Vendor directory |
| Prerequisites | 100+ records optional |
| Test Data | None |
| Step-by-Step Instructions | 1. Open large virtualized list.<br>2. Scroll and search.<br>3. Measure subjective load time (<3s LAN). |
| Expected Result | Lists remain responsive; pagination/virtualization works. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-534 — Performance — Report generation

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Performance — Report generation |
| Objective | Verify report generation time |
| Navigation Path | Sidebar → Financials → Accounting → Trial Balance |
| Prerequisites | Full year data |
| Test Data | None |
| Step-by-Step Instructions | 1. Run Trial Balance on tenant with full UAT data.<br>2. Note generation time. |
| Expected Result | Report completes within acceptable time on staging hardware. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-535 — Real-time — cross-module sync

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Real-time — cross-module sync |
| Objective | Verify socket sync across modules |
| Navigation Path | Two browser sessions same tenant |
| Prerequisites | Two users same tenant |
| Test Data | None |
| Step-by-Step Instructions | 1. User A posts bill in Construction.<br>2. User B on Dashboard/GL sees update without F5. |
| Expected Result | Real-time invalidation updates connected clients. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-536 — Security — Session logout

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Security — Session logout |
| Objective | Verify logout invalidates session |
| Navigation Path | User menu → Logout |
| Prerequisites | Logged in user |
| Test Data | None |
| Step-by-Step Instructions | 1. Log out.<br>2. Attempt back button to protected page. |
| Expected Result | Session cleared; redirect to login. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-537 — Security — Unauthorized API

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Security — Unauthorized API |
| Objective | Verify unauthorized access blocked |
| Navigation Path | Browser devtools not required — use UI |
| Prerequisites | Restricted user |
| Test Data | None |
| Step-by-Step Instructions | 1. As restricted user, attempt action without permission (e.g., User Management). |
| Expected Result | UI blocks action; no unauthorized mutation. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-538 — Import Data — Full wizard review

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Import Data — Full wizard review |
| Objective | Review all import types in wizard |
| Navigation Path | Settings → Import Data wizard |
| Prerequisites | Admin access |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Import wizard.<br>2. Review all import types available.<br>3. Note Phase 2 items. |
| Expected Result | Import types documented; legacy SQLite imports marked deprecated/absent. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-539 — Workflow — Approval queue

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Workflow — Approval queue |
| Objective | Global approval queue review |
| Navigation Path | Settings → Preferences → Workflow OR ApprovalQueuePanel |
| Prerequisites | Pending approvals from prior chapters |
| Test Data | None |
| Step-by-Step Instructions | 1. Open approval queue.<br>2. Review pending contract/agreement/PO items. |
| Expected Result | Approval queue consolidates pending workflow items. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-540 — Dashboard — KPI panel

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Dashboard — KPI panel |
| Objective | Verify dashboard KPI panel shortcuts |
| Navigation Path | Sidebar → Dashboard → KPI panel |
| Prerequisites | None |
| Test Data | None |
| Step-by-Step Instructions | 1. Open KPI panel (chart icon).<br>2. Test shortcuts: Transactions, Bills, Vendors, Configuration. |
| Expected Result | KPI shortcuts navigate to correct modules. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-541 — Global search coverage

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Global search coverage |
| Objective | Verify global search finds all major modules |
| Navigation Path | Header → Global search |
| Prerequisites | None |
| Test Data | Search: Payroll, Rental, Budget, Settings |
| Step-by-Step Instructions | 1. Search each major module.<br>2. Verify results navigate correctly. |
| Expected Result | Global search indexes major modules and settings sections. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-542 — Mobile footer nav

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Mobile footer nav |
| Objective | Verify mobile footer navigation |
| Navigation Path | Mobile viewport footer |
| Prerequisites | Viewport <768px |
| Test Data | None |
| Step-by-Step Instructions | 1. Review footer: Dashboard, Ledger, Payments, Config.<br>2. Tap each item. |
| Expected Result | Mobile footer navigation works. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-543 — Health endpoint

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Health endpoint |
| Objective | Verify API health (consultant check) |
| Navigation Path | Browser: http://127.0.0.1:3001/health (staging) |
| Prerequisites | API server running |
| Test Data | None |
| Step-by-Step Instructions | 1. Open /health URL in browser.<br>2. Verify {"status":"ok"} or equivalent JSON. |
| Expected Result | API health endpoint responds OK. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-544 — Cross-chapter GL reconcile

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Cross-chapter GL reconcile |
| Objective | Reconcile GL totals with module reports |
| Navigation Path | GL + Accounting Trial Balance + Payroll Journal report |
| Prerequisites | All chapters executed |
| Test Data | None |
| Step-by-Step Instructions | 1. Compare GL bank balance to Bank Accounts report.<br>2. Compare payroll liability to Payroll Liability report. |
| Expected Result | Cross-module figures reconcile within rounding tolerance. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-545 — Tenant settings — Print

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Tenant settings — Print |
| Objective | Configure print settings with company info |
| Navigation Path | Settings → Preferences → Communication/Tools → Print Settings |
| Prerequisites | Company from Setup Wizard |
| Test Data | Company name on reports |
| Step-by-Step Instructions | 1. Open Print Settings.<br>2. Verify company name/logo on templates.<br>3. Save. |
| Expected Result | Printed documents show company information. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-546 — Error log viewer

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Error log viewer |
| Objective | Review error log if available |
| Navigation Path | Settings → (Error log if exposed) OR Help |
| Prerequisites | Admin access |
| Test Data | None |
| Step-by-Step Instructions | 1. Locate Error Log Viewer if accessible.<br>2. Review recent errors during UAT. |
| Expected Result | No critical unresolved errors OR errors documented in UAT remarks. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-547 — Clear transactions guard

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Clear transactions guard |
| Objective | Verify clear transactions requires confirmation |
| Navigation Path | Settings → Data Management → Clear Transactions |
| Prerequisites | Staging only |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Clear Transactions modal.<br>2. Review warnings.<br>3. Cancel without executing on production. |
| Expected Result | Destructive action requires explicit confirmation; staging-only test. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-548 — Application update settings

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Application update settings |
| Objective | Review application update section |
| Navigation Path | Settings → Application Update (if feature flag enabled) |
| Prerequisites | features.applicationUpdates |
| Test Data | None |
| Step-by-Step Instructions | 1. Open Application Update if visible.<br>2. Or verify redirect when feature disabled. |
| Expected Result | Update section behavior matches feature flag. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-549 — Full regression smoke

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Full regression smoke |
| Objective | Execute cross-module smoke path |
| Navigation Path | Multi-module navigation |
| Prerequisites | All prior chapters |
| Test Data | None |
| Step-by-Step Instructions | 1. Login → Dashboard → GL entry → Selling invoice → Construction bill → Rental invoice → Payroll dashboard → Settings audit.<br>2. Verify no critical errors. |
| Expected Result | Cross-module smoke path completes without critical defects. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

### UAT-600 — Master UAT sign-off

| Field | Value |
|-------|-------|
| Module | Administration |
| Feature | Master UAT sign-off |
| Objective | Complete master UAT sign-off |
| Navigation Path | UAT Summary Sheet + Sign-Off Page (end of manual) |
| Prerequisites | All chapters addressed |
| Test Data | None |
| Step-by-Step Instructions | 1. Complete UAT Summary Sheet module counts.<br>2. Fill Business Sign-Off Page.<br>3. Archive screenshots and execution log. |
| Expected Result | Master UAT formally signed off for release baseline. |
| Actual Result | |
| Status | Pass / Fail / Blocked / N/A |
| Screenshot Reference | |
| Remarks |  |

## Chapter Completion Checklist

- [ ] GL transactions verified
- [ ] Key accounting reports run
- [ ] Backup/restore tested on staging
- [ ] Audit trail complete
- [ ] Security settings reviewed
- [ ] Sign-off sheet completed

| Pass Count | Fail Count | Blocked/N/A | Observations |
|------------|------------|-------------|--------------|
| | | | |

---

## UAT Summary Sheet

| Module / Chapter | Passed | Failed | Blocked | Not Tested | Overall Result |
|------------------|--------|--------|---------|------------|----------------|
| Ch.1 System Initialization & Basic Setup | | | | | |
| Ch.2 Master Data Foundation | | | | | |
| Ch.3 Payroll | | | | | |
| Ch.4 Project Selling | | | | | |
| Ch.5 Project Construction | | | | | |
| Ch.6 Rental Management | | | | | |
| Ch.7 Procurement Management | | | | | |
| Ch.8 Investment Management | | | | | |
| Ch.9 PM Cycle | | | | | |
| Ch.10 Budget Management | | | | | |
| Ch.11 Personal Transactions | | | | | |
| Ch.12 Advanced Administration | | | | | |
| **Grand Total** | | | | | |

## Business Sign-Off Page

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Prepared By | | | |
| Tested By | | | |
| Reviewed By | | | |
| Approved By | | | |

**Acceptance Status:** ☐ Accepted  ☐ Accepted with Conditions  ☐ Rejected

**Conditions / Notes:**

---