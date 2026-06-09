# Marketing email workflows

Automated lifecycle emails for demo requests, free trials, and newsletter signups. All templates use responsive HTML, PBooks Pro branding, open/click tracking pixels, and HMAC-signed unsubscribe links.

## Architecture

```
Lead / trial / demo event
        ↓
┌───────────────────┬────────────────────────────┐
│ Tenant lifecycle  │ Marketing lead sequences   │
│ email_automation_ │ marketing_email_queue      │
│ queue             │                            │
└─────────┬─────────┴──────────────┬─────────────┘
          ↓                        ↓
   emailAutomationSender    marketingEmailSender
          ↓                        ↓
   emailTemplateLibrary (shared HTML + brand layout)
          ↓
   SMTP → open/click via /api/email/track/*
```

| Layer | Path |
|-------|------|
| Brand layout | `backend/src/services/email/emailBrandLayout.ts` |
| Template library | `backend/src/services/email/emailTemplateLibrary.ts` |
| Marketing catalog | `backend/src/constants/marketingEmailTemplates.ts` |
| Lead sequences | `backend/src/constants/emailSequences.ts` |
| Trial schedule | `backend/src/constants/emailAutomation.ts` → `TRIAL_LIFECYCLE_SCHEDULE` |
| Queue processor | `emailSequenceService.ts`, `emailAutomationQueueService.ts` |
| Schedulers | `marketingEmailScheduler.ts`, `emailAutomationScheduler.ts` |

## Workflows

### 1. Demo Request

| # | When | Template key | Trigger |
|---|------|--------------|---------|
| 1 | Instant | `demo_confirmation` | `demoBookingEmailService` on `POST /api/demo/bookings` |
| 2 | +1 day | `demo_reminder` | `demo_request_nurture` sequence |
| 3 | +3 days | `demo_followup` | `demo_request_nurture` sequence |

Enrollment: creating a marketing lead with `source: demo_booking` enrolls steps 2–3. Email 1 is sent immediately and is not queued.

### 2. Free Trial (tenant lifecycle)

| # | Day | Event type | Subject theme |
|---|-----|------------|---------------|
| Welcome | 0 | `trial_started` | Trial started + onboarding CTA |
| Tips | 1 | `trial_day_1` | Quick-start checklist |
| Features | 3 | `trial_day_3` | Rentals, construction, reporting |
| Benefits | 7 | `trial_day_7` | Mid-trial value + upgrade |
| Upgrade | 12 | `trial_day_12` | 2 days left |
| Expiry | 14 | `trial_day_14` | Last day |

Enrollment: `trial_started` subscription event → `enrollTrialLifecycleEmails()` in `emailAutomationHooks.ts`.

### 3. Newsletter Signup

| # | When | Template key |
|---|------|--------------|
| 1 | Instant | `newsletter_welcome` |
| 2 | +1 hour | `newsletter_lead_magnet` |
| 3 | +14 days | `newsletter_week2` (optional nurture) |

Enrollment: marketing lead with `source: newsletter`.

### Lead magnet (checklist / exit-intent)

| Step | Delay | Template |
|------|-------|----------|
| Delivery | 0 | `lead_checklist_instant` |
| Tips | +2 days | `lead_checklist_day2` |
| Demo CTA | +5 days | `lead_checklist_day5` |
| Trial CTA | +10 days | `lead_checklist_day10` |

Sources: `checklist`, `exit_intent`.

## Template features

- **Responsive** — single-column, max-width 560px, mobile-friendly padding
- **Branding** — PBooks Pro indigo (`#4f46e5`), consistent header/footer
- **Preview text** — hidden preheader for inbox snippets
- **CTA buttons** — tracked via `/api/email/track/click/:token?url=`
- **Open pixel** — `/api/email/track/open/:token` (1×1 GIF)
- **Unsubscribe** — `List-Unsubscribe` header + footer link
- **Plain-text** — multipart alternative generated alongside HTML

## Tracking & unsubscribe

| Endpoint | Purpose |
|----------|---------|
| `GET /api/email/track/open/:token` | Records `opened_at` on lifecycle or marketing queue row |
| `GET /api/email/track/click/:token?url=` | Records `clicked_at`, redirects to target URL |
| `GET /api/email/unsubscribe?email=&category=&sig=` | HMAC-signed; cancels pending queue items |

Categories: `lifecycle` (trial/billing), `marketing` (leads/newsletter), `announcements`, `all`.

## Configuration

```env
# Lead nurture (demo follow-up, newsletter, checklist)
MARKETING_LEADS_ENABLED=true
MARKETING_EMAIL_SCHEDULER=true
MARKETING_EMAIL_SEND_ENABLED=true
MARKETING_SMTP_HOST=smtp.example.com
MARKETING_SMTP_PORT=587
MARKETING_EMAIL_FROM=hello@pbookspro.com
MARKETING_SITE_URL=https://www.pbookspro.com
MARKETING_LEAD_MAGNET_URL=https://www.pbookspro.com/blog/property-management-accounting-guide.html

# Demo booking
DEMO_BOOKING_ENABLED=true
DEMO_BOOKING_EMAIL_ENABLED=true
DEMO_BOOKING_CALENDLY_URL=https://calendly.com/your-team/pbookspro-demo

# Trial lifecycle (tenant emails)
EMAIL_AUTOMATION_ENABLED=true
EMAIL_AUTOMATION_SEND_ENABLED=true
EMAIL_AUTOMATION_SCHEDULER=true
EMAIL_AUTOMATION_PUBLIC_BASE_URL=https://app.pbookspro.com
EMAIL_AUTOMATION_APP_URL=https://app.pbookspro.com
EMAIL_AUTOMATION_UNSUBSCRIBE_SECRET=long-random-secret
```

Run migration `091_marketing_email_tracking.sql` for marketing open/click columns.

## API catalog

| Endpoint | Returns |
|----------|---------|
| `GET /api/marketing/sequences` | Active nurture sequence definitions |
| `GET /admin/email-automation/templates` | Tenant lifecycle template catalog |

## Adding a template

1. Add key to `marketingEmailTemplates.ts` (or `emailAutomation.ts` for tenant emails).
2. Add builder in `emailTemplateLibrary.ts`.
3. Reference the key in `emailSequences.ts` or `TRIAL_LIFECYCLE_SCHEDULE`.
4. Document in this file.
