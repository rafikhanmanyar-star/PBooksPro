-- Unified lead management: mobile, campaign, normalized status values

ALTER TABLE marketing_leads ADD COLUMN IF NOT EXISTS mobile TEXT;
ALTER TABLE marketing_leads ADD COLUMN IF NOT EXISTS campaign TEXT;

-- Backfill campaign from UTM when missing
UPDATE marketing_leads
SET campaign = utm_campaign
WHERE campaign IS NULL AND utm_campaign IS NOT NULL;

-- Backfill mobile from demo booking metadata where available
UPDATE marketing_leads ml
SET mobile = db.mobile_number
FROM demo_bookings db
WHERE ml.id = db.lead_id
  AND ml.mobile IS NULL
  AND db.mobile_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_marketing_leads_campaign ON marketing_leads (campaign, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_leads_mobile ON marketing_leads (mobile)
  WHERE mobile IS NOT NULL;
