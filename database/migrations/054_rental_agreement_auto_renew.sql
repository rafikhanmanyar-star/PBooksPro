-- Optional: auto-renewal flag per rental agreement (LAN / PostgreSQL)
ALTER TABLE rental_agreements
  ADD COLUMN IF NOT EXISTS auto_renew_lease BOOLEAN NOT NULL DEFAULT false;
