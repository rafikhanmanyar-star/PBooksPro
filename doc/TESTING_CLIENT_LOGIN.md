# Client login walkthrough — Desktop (Full ERP) vs Mobile (Executive)

Manual QA guide for **Cloud/API mode** (PostgreSQL + REST API). Offline SQLite / `electron:local` uses a different company-picker login and **does not** show Executive Mobile Mode.

---

## Prerequisites

| Item | Staging (recommended) | Production-like local |
|------|----------------------|------------------------|
| Env file | `.env.staging` from `.env.staging.example` | `.env` or `.env.production` |
| Database | `pBookspro_Staging` | `pbookspro` |
| API port | **3001** | **3000** |
| Migrate | `npm run db:migrate:staging` | `npm run db:migrate:lan` or `db:migrate:production` |
| Seed (staging) | `npm run db:seed:staging` | — |
| Health check | `http://127.0.0.1:3001/health` | `http://127.0.0.1:3000/health` |

**Staging test credentials** (after `db:seed:staging`):

- Organization: **test company** (`test-company`)
- User: **Rafi**
- Password: **Rafi1234**
- Sign-in identifier: email field accepts **Rafi** (username) or the user’s registered email if set

**Migration for Executive Mobile** (once per DB):

```powershell
npm run db:migrate:staging
```

Applies `112_executive_mobile.sql` (`users.interface_mode`, `unposted_transactions`).

---

## How the client chooses Desktop vs Mobile after login

Same login screen (`ApiLoginScreen`) for both. After authentication, the shell depends on **Interface mode** + **device**:

| `interface_mode` (per user, server) | Desktop browser (width ≥ 768, not mobile UA) | Phone / narrow browser / tablet portrait |
|-------------------------------------|---------------------------------------------|------------------------------------------|
| `auto` (default) | **Full ERP** (sidebar) | **Executive Mobile** |
| `full_erp` | Full ERP | Full ERP |
| `executive_mobile` | Executive Mobile | Executive Mobile |

**Important:** The **Electron staging/production API client always counts as desktop**, even on a small window. To see Executive Mobile in Electron, set Interface mode to **Executive Mobile Mode** (before or after login).

Executive Mobile is **disabled** when `VITE_LOCAL_ONLY=true` (offline SQLite builds).

---

## Option A — Full stack (Electron client, easiest for desktop login)

### Start staging stack

```powershell
npm run test:staging
```

This migrates + seeds staging, starts API on **3001**, builds the client, and opens Electron.

### Desktop login steps (Full ERP)

1. Wait for the **Welcome back** sign-in screen.
2. Confirm **API server** shows `http://127.0.0.1:3001` (staging). Change only if your API runs elsewhere.
3. Enter **Email address:** `Rafi` (or your staging user email).
4. Enter **Password:** `Rafi1234`.
5. Click **Sign in**.
6. If **Choose organization** appears (user belongs to multiple companies), pick **test company** and continue.
7. If **MFA** appears, complete TOTP (staging usually has `DISABLE_MFA_ENFORCEMENT=true` in `.env.staging`).
8. Wait for the loading shell to finish.

**Pass criteria — Desktop (Full ERP):**

- [ ] Left **sidebar** with modules (Dashboard, Accounting, etc.)
- [ ] Header shows company name; **no** “PBooks Pro Executive” banner
- [ ] Bottom area is **not** the executive 5-tab bar (Home / Approvals / Quick Tx / Alerts / More)
- [ ] **Settings → Preferences → Interface mode** shows **Automatic** or **Full ERP Mode** selected (if you did not force executive)
- [ ] Accounting and other full modules open normally

### Force desktop on a phone-sized window (Electron)

1. After login, go to **Settings → Preferences → Interface mode**.
2. Select **Full ERP Mode**.
3. Resize the window or restart the app — shell stays Full ERP.

---

## Option B — Browser client (best for true mobile login QA)

### Start API + Vite (staging)

Terminal 1:

```powershell
npm run start:backend:staging
# or: npm run dev:backend:staging
```

Terminal 2:

```powershell
$env:VITE_LOCAL_ONLY="false"
$env:VITE_STAGING="true"
$env:VITE_API_URL="http://127.0.0.1:3001/api/v1"
$env:VITE_WS_URL="http://127.0.0.1:3001"
npm run dev
```

Open the URL Vite prints. This repo uses port **5174** by default (`vite.config.ts`), not 5173. If 5174 is busy, Vite picks the next free port (e.g. **5175**) — use the URL shown in the terminal.

### Mobile login steps (Executive Mobile, auto mode)

