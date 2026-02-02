-- Migration: Add tenant_modules table for modular licensing
-- Created at: 2026-02-02

CREATE TABLE IF NOT EXISTS tenant_modules (
    id TEXT PRIMARY KEY DEFAULT 'mod_' || substr(md5(random()::text), 1, 16),
    tenant_id TEXT NOT NULL,
    module_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    activated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP,
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    UNIQUE(tenant_id, module_key),
    CONSTRAINT valid_status CHECK (status IN ('active', 'expired', 'suspended', 'inactive'))
);

-- Index for fast module lookups
CREATE INDEX IF NOT EXISTS idx_tenant_modules_tenant_id ON tenant_modules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_modules_module_key ON tenant_modules(module_key);

-- Add comment to documents the module keys
COMMENT ON COLUMN tenant_modules.module_key IS 'Keys: real_estate, rental, tasks, biz_planet, shop';
