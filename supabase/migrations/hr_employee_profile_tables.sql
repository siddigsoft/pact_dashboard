-- ============================================================
-- HR Employee Full Profile Tables
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Personal Details (one-to-one with profiles)
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

-- 2. Education History (one-to-many)
CREATE TABLE IF NOT EXISTS hr_employee_education (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  degree_level     text NOT NULL CHECK (degree_level IN ('high_school','diploma','bachelor','master','phd','professional','other')),
  institution      text NOT NULL,
  field_of_study   text,
  graduation_year  int,
  country          text,
  grade            text,
  notes            text,
  sort_order       int NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- 3. Work Experience (one-to-many)
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

-- 4. Employee Documents (document vault)
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

-- 5. Skills
CREATE TABLE IF NOT EXISTS hr_employee_skills (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  skill_name       text NOT NULL,
  skill_level      text CHECK (skill_level IN ('beginner','intermediate','advanced','expert')),
  category         text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- 6. Languages
CREATE TABLE IF NOT EXISTS hr_employee_languages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  language         text NOT NULL,
  proficiency      text CHECK (proficiency IN ('basic','conversational','fluent','native')),
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- 7. References
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

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_hr_personal_profile       ON hr_employee_personal(profile_id);
CREATE INDEX IF NOT EXISTS idx_hr_education_profile      ON hr_employee_education(profile_id);
CREATE INDEX IF NOT EXISTS idx_hr_experience_profile     ON hr_employee_experience(profile_id);
CREATE INDEX IF NOT EXISTS idx_hr_documents_profile      ON hr_employee_documents(profile_id);
CREATE INDEX IF NOT EXISTS idx_hr_skills_profile         ON hr_employee_skills(profile_id);
CREATE INDEX IF NOT EXISTS idx_hr_languages_profile      ON hr_employee_languages(profile_id);
CREATE INDEX IF NOT EXISTS idx_hr_references_profile     ON hr_employee_references(profile_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE hr_employee_personal    ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_employee_education   ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_employee_experience  ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_employee_documents   ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_employee_skills      ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_employee_languages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_employee_references  ENABLE ROW LEVEL SECURITY;

-- Helper: is the current user an admin/HR role?
CREATE OR REPLACE FUNCTION is_hr_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin','super_admin','superAdmin','SuperAdmin','ict','hr_admin')
  );
$$;

-- Personal
CREATE POLICY "hr_personal_select" ON hr_employee_personal FOR SELECT
  USING (profile_id = auth.uid() OR is_hr_admin());
CREATE POLICY "hr_personal_insert" ON hr_employee_personal FOR INSERT
  WITH CHECK (is_hr_admin());
CREATE POLICY "hr_personal_update" ON hr_employee_personal FOR UPDATE
  USING (is_hr_admin());
CREATE POLICY "hr_personal_delete" ON hr_employee_personal FOR DELETE
  USING (is_hr_admin());

-- Education
CREATE POLICY "hr_education_select" ON hr_employee_education FOR SELECT
  USING (profile_id = auth.uid() OR is_hr_admin());
CREATE POLICY "hr_education_insert" ON hr_employee_education FOR INSERT
  WITH CHECK (is_hr_admin());
CREATE POLICY "hr_education_update" ON hr_employee_education FOR UPDATE
  USING (is_hr_admin());
CREATE POLICY "hr_education_delete" ON hr_employee_education FOR DELETE
  USING (is_hr_admin());

-- Experience
CREATE POLICY "hr_experience_select" ON hr_employee_experience FOR SELECT
  USING (profile_id = auth.uid() OR is_hr_admin());
CREATE POLICY "hr_experience_insert" ON hr_employee_experience FOR INSERT
  WITH CHECK (is_hr_admin());
CREATE POLICY "hr_experience_update" ON hr_employee_experience FOR UPDATE
  USING (is_hr_admin());
CREATE POLICY "hr_experience_delete" ON hr_employee_experience FOR DELETE
  USING (is_hr_admin());

-- Documents
CREATE POLICY "hr_documents_select" ON hr_employee_documents FOR SELECT
  USING (profile_id = auth.uid() OR is_hr_admin());
CREATE POLICY "hr_documents_insert" ON hr_employee_documents FOR INSERT
  WITH CHECK (is_hr_admin());
CREATE POLICY "hr_documents_update" ON hr_employee_documents FOR UPDATE
  USING (is_hr_admin());
CREATE POLICY "hr_documents_delete" ON hr_employee_documents FOR DELETE
  USING (is_hr_admin());

-- Skills
CREATE POLICY "hr_skills_select" ON hr_employee_skills FOR SELECT
  USING (profile_id = auth.uid() OR is_hr_admin());
CREATE POLICY "hr_skills_insert" ON hr_employee_skills FOR INSERT
  WITH CHECK (is_hr_admin());
CREATE POLICY "hr_skills_update" ON hr_employee_skills FOR UPDATE
  USING (is_hr_admin());
CREATE POLICY "hr_skills_delete" ON hr_employee_skills FOR DELETE
  USING (is_hr_admin());

-- Languages
CREATE POLICY "hr_languages_select" ON hr_employee_languages FOR SELECT
  USING (profile_id = auth.uid() OR is_hr_admin());
CREATE POLICY "hr_languages_insert" ON hr_employee_languages FOR INSERT
  WITH CHECK (is_hr_admin());
CREATE POLICY "hr_languages_update" ON hr_employee_languages FOR UPDATE
  USING (is_hr_admin());
CREATE POLICY "hr_languages_delete" ON hr_employee_languages FOR DELETE
  USING (is_hr_admin());

-- References
CREATE POLICY "hr_references_select" ON hr_employee_references FOR SELECT
  USING (profile_id = auth.uid() OR is_hr_admin());
CREATE POLICY "hr_references_insert" ON hr_employee_references FOR INSERT
  WITH CHECK (is_hr_admin());
CREATE POLICY "hr_references_update" ON hr_employee_references FOR UPDATE
  USING (is_hr_admin());
CREATE POLICY "hr_references_delete" ON hr_employee_references FOR DELETE
  USING (is_hr_admin());
