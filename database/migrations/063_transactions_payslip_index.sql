-- Payroll payslip lookups on transactions (revert, ledger sync, payslip delete guards).
CREATE INDEX IF NOT EXISTS idx_transactions_tenant_payslip
  ON transactions (tenant_id, payslip_id)
  WHERE deleted_at IS NULL AND payslip_id IS NOT NULL;
