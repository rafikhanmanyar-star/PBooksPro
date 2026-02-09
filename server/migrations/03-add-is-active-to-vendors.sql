-- Migration: Add is_active to vendors
-- Date: 2026-02-07

ALTER TABLE vendors ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
