-- Migration: Add delivery_status to purchase_bills
-- Description: Add delivery status tracking to purchase bills
-- Date: 2026-01-28

-- Add delivery_status column
ALTER TABLE purchase_bills 
ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(50) DEFAULT 'Pending';

-- Set default delivery_status based on items_received flag
UPDATE purchase_bills 
SET delivery_status = CASE 
    WHEN items_received = true THEN 'Received'
    ELSE 'Pending'
END
WHERE delivery_status IS NULL OR delivery_status = 'Pending';

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_purchase_bills_delivery_status 
ON purchase_bills(delivery_status);

-- Add check constraint for valid delivery status values
ALTER TABLE purchase_bills 
DROP CONSTRAINT IF EXISTS chk_purchase_bills_delivery_status;

ALTER TABLE purchase_bills 
ADD CONSTRAINT chk_purchase_bills_delivery_status 
CHECK (delivery_status IN ('Pending', 'Partially Received', 'Received'));
