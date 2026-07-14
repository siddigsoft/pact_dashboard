-- ============================================================
-- EMPLOYEE PROFILE ENHANCEMENTS
-- Run this migration in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ============================================================

-- ── 1. hr_employee_personal: new personal, contact & address columns ─────────

ALTER TABLE hr_employee_personal
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
  ADD COLUMN IF NOT EXISTS residential_country        text;

-- ── 2. hr_employee_documents: per-document verification workflow ─────────────

ALTER TABLE hr_employee_documents
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  ADD COLUMN IF NOT EXISTS verified_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_at         timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason    text,
  ADD COLUMN IF NOT EXISTS is_required         boolean DEFAULT false;

-- Back-fill existing documents to 'pending' (should already be default, but just in case)
UPDATE hr_employee_documents
SET verification_status = 'pending'
WHERE verification_status IS NULL;

-- ── 3. hr_employee_experience: experience sector/area field ──────────────────

ALTER TABLE hr_employee_experience
  ADD COLUMN IF NOT EXISTS sector text;

-- ── 4. Employee ID sequence table ────────────────────────────────────────────
-- Tracks the next 4-digit sequence per country code.

CREATE TABLE IF NOT EXISTS hr_employee_id_sequences (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text        NOT NULL,
  last_seq     integer     NOT NULL DEFAULT 0,
  created_at   timestamptz DEFAULT now(),
  UNIQUE (country_code)
);

-- ── 5. Function: generate_employee_id ────────────────────────────────────────
-- Returns: <COUNTRYCODE><YYYYMMDD><0001>
-- Example: SD202501250001
-- Thread-safe: uses an atomic UPDATE with RETURNING.

CREATE OR REPLACE FUNCTION generate_employee_id(
  p_country_code text,
  p_contract_date date
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_seq      integer;
  v_date_str text;
BEGIN
  v_date_str := to_char(p_contract_date, 'YYYYMMDD');

  -- Atomically increment (or insert-and-return 1 on first use for this country)
  INSERT INTO hr_employee_id_sequences (country_code, last_seq)
  VALUES (upper(p_country_code), 1)
  ON CONFLICT (country_code) DO UPDATE
    SET last_seq = hr_employee_id_sequences.last_seq + 1
  RETURNING last_seq INTO v_seq;

  RETURN upper(p_country_code) || v_date_str || lpad(v_seq::text, 4, '0');
END;
$$;

-- Grant execute to authenticated users (the function is SECURITY DEFINER so it
-- runs as the definer; row-level security on profiles still applies for the update).
GRANT EXECUTE ON FUNCTION generate_employee_id(text, date) TO authenticated;

-- ── 6. profiles: country_code column for employee ID generation ──────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS country_code text DEFAULT 'SD';

-- ── Done ─────────────────────────────────────────────────────────────────────
-- After running: reload the page — no app restart needed.