1. Open **Chrome DevTools** → **Toggle device toolbar** (or use a real phone on the same LAN with API URL pointing at your PC’s IP:3001).
2. Pick a phone preset (e.g. iPhone 14) or width **&lt; 768px**.
3. Hard refresh the page.
4. Sign in: **Rafi** / **Rafi1234** (same as desktop).
5. Complete company selection / MFA if prompted.
6. Wait for data load.

**Pass criteria — Executive Mobile:**

- [ ] Header: **“PBooks Pro Executive”** + company name
- [ ] **Full ERP** link in header (switches to desktop shell)
- [ ] Bottom nav: **Home · Approvals · Quick Tx · Alerts · More**
- [ ] **Home** shows KPI cards and module shortcuts
- [ ] **Alerts** (or header bell) loads notifications without error
- [ ] **Approvals** lists pending items or empty state
- [ ] **Quick Tx** form submits a field transaction
- [ ] **More** opens module list; links to Reports, My quick transactions, Settings work
- [ ] No full accounting sidebar

### Desktop login steps (same browser, wide window)

1. Set viewport width **≥ 1280px** (exit device toolbar).
2. Ensure Interface mode is **Automatic** or **Full ERP** (Settings → Preferences after login, or Executive **More → Settings** if still in executive shell).
3. Sign out and sign in again (or set **Full ERP Mode** and reload).

**Pass criteria:** Same as Electron desktop checklist above.

### Force Executive Mobile on desktop browser (smoke test)

1. Sign in on a **wide** browser window.
2. **Settings → Preferences → Interface mode** → **Executive Mobile Mode**.
3. Page should switch to Executive shell without re-login.

---

## Option C — Real phone on LAN

1. Run staging API bound to LAN (ensure firewall allows port **3001**).
2. Build or dev-serve client with `VITE_API_URL=http://<your-pc-ip>:3001/api/v1`.
3. Open the client URL on the phone’s browser.
4. Sign in with cloud credentials.

**Pass criteria:** Executive Mobile shell appears automatically when `interface_mode` is `auto`.

---

## Post-login smoke tests (both modes)

### Shared (any shell)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Sign out (header user / logout) | Returns to login screen |
| 2 | Sign in again | Session restores; same org |
| 3 | Wrong password | Clear error: invalid email or password |
| 4 | API stopped | Connect / server error screen (not blank crash) |

### Executive Mobile only

| Step | Action | Expected |
|------|--------|----------|
| 1 | **Quick Tx** → submit fuel/site expense | Success; appears under **More → My quick transactions** |
| 2 | **Alerts** | Pull notifications (collections, rentals, unposted counts) |
| 3 | **Approvals** | PEV / installment plan actions or empty state |
| 4 | Tap **Full ERP** | Switches to Full ERP; preference saved as `full_erp` |

### Full ERP only

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open **Accounting** | Full ledger UI (not executive cards only) |
| 2 | **Accounting → Unposted Transactions** | Queue for accountant review of field entries |
| 3 | Interface mode **Automatic** on desktop | Stays Full ERP at wide width |

---

## Interface mode reference

| Where to change | Desktop shell | Executive shell |
|-----------------|---------------|-----------------|
| **Settings → Preferences → Interface mode** | ✓ | — (use More → Settings in executive) |
| **Executive → More → Settings** | — | ✓ |
| Server PATCH `/api/v1/users/me` `{ "interfaceMode": "..." }` | ✓ | ✓ |

Modes:

- **Automatic** — executive on phone/small screen; full ERP on desktop (browser only; not Electron auto-detect).
- **Executive Mobile Mode** — always executive (cloud only).
- **Full ERP Mode** — always desktop shell (cloud only).

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Executive shell never appears in Electron | Electron is always “desktop” | Set **Executive Mobile Mode** in settings |
| Executive shell never appears in browser | `interface_mode` = `full_erp` | Set **Automatic** or **Executive Mobile** |
| Login works but no executive features | SQLite / local-only build | Use `VITE_LOCAL_ONLY=false` and API client |
| 401 / connection errors | API down or wrong URL | Check `/health`; match port 3001 vs 3000 |
| Missing approvals / notifications API | Migration not applied | `npm run db:migrate:staging` |
| Stuck on “Connecting to server” | LAN discovery / wrong host | Set API URL explicitly on login form |
| Company picker every login | Multiple orgs for same email | Expected; pick org once per session |

---

## Quick command reference

```powershell
# Staging: API + Electron (desktop login QA)
npm run test:staging

# Staging: API only
npm run start:backend:staging

# Browser against staging API
$env:VITE_LOCAL_ONLY="false"; $env:VITE_STAGING="true"; $env:VITE_API_URL="http://127.0.0.1:3001/api/v1"; npm run dev

# Run mobile module unit tests
cd backend; node --import tsx --test src/modules/mobile/mobileModule.test.ts
```
