-- Migration: Add type, area, and floor fields to units table
-- Date: 2024
-- Description: Adds type, area, and floor columns to the units table for better unit categorization

-- Add type column (e.g., 2BHK, shop, Office)
ALTER TABLE units 
ADD COLUMN IF NOT EXISTS type TEXT;

-- Add area column (area in square feet)
ALTER TABLE units 
ADD COLUMN IF NOT EXISTS area DECIMAL(15, 2);

-- Add floor column (e.g., Ground floor, 1st floor)
ALTER TABLE units 
ADD COLUMN IF NOT EXISTS floor TEXT;

-- Add comments for documentation
COMMENT ON COLUMN units.type IS 'Unit type (e.g., 2BHK, shop, Office)';
COMMENT ON COLUMN units.area IS 'Area in square feet';
COMMENT ON COLUMN units.floor IS 'Floor number or description (e.g., Ground floor, 1st floor)';
