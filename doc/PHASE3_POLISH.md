# Phase 3 — Polish & Performance

Post-launch optimization items from the launch readiness audit.

---

## Completed in codebase

| Item | Implementation |
|------|----------------|
| **Accessibility** | `site-a11y.js` — auto `<main>` landmark, help search label; skip link + hamburger a11y via `site-nav.js` |
| **Self-hosted icons** | `@fortawesome/fontawesome-free` → `website/fonts/` + `css/icons-subset.css` (no CDN) |
| **Lighthouse CI** | `npm run lighthouse:ci` (website) or `npm run lighthouse:website` (root) |
| **Calendly embed** | `demo-booking.js` + `PBBOOKS_CALENDLY_URL` at build; API `DEMO_BOOKING_CALENDLY_URL` fallback |
| **Customer logo bar** | Homepage `#customerLogosMount` — text badges with disclaimer |
| **Favicon** | `website/favicon.svg` injected in production build |
| **Scroll / WhatsApp** | Scroll-to-top offset above WhatsApp float |

---

## Commands

```powershell
# Regenerate local Font Awesome assets
cd website
npm run prepare:fonts

# Production build (includes fonts + favicon)
npm run build

# Preview production build
npm run serve:dist

# Lighthouse (server must be running on BASE_URL)
npm run serve:dist
npm run lighthouse:ci
# Or against production:
$env:BASE_URL="https://www.pbookspro.com"; npm run lighthouse:ci
```

Report written to `doc/LIGHTHOUSE_REPORT.md`.

---

## Calendly setup

**Option A — build-time (static site):**

```powershell
$env:PBBOOKS_CALENDLY_URL="https://calendly.com/your-team/pbookspro-demo"
npm run build:website
```

**Option B — API (dynamic):**

```env
DEMO_BOOKING_CALENDLY_URL=https://calendly.com/your-team/pbookspro-demo
```

Embed appears on `demo.html` sidebar when URL is set.

---

## Customer logos

Edit `website/js/customer-logos-config.js`. Replace text badges with `<img>` when logo assets and permissions are available.

---

## Lighthouse targets

| Page | Performance | Accessibility | Best Practices | SEO |
|------|------------:|--------------:|---------------:|----:|
| Homepage | ≥90 | ≥90 | ≥90 | ≥90 |
| Pricing | ≥90 | ≥90 | ≥90 | ≥90 |
| Download | ≥90 | ≥90 | ≥90 | ≥90 |

---

## Remaining optional polish

- Replace customer text badges with verified logo SVGs/PNGs
- Add real product screenshots (replace `dashboard-hero.webp` placeholders)
- LinkedIn company link in footer when profile is live
- Run Lighthouse in CI on every release (GitHub Action)
