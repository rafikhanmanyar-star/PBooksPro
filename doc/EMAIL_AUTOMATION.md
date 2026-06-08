# Email Automation Architecture

Lifecycle and campaign emails for PBooks Pro tenants: template catalog, PostgreSQL queue, scheduler, open/click tracking, and unsubscribe.

## Events

| Event | Trigger | Template key |
|-------|---------|--------------|
| Trial Started | `trial_started` subscription event | `trial_started` |
| Trial Day 3 | Scheduled +3 days from trial start | `trial_day_3` |
| Trial Day 7 | Scheduled +7 days | `trial_day_7` |
| Trial Day 14 | Scheduled +14 days | `trial_day_14` |
| Trial Expiring | Scheduled 2 days before `trial_end_date` | `trial_expiring` |
| Subscription Purchased | `subscription_activated` | `subscription_purchased` |
| Payment Failed | Paddle `transaction.payment_failed` / `subscription.past_due` | `payment_failed` |
| Subscription Cancelled | `subscription_canceled` / `subscription.canceled` | `subscription_cancelled` |
| New Feature Announcement | Admin campaign | `new_feature_announcement` |
| Re-engagement Campaign | Admin campaign (expired/inactive tenants) | `re_engagement_campaign` |

## Components

- **Templates:** `backend/src/constants/emailAutomation.ts` + `emailAutomationTemplates.ts`
- **Queue:** `email_automation_queue` (dedupe keys, `FOR UPDATE SKIP LOCKED`)
- **Scheduler:** `emailAutomationScheduler.ts` (default 5 min interval)
- **Hooks:** `subscriptionEventService` → `emailAutomationHooks.ts`
- **Tracking:** `GET /api/email/track/open/:token`, `GET /api/email/track/click/:token?url=`
- **Unsubscribe:** `GET /api/email/unsubscribe?email=&tenant=&category=&sig=` (HMAC-signed)

## Configuration

```env
EMAIL_AUTOMATION_ENABLED=true
EMAIL_AUTOMATION_SEND_ENABLED=true
EMAIL_AUTOMATION_SCHEDULER=true
EMAIL_AUTOMATION_INTERVAL_MS=300000
EMAIL_AUTOMATION_SMTP_HOST=smtp.example.com
EMAIL_AUTOMATION_SMTP_PORT=587
EMAIL_AUTOMATION_SMTP_USER=
EMAIL_AUTOMATION_SMTP_PASS=
EMAIL_AUTOMATION_EMAIL_FROM=hello@pbookspro.com
EMAIL_AUTOMATION_PUBLIC_BASE_URL=https://app.pbookspro.com
EMAIL_AUTOMATION_APP_URL=https://app.pbookspro.com
EMAIL_AUTOMATION_BILLING_URL=https://app.pbookspro.com/settings?tab=billing
EMAIL_AUTOMATION_UNSUBSCRIBE_SECRET=long-random-secret
```

Falls back to `MARKETING_SMTP_*` / `DR_SMTP_*` when automation SMTP is unset.

## Migration

```bash
npm run migrate --prefix backend
```

Applies `085_email_automation.sql`.

## Admin API (super_admin)

- `GET /api/admin/email-automation/templates`
- `GET /api/admin/email-automation/stats`
- `GET /api/admin/email-automation/queue?status=sent`
- `GET /api/admin/email-automation/campaigns`
- `POST /api/admin/email-automation/campaigns` — create (optional `launchNow`)
- `POST /api/admin/email-automation/campaigns/:id/launch`

## Unsubscribe categories

- `lifecycle` — trial and billing emails
- `announcements` — product updates
- `marketing` — re-engagement
- `all` — use `&scope=all` on unsubscribe URL
