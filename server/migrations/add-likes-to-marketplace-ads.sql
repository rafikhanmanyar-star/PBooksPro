-- Migration: Add Likes Column to Marketplace Ads
-- Description: Track how many times an ad has been liked.
-- Date: 2026-01-31

ALTER TABLE marketplace_ads ADD COLUMN IF NOT EXISTS likes INTEGER DEFAULT 0;
