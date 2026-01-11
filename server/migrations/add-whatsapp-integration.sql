-- WhatsApp Business API Integration
-- Adds tables for WhatsApp configuration and message history

-- WhatsApp Configurations table
-- Stores per-tenant WhatsApp API configuration
CREATE TABLE IF NOT EXISTS whatsapp_configs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    
    -- API Credentials (encrypted)
    api_key TEXT NOT NULL,
    api_secret TEXT,
    
    -- WhatsApp Business API Identifiers
    phone_number_id TEXT NOT NULL,
    business_account_id TEXT,
    
    -- Webhook Configuration
    verify_token TEXT NOT NULL,
    webhook_url TEXT,
    
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    
    -- Metadata
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    UNIQUE(tenant_id)
);

-- WhatsApp Messages table
-- Stores message history for all conversations
CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    
    -- Contact Information
    contact_id TEXT,
    phone_number TEXT NOT NULL,
    
    -- Message Identifiers
    message_id TEXT UNIQUE,
    wam_id TEXT, -- WhatsApp API Message ID
    
    -- Message Details
    direction TEXT NOT NULL, -- 'outgoing' or 'incoming'
    status TEXT NOT NULL DEFAULT 'sent', -- 'sending', 'sent', 'delivered', 'read', 'failed', 'received'
    message_text TEXT,
    
    -- Media (optional)
    media_url TEXT,
    media_type TEXT, -- 'image', 'video', 'document', 'audio', 'sticker'
    media_caption TEXT,
    
    -- Timestamps
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    read_at TIMESTAMP, -- When message was read (for incoming messages)
    
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
    CONSTRAINT valid_direction CHECK (direction IN ('outgoing', 'incoming')),
    CONSTRAINT valid_status CHECK (status IN ('sending', 'sent', 'delivered', 'read', 'failed', 'received'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_whatsapp_configs_tenant_id ON whatsapp_configs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_configs_active ON whatsapp_configs(tenant_id, is_active) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_tenant_id ON whatsapp_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_contact_id ON whatsapp_messages(contact_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_phone_number ON whatsapp_messages(tenant_id, phone_number);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_message_id ON whatsapp_messages(message_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_timestamp ON whatsapp_messages(tenant_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_unread ON whatsapp_messages(tenant_id, phone_number, read_at) WHERE direction = 'incoming' AND read_at IS NULL;
