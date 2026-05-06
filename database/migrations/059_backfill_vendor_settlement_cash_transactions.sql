-- Mirror hybrid vendor-bill settlement cash legs as app `transactions` (Expense + bill_id).
-- Cash slices stay in vendor_bill_advance_clearings for JE linkage; aggregates count advance rows + txns only.
-- Idempotent: transaction id tx_vbcash_<clearing_id>; skips when pay account cannot be inferred from JE lines.

WITH pay_lines AS (
  SELECT
    vbc.id AS clearing_id,
    vbc.tenant_id,
    vbc.bill_id,
    vbc.amount AS clearing_amt,
    vbc.journal_entry_id,
    je.entry_date::date AS entry_date_only,
    (
      SELECT jl.account_id
      FROM journal_lines jl
      WHERE jl.journal_entry_id = vbc.journal_entry_id
        AND COALESCE(jl.credit_amount, 0) > 0
        AND COALESCE(jl.debit_amount, 0) = 0
        AND ROUND(jl.credit_amount::numeric, 2) = ROUND(vbc.amount::numeric, 2)
      ORDER BY jl.line_number DESC
      LIMIT 1
    ) AS pay_account_id
  FROM vendor_bill_advance_clearings vbc
  INNER JOIN journal_entries je ON je.id = vbc.journal_entry_id AND je.tenant_id = vbc.tenant_id
  WHERE COALESCE(TRIM(vbc.settlement_kind), 'advance') = 'cash'
    AND TRIM(COALESCE(je.source_module, '')) = 'vendor_bill_advance_clearing'
),
eligible AS (SELECT * FROM pay_lines WHERE pay_account_id IS NOT NULL),
ins AS (
  INSERT INTO transactions (
    id,
    tenant_id,
    user_id,
    type,
    subtype,
    amount,
    date,
    description,
    reference,
    account_id,
    category_id,
    contact_id,
    vendor_id,
    project_id,
    bill_id,
    batch_id,
    is_system,
    version,
    deleted_at,
    created_at,
    updated_at
  )
  SELECT
    'tx_vbcash_' || e.clearing_id,
    e.tenant_id,
    NULL,
    'Expense',
    'vendor_settlement_cash',
    ROUND(e.clearing_amt::numeric, 2),
    e.entry_date_only,
    'Cash/bank leg from supplier prepaid settlement (' || ROUND(e.clearing_amt::numeric, 2) || ') — bill #' ||
      COALESCE(NULLIF(TRIM(b.bill_number::text), ''), b.id),
    'VSET:' || e.journal_entry_id::text,
    e.pay_account_id,
    b.category_id,
    b.contact_id,
    b.vendor_id,
    b.project_id,
    e.bill_id,
    NULL,
    FALSE,
    1,
    NULL,
    NOW(),
    NOW()
  FROM eligible e
  INNER JOIN bills b ON b.id = e.bill_id AND b.tenant_id = e.tenant_id AND b.deleted_at IS NULL
  WHERE NOT EXISTS (SELECT 1 FROM transactions x WHERE x.id = 'tx_vbcash_' || e.clearing_id)
  RETURNING tenant_id, bill_id
),
affected AS (
  SELECT DISTINCT vbc.tenant_id, vbc.bill_id
  FROM vendor_bill_advance_clearings vbc
  WHERE COALESCE(TRIM(vbc.settlement_kind), 'advance') = 'cash'
),
agg AS (
  SELECT
    a.tenant_id,
    a.bill_id AS id,
    ROUND(
      GREATEST(
        0::numeric,
        COALESCE(
          (
            SELECT SUM(t.amount::numeric)
            FROM transactions t
            WHERE t.tenant_id = a.tenant_id
              AND t.bill_id = a.bill_id
              AND t.deleted_at IS NULL
              AND LOWER(TRIM(t.type)) IN ('expense', 'income')
          ),
          0
        ) + COALESCE(
          (
            SELECT SUM(v.amount::numeric)
            FROM vendor_bill_advance_clearings v
            WHERE v.tenant_id = a.tenant_id
              AND v.bill_id = a.bill_id
              AND COALESCE(TRIM(v.settlement_kind), 'advance') <> 'cash'
          ),
          0
        )
      )::numeric,
      2
    ) AS paid
  FROM affected a
)
UPDATE bills b
SET
  paid_amount = agg.paid,
  status = CASE
    WHEN agg.paid >= ROUND(b.amount::numeric, 2) - 0.01 THEN 'Paid'
    WHEN agg.paid > 0.01 THEN 'Partially Paid'
    ELSE 'Unpaid'
  END,
  version = b.version + 1,
  updated_at = NOW()
FROM agg
WHERE b.tenant_id = agg.tenant_id
  AND b.id = agg.id
  AND b.deleted_at IS NULL;
