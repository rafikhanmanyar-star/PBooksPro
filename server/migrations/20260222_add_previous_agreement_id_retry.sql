-- Migration: Retry adding previous_agreement_id to rental_agreements
-- The original migration (20260219) may have been marked as applied without
-- this ALTER actually executing due to batch error handling in the runner.
-- Date: 2026-02-22

ALTER TABLE rental_agreements 
ADD COLUMN IF NOT EXISTS previous_agreement_id TEXT;
