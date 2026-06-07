-- Marketing leads & email nurture sequences (public website funnel)

CREATE TABLE IF NOT EXISTS marketing_leads (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  lead_magnet TEXT,
  name TEXT,
  email TEXT NOT NULL,
  company TEXT,
  country TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  page_url TEXT,
  user_agent TEXT,
  ip_address TEXT,
  crm_external_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_leads_email ON marketing_leads (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_marketing_leads_source ON marketing_leads (source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_leads_status ON marketing_leads (status, created_at DESC);

CREATE TABLE IF NOT EXISTS marketing_email_enrollments (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES marketing_leads(id) ON DELETE CASCADE,
  sequence_id TEXT NOT NULL,
  current_step INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  next_send_at TIMESTAMPTZ,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (lead_id, sequence_id)
);

CREATE INDEX IF NOT EXISTS idx_marketing_enrollments_next ON marketing_email_enrollments (status, next_send_at)
  WHERE status = 'active' AND next_send_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS marketing_email_queue (
  id TEXT PRIMARY KEY,
  enrollment_id TEXT NOT NULL REFERENCES marketing_email_enrollments(id) ON DELETE CASCADE,
  lead_id TEXT NOT NULL REFERENCES marketing_leads(id) ON DELETE CASCADE,
  sequence_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  template_key TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_email_queue_pending ON marketing_email_queue (status, scheduled_at)
  WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_email_queue_step
  ON marketing_email_queue (enrollment_id, step_id);
