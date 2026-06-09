-- Demo booking requests from the public marketing website

CREATE TABLE IF NOT EXISTS demo_bookings (
  id TEXT PRIMARY KEY,
  booking_ref TEXT NOT NULL UNIQUE,
  lead_id TEXT REFERENCES marketing_leads(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  company_name TEXT NOT NULL,
  email TEXT NOT NULL,
  mobile_number TEXT NOT NULL,
  city TEXT NOT NULL,
  user_count TEXT NOT NULL,
  business_type TEXT NOT NULL,
  preferred_date DATE,
  preferred_time TEXT,
  additional_notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  page_url TEXT,
  user_agent TEXT,
  ip_address TEXT,
  calendar_provider TEXT,
  calendar_event_url TEXT,
  confirmation_email_sent_at TIMESTAMPTZ,
  admin_notified_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demo_bookings_email ON demo_bookings (LOWER(email), created_at DESC);
CREATE INDEX IF NOT EXISTS idx_demo_bookings_status ON demo_bookings (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_demo_bookings_preferred_date ON demo_bookings (preferred_date)
  WHERE preferred_date IS NOT NULL;
