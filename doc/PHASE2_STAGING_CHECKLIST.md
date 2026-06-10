# PBooksPro — Phase 2 Staging Checklist

Use this after Phase 1 P0 fixes and before public launch. Run against **staging** API + **`website/dist/`** deploy preview.

---

## 1. Production environment (API server)

Copy `backend/.env.production.launch.example` values into your production/staging `.env`:

| Variable | Required | Purpose |
|----------|----------|---------|
| `ALLOW_TRIAL_SIGNUP` | Yes | Website trial signup |
| `MARKETING_LEADS_ENABLED` | Yes | Contact, newsletter, exit-intent |
| `SUPPORT_TICKETS_ENABLED` | Yes | Support center forms |
| `DEMO_BOOKING_ENABLED` | Yes | Demo page bookings |
| `EMAIL_AUTOMATION_ENABLED` | Yes | Trial drip emails |
| `MARKETING_EMAIL_SEND_ENABLED` | Yes | Demo/newsletter nurture |
| `EMAIL_AUTOMATION_PUBLIC_BASE_URL` | Yes | Links in emails |
| `TRIAL_SIGNUP_APP_URL` | Yes | Post-signup redirect |

Configure SMTP hosts (`MARKETING_SMTP_*`, `EMAIL_AUTOMATION_SMTP_*`, `DEMO_BOOKING_*`).

Restart API after changes: `npm run build:backend && npm run start:backend`

---

## 2. Analytics (build-time)

Set env vars **before** `npm run build:website`:

```bash
set PBBOOKS_GTM_ID=GTM-XXXXXXX
set PBBOOKS_GA4_ID=G-XXXXXXXXXX
set PBBOOKS_META_PIXEL_ID=1234567890
set PBBOOKS_LINKEDIN_PARTNER_ID=1234567
set PBBOOKS_GA4_VIA_GTM=true
```

Deploy `website/dist/`. In browser:

1. Open site with `?utm_source=staging&utm_medium=checklist`
2. Accept cookies (analytics + marketing)
3. DevTools → Network: confirm GTM/GA requests
4. GTM Preview mode: verify events below

| Event | Trigger |
|-------|---------|
| `page_view` | Any page load |
| `demo_request` | Submit demo form |
| `trial_signup` | Complete trial signup |
| `contact_form_submit` | Contact form |
| `newsletter_signup` | Footer newsletter |
| `exit_intent_submit` | Exit popup |
| `pricing_page_view` | Open pricing |
| `support_ticket_submit` | Support ticket |

---

## 3. Website deploy

```bash
npm run build:website
# Deploy website/dist/ to CDN (Netlify, Cloudflare Pages, etc.)
```

Verify `_headers` applied (CSP, HSTS, cache). Confirm **not** serving raw `website/` source.

---

## 4. End-to-end funnel tests

### Trial signup
1. Open `/download.html`
2. Complete form → redirect to app with `?trial_code=...`
3. Confirm app login + onboarding wizard
4. Check PostgreSQL: new tenant, marketing lead, trial subscription

### Demo booking
1. Open `/demo.html`, submit form
2. Confirm success message + confirmation email
3. Check `demo_bookings` / marketing lead record

### Contact form
1. `/contact.html` → submit
2. Lead in admin CRM / `marketing_leads`

### Newsletter
1. Footer subscribe on homepage
2. Welcome email queued (if SMTP enabled)

### Exit intent
1. Homepage → move mouse to top edge (desktop)
2. Submit email → lead + `exit_intent_submit` event

### Support tickets
1. `/support.html` → submit contact ticket
2. Ticket number returned; row in support tickets table

---

## 5. Manual QA (Phase 2 UX)

- [ ] Nav identical on all pages (Home, Features, **Pricing**, About, Blog, Support, Contact, Free Trial)
- [ ] Logo links to home
- [ ] Skip link visible on Tab
- [ ] Cookie Settings in footer reopens consent
- [ ] Testimonials show “Representative outcomes…” disclaimer
- [ ] OG images use `.webp` (Facebook Debugger / LinkedIn Post Inspector)
- [ ] No console 404s for JS/CSS on homepage, pricing, contact, support

---

## 6. Launch score gate

Re-run launch audit. Target **≥ 75/100** with:

- All P0 resolved
- Analytics IDs live
- E2E funnels passing on staging
- `dist/` deployed with security headers

---

## Quick local preview

```powershell
cd "C:\My Projects\PBooksPro -Local DB only"
npm run build:website
cd website
npm run serve:dist
```

Open http://127.0.0.1:8765/ (requires API at localhost:3000 for form submissions).
