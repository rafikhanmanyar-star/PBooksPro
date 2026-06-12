# Public Demo Environment Architecture

## Overview

PBooksPro exposes a **public sandbox** (`pbooks-demo`) for prospects to explore the product with realistic sample data. The **master template** lives in version-controlled code (`backend/src/services/demo/demoSeedService.ts`) — visitor changes never affect it.

```
┌─────────────────┐     POST /api/demo/enter      ┌──────────────────┐
│  Marketing site │ ────────────────────────────► │  pbooks-demo     │
│  demo-login.html│     JWT + guided tour         │  (public tenant)   │
└─────────────────┘                               └────────┬─────────┘
                                                             │
                    Daily reset (cron / scheduler)           │
                             ▼                               │
                    ┌──────────────────┐                     │
                    │ demoSeedService  │ ◄── master template │
                    │ (code, not DB)   │     (source of truth)│
                    └──────────────────┘                     │
                    Optional: __demo_master__ (internal only)  │
```

## Tenants

| ID | Purpose | Public access |
|----|---------|---------------|
| `pbooks-demo` | Live sandbox visitors use | Yes — `/demo/enter`, login picker |
| `__demo_master__` | Optional DB snapshot for ops | No — blocked at login & API |

## Sample data seeded

- **Contacts** — owners & tenants
- **Buildings & properties** — 2 buildings, 4 units
- **Vendors** — steel, cement, electrical
- **Projects & units** — Horizon Heights, Riverside Plaza
- **Rental agreements & invoices** — paid + partial rent
- **Transactions** — income, expenses, installments
- **Reports** — trial balance, P&L, ledgers work against seeded ledger data

## Environment variables

| Variable | Description |
|----------|-------------|
| `DEMO_ENVIRONMENT_ENABLED=true` | Master switch |
| `DEMO_PUBLIC_LOGIN_ENABLED=true` | Allow `POST /api/demo/enter` |
| `DEMO_USER_PASSWORD` | Password for `demo` user (min 8 chars) |
| `DEMO_AUTO_RESET=true` | Enable in-process daily scheduler |
| `DEMO_RESET_HOUR_UTC=3` | Reset after this UTC hour |
| `DEMO_RESET_SECRET` | Protects `POST /api/demo/reset` |
| `DEMO_READ_ONLY=true` | Block mutations on public demo |
| `DEMO_SEED_MASTER=true` | Also seed internal `__demo_master__` |
| `ALLOW_DEMO_SEED_IN_PRODUCTION=true` | Required to seed in production |

## Daily reset

**In-process:** `startDemoResetScheduler()` in `backend/src/index.ts`

**Cron (recommended for production):**

```bash
0 3 * * * curl -sS -X POST \
  -H "x-demo-reset-secret: $DEMO_RESET_SECRET" \
  https://api.example.com/api/demo/reset
```

**CLI:**

```bash
npm run demo:reset --prefix backend
```

## API endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/demo/info` | Public | Demo availability metadata |
| POST | `/api/demo/enter` | Public (rate-limited) | Passwordless demo JWT |
| POST | `/api/demo/analytics` | Public | Funnel event sink |
| POST | `/api/demo/reset` | `x-demo-reset-secret` | Wipe + reseed public tenant |

## Frontend integration

- **Website:** `website/demo-login.html` → redirects to `app.pbookspro.com/?auto_demo=1`
- **App bootstrap:** `utils/demoAuthBootstrap.ts` → `POST /demo/enter` on app origin → `pbooks_demo_auth` in sessionStorage
- **In-app login:** `Try Live Demo` on `ApiLoginScreen` → `enterDemoSession()`
- **Guided tour:** `components/onboarding/DemoProductTour.tsx` (16-step end-to-end workflow)
- **Analytics:** `services/analytics/trackEvent.ts` + `website/js/analytics.js`

## Deployment checklist

1. Set env vars on API server and enable demo seed
2. Update `website/js/demo-config.js` with production `apiBaseUrl` and `appUrl`
3. Optionally set `gaMeasurementId` for GA4
4. Configure cron reset with `DEMO_RESET_SECRET`
5. Set `DISABLE_MFA_ENFORCEMENT=true` or ensure demo user bypasses MFA
6. Verify `GET /api/demo/info` returns `enabled: true`

## Security notes

- Internal tenants (`id` matching `^__`) are hidden from `/auth/tenants` and blocked at login
- Demo enter is rate-limited (30 / 15 min / IP)
- Master template is re-applied from code — not copied from visitor-modified rows
- Set `DEMO_READ_ONLY=true` for view-only demos at conferences
