-- Migration: Separate Vendors from Contacts (Refined)
-- Date: 2026-02-04

-- 1. Create vendors table
CREATE TABLE IF NOT EXISTS vendors (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    contact_no TEXT,
    company_name TEXT,
    address TEXT,
    description TEXT,
    user_id TEXT REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 2. Migrate existing Vendor contacts to vendors table
INSERT INTO vendors (id, tenant_id, name, contact_no, company_name, address, description, user_id, created_at, updated_at)
SELECT id, tenant_id, name, contact_no, company_name, address, description, user_id, created_at, updated_at
FROM contacts
WHERE type = 'Vendor'
ON CONFLICT (id) DO NOTHING;

-- 3. Modify referencing tables
-- Bills
ALTER TABLE bills ADD COLUMN IF NOT EXISTS vendor_id TEXT REFERENCES vendors(id);
ALTER TABLE bills ALTER COLUMN contact_id DROP NOT NULL;

-- Contracts
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS vendor_id_new TEXT REFERENCES vendors(id);
ALTER TABLE contracts ALTER COLUMN vendor_id DROP NOT NULL;

-- Transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS vendor_id TEXT REFERENCES vendors(id);

-- Quotations
-- (Assuming quotations table exists and has vendor_id)
-- We need to drop the old FK if it exists and add new one, but let's just make it point to vendors.
-- Actually, without knowing the constraint name, we can't easily drop it.
-- But if we delete from contacts, it will fail if there's a FK.
-- So we should SET NULL or update it.

-- 4. Update data and break links to contacts for vendors
UPDATE bills b SET vendor_id = b.contact_id, contact_id = NULL 
WHERE EXISTS (SELECT 1 FROM vendors v WHERE v.id = b.contact_id);

UPDATE contracts c SET vendor_id_new = c.vendor_id, vendor_id = NULL 
WHERE EXISTS (SELECT 1 FROM vendors v WHERE v.id = c.vendor_id);

UPDATE transactions t SET vendor_id = t.contact_id, contact_id = NULL 
WHERE EXISTS (SELECT 1 FROM vendors v WHERE v.id = t.contact_id);

-- If quotations exist
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'quotations') THEN
        ALTER TABLE quotations ADD COLUMN IF NOT EXISTS vendor_id_new TEXT REFERENCES vendors(id);
        UPDATE quotations q SET vendor_id_new = q.vendor_id 
        WHERE EXISTS (SELECT 1 FROM vendors v WHERE v.id = q.vendor_id);
    END IF;
END $$;

-- 5. Delete from contacts
DELETE FROM contacts WHERE type = 'Vendor';

-- 6. Enable RLS on vendors
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON vendors;
CREATE POLICY tenant_isolation ON vendors FOR ALL USING (tenant_id = get_current_tenant_id()) WITH CHECK (tenant_id = get_current_tenant_id());
