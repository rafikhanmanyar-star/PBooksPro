-- Add module_key column to payments table
-- Created at: 2026-02-02

ALTER TABLE payments ADD COLUMN IF NOT EXISTS module_key TEXT;
