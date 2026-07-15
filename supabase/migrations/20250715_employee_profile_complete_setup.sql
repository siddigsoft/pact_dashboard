-- ============================================================================
-- EMPLOYEE PROFILE — COMPLETE SETUP & FIXES
-- Run this ONCE in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Safe to re-run: all statements use IF NOT EXISTS / CREATE OR REPLACE.
-- ============================================================================
-- Fixes included:
--   1. Create all hr_employee_* tables if they don't exist yet
--   2. Add all new columns from the enhancement migration
--   3. Expand degree_level CHECK constraint to include new degree types
--   4. Fix staff_contracts RLS to cover all admin role variants
--   5. Add storage policies for the staff-contracts bucket
--   6. Create hr_employee_id_sequences table + generate_employee_id() RPC
--   7. Add country_code to profiles
-- ============================================================================


-- ── STEP 1: Helper function ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION is_hr_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN (
      'admin','super_admin','superAdmin','SuperAdmin',
      'ict','hr_admin','Admin','SuperAdmin'
    )
  );
$$;


-- ── STEP 2: Create base tables (safe if already exist) ───────────────────────

CREATE TABLE IF NOT EXISTS hr_employee_personal (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date_of_birth    date,
  gender           text CHECK (gender IN ('male','female','other','prefer_not_to_say')),
  nationality      text,
  marital_status   text CHECK (marital_status IN ('single','married','divorced','widowed','other')),
  national_id_no   text,
  passport_no      text,
  passport_expiry  date,
  blood_type       text CHECK (blood_type IN ('A+','A-','B+','B-','AB+','AB-','O+','O-','unknown')),
  address_line1    text,
  address_line2    text,
  city             text,
  country          text DEFAULT 'Sudan',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id)
);

