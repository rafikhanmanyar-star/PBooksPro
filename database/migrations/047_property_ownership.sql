-- Percentage-based property co-ownership (history-preserving; multiple active rows per property).
-- Run after 004_buildings_properties.sql and 002_contacts.sql.

CREATE TABLE IF NOT EXISTS property_ownership (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE RESTRICT,
  ownership_percentage NUMERIC(18, 4) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT property_ownership_pct_positive CHECK (ownership_percentage > 0),
  CONSTRAINT property_ownership_end_after_start CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_property_ownership_tenant_property
  ON property_ownership(tenant_id, property_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_property_ownership_property_dates
  ON property_ownership(property_id, start_date, end_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_property_ownership_active
  ON property_ownership(property_id, is_active)
  WHERE is_active = TRUE AND deleted_at IS NULL;
