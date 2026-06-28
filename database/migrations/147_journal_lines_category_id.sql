-- P0-B Migration 3 — journal_lines.category_id analytical dimension.
-- Nullable; stamped on the P&L leg so category drill-down derives from the GL (not the legacy
-- parallel category engine). Historical rows stay NULL and are unaffected.
-- Apply with: npm run db:migrate:lan.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'journal_lines' AND column_name = 'category_id'
  ) THEN
    ALTER TABLE journal_lines ADD COLUMN category_id TEXT REFERENCES categories(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_journal_lines_category ON journal_lines(category_id) WHERE category_id IS NOT NULL;

COMMENT ON COLUMN journal_lines.category_id IS
  'Optional analytical dimension. Stamped on revenue/expense legs under gl_native_pl for P&L drill-down. NULL on balance-sheet legs and all legacy rows.';
