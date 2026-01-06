-- Migration: Add version column to bills table
-- This migration adds a version column for optimistic locking to prevent double payment race conditions

-- Add version column to bills table
ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Create index on (id, version) for efficient conflict detection
CREATE INDEX IF NOT EXISTS idx_bills_id_version ON bills(id, version);

-- Note: All existing bills will have version = 1
-- The version will be incremented each time a bill is updated

