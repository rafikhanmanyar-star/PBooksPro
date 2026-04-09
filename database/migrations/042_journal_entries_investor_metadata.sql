-- Investor / project attribution on journal headers (metadata for reporting & cash flow).
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS project_id TEXT;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS investor_id TEXT;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS investor_transaction_type TEXT;
COMMENT ON COLUMN journal_entries.investor_id IS 'Equity GL account id or contact id for the investor row';
COMMENT ON COLUMN journal_entries.investor_transaction_type IS 'investment | profit_allocation | withdrawal | transfer';

CREATE INDEX IF NOT EXISTS idx_journal_entries_tenant_investor ON journal_entries (tenant_id, investor_id)
  WHERE investor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_journal_entries_tenant_project_inv ON journal_entries (tenant_id, project_id)
  WHERE project_id IS NOT NULL;
