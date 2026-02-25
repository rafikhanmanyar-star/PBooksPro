-- Migration: Fix bills where contact_id was set to a vendor id (violates bills_contact_id_fkey)
-- Date: 2026-02-27
-- Description: bills.contact_id REFERENCES contacts(id); vendor ids live in vendors table.
--              For vendor bills, contact_id must be NULL and vendor_id set. This corrects
--              any rows that have contact_id = vendor id (e.g. from PM cycle with vendor selected).

BEGIN;

-- Set contact_id = NULL and ensure vendor_id is set for bills that reference a vendor in contact_id
UPDATE bills b
SET contact_id = NULL,
    vendor_id = COALESCE(b.vendor_id, b.contact_id)
WHERE b.contact_id IS NOT NULL
  AND b.contact_id IN (SELECT id FROM vendors);

COMMIT;
