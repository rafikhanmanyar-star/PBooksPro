-- Snapshot project/building shares on each payslip at generation time (immutable for that row).
ALTER TABLE payslips
  ADD COLUMN IF NOT EXISTS assignment_snapshot JSONB DEFAULT NULL;

COMMENT ON COLUMN payslips.assignment_snapshot IS 'JSON: { projects: [...], buildings?: [...] } copied from employee at payslip creation';
