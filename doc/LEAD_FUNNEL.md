# SaaS Lead Generation Funnel

## Funnel map

```
Homepage lead magnet ──► POST /api/marketing/leads (source: checklist)
Exit-intent popup    ──► POST /api/marketing/leads (source: exit_intent)
Footer / blog news   ──► POST /api/marketing/newsletter
                              │
                              ▼
                    marketing_leads (PostgreSQL)
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
   marketing_email_enrollments      GET /api/marketing/leads/export
              │                      (CRM sync — HubSpot, Salesforce, etc.)
              ▼
   marketing_email_queue → SMTP / ESP
```

## Enable API

```env
MARKETING_LEADS_ENABLED=true
MARKETING_EMAIL_SCHEDULER=true
# Optional live send:
# MARKETING_EMAIL_SEND_ENABLED=true
# MARKETING_SMTP_HOST=...
```

Run migration `080_marketing_leads.sql`.

## CRM export shape

Each lead maps to `CrmLeadPayload` (`crmLeadMapper.ts`):

- `externalId`, `email`, `firstName`, `lastName`, `company`, `country`
- `leadSource`, `leadMagnet`, `tags`, `customFields` (UTM, page URL)

Sync:

```bash
curl -H "x-crm-export-secret: $SECRET" \
  "https://api.pbookspro.com/api/marketing/leads/export?since=2026-01-01T00:00:00Z"
```

## Email sequences

Defined in `backend/src/constants/emailSequences.ts`:

| Sequence | Trigger | Steps |
|----------|---------|-------|
| `checklist_welcome` | checklist, exit_intent | Day 0, 2, 5, 10 |
| `newsletter_nurture` | newsletter | Day 0, 14 |

View catalog: `GET /api/marketing/sequences`

## Website module

`website/js/lead-funnel.js` — `window.PBooksLeads.submitLead()` for custom forms.

Config: `website/js/leads-config.js`

Checklist asset: `website/assets/checklists/property-management-accounting-checklist.html`
