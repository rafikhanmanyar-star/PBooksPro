# UI Guide — Multi-Factor Authentication & Financial Reconciliation

This document describes **every user-facing change** introduced in this development session. It is written for administrators, accountants, and end users who interact with PBooks Pro in **API / PostgreSQL mode** (LAN or self-hosted server).

> **Local-only mode:** MFA and Financial Reconciliation Certification are **not available** in local-only (SQLite) mode. Those features require the backend API and PostgreSQL.

---

## Table of contents

1. [Summary of changes](#1-summary-of-changes)
2. [Multi-Factor Authentication (MFA)](#2-multi-factor-authentication-mfa)
   - [Who must use MFA](#21-who-must-use-mfa)
   - [Supported methods](#22-supported-methods)
   - [Login screen — standard sign-in](#23-login-screen--standard-sign-in)
   - [Login screen — MFA challenge (returning user)](#24-login-screen--mfa-challenge-returning-user)
   - [Login screen — forced MFA setup (first time)](#25-login-screen--forced-mfa-setup-first-time)
   - [Login screen — recovery code sign-in](#26-login-screen--recovery-code-sign-in)
   - [Settings — Two-Factor Auth](#27-settings--two-factor-auth)
   - [MFA error messages & troubleshooting](#28-mfa-error-messages--troubleshooting)
3. [Financial Reconciliation Certification](#3-financial-reconciliation-certification)
   - [How to open the dashboard](#31-how-to-open-the-dashboard)
   - [Running a certification](#32-running-a-certification)
   - [Understanding the results](#33-understanding-the-results)
   - [Report source status](#34-report-source-status)
4. [Quick reference — navigation paths](#4-quick-reference--navigation-paths)
5. [Administrator checklist](#5-administrator-checklist)

---

## 1. Summary of changes

| Feature | Where in the app | Mode required |
|--------|------------------|---------------|
| **Multi-Factor Authentication (TOTP + recovery codes)** | Login screen, Settings → Two-Factor Auth | API / PostgreSQL |
| **Financial Reconciliation Certification dashboard** | Project Management → Reports → Reconciliation | API / PostgreSQL |

---

## 2. Multi-Factor Authentication (MFA)

MFA adds a second step after username and password for privileged roles. Users scan a QR code with an authenticator app (Google Authenticator, Authy, Microsoft Authenticator, 1Password, etc.) and enter a 6-digit code that changes every 30 seconds.

### 2.1 Who must use MFA

MFA is **required** for these roles (including legacy display names):

| Enterprise role | Legacy role names in User Management |
|-----------------|--------------------------------------|
| Super Admin | Super Admin |
| Company Admin | Admin, Manager |
| Accountant | Accounts, Accountant |

All other roles (e.g. Viewer, Project Manager, Store Manager) are **not** forced to enroll, but may optionally enable MFA in Settings.

### 2.2 Supported methods

| Method | Description |
|--------|-------------|
| **Authenticator app (TOTP)** | Primary method — 6-digit time-based code from your app |
| **Recovery codes** | One-time backup codes shown when MFA is first enabled (10 codes). Use if you lose your phone. |

---

### 2.3 Login screen — standard sign-in

**Path:** App launch → API Login screen (when not already signed in)

**Screen:** *Welcome back — Sign in to your organization (API mode)*

**Fields (unchanged):**

| Field | Description |
|-------|-------------|
| API server | Host and port of your PBooks Pro API (e.g. `http://192.168.1.10:3000`) |
| Organization | Tenant / organization ID |
| Username | Your login username |
| Password | Your password |

**What changed:** After you click **Sign in**, one of three outcomes occurs:

```
Password correct?
  ├─ Role does NOT require MFA        → You enter the app immediately (same as before)
  ├─ Role requires MFA + already set up → MFA Challenge screen (Section 2.4)
  └─ Role requires MFA + NOT set up     → MFA Setup screen (Section 2.5)
```

The normal login form is **hidden** while the MFA step is active. Use **Back to sign in** to return to the password form.

---

### 2.4 Login screen — MFA challenge (returning user)

**When you see it:** Your role requires MFA and you have already enrolled an authenticator app.

**Screen title:** *Two-factor authentication*

**Tabs:**

| Tab | Use when |
|-----|----------|
| **Authenticator app** | You have your phone / authenticator app available |
| **Recovery code** | You lost access to your authenticator app |

#### Authenticator app tab

1. Open your authenticator app (Google Authenticator, Authy, etc.).
2. Find the **PBooksPro** entry for your account.
3. Enter the current **6-digit code** in the field.
4. Click **Verify & sign in**.

Codes expire every 30 seconds. If verification fails, wait for the next code and try again.

#### Controls

| Control | Action |
|---------|--------|
| **Back to sign in** | Cancels MFA step; returns to username/password form |
| **Verify & sign in** | Submits the code and completes login |

**On success:** You are signed in and taken into the main application.

---

### 2.5 Login screen — forced MFA setup (first time)

**When you see it:** Your role requires MFA but you have **never** completed setup (e.g. first login after MFA was deployed, or MFA was reset).

**Screen title:** *Set up two-factor authentication*

**Steps:**

1. **Read the instructions** — explains that your role requires MFA.
2. **Wait for the QR code** — a spinner appears briefly while setup initializes.
3. **Scan the QR code** with your authenticator app, **or** manually enter the secret key shown below the QR code.
4. **Enter the 6-digit verification code** from your app to confirm setup works.
5. Click **Enable MFA & sign in**.

**Recovery codes screen (important):**

After a successful setup, a yellow panel appears:

- **Title:** *Save your recovery codes*
- **Content:** 10 codes in `XXXX-XXXX-XXXX` format
- **Copy codes** — copies all codes to clipboard
- **Continue to app** — proceed after you have saved the codes

> **Store recovery codes securely** (password manager, printed copy in a safe). Each code works **once**. You cannot sign in with MFA if you lose both your authenticator app and your recovery codes.

**Controls:**

| Control | Action |
|---------|--------|
| **Back to sign in** | Abandons setup; returns to login form (you will be prompted again on next login) |
| **Enable MFA & sign in** | Confirms TOTP and enables MFA |
| **Copy codes** | Copies recovery codes |
| **Continue to app** | Enters the application after saving codes |

---

### 2.6 Login screen — recovery code sign-in

**Path:** Login → MFA Challenge → **Recovery code** tab

1. Enter one of your saved recovery codes (format `XXXX-XXXX-XXXX`; spaces are optional).
2. Click **Verify & sign in**.

**Notes:**

- Each recovery code can only be used **once**.
- After use, the remaining count decreases (visible in Settings → Two-Factor Auth).
- When codes run low, contact an administrator to disable and re-enable MFA to generate new codes (or use Settings if your role allows voluntary disable).

---

### 2.7 Settings — Two-Factor Auth

**Path:** **Settings** (gear icon) → sidebar under **General** → **Two-Factor Auth**

**Availability:** API / PostgreSQL mode only (hidden in local-only mode).

#### Status panel

Shows at a glance:

| Field | Meaning |
|-------|---------|
| **Status** | Enabled (green) or Disabled (gray) |
| **Required for your role** | Amber warning if MFA cannot be turned off |
| **Recovery codes remaining** | Count of unused backup codes (when enabled) |

#### Enable MFA (voluntary or before first required login)

1. Click **Set up authenticator app**.
2. Scan the QR code (or use the manual secret below it).
3. Enter the **Verification code** from your app.
4. Click **Enable MFA**.
5. **Save the recovery codes** shown in the amber panel (use **Copy** if needed).

#### Disable MFA

**Only available when MFA is NOT required for your role.**

1. Enter your current **6-digit authenticator code**.
2. Click **Disable MFA**.

If MFA is required for your role, a message appears: *MFA cannot be disabled while it is required for your role.*

#### Success / error banners

| Banner color | Meaning |
|--------------|---------|
| Green | Action succeeded (e.g. "Multi-factor authentication enabled.") |
| Red | Error (invalid code, network failure, etc.) |

---

### 2.8 MFA error messages & troubleshooting

| Message / symptom | Likely cause | What to do |
|-------------------|--------------|------------|
| *Invalid authenticator code* | Wrong code or expired 30-second window | Wait for next code; check correct PBooksPro entry in app |
| *Invalid recovery code* | Typo or code already used | Try another code; check format |
| *MFA setup not started* | Enable clicked before setup | Click **Set up authenticator app** first |
| *Too many MFA attempts* | Rate limit (30 attempts / 15 min) | Wait and try again |
| QR code does not load | No internet on client device | QR is fetched from an external service; use manual secret key instead |
| Forced setup every login | Setup never completed | Finish setup through **Enable MFA & sign in** and save recovery codes |
| Cannot disable in Settings | Privileged role | Expected — Super Admin, Company Admin, and Accountant must keep MFA |

**Authenticator app tips:**

- Set device time to **automatic** (TOTP depends on accurate clock).
- One PBooksPro entry per user account; re-scanning replaces the previous secret during setup.

---

## 3. Financial Reconciliation Certification

This dashboard validates that core financial reports agree with journal-backed data for a selected period.

### 3.1 How to open the dashboard

**Path:** **Project Management** → **Reports** → **Financial Reconciliation**

**Permission required:** Trial Balance read access (`reports.trial_balance.read` — typically admins and accountants).

**Not available in local-only mode** — a message explains that PostgreSQL journal data is required.

---

### 3.2 Running a certification

**Screen title:** *Financial Reconciliation Certification*

**Controls at top right:**

| Control | Description |
|---------|-------------|
| **From** | Start date of certification period (defaults to first day of current month) |
| **To** | End date (defaults to today) |
| **Run certification** | Loads / refreshes results for the selected period |

The dashboard **auto-runs** when you open it or change dates.

---

### 3.3 Understanding the results

#### Summary cards (top row)

| Card | Meaning |
|------|---------|
| **Status** | Overall result: `reconciled` (green), `differences` (amber), or `critical` (red) |
| **Certification score** | 0–100 score; green ≥85, amber ≥70, red below 70 |
| **Missing journals** | Count of transactions without mirrored journal entries |
| **Unified reports** | How many report sources use the unified journal ledger vs total tracked |

#### Reconciliation checks list

Each row shows pass (✓ green) or fail (✗ red) for rules such as:

- Trial balance debits equal credits
- Assets = Liabilities + Equity
- Net profit matches change in equity
- Cross-checks against balance sheet engine (when applicable)

Failed checks show **Expected**, **Actual**, and **difference (Δ)** where relevant.

#### Differences section (amber)

Lists specific issues found during certification with error codes and messages. Review these before closing a fiscal period.

#### Missing journal mirrors table

Lists transactions that have no posted journal entry. These should be backfilled on the server:

```bash
npm run backfill-transaction-journal --prefix backend
```

Columns: Date, Type, Amount, Transaction ID.

#### Report sources section

Shows each financial report and whether it reads from the **unified journal**, **partial/legacy hybrid**, or **legacy** data path. Use this to understand which reports are fully certified vs still migrating.

---

### 3.4 Report source status

| Status badge | Meaning for users |
|--------------|-------------------|
| **Unified** | Report uses journal entries as source of truth — included in certification |
| **Partial** | Mixed sources (e.g. P&L category aggregation + journal) — may show differences |
| **Legacy** | Operational/subledger source — not fully unified yet |

A high certification score with unified Trial Balance and General Ledger but partial P&L/Balance Sheet is **expected** during ledger migration.

---

## 4. Quick reference — navigation paths

| Task | Navigation |
|------|------------|
| Sign in with MFA | Launch app → Enter credentials → MFA Challenge or Setup |
| Sign in with recovery code | Launch app → Credentials → MFA Challenge → **Recovery code** tab |
| Manage MFA while signed in | **Settings** → **Two-Factor Auth** |
| Run financial reconciliation | **Project Management** → **Reports** → **Financial Reconciliation** |
| View MFA requirement for role | **Settings** → **Two-Factor Auth** → status panel |

---

## 5. Administrator checklist

Before rolling out to users:

- [ ] Run database migration: `npm run migrate --prefix backend` (creates `user_mfa_settings` table).
- [ ] Ensure `JWT_SECRET` (≥16 characters) is set on the API server; optionally set `MFA_ENCRYPTION_KEY` for dedicated secret encryption.
- [ ] Notify Super Admin, Company Admin, and Accountant users that MFA will be required on next login.
- [ ] Confirm users have an authenticator app installed on a phone or tablet.
- [ ] For reconciliation: run journal backfill if **Missing journals** count is non-zero.
- [ ] Document where your organization stores recovery codes (password manager policy).

---

## Appendix — UI components (for developers)

| Component | File | Purpose |
|-----------|------|---------|
| API Login (MFA integration) | `components/auth/ApiLoginScreen.tsx` | Switches between login form and MFA panel |
| MFA Login Panel | `components/auth/MfaLoginPanel.tsx` | Challenge, setup, and recovery code flows at login |
| MFA Settings | `components/settings/MfaSettingsSection.tsx` | Enable / disable / status in Settings |
| Reconciliation Dashboard | `components/reports/ReconciliationDashboard.tsx` | Financial certification UI |
| Auth context (MFA methods) | `context/AuthContext.tsx` | `login`, `verifyMfaLogin`, `completeMfaSetupLogin` |
| MFA API client | `services/api/mfaApi.ts` | Frontend calls to `/auth/mfa/*` endpoints |

---

*Document version: June 2026 — covers MFA and Financial Reconciliation UI from this development session.*
