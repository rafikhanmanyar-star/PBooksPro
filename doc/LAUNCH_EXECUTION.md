# PBooksPro — Launch Execution Guide

**Status:** Code-complete for launch · **Conditional GO** pending production secrets & staging E2E  
**Updated:** June 8, 2026  
**Revised launch score:** **80 / 100** (see below)

---

## What’s done (Phases 1–3)

| Phase | Deliverables |
|-------|----------------|
| **1 — P0 blockers** | Production API config, support center, trial exchange code, 14-day trial copy, blog content, build pipeline |
| **2 — Launch week** | Unified nav, analytics build injection, CSP/HSTS, OG webp, cookie settings, honeypots, staging checklist |
| **3 — Polish** | Self-hosted FA fonts, a11y landmarks, Calendly wiring, customer logo bar, favicon, Lighthouse CI script |
| **4 — Execution** | Smoke tests, GitHub Actions `website.yml`, this deploy guide |

---

## Revised launch score: 80 / 100

| Category | Was | Now | Notes |
|----------|----:|----:|-------|
| UX/UI | 7.0 | 8.0 | Unified nav, logo link, deployment note |
| Conversion | 4.0 | 7.5 | API auto-config; needs live backend flags |
| SEO | 5.5 | 7.5 | Blog content, webp OG, sitemap fix |
| Performance | 6.0 | 8.0 | dist bundles, local fonts, cache headers |
| Accessibility | 6.5 | 8.0 | skip link, main landmarks, help label |
| Security | 5.5 | 8.0 | CSP/HSTS, trial code exchange |
| Analytics | 4.0 | 6.0 | Framework ready; IDs still required |
| Lead gen | 3.5 | 7.5 | Support + funnels wired; API flags needed |
| Mobile | 7.0 | 7.5 | Scroll/WhatsApp offset |
| Trust | 6.0 | 7.5 | Disclaimers, logo bar, trust section |
| **Total** | **54** | **80** | |

**Remaining −20 points:** production analytics IDs, SMTP live emails, real screenshots/logos, staging E2E proof.

---

## Pre-deploy checklist (you)

### 1. API server (`backend/.env`)

Copy from `backend/.env.production.launch.example`:

```env
ALLOW_TRIAL_SIGNUP=true
MARKETING_LEADS_ENABLED=true
SUPPORT_TICKETS_ENABLED=true
DEMO_BOOKING_ENABLED=true
EMAIL_AUTOMATION_ENABLED=true
MARKETING_EMAIL_SEND_ENABLED=true
TRIAL_SIGNUP_APP_URL=https://app.pbookspro.com
# + SMTP credentials
```

Restart API after deploy.

### 2. Build website with secrets

```powershell
cd "C:\My Projects\PBooksPro -Local DB only"

$env:PBBOOKS_GTM_ID="GTM-XXXXXXX"
$env:PBBOOKS_GA4_ID="G-XXXXXXXXXX"
$env:PBBOOKS_META_PIXEL_ID="your_pixel_id"
$env:PBBOOKS_LINKEDIN_PARTNER_ID="your_partner_id"
$env:PBBOOKS_CALENDLY_URL="https://calendly.com/your-team/pbookspro-demo"

npm run build:website
npm run smoke:website
```

### 3. Deploy **`website/dist/`** only

Upload the **contents** of `website/dist/` to your static host. Do **not** deploy the raw `website/` source folder.

**Cloudflare + local API:** see [`doc/CLOUDFLARE_DEPLOY.md`](CLOUDFLARE_DEPLOY.md) — tunnel `api.pbookspro.com` → `localhost:3000`, enable backend flags, redeploy dist.

Optional build override when API hostname differs from production default:

```powershell
$env:PBBOOKS_API_URL="https://api.pbookspro.com/api"
```

| Host | Notes |
|------|-------|
| **Netlify** | Publish directory: `website/dist`; `_headers` applied automatically |
| **Cloudflare Pages** | Build command: `npm run build:website`; output: `website/dist` |
| **Azure Static Web Apps** | Same output dir; configure API CORS for `www.pbookspro.com` |
| **S3 + CloudFront** | Sync `dist/`; map `_headers` to CloudFront response headers |

Point `www.pbookspro.com` → static host.  
Point `api.pbookspro.com` → API server (port 3000 behind TLS proxy).

### 4. Staging E2E

Follow [`doc/PHASE2_STAGING_CHECKLIST.md`](PHASE2_STAGING_CHECKLIST.md):

- Trial signup → app redirect
- Demo booking → email
- Contact / newsletter / exit-intent → DB lead
- Support ticket → ticket number
- GA4/GTM debug events

### 5. Post-deploy verification

```powershell
npm run serve:dist          # local preview of dist
npm run smoke:website       # static asset checks
npm run lighthouse:website  # performance gate (optional)
```

---

## CI (automated)

Workflow: [`.github/workflows/website.yml`](../.github/workflows/website.yml)

On every PR/push touching `website/`:

1. `npm ci` + `npm run build`
2. `npm run smoke`
3. Lighthouse on homepage, pricing, download (artifact: `doc/LIGHTHOUSE_REPORT.md`)

---

## Go / No-Go (current)

| Verdict | **CONDITIONAL GO** |
|---------|-------------------|
| **Safe for soft launch** | Yes — invite-only beta, no paid ads, with API flags + dist deploy |
| **Safe for full marketing launch** | After analytics live + staging E2E pass + real screenshots |

### Full launch gate

- [ ] `npm run smoke:website` passes
- [ ] Staging E2E checklist 100% pass
- [ ] Analytics IDs in production build
- [ ] SMTP sending confirmed
- [ ] Lighthouse ≥90 mobile on homepage (target)

---

## Quick reference

| Command | Purpose |
|---------|---------|
| `npm run build:website` | Production build → `website/dist/` |
| `npm run smoke:website` | Validate dist assets |
| `npm run serve:website` | Dev preview (source) |
| `cd website && npm run serve:dist` | Preview production build |
| `npm run lighthouse:website` | Performance audit |

Related docs: [`LAUNCH_READINESS_REPORT.md`](LAUNCH_READINESS_REPORT.md) · [`PHASE2_STAGING_CHECKLIST.md`](PHASE2_STAGING_CHECKLIST.md) · [`PHASE3_POLISH.md`](PHASE3_POLISH.md)
