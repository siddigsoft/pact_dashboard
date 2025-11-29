-- Migration: Normalize fee structures to SDG
-- Date: 2025-11-28
-- Description: Converts coordinator/supervisor fees from cents to SDG
-- 
-- Background: The column `site_visit_base_fee_cents` has a legacy naming convention.
-- According to documentation, fees are stored directly in SDG, not cents.
-- However, some coordinator/supervisor fees were entered in cents (60000, 45000, etc.)
-- while dataCollector fees were correctly entered in SDG (600, 350, 200).
--
-- This migration normalizes all fees to SDG by dividing values > 1000 by 100.

-- Update coordinator and supervisor fees that were entered in cents
UPDATE classification_fee_structures 
SET site_visit_base_fee_cents = site_visit_base_fee_cents / 100
WHERE role_scope IN ('coordinator', 'supervisor')
  AND site_visit_base_fee_cents > 1000
  AND is_active = true;

-- Add site_visits fee columns if not present (for storing fees at claim/accept time)
ALTER TABLE site_visits 
ADD COLUMN IF NOT EXISTS enumerator_fee NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS transport_fee NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS cost NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS mmp_site_entry_id UUID REFERENCES mmp_site_entries(id),
ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS completed_by UUID;

-- Comment explaining the column naming convention
COMMENT ON COLUMN classification_fee_structures.site_visit_base_fee_cents IS 
'Legacy column name - values are stored directly in SDG, not cents. 
Base fee before complexity multiplier is applied.';
