-- Marketing email open/click tracking & unsubscribe parity with lifecycle automation

ALTER TABLE marketing_email_queue
  ADD COLUMN IF NOT EXISTS tracking_token TEXT,
  ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_email_queue_tracking
  ON marketing_email_queue (tracking_token)
  WHERE tracking_token IS NOT NULL;
