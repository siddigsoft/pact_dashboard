-- ============================================================================
-- Field Data Hub — Phase 8: Multi-Round Study Management
-- Run in Supabase SQL Editor (safe to re-run: uses IF NOT EXISTS / ALTER ... ADD COLUMN IF NOT EXISTS)
-- ============================================================================

-- ─── 1. Studies ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fd_studies (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  description      TEXT,
  study_type       TEXT NOT NULL DEFAULT 'panel'
                   CHECK (study_type IN ('panel','repeated_cross_section','cohort','rct')),
  unique_id_field  TEXT,           -- e.g. 'household_id' — links records across rounds
  target_sample    INTEGER,        -- overall study sample target
  country_id       TEXT,
  project_id       UUID,           -- REFERENCES projects(id) ON DELETE SET NULL
  grant_id         UUID,
  start_date       DATE,
  end_date         DATE,
  status           TEXT NOT NULL DEFAULT 'design'
                   CHECK (status IN ('design','active','paused','complete','archived')),
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 2. Study Rounds ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fd_study_rounds (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id           UUID NOT NULL REFERENCES fd_studies(id) ON DELETE CASCADE,
  round_order        INTEGER NOT NULL DEFAULT 1,
  label              TEXT NOT NULL,   -- 'Baseline', 'Midline', 'Endline', 'Round 1', etc.
  form_id            UUID,            -- REFERENCES field_data_forms(id) ON DELETE SET NULL
  target_date        DATE,
  actual_start_date  DATE,
  actual_end_date    DATE,
  target_sample      INTEGER,
  submission_count   INTEGER NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'planned'
                     CHECK (status IN ('planned','active','complete','paused')),
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fd_study_rounds_study ON fd_study_rounds(study_id);

-- ─── 3. Panel Unit Tracking ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fd_study_unit_tracking (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id          UUID NOT NULL REFERENCES fd_studies(id) ON DELETE CASCADE,
  unit_id           TEXT NOT NULL,   -- the unique ID value (e.g., 'HH-00142')
  unit_label        TEXT,            -- display name / description
  location_admin1   TEXT,
  location_admin2   TEXT,
  gps_lat           NUMERIC(9,6),
  gps_lng           NUMERIC(9,6),
  status            TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','dropped','replaced','refused','not_found')),
  dropout_reason    TEXT,
  dropout_round_id  UUID REFERENCES fd_study_rounds(id) ON DELETE SET NULL,
  replacement_for   UUID REFERENCES fd_study_unit_tracking(id) ON DELETE SET NULL,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(study_id, unit_id)
);

CREATE INDEX IF NOT EXISTS idx_fd_study_units_study ON fd_study_unit_tracking(study_id);

-- ─── 4. Round Submissions (links units to rounds) ────────────────────────────
CREATE TABLE IF NOT EXISTS fd_study_round_submissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id      UUID NOT NULL REFERENCES fd_studies(id) ON DELETE CASCADE,
  round_id      UUID NOT NULL REFERENCES fd_study_rounds(id) ON DELETE CASCADE,
  unit_id       TEXT NOT NULL,
  submission_id UUID,              -- REFERENCES field_data_submissions(id) ON DELETE SET NULL
  submitted_at  TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'submitted'
                CHECK (status IN ('submitted','approved','rejected','pending')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(round_id, unit_id)
);

CREATE INDEX IF NOT EXISTS idx_fd_round_subs_round   ON fd_study_round_submissions(round_id);
CREATE INDEX IF NOT EXISTS idx_fd_round_subs_study   ON fd_study_round_submissions(study_id);
CREATE INDEX IF NOT EXISTS idx_fd_round_subs_unit    ON fd_study_round_submissions(study_id, unit_id);

-- ─── 5. updated_at triggers ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_fd_study_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DO $$ BEGIN
  CREATE TRIGGER trg_fd_studies_updated_at
    BEFORE UPDATE ON fd_studies FOR EACH ROW EXECUTE FUNCTION update_fd_study_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_fd_study_rounds_updated_at
    BEFORE UPDATE ON fd_study_rounds FOR EACH ROW EXECUTE FUNCTION update_fd_study_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_fd_study_units_updated_at
    BEFORE UPDATE ON fd_study_unit_tracking FOR EACH ROW EXECUTE FUNCTION update_fd_study_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 6. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE fd_studies               ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_study_rounds          ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_study_unit_tracking   ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_study_round_submissions ENABLE ROW LEVEL SECURITY;

-- Finance / Admin / ICT / FOM / Data Team / Project Manager / Country Director
-- Access model: same as Field Data Hub (any non-field-staff role can access)
DO $$ BEGIN
  DROP POLICY IF EXISTS "fd_studies_access"        ON fd_studies;
  DROP POLICY IF EXISTS "fd_rounds_access"         ON fd_study_rounds;
  DROP POLICY IF EXISTS "fd_units_access"          ON fd_study_unit_tracking;
  DROP POLICY IF EXISTS "fd_round_subs_access"     ON fd_study_round_submissions;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE POLICY "fd_studies_access" ON fd_studies FOR ALL
  USING ( EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND LOWER(role) IN (
        'super_admin','superadmin','admin','financialadmin','financial_admin',
        'ict','fom','data_team','projectmanager','project_manager',
        'countrydirector','country_director'
      )
  ));

CREATE POLICY "fd_rounds_access" ON fd_study_rounds FOR ALL
  USING ( EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND LOWER(role) IN (
        'super_admin','superadmin','admin','financialadmin','financial_admin',
        'ict','fom','data_team','projectmanager','project_manager',
        'countrydirector','country_director'
      )
  ));

CREATE POLICY "fd_units_access" ON fd_study_unit_tracking FOR ALL
  USING ( EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND LOWER(role) IN (
        'super_admin','superadmin','admin','financialadmin','financial_admin',
        'ict','fom','data_team','projectmanager','project_manager',
        'countrydirector','country_director'
      )
  ));

CREATE POLICY "fd_round_subs_access" ON fd_study_round_submissions FOR ALL
  USING ( EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND LOWER(role) IN (
        'super_admin','superadmin','admin','financialadmin','financial_admin',
        'ict','fom','data_team','projectmanager','project_manager',
        'countrydirector','country_director'
      )
  ));

NOTIFY pgrst, 'reload schema';
-- ============================================================================
-- Migration complete. Open /field-data/studies in the app to get started.
-- ============================================================================
