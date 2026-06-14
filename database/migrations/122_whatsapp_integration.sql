-- WhatsApp Business API: tenant config, message history, auto-reply menu sessions

CREATE TABLE IF NOT EXISTS whatsapp_configs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  api_key TEXT NOT NULL,
  api_secret TEXT,
  phone_number_id TEXT NOT NULL,
  business_account_id TEXT,
  verify_token TEXT NOT NULL,
  webhook_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id)
);

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  phone_number TEXT NOT NULL,
  message_id TEXT UNIQUE,
  wam_id TEXT,
  direction TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  message_text TEXT,
  media_url TEXT,
  media_type TEXT,
  media_caption TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  CONSTRAINT whatsapp_messages_valid_direction CHECK (direction IN ('outgoing', 'incoming')),
  CONSTRAINT whatsapp_messages_valid_status CHECK (
    status IN ('sending', 'sent', 'delivered', 'read', 'failed', 'received')
  )
);

CREATE TABLE IF NOT EXISTS whatsapp_menu_sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  current_menu_path TEXT NOT NULL DEFAULT 'root',
  last_interaction_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, phone_number)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_configs_tenant_id ON whatsapp_configs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_configs_active ON whatsapp_configs(tenant_id, is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_tenant_id ON whatsapp_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_contact_id ON whatsapp_messages(contact_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_phone_number ON whatsapp_messages(tenant_id, phone_number);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_message_id ON whatsapp_messages(message_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_timestamp ON whatsapp_messages(tenant_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_unread ON whatsapp_messages(tenant_id, phone_number, read_at)
  WHERE direction = 'incoming' AND read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_whatsapp_menu_sessions_tenant_phone ON whatsapp_menu_sessions(tenant_id, phone_number);
CREATE INDEX IF NOT EXISTS idx_whatsapp_menu_sessions_last_interaction ON whatsapp_menu_sessions(tenant_id, last_interaction_at);
