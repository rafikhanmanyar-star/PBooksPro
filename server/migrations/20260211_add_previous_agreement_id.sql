-- Migration: Add previous_agreement_id to rental_agreements for renewal chain tracking
-- Date: 2026-02-11

ALTER TABLE rental_agreements 
ADD COLUMN IF NOT EXISTS previous_agreement_id TEXT;
