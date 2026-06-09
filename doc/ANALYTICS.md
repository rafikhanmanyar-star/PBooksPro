# Marketing analytics & conversion tracking

## Architecture

```
Website funnels (forms, CTAs, exit intent)
        ↓
  PBooksAnalytics.track()  ← analytics.js hub
        ↓
┌───────┴───────┬─────────────┬──────────────┐
│  GTM dataLayer │  GA4 gtag   │ Meta / LI    │
│  pbooks_*      │  (direct)   │  Pixel       │
└───────────────┴─────────────┴──────────────┘
```

| File | Role |
|------|------|
| `website/js/analytics-config.js` | GTM, GA4, Meta, LinkedIn IDs, consent version |
| `website/js/analytics.js` | Consent, UTM attribution, event hub, auto-tracking |
| `services/analytics/trackEvent.ts` | In-app events (delegates to `PBooksAnalytics`) |

## Production setup

**Recommended:** set IDs at build time (injected into `dist/` HTML):

```powershell
$env:PBBOOKS_GTM_ID="GTM-XXXXXXX"
$env:PBBOOKS_GA4_ID="G-XXXXXXXXXX"
$env:PBBOOKS_META_PIXEL_ID="1234567890"
$env:PBBOOKS_LINKEDIN_PARTNER_ID="1234567"
$env:PBBOOKS_GA4_VIA_GTM="true"
npm run build:website
```

Or edit `website/js/analytics-config.js` directly for local/dev:

```javascript
gtmContainerId: 'GTM-XXXXXXX',      // Google Tag Manager (recommended)
ga4MeasurementId: 'G-XXXXXXXX',     // Direct GA4 (or configure inside GTM)
ga4ViaGtm: false,                   // true = skip direct gtag, use GTM only
metaPixelId: 'XXXXXXXXXXXX',
linkedInPartnerId: 'XXXXXXX',
linkedInConversions: {
  demo_request: '12345678',
  trial_signup: '87654321',
  newsletter_signup: '',
  contact_form_submit: ''
},
consentRequired: true,
consentVersion: '2026-06-08'
```

Include on every marketing page **before** funnel scripts:

```html
<script src="js/demo-config.js" defer></script>
<script src="js/analytics-config.js" defer></script>
<script src="js/analytics.js" defer></script>
```

### GTM container

1. Create container at [tagmanager.google.com](https://tagmanager.google.com)
2. Set `gtmContainerId` in config
3. Add **Custom Event** triggers matching `pbooks_<event_name>` (e.g. `pbooks_demo_request`)
4. Or use one trigger on `pbooks_*` regex and read `event_name` from dataLayer
5. Optional: add GA4 Configuration tag + Consent Mode tags in GTM

**dataLayer shape** (every conversion):

```javascript
{
  event: 'pbooks_demo_request',     // GTM trigger name
  event_name: 'demo_request',       // canonical name
  event_category: 'conversion',
  event_action: 'lead',
  utm_source: '...',
  utm_medium: '...',
  utm_campaign: '...',
  first_touch_source: '...',
  page_path: '/pricing.html',
  ...
}
```

## Event naming standards

| Rule | Example |
|------|---------|
| snake_case | `demo_request` |
| Stable — never rename without GTM migration | — |
| Funnel stage in `funnel_stage` | `cta_click`, `form_submit`, `success` |
| No PII in payloads | No email, phone, or personal names |

### Core conversion events

| Event | When fired | Category |
|-------|------------|----------|
| `page_view` | Every page load | navigation |
| `cta_click` | Hero/footer/primary button clicks | engagement |
| `pricing_click` | Pricing plan CTA clicks | engagement |
| `demo_request` | Demo links, demo form, booking success | conversion |
| `trial_signup` | Trial CTAs, download/trial form, account created | conversion |
| `newsletter_signup` | Footer/blog newsletter success | conversion |
| `whatsapp_click` | Floating WhatsApp or wa.me links | conversion |
| `contact_form_submit` | Contact page form success | conversion |
| `form_submit` | Any form submit (generic) | engagement |

### Supporting events

| Event | When fired |
|-------|------------|
| `pricing_page_view` | `pricing.html` load |
| `scroll_depth` | 25 / 50 / 75 / 90 / 100% scroll |
| `video_view` | Product tour play |
| `exit_intent_*` | Exit popup funnel |

Legacy funnel events (`lead_magnet_submit`, `demo_booking_success`, etc.) still fire for backward compatibility.

## UTM & campaign attribution

Captured automatically on landing:

| Field | Scope |
|-------|--------|
| `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content` | Session (URL params) |
| `first_touch_*` | First visit with UTM (localStorage) |
| `session_source`, `session_medium`, `session_campaign` | Current session |
| `referrer` | document.referrer |

Attached to **every** `track()` call. Referrer inferred when UTM absent (`google`, `meta`, `linkedin`, `direct`).

## Provider mapping

| Event | GA4 | Meta standard | Meta custom | LinkedIn |
|-------|-----|---------------|-------------|----------|
| `page_view` | page_view | PageView | — | insights |
| `cta_click` | select_promotion | Contact | PbooksCtaClick | — |
| `pricing_click` | select_item | ViewContent | PbooksPricingClick | — |
| `demo_request` | generate_lead | Lead | PbooksDemoRequest | conversion* |
| `trial_signup` | sign_up | Lead | PbooksTrialSignup | conversion* |
| `newsletter_signup` | sign_up | Lead | PbooksNewsletterSignup | conversion* |
| `contact_form_submit` | generate_lead | Lead | PbooksContactForm | conversion* |
| `whatsapp_click` | generate_lead | Contact | PbooksWhatsAppClick | — |

\* Requires `linkedInConversions.<event>` ID in config.

## Privacy

- Consent banner: Accept all / Reject / Customize
- Analytics consent → GA4, GTM, Clarity
- Marketing consent → Meta Pixel, LinkedIn
- GA4 Consent Mode v2 — denied until granted
- PII stripped from all outbound payloads
- `PBooksAnalytics.reopenConsent()` — footer cookie settings link

## Listening & debugging

```javascript
// Enable debug logs
PBooksAnalyticsConfig.debug = true;

// Subscribe to all events
window.addEventListener('pbooks:analytics', (e) => {
  console.log(e.detail.event, e.detail.properties);
});

// Read attribution
PBooksAnalytics.getAttribution();
```

## Markup conventions

```html
<a href="demo.html" data-analytics-cta="hero_demo">Book a demo</a>
<form data-analytics-form="contact" ...>
```

Auto-tracked selectors: `.pricing-plan-cta`, `.hero-buttons a`, `[data-whatsapp-lead]`, `.wa-lead-float`.
