-- Allow cash slices alongside advance slices (counts toward bills.paid_amount; journal-only cash leg).
ALTER TABLE vendor_bill_advance_clearings
  ADD COLUMN IF NOT EXISTS settlement_kind TEXT NOT NULL DEFAULT 'advance';

ALTER TABLE vendor_bill_advance_clearings
  DROP CONSTRAINT IF EXISTS vendor_bill_advance_clearings_contractor_advance_id_fkey;

ALTER TABLE vendor_bill_advance_clearings
  ALTER COLUMN contractor_advance_id DROP NOT NULL;

ALTER TABLE vendor_bill_advance_clearings
  ADD CONSTRAINT vendor_bill_advance_clearings_contractor_advance_id_fkey
  FOREIGN KEY (contractor_advance_id) REFERENCES contractor_advances(id) ON DELETE RESTRICT;

ALTER TABLE vendor_bill_advance_clearings DROP CONSTRAINT IF EXISTS vbac_adv_or_cash_chk;
ALTER TABLE vendor_bill_advance_clearings ADD CONSTRAINT vbac_adv_or_cash_chk CHECK (
  (settlement_kind = 'advance' AND contractor_advance_id IS NOT NULL)
  OR (settlement_kind = 'cash' AND contractor_advance_id IS NULL)
);

COMMENT ON COLUMN vendor_bill_advance_clearings.settlement_kind IS
  'advance: applied from prepaid; cash: cleared via JE bank credit (included in bill paid totals, no duplicate expense txn).';
