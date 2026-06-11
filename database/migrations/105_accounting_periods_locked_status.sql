-- Architecture v2: add LOCKED status to accounting periods (super_admin override only).

ALTER TABLE accounting_periods DROP CONSTRAINT IF EXISTS accounting_periods_status_check;
ALTER TABLE accounting_periods ADD CONSTRAINT accounting_periods_status_check
  CHECK (status IN ('open', 'closed', 'locked'));

COMMENT ON COLUMN accounting_periods.status IS 'open=full access; closed=no mutations; locked=super_admin override only';