-- Education — create without the narrow CHECK so new degree types work freely
CREATE TABLE IF NOT EXISTS hr_employee_education (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  degree_level     text NOT NULL,
  institution      text NOT NULL,
  field_of_study   text,
  graduation_year  int,
  country          text,
  grade            text,
  notes            text,
  sort_order       int NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hr_employee_experience (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  employer         text NOT NULL,
  job_title        text NOT NULL,
  start_date       date NOT NULL,
  end_date         date,
  is_current       boolean NOT NULL DEFAULT false,
  description      text,
  location         text,
  sort_order       int NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hr_employee_documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  doc_type         text NOT NULL CHECK (doc_type IN (
                     'national_id','passport','photo','cv','resume',
                     'academic_certificate','work_permit','reference_letter',
                     'medical_certificate','police_clearance','other'
                   )),
  doc_name         text NOT NULL,
  file_path        text NOT NULL,
  file_size        bigint,
  file_mime        text,
  expiry_date      date,
  notes            text,
  uploaded_by      uuid REFERENCES profiles(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hr_employee_skills (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  skill_name       text NOT NULL,
  skill_level      text CHECK (skill_level IN ('beginner','intermediate','advanced','expert')),
  category         text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hr_employee_languages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  language         text NOT NULL,
  proficiency      text CHECK (proficiency IN ('basic','conversational','fluent','native')),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hr_employee_references (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ref_name         text NOT NULL,
  ref_title        text,
  organization     text,
  email            text,
  phone            text,
  relationship     text,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_hr_personal_profile    ON hr_employee_personal(profile_id);
CREATE INDEX IF NOT EXISTS idx_hr_education_profile   ON hr_employee_education(profile_id);
CREATE INDEX IF NOT EXISTS idx_hr_experience_profile  ON hr_employee_experience(profile_id);
CREATE INDEX IF NOT EXISTS idx_hr_documents_profile   ON hr_employee_documents(profile_id);
CREATE INDEX IF NOT EXISTS idx_hr_skills_profile      ON hr_employee_skills(profile_id);
CREATE INDEX IF NOT EXISTS idx_hr_languages_profile   ON hr_employee_languages(profile_id);
CREATE INDEX IF NOT EXISTS idx_hr_references_profile  ON hr_employee_references(profile_id);


-- ── STEP 3: Drop the old narrow degree_level CHECK (if it exists) ─────────────
-- The original had only: high_school, diploma, bachelor, master, phd, professional, other
-- We now support: vocational, college_diploma, postgrad_diploma too.
-- Drop by name (constraint is named hr_employee_education_degree_level_check by Postgres default).

ALTER TABLE hr_employee_education
  DROP CONSTRAINT IF EXISTS hr_employee_education_degree_level_check;

-- No replacement CHECK — degree_level is validated in the application layer.


-- ── STEP 4: New columns from the enhancement migration ────────────────────────

-- hr_employee_personal: emergency contact, secondary phone, residential address
ALTER TABLE hr_employee_personal
  ADD COLUMN IF NOT EXISTS id_type                       text,
  ADD COLUMN IF NOT EXISTS secondary_phone               text,
  ADD COLUMN IF NOT EXISTS personal_email                text,
  ADD COLUMN IF NOT EXISTS emergency_contact_name        text,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone       text,
  ADD COLUMN IF NOT EXISTS emergency_contact_relationship text,
  ADD COLUMN IF NOT EXISTS permanent_state               text,
  ADD COLUMN IF NOT EXISTS residential_address_line1     text,
  ADD COLUMN IF NOT EXISTS residential_address_line2     text,
  ADD COLUMN IF NOT EXISTS residential_city              text,
  ADD COLUMN IF NOT EXISTS residential_country           text;

-- hr_employee_documents: verification workflow columns
ALTER TABLE hr_employee_documents
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  ADD COLUMN IF NOT EXISTS verified_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_at         timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason    text,
  ADD COLUMN IF NOT EXISTS is_required         boolean DEFAULT false;

-- Backfill existing rows
UPDATE hr_employee_documents
SET verification_status = 'pending'
WHERE verification_status IS NULL;

-- hr_employee_experience: sector/area field
ALTER TABLE hr_employee_experience
  ADD COLUMN IF NOT EXISTS sector text;

-- profiles: country_code for Employee ID generation
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS country_code text DEFAULT 'SD';


-- ── STEP 5: Employee ID sequence infrastructure ───────────────────────────────

CREATE TABLE IF NOT EXISTS hr_employee_id_sequences (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text        NOT NULL,
  last_seq     integer     NOT NULL DEFAULT 0,
  created_at   timestamptz DEFAULT now(),
  UNIQUE (country_code)
);

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
  INSERT INTO hr_employee_id_sequences (country_code, last_seq)
  VALUES (upper(p_country_code), 1)
  ON CONFLICT (country_code) DO UPDATE
    SET last_seq = hr_employee_id_sequences.last_seq + 1
  RETURNING last_seq INTO v_seq;
  RETURN upper(p_country_code) || v_date_str || lpad(v_seq::text, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION generate_employee_id(text, date) TO authenticated;


-- ── STEP 6: Enable RLS on all HR tables ───────────────────────────────────────

ALTER TABLE hr_employee_personal    ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_employee_education   ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_employee_experience  ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_employee_documents   ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_employee_skills      ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_employee_languages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_employee_references  ENABLE ROW LEVEL SECURITY;


-- ── STEP 7: RLS policies — drop old, recreate fresh ──────────────────────────

-- Personal
DROP POLICY IF EXISTS "hr_personal_select" ON hr_employee_personal;
DROP POLICY IF EXISTS "hr_personal_insert" ON hr_employee_personal;
DROP POLICY IF EXISTS "hr_personal_update" ON hr_employee_personal;
DROP POLICY IF EXISTS "hr_personal_delete" ON hr_employee_personal;
CREATE POLICY "hr_personal_select" ON hr_employee_personal FOR SELECT USING (profile_id = auth.uid() OR is_hr_admin());
CREATE POLICY "hr_personal_insert" ON hr_employee_personal FOR INSERT WITH CHECK (is_hr_admin());
CREATE POLICY "hr_personal_update" ON hr_employee_personal FOR UPDATE USING (is_hr_admin());
CREATE POLICY "hr_personal_delete" ON hr_employee_personal FOR DELETE USING (is_hr_admin());

-- Education
DROP POLICY IF EXISTS "hr_education_select" ON hr_employee_education;
DROP POLICY IF EXISTS "hr_education_insert" ON hr_employee_education;
DROP POLICY IF EXISTS "hr_education_update" ON hr_employee_education;
DROP POLICY IF EXISTS "hr_education_delete" ON hr_employee_education;
CREATE POLICY "hr_education_select" ON hr_employee_education FOR SELECT USING (profile_id = auth.uid() OR is_hr_admin());
CREATE POLICY "hr_education_insert" ON hr_employee_education FOR INSERT WITH CHECK (is_hr_admin());
CREATE POLICY "hr_education_update" ON hr_employee_education FOR UPDATE USING (is_hr_admin());
CREATE POLICY "hr_education_delete" ON hr_employee_education FOR DELETE USING (is_hr_admin());

-- Experience
DROP POLICY IF EXISTS "hr_experience_select" ON hr_employee_experience;
DROP POLICY IF EXISTS "hr_experience_insert" ON hr_employee_experience;
DROP POLICY IF EXISTS "hr_experience_update" ON hr_employee_experience;
DROP POLICY IF EXISTS "hr_experience_delete" ON hr_employee_experience;
CREATE POLICY "hr_experience_select" ON hr_employee_experience FOR SELECT USING (profile_id = auth.uid() OR is_hr_admin());
CREATE POLICY "hr_experience_insert" ON hr_employee_experience FOR INSERT WITH CHECK (is_hr_admin());
CREATE POLICY "hr_experience_update" ON hr_employee_experience FOR UPDATE USING (is_hr_admin());
CREATE POLICY "hr_experience_delete" ON hr_employee_experience FOR DELETE USING (is_hr_admin());

-- Documents
DROP POLICY IF EXISTS "hr_documents_select" ON hr_employee_documents;
DROP POLICY IF EXISTS "hr_documents_insert" ON hr_employee_documents;
DROP POLICY IF EXISTS "hr_documents_update" ON hr_employee_documents;
DROP POLICY IF EXISTS "hr_documents_delete" ON hr_employee_documents;
CREATE POLICY "hr_documents_select" ON hr_employee_documents FOR SELECT USING (profile_id = auth.uid() OR is_hr_admin());
CREATE POLICY "hr_documents_insert" ON hr_employee_documents FOR INSERT WITH CHECK (is_hr_admin());
CREATE POLICY "hr_documents_update" ON hr_employee_documents FOR UPDATE USING (is_hr_admin());
CREATE POLICY "hr_documents_delete" ON hr_employee_documents FOR DELETE USING (is_hr_admin());

-- Skills
DROP POLICY IF EXISTS "hr_skills_select" ON hr_employee_skills;
DROP POLICY IF EXISTS "hr_skills_insert" ON hr_employee_skills;
DROP POLICY IF EXISTS "hr_skills_update" ON hr_employee_skills;
DROP POLICY IF EXISTS "hr_skills_delete" ON hr_employee_skills;
CREATE POLICY "hr_skills_select" ON hr_employee_skills FOR SELECT USING (profile_id = auth.uid() OR is_hr_admin());
CREATE POLICY "hr_skills_insert" ON hr_employee_skills FOR INSERT WITH CHECK (is_hr_admin());
CREATE POLICY "hr_skills_update" ON hr_employee_skills FOR UPDATE USING (is_hr_admin());
CREATE POLICY "hr_skills_delete" ON hr_employee_skills FOR DELETE USING (is_hr_admin());

-- Languages
DROP POLICY IF EXISTS "hr_languages_select" ON hr_employee_languages;
DROP POLICY IF EXISTS "hr_languages_insert" ON hr_employee_languages;
DROP POLICY IF EXISTS "hr_languages_update" ON hr_employee_languages;
DROP POLICY IF EXISTS "hr_languages_delete" ON hr_employee_languages;
CREATE POLICY "hr_languages_select" ON hr_employee_languages FOR SELECT USING (profile_id = auth.uid() OR is_hr_admin());
CREATE POLICY "hr_languages_insert" ON hr_employee_languages FOR INSERT WITH CHECK (is_hr_admin());
CREATE POLICY "hr_languages_update" ON hr_employee_languages FOR UPDATE USING (is_hr_admin());
CREATE POLICY "hr_languages_delete" ON hr_employee_languages FOR DELETE USING (is_hr_admin());

-- References
DROP POLICY IF EXISTS "hr_references_select" ON hr_employee_references;
DROP POLICY IF EXISTS "hr_references_insert" ON hr_employee_references;
DROP POLICY IF EXISTS "hr_references_update" ON hr_employee_references;
DROP POLICY IF EXISTS "hr_references_delete" ON hr_employee_references;
CREATE POLICY "hr_references_select" ON hr_employee_references FOR SELECT USING (profile_id = auth.uid() OR is_hr_admin());
CREATE POLICY "hr_references_insert" ON hr_employee_references FOR INSERT WITH CHECK (is_hr_admin());
CREATE POLICY "hr_references_update" ON hr_employee_references FOR UPDATE USING (is_hr_admin());
CREATE POLICY "hr_references_delete" ON hr_employee_references FOR DELETE USING (is_hr_admin());


-- ── STEP 8: Fix staff_contracts RLS ──────────────────────────────────────────
-- The previous policy only covered 'admin','super_admin','ict'
-- Missing: 'superAdmin','SuperAdmin','hr_admin','Admin' variants

ALTER TABLE public.staff_contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_contracts_admin_all"    ON public.staff_contracts;
DROP POLICY IF EXISTS "staff_contracts_select_auth"  ON public.staff_contracts;
DROP POLICY IF EXISTS "staff_contracts_select"       ON public.staff_contracts;
DROP POLICY IF EXISTS "staff_contracts_insert"       ON public.staff_contracts;
DROP POLICY IF EXISTS "staff_contracts_update"       ON public.staff_contracts;
DROP POLICY IF EXISTS "staff_contracts_delete"       ON public.staff_contracts;

-- Admins can do everything
CREATE POLICY "staff_contracts_admin_all"
ON public.staff_contracts FOR ALL
TO authenticated
USING (is_hr_admin())
WITH CHECK (is_hr_admin());

-- Any authenticated user can VIEW their own contract
CREATE POLICY "staff_contracts_own_select"
ON public.staff_contracts FOR SELECT
TO authenticated
USING (profile_id = auth.uid() OR is_hr_admin());


-- ── STEP 9: Storage policies for staff-contracts bucket ──────────────────────

-- Ensure bucket exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('staff-contracts', 'staff-contracts', false)
ON CONFLICT (id) DO NOTHING;

-- Drop old narrow policies
DROP POLICY IF EXISTS "staff_contracts_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "staff_contracts_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "staff_contracts_storage_delete" ON storage.objects;
DROP POLICY IF EXISTS "staff_contracts_storage_update" ON storage.objects;

-- Admins can upload to staff-contracts bucket
CREATE POLICY "staff_contracts_storage_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'staff-contracts'
  AND is_hr_admin()
);

-- Authenticated users can view files in their own folder or if admin
CREATE POLICY "staff_contracts_storage_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'staff-contracts'
  AND (
    is_hr_admin()
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);

-- Admins can delete
CREATE POLICY "staff_contracts_storage_delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'staff-contracts' AND is_hr_admin());


-- ── Done ─────────────────────────────────────────────────────────────────────
-- After running: hard-refresh the app (Ctrl+Shift+R) to clear the schema cache.
-- You do NOT need to restart the server.
