-- ============================================================================
-- HR TASK #81 — Compliance Fields, Dependents, IT Accounts
-- Run ONCE in Supabase SQL Editor.
-- Safe to re-run: all statements use IF NOT EXISTS / DO $$ blocks.
-- ============================================================================

-- ── 1. Add compliance/work-auth columns to hr_employee_personal ──────────────

ALTER TABLE hr_employee_personal
  ADD COLUMN IF NOT EXISTS tax_id            text,
  ADD COLUMN IF NOT EXISTS tax_id_type       text CHECK (
    tax_id_type IS NULL OR tax_id_type IN ('sudan_tin','personal_income_tax','vat_reg','other')
  ),
  ADD COLUMN IF NOT EXISTS visa_type         text CHECK (
    visa_type IS NULL OR visa_type IN (
      'work_permit','residence_permit','business_visa','diplomatic',
      'humanitarian','student','transit','none','other'
    )
  ),
  ADD COLUMN IF NOT EXISTS visa_expiry       date,
  ADD COLUMN IF NOT EXISTS visa_number       text;

-- ── 2. Add probation and working-pattern columns to profiles ─────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS probation_end_date   date,
  ADD COLUMN IF NOT EXISTS probation_confirmed  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS working_pattern      text CHECK (
    working_pattern IS NULL OR working_pattern IN (
      'full-time','part-time','remote','hybrid','field'
    )
  );

-- ── 3. Create hr_employee_dependents table ───────────────────────────────────

CREATE TABLE IF NOT EXISTS hr_employee_dependents (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  full_name           text NOT NULL,
  relationship        text NOT NULL CHECK (relationship IN (
    'spouse','child','parent','sibling','other'
  )),
  date_of_birth       date,
  gender              text CHECK (gender IS NULL OR gender IN ('male','female','other')),
  national_id_no      text,
  is_beneficiary      boolean NOT NULL DEFAULT false,
  health_insurance    boolean NOT NULL DEFAULT false,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hr_employee_dependents_profile_id_idx
  ON hr_employee_dependents(profile_id);

-- ── 4. Create hr_it_accounts table ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hr_it_accounts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  system_name  text NOT NULL,
  username     text,
  account_type text NOT NULL DEFAULT 'standard' CHECK (account_type IN (
    'standard','admin','service','shared','other'
  )),
  status       text NOT NULL DEFAULT 'active' CHECK (status IN (
    'active','suspended','pending','deprovisioned'
  )),
  provisioned_at   date,
  deprovisioned_at date,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hr_it_accounts_profile_id_idx
  ON hr_it_accounts(profile_id);

-- ── 5. RLS policies ──────────────────────────────────────────────────────────

ALTER TABLE hr_employee_dependents ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_it_accounts         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_dependents_admin_all   ON hr_employee_dependents;
DROP POLICY IF EXISTS hr_dependents_self_read   ON hr_employee_dependents;
DROP POLICY IF EXISTS hr_it_accounts_admin_all  ON hr_it_accounts;
DROP POLICY IF EXISTS hr_it_accounts_self_read  ON hr_it_accounts;

CREATE POLICY hr_dependents_admin_all ON hr_employee_dependents
  FOR ALL USING (is_hr_admin()) WITH CHECK (is_hr_admin());

CREATE POLICY hr_dependents_self_read ON hr_employee_dependents
  FOR SELECT USING (profile_id = auth.uid());

-- IT Accounts: HR/Super Admin only — no self-read (sensitive system metadata)
CREATE POLICY hr_it_accounts_admin_all ON hr_it_accounts
  FOR ALL USING (is_hr_admin()) WITH CHECK (is_hr_admin());
