-- Project attribution on GL lines (cash flow / project TB). Nullable for legacy rows.
ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS project_id TEXT;
CREATE INDEX IF NOT EXISTS idx_journal_lines_tenant_project ON journal_lines (project_id) WHERE project_id IS NOT NULL;
