-- Rental / owner performance: composite transaction indexes, owner balance rollups, monthly summaries.
-- owner_balances / monthly_owner_summary are maintained by the API on transaction insert/update/delete.

-- Transaction list + ledger-style filters by property and date
CREATE INDEX IF NOT EXISTS idx_transactions_tenant_property_date
  ON transactions (tenant_id, property_id, date)
  WHERE deleted_at IS NULL AND property_id IS NOT NULL;

-- Resolve owner_id from property_ownership by date range (matches resolveOwnerIdFromProperty)
CREATE INDEX IF NOT EXISTS idx_property_ownership_tenant_property_active_dates
  ON property_ownership (tenant_id, property_id, start_date)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS owner_balances (
  tenant_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  balance NUMERIC(18, 2) NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, owner_id, property_id)
);

CREATE INDEX IF NOT EXISTS idx_owner_balances_tenant_owner
  ON owner_balances (tenant_id, owner_id);

CREATE TABLE IF NOT EXISTS monthly_owner_summary (
  tenant_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  month DATE NOT NULL,
  total_rent NUMERIC(18, 2) NOT NULL DEFAULT 0,
  total_expense NUMERIC(18, 2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, owner_id, property_id, month)
);

CREATE INDEX IF NOT EXISTS idx_monthly_owner_summary_tenant_month
  ON monthly_owner_summary (tenant_id, month);

-- One-time rollup from existing transactions (monthly summary left at zero; forward-filled by API)
INSERT INTO owner_balances (tenant_id, owner_id, property_id, balance, last_updated)
SELECT
  t.tenant_id,
  t.owner_id,
  t.property_id,
  SUM(
    CASE
      WHEN t.type = 'Income' THEN t.amount
      WHEN t.type = 'Expense' THEN -t.amount
      ELSE 0::numeric
    END
  ) AS balance,
  NOW()
FROM transactions t
WHERE t.deleted_at IS NULL
  AND t.owner_id IS NOT NULL
  AND t.property_id IS NOT NULL
  AND TRIM(t.owner_id) <> ''
  AND TRIM(t.property_id) <> ''
GROUP BY t.tenant_id, t.owner_id, t.property_id
ON CONFLICT (tenant_id, owner_id, property_id) DO UPDATE
SET
  balance = EXCLUDED.balance,
  last_updated = NOW();

-- Historical monthly rollups (rent = income linked to rental module invoices; expense = all property expenses)
INSERT INTO monthly_owner_summary (
  tenant_id,
  owner_id,
  property_id,
  month,
  total_rent,
  total_expense,
  net_amount
)
SELECT
  t.tenant_id,
  t.owner_id,
  t.property_id,
  date_trunc('month', t.date::timestamp)::date AS month,
  SUM(
    CASE
      WHEN t.type = 'Income'
        AND i.invoice_type IN ('Rental', 'Security Deposit', 'Service Charge')
      THEN t.amount
      ELSE 0::numeric
    END
  ) AS total_rent,
  SUM(CASE WHEN t.type = 'Expense' THEN t.amount ELSE 0::numeric END) AS total_expense,
  SUM(
    CASE
      WHEN t.type = 'Income'
        AND i.invoice_type IN ('Rental', 'Security Deposit', 'Service Charge')
      THEN t.amount
      ELSE 0::numeric
    END
  ) - SUM(CASE WHEN t.type = 'Expense' THEN t.amount ELSE 0::numeric END) AS net_amount
FROM transactions t
LEFT JOIN invoices i
  ON i.id = t.invoice_id AND i.tenant_id = t.tenant_id AND i.deleted_at IS NULL
WHERE t.deleted_at IS NULL
  AND t.owner_id IS NOT NULL
  AND t.property_id IS NOT NULL
  AND TRIM(t.owner_id) <> ''
  AND TRIM(t.property_id) <> ''
GROUP BY t.tenant_id, t.owner_id, t.property_id, date_trunc('month', t.date::timestamp)::date
ON CONFLICT (tenant_id, owner_id, property_id, month) DO UPDATE
SET
  total_rent = EXCLUDED.total_rent,
  total_expense = EXCLUDED.total_expense,
  net_amount = EXCLUDED.net_amount;
