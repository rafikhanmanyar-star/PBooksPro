-- Organization approval workflow (pre-Paddle SaaS protection)

CREATE SEQUENCE IF NOT EXISTS tenant_registration_ref_seq START 1;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'PENDING';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS registration_reference TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS approved_by TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS rejected_by TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_status_check;
ALTER TABLE tenants ADD CONSTRAINT tenants_status_check
  CHECK (status IN ('PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED'));

-- Existing organizations were created before approval workflow — grant immediate access.
UPDATE tenants SET status = 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_registration_reference
  ON tenants (registration_reference)
  WHERE registration_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tenants_status_created
  ON tenants (status, created_at DESC);
