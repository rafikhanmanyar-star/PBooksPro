# Marketing analytics architecture

## Files

| File | Role |
|------|------|
| `website/js/analytics-config.js` | Provider IDs, consent version, scroll thresholds |
| `website/js/analytics.js` | Consent UI, event hub, auto-tracking, provider adapters |
| `services/analytics/trackEvent.ts` | In-app events (delegates to `PBooksAnalytics` when present) |

## Production setup

Edit `website/js/analytics-config.js`:

```javascript
ga4MeasurementId: 'G-XXXXXXXX',
clarityProjectId: 'your-clarity-id',
metaPixelId: 'your-pixel-id',
linkedInPartnerId: 'your-partner-id',
consentRequired: true,
consentVersion: '2026-06-07', // bump when cookie policy changes
```

Include on every marketing page (before `analytics.js`):

```html
<script src="js/demo-config.js" defer></script>
<script src="js/analytics-config.js" defer></script>
<script src="js/analytics.js" defer></script>
```

Regenerate shells after template changes:

```bash
node website/js/blog-shell.js
node website/js/seo-landing-shell.js
```

## Event taxonomy

| Event | When fired |
|-------|------------|
| `page_view` | Every page load |
| `cta_click` | Primary CTAs, hero buttons, plan buttons |
| `demo_request` | Demo links / demo form / demo login |
| `trial_signup` | Download/trial CTAs and trial signup form |
| `pricing_page_view` | `pricing.html` render |
| `video_view` | Product tour play |
| `form_submit` | Any form submit (+ funnel-specific events) |
| `scroll_depth` | 25 / 50 / 75 / 90 / 100% scroll milestones |

Custom funnel events (`lead_magnet_submit`, `newsletter_success`, `demo_tour_*`) continue to fire for backward compatibility.

## Privacy

- Consent banner: **Accept all**, **Reject non-essential**, **Customize**
- Analytics consent → GA4, Microsoft Clarity
- Marketing consent → Meta Pixel, LinkedIn Insight Tag
- GA4 Consent Mode v2 defaults denied until granted
- No email/phone/name in analytics payloads (sanitized)
- `PBooksAnalytics.reopenConsent()` — cookie settings (footer link on homepage)

## Listening for events

```javascript
window.addEventListener('pbooks:analytics', (e) => {
  console.log(e.detail.event, e.detail.properties);
});
```

## Provider mapping

- **GA4:** standard + mapped names (`generate_lead`, `sign_up`, `video_start`, …)
- **Meta:** `PageView`, `Lead`, `ViewContent`, `Contact`
- **Clarity:** session recordings / heatmaps (script load only)
- **LinkedIn:** page insights (script load only)
- **Demo API:** `demo_*` events → `POST /api/demo/analytics`
