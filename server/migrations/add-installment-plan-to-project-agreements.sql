-- Migration: Add installment_plan column to project_agreements table
-- This allows each agreement to store its own installment plan configuration

-- Add installment_plan column as JSONB to store the plan configuration
ALTER TABLE project_agreements 
ADD COLUMN IF NOT EXISTS installment_plan JSONB;

-- Add comment to document the column
COMMENT ON COLUMN project_agreements.installment_plan IS 'Stores installment plan configuration (durationYears, downPaymentPercentage, frequency) for this agreement';

