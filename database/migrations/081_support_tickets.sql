-- Support center tickets (public website → PostgreSQL → helpdesk/CRM integration)



CREATE TABLE IF NOT EXISTS support_tickets (

  id TEXT PRIMARY KEY,

  ticket_number TEXT NOT NULL UNIQUE,

  ticket_type TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'open',

  priority TEXT NOT NULL DEFAULT 'normal',

  name TEXT NOT NULL,

  email TEXT NOT NULL,

  organization TEXT,

  subject TEXT NOT NULL,

  message TEXT NOT NULL,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  page_url TEXT,

  user_agent TEXT,

  ip_address TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);



CREATE INDEX IF NOT EXISTS idx_support_tickets_email ON support_tickets (LOWER(email));

CREATE INDEX IF NOT EXISTS idx_support_tickets_type ON support_tickets (ticket_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_number ON support_tickets (ticket_number);


