-- Migration: Add Views Column to Marketplace Ads
-- Description: Track how many times an ad has been viewed.
-- Date: 2026-01-31

ALTER TABLE marketplace_ads ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0;
