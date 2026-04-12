-- Speeds up assertExpenseProjectCashAvailable: transactions by tenant, project, and date.
CREATE INDEX IF NOT EXISTS idx_transactions_tenant_project_date
  ON transactions (tenant_id, project_id, date)
  WHERE deleted_at IS NULL AND project_id IS NOT NULL;
