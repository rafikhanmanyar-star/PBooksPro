-- Normalize project_agreements.status to Title Case expected by the client (Sales Returns picker, filters).
-- Legacy rows may store ACTIVE / active / etc.

UPDATE project_agreements
SET status = CASE LOWER(TRIM(status))
  WHEN 'active' THEN 'Active'
  WHEN 'cancelled' THEN 'Cancelled'
  WHEN 'canceled' THEN 'Cancelled'
  WHEN 'completed' THEN 'Completed'
  WHEN 'complete' THEN 'Completed'
  ELSE status
END
WHERE deleted_at IS NULL
  AND status IS NOT NULL
  AND LOWER(TRIM(status)) IN ('active', 'cancelled', 'canceled', 'completed', 'complete');
