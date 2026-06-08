-- Customer lifecycle email automation: templates queue, tracking, unsubscribe, campaigns

CREATE TABLE IF NOT EXISTS email_automation_unsubscribes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'all',
  unsubscribe_token TEXT NOT NULL,
  unsubscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_automation_unsub_token
  ON email_automation_unsubscribes (unsubscribe_token);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_automation_unsub_email_cat
  ON email_automation_unsubscribes (LOWER(email), COALESCE(tenant_id, ''), category);

CREATE INDEX IF NOT EXISTS idx_email_automation_unsub_email
  ON email_automation_unsubscribes (LOWER(email));

CREATE TABLE IF NOT EXISTS email_automation_campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  subject TEXT NOT NULL,
  template_key TEXT NOT NULL,
  body_override TEXT,
  target_filter JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by TEXT,
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_automation_campaigns_status
  ON email_automation_campaigns (status, scheduled_at);

CREATE TABLE IF NOT EXISTS email_automation_queue (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  event_type TEXT NOT NULL,
  template_key TEXT NOT NULL,
  subject TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  tracking_token TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  campaign_id TEXT REFERENCES email_automation_campaigns(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_automation_queue_dedupe
  ON email_automation_queue (dedupe_key);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_automation_queue_tracking
  ON email_automation_queue (tracking_token);

CREATE INDEX IF NOT EXISTS idx_email_automation_queue_pending
  ON email_automation_queue (status, scheduled_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_email_automation_queue_tenant
  ON email_automation_queue (tenant_id, event_type, created_at DESC);
