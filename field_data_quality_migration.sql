-- ============================================================================
-- Field Data Hub — Phase 9: Data Quality, Enumerator Scoring & Target Tracking
-- Run in Supabase SQL Editor (safe to re-run: uses IF NOT EXISTS)
-- ============================================================================

-- ─── 1. Quality Rules ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fd_quality_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id     UUID NOT NULL,       -- REFERENCES field_data_forms(id) ON DELETE CASCADE
  name        TEXT NOT NULL,
  rule_type   TEXT NOT NULL
              CHECK (rule_type IN (
                'required_field','value_range','regex',
                'gps_bounds','duration_range','no_duplicate'
              )),
  field_name  TEXT,                -- XLSForm variable name this rule applies to
  config      JSONB NOT NULL DEFAULT '{}',
              -- required_field:  {}
              -- value_range:     { "min": 0, "max": 100 }
              -- regex:           { "pattern": "^HH-\\d{5}$" }
              -- gps_bounds:      { "lat_min": 10.0, "lat_max": 23.0, "lng_min": 22.0, "lng_max": 38.0 }
              -- duration_range:  { "min": 120, "max": 7200 }  (seconds)
              -- no_duplicate:    {}
  severity    TEXT NOT NULL DEFAULT 'warning'
              CHECK (severity IN ('error','warning','info')),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Guard: add is_active if the table already existed without it
ALTER TABLE fd_quality_rules ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_fd_quality_rules_form ON fd_quality_rules(form_id);

-- ─── 2. Quality Flags ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fd_quality_flags (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id         UUID NOT NULL,       -- REFERENCES field_data_forms(id) ON DELETE CASCADE
  submission_id   UUID,                -- REFERENCES field_data_submissions(id) ON DELETE CASCADE
  rule_id         UUID REFERENCES fd_quality_rules(id) ON DELETE CASCADE,
  field_name      TEXT,
  actual_value    TEXT,
  expected        TEXT,                -- human-readable description of what was expected
  severity        TEXT NOT NULL DEFAULT 'warning'
                  CHECK (severity IN ('error','warning','info')),
  status          TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','resolved','dismissed','false_positive')),
  resolved_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at     TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Guard: add status if table already existed without it
ALTER TABLE fd_quality_flags ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open';

CREATE INDEX IF NOT EXISTS idx_fd_quality_flags_form       ON fd_quality_flags(form_id);
CREATE INDEX IF NOT EXISTS idx_fd_quality_flags_submission ON fd_quality_flags(submission_id);
CREATE INDEX IF NOT EXISTS idx_fd_quality_flags_status     ON fd_quality_flags(status);

-- ─── 3. Enumerator Performance Stats ─────────────────────────────────────────
-- Denormalized; populated by a background job or manual SQL after each sync.
CREATE TABLE IF NOT EXISTS fd_enumerator_stats (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id               UUID NOT NULL,   -- REFERENCES field_data_forms(id) ON DELETE CASCADE
  enumerator_id         TEXT NOT NULL,   -- username / user_id from submission metadata
  enumerator_name       TEXT,
  submission_count      INTEGER NOT NULL DEFAULT 0,
  avg_duration_seconds  INTEGER,         -- average survey completion time
  flag_count            INTEGER NOT NULL DEFAULT 0,
  flag_rate             NUMERIC(5,2),    -- flag_count / submission_count * 100
  gps_accuracy_avg      NUMERIC(8,2),    -- average GPS accuracy in metres
  missing_field_rate    NUMERIC(5,2),    -- % of required fields left blank
  score                 INTEGER,         -- 0–100 composite quality score
  score_label           TEXT             -- 'excellent' | 'good' | 'needs_review' | 'poor'
                        CHECK (score_label IN ('excellent','good','needs_review','poor')),
  last_submission_at    TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(form_id, enumerator_id)
);

CREATE INDEX IF NOT EXISTS idx_fd_enum_stats_form ON fd_enumerator_stats(form_id);

-- Helper: compute score label from score
CREATE OR REPLACE FUNCTION fd_score_label(score INTEGER)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN score >= 80 THEN 'excellent'
    WHEN score >= 60 THEN 'good'
    WHEN score >= 40 THEN 'needs_review'
    ELSE 'poor'
  END;
$$;

-- ─── 4. Form Targets ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fd_form_targets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id           UUID NOT NULL,   -- REFERENCES field_data_forms(id) ON DELETE CASCADE
  target_count      INTEGER NOT NULL CHECK (target_count > 0),
  target_date       DATE,
  geographic_scope  TEXT NOT NULL DEFAULT 'All',
  notes             TEXT,
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(form_id, geographic_scope)
);

