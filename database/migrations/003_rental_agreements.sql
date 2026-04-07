-- Rental agreements (tenant-scoped; property_id references app state until properties exist in LAN DB)
-- Applied after 002_contacts.sql

CREATE TABLE IF NOT EXISTS rental_agreements (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agreement_number TEXT NOT NULL,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE RESTRICT,
  property_id TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  monthly_rent NUMERIC(18, 2) NOT NULL,
  rent_due_date INTEGER,
  status TEXT NOT NULL,
  description TEXT,
  security_deposit NUMERIC(18, 2),
  broker_id TEXT,
  broker_fee NUMERIC(18, 2),
  owner_id TEXT,
  previous_agreement_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, agreement_number)
);

CREATE INDEX IF NOT EXISTS idx_rental_agreements_tenant ON rental_agreements(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_rental_agreements_contact ON rental_agreements(tenant_id, contact_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_rental_agreements_property ON rental_agreements(tenant_id, property_id) WHERE deleted_at IS NULL;
