-- Hot-path indexes for dashboard aggregates, bill payments, and rental sync.

CREATE INDEX IF NOT EXISTS idx_transactions_tenant_bill
  ON transactions (tenant_id, bill_id)
  WHERE deleted_at IS NULL AND bill_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_tenant_issue_date
  ON invoices (tenant_id, issue_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_tenant_due_open
  ON invoices (tenant_id, due_date)
  WHERE deleted_at IS NULL AND status <> 'Paid';

CREATE INDEX IF NOT EXISTS idx_bills_tenant_issue_date
  ON bills (tenant_id, issue_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_bills_tenant_vendor
  ON bills (tenant_id, vendor_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_rental_agreements_tenant_status
  ON rental_agreements (tenant_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_rental_agreements_tenant_updated
  ON rental_agreements (tenant_id, updated_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_journal_reversals_tenant_original
  ON journal_reversals (tenant_id, original_journal_entry_id);

CREATE INDEX IF NOT EXISTS idx_vbac_tenant_journal
  ON vendor_bill_advance_clearings (tenant_id, journal_entry_id);
