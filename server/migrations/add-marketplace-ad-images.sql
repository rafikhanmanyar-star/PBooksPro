-- Migration: Marketplace ad images (pictures stored in DB)
-- Description: Store product images for marketplace ads as BYTEA.
-- Date: 2026-01-29

CREATE TABLE IF NOT EXISTS marketplace_ad_images (
    id VARCHAR(100) PRIMARY KEY,
    ad_id VARCHAR(100) NOT NULL,
    image_data BYTEA NOT NULL,
    content_type VARCHAR(100) NOT NULL DEFAULT 'image/jpeg',
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT fk_marketplace_ad_images_ad FOREIGN KEY (ad_id) REFERENCES marketplace_ads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_marketplace_ad_images_ad_id ON marketplace_ad_images(ad_id);
