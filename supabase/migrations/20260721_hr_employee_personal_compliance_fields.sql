-- ================================================================
-- Add missing columns to hr_employee_personal
-- Run in Supabase SQL Editor (production and any lagging environments)
-- ================================================================

ALTER TABLE hr_employee_personal
  ADD COLUMN IF NOT EXISTS professional_summary       text,
  ADD COLUMN IF NOT EXISTS id_type                    text,
  ADD COLUMN IF NOT EXISTS secondary_phone            text,
  ADD COLUMN IF NOT EXISTS personal_email             text,
  ADD COLUMN IF NOT EXISTS emergency_contact_name     text,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone    text,
  ADD COLUMN IF NOT EXISTS emergency_contact_relationship text,
  ADD COLUMN IF NOT EXISTS permanent_state            text,
  ADD COLUMN IF NOT EXISTS residential_address_line1  text,
  ADD COLUMN IF NOT EXISTS residential_address_line2  text,
  ADD COLUMN IF NOT EXISTS residential_city           text,
  ADD COLUMN IF NOT EXISTS residential_country        text,
  ADD COLUMN IF NOT EXISTS tax_id                     text,
  ADD COLUMN IF NOT EXISTS tax_id_type                text CHECK (
    tax_id_type IS NULL OR tax_id_type IN ('sudan_tin','personal_income_tax','vat_reg','other')
  ),
  ADD COLUMN IF NOT EXISTS visa_type                  text,
  ADD COLUMN IF NOT EXISTS visa_number                text,
  ADD COLUMN IF NOT EXISTS visa_expiry                date;

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';
