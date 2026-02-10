-- Migration: Add whatsapp_menu_sessions table for auto-reply menu state tracking
-- Date: 2026-02-10
-- Description: Tracks which menu level each phone number is currently at
--              for the WhatsApp auto-reply menu feature.

BEGIN;

CREATE TABLE IF NOT EXISTS whatsapp_menu_sessions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    phone_number TEXT NOT NULL,
    current_menu_path TEXT NOT NULL DEFAULT 'root',
    last_interaction_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, phone_number)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_menu_sessions_tenant_phone
    ON whatsapp_menu_sessions(tenant_id, phone_number);

CREATE INDEX IF NOT EXISTS idx_whatsapp_menu_sessions_last_interaction
    ON whatsapp_menu_sessions(tenant_id, last_interaction_at);

COMMIT;
