-- Links regular vendor bills (`bills`) to contractor/supplier advances for paid_amount aggregation.
-- Each row clears part of unpaid balance without a cash transaction until journal settles economics.

CREATE TABLE IF NOT EXISTS vendor_bill_advance_clearings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  bill_id TEXT NOT NULL REFERENCES bills(id) ON DELETE RESTRICT,
  contractor_advance_id TEXT NOT NULL REFERENCES contractor_advances(id) ON DELETE RESTRICT,
  amount NUMERIC(18, 2) NOT NULL,
  journal_entry_id TEXT REFERENCES journal_entries(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT vendor_bill_advance_clearings_amount_positive CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_vbac_tenant_bill ON vendor_bill_advance_clearings(tenant_id, bill_id);

CREATE INDEX IF NOT EXISTS idx_vbac_tenant_advance ON vendor_bill_advance_clearings(tenant_id, contractor_advance_id);