CREATE INDEX IF NOT EXISTS idx_fd_form_targets_form ON fd_form_targets(form_id);

-- ─── 5. updated_at trigger for enumerator stats ───────────────────────────────
CREATE OR REPLACE FUNCTION update_fd_enumerator_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DO $$ BEGIN
  CREATE TRIGGER trg_fd_enum_stats_updated_at
    BEFORE UPDATE ON fd_enumerator_stats
    FOR EACH ROW EXECUTE FUNCTION update_fd_enumerator_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 6. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE fd_quality_rules     ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_quality_flags     ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_enumerator_stats  ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_form_targets      ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "fd_quality_rules_access"    ON fd_quality_rules;
  DROP POLICY IF EXISTS "fd_quality_flags_access"    ON fd_quality_flags;
  DROP POLICY IF EXISTS "fd_enum_stats_access"       ON fd_enumerator_stats;
  DROP POLICY IF EXISTS "fd_form_targets_access"     ON fd_form_targets;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- Same access model as the rest of Field Data Hub
DROP POLICY IF EXISTS "fd_quality_rules_access" ON fd_quality_rules;
CREATE POLICY "fd_quality_rules_access" ON fd_quality_rules FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
    AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin','financial_admin',
      'ict','fom','data_team','projectmanager','project_manager','countrydirector','country_director')));

DROP POLICY IF EXISTS "fd_quality_flags_access" ON fd_quality_flags;
CREATE POLICY "fd_quality_flags_access" ON fd_quality_flags FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
    AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin','financial_admin',
      'ict','fom','data_team','projectmanager','project_manager','countrydirector','country_director')));

DROP POLICY IF EXISTS "fd_enum_stats_access" ON fd_enumerator_stats;
CREATE POLICY "fd_enum_stats_access" ON fd_enumerator_stats FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
    AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin','financial_admin',
      'ict','fom','data_team','projectmanager','project_manager','countrydirector','country_director')));

DROP POLICY IF EXISTS "fd_form_targets_access" ON fd_form_targets;
CREATE POLICY "fd_form_targets_access" ON fd_form_targets FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
    AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin','financial_admin',
      'ict','fom','data_team','projectmanager','project_manager','countrydirector','country_director')));

NOTIFY pgrst, 'reload schema';

-- ─── 7. Sample: compute enumerator stats from existing submissions ─────────────
-- Run this SQL snippet after syncing submissions to populate fd_enumerator_stats.
-- Adjust the submitted_by / duration_seconds column names to match your form data.
/*
INSERT INTO fd_enumerator_stats (form_id, enumerator_id, enumerator_name,
  submission_count, flag_count, flag_rate, score, score_label, last_submission_at)
SELECT
  s.form_id,
  s.submitted_by                            AS enumerator_id,
  s.submitted_by                            AS enumerator_name,
  COUNT(*)                                  AS submission_count,
  COALESCE(f.flag_count, 0)                 AS flag_count,
  ROUND(COALESCE(f.flag_count, 0)::NUMERIC / NULLIF(COUNT(*), 0) * 100, 2) AS flag_rate,
  GREATEST(0, 100 - ROUND(COALESCE(f.flag_count, 0)::NUMERIC / NULLIF(COUNT(*), 0) * 100)) AS score,
  fd_score_label(GREATEST(0, 100 - ROUND(COALESCE(f.flag_count, 0)::NUMERIC / NULLIF(COUNT(*), 0) * 100))::INTEGER) AS score_label,
  MAX(s.submitted_at)                       AS last_submission_at
FROM field_data_submissions s
LEFT JOIN (
  SELECT form_id, submission_id::TEXT AS enumerator_proxy, COUNT(*) AS flag_count
  -- Note: join flags to submissions by submission_id
  FROM fd_quality_flags WHERE status = 'open' GROUP BY form_id, submission_id
) f ON f.form_id = s.form_id
WHERE s.submitted_by IS NOT NULL
GROUP BY s.form_id, s.submitted_by, f.flag_count
ON CONFLICT (form_id, enumerator_id) DO UPDATE SET
  submission_count   = EXCLUDED.submission_count,
  flag_count         = EXCLUDED.flag_count,
  flag_rate          = EXCLUDED.flag_rate,
  score              = EXCLUDED.score,
  score_label        = EXCLUDED.score_label,
  last_submission_at = EXCLUDED.last_submission_at,
  updated_at         = now();
*/

-- ============================================================================
-- Migration complete. Open /field-data/quality in the app to get started.
-- ============================================================================
