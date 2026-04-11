-- Audit table: batches that used Internal Clearing for inter-project equity_move_in / equity_move_out (legacy non-cash flow).
-- Does not modify transactions — use for reporting and manual cleanup (re-post with bank legs if needed).

CREATE TABLE IF NOT EXISTS inter_project_clearing_legacy_audit (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  transaction_count INTEGER NOT NULL DEFAULT 0,
  first_tx_date DATE,
  note TEXT NOT NULL DEFAULT 'MOVE_IN/MOVE_OUT batch using Internal Clearing — review or re-post with bank legs.',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, batch_id)
);

INSERT INTO inter_project_clearing_legacy_audit (tenant_id, batch_id, transaction_count, first_tx_date)
SELECT
  t.tenant_id,
  t.batch_id,
  COUNT(*)::integer,
  MIN(t.date)::date
FROM transactions t
WHERE t.deleted_at IS NULL
  AND t.batch_id IS NOT NULL
  AND t.subtype IN ('equity_move_out', 'equity_move_in')
  AND (
    t.account_id IN (
      SELECT a.id FROM accounts a
      WHERE a.tenant_id = t.tenant_id AND a.deleted_at IS NULL AND a.name = 'Internal Clearing'
    )
    OR t.from_account_id IN (
      SELECT a.id FROM accounts a
      WHERE a.tenant_id = t.tenant_id AND a.deleted_at IS NULL AND a.name = 'Internal Clearing'
    )
    OR t.to_account_id IN (
      SELECT a.id FROM accounts a
      WHERE a.tenant_id = t.tenant_id AND a.deleted_at IS NULL AND a.name = 'Internal Clearing'
    )
  )
GROUP BY t.tenant_id, t.batch_id
ON CONFLICT (tenant_id, batch_id) DO NOTHING;
