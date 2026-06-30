-- ============================================================================
-- Field Data Hub — Phase 10: Fieldwork Monitoring
-- Run in Supabase SQL Editor (safe to re-run: uses IF NOT EXISTS)
-- ============================================================================

-- ─── 1. Enumerator Live Locations ────────────────────────────────────────────
-- One row per enumerator per form; updated whenever a GPS submission is synced.
CREATE TABLE IF NOT EXISTS fd_enumerator_locations (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id                UUID NOT NULL,     -- REFERENCES field_data_forms(id) ON DELETE CASCADE
  enumerator_id          TEXT NOT NULL,     -- submitted_by or username from submission
  enumerator_name        TEXT,
  latitude               NUMERIC(9,6),
  longitude              NUMERIC(9,6),
  accuracy_m             NUMERIC(8,2),      -- GPS accuracy in metres
  submission_count_today INTEGER NOT NULL DEFAULT 0,
  daily_target           INTEGER NOT NULL DEFAULT 0,
  last_submission_at     TIMESTAMPTZ,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(form_id, enumerator_id)
);

CREATE INDEX IF NOT EXISTS idx_fd_enum_locs_form ON fd_enumerator_locations(form_id);

-- ─── 2. Coverage Zones ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fd_coverage_zones (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id                UUID NOT NULL,     -- REFERENCES field_data_forms(id) ON DELETE CASCADE
  zone_name              TEXT NOT NULL,
  zone_type              TEXT NOT NULL DEFAULT 'locality'
                         CHECK (zone_type IN ('locality','site','admin_area','cluster')),
  target_count           INTEGER NOT NULL DEFAULT 0,
  actual_count           INTEGER NOT NULL DEFAULT 0,
  status                 TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','in_progress','complete','skipped')),
  assigned_enumerator_id TEXT,
  last_activity_at       TIMESTAMPTZ,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(form_id, zone_name)
);

CREATE INDEX IF NOT EXISTS idx_fd_coverage_zones_form   ON fd_coverage_zones(form_id);
CREATE INDEX IF NOT EXISTS idx_fd_coverage_zones_status ON fd_coverage_zones(status);

-- ─── 3. Supervisor Actions Log ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fd_supervisor_actions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id                UUID,              -- REFERENCES field_data_forms(id) ON DELETE SET NULL
  action_type            TEXT NOT NULL
                         CHECK (action_type IN ('message','reassign','extend_deadline','note')),
  target_enumerator_id   TEXT,             -- NULL = whole team
  zone_name              TEXT,
  message                TEXT,
  new_deadline           DATE,
  performed_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  performed_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fd_sup_actions_form ON fd_supervisor_actions(form_id);
CREATE INDEX IF NOT EXISTS idx_fd_sup_actions_time ON fd_supervisor_actions(performed_at DESC);

-- ─── 4. updated_at triggers ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_fd_monitoring_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DO $$ BEGIN
  CREATE TRIGGER trg_fd_enum_locs_updated_at
    BEFORE UPDATE ON fd_enumerator_locations
    FOR EACH ROW EXECUTE FUNCTION update_fd_monitoring_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_fd_coverage_zones_updated_at
    BEFORE UPDATE ON fd_coverage_zones
    FOR EACH ROW EXECUTE FUNCTION update_fd_monitoring_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 5. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE fd_enumerator_locations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_coverage_zones        ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_supervisor_actions    ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "fd_enum_locs_access"     ON fd_enumerator_locations;
  DROP POLICY IF EXISTS "fd_coverage_zones_access" ON fd_coverage_zones;
  DROP POLICY IF EXISTS "fd_sup_actions_access"    ON fd_supervisor_actions;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE POLICY "fd_enum_locs_access" ON fd_enumerator_locations FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
    AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin','financial_admin',
      'ict','fom','data_team','projectmanager','project_manager','countrydirector','country_director')));

CREATE POLICY "fd_coverage_zones_access" ON fd_coverage_zones FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
    AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin','financial_admin',
      'ict','fom','data_team','projectmanager','project_manager','countrydirector','country_director')));

CREATE POLICY "fd_sup_actions_access" ON fd_supervisor_actions FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
    AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin','financial_admin',
      'ict','fom','data_team','projectmanager','project_manager','countrydirector','country_director')));

NOTIFY pgrst, 'reload schema';

-- ─── 6. Populate enumerator locations from submissions ────────────────────────
-- Run this after each sync to refresh the live map data.
-- Adjust column names to match your actual field_data_submissions schema.
/*
INSERT INTO fd_enumerator_locations (
  form_id, enumerator_id, enumerator_name,
  latitude, longitude,
  submission_count_today, last_submission_at
)
SELECT
  s.form_id,
  s.submitted_by                                   AS enumerator_id,
  s.submitted_by                                   AS enumerator_name,
  (s.data->>'gps_lat')::NUMERIC                    AS latitude,
  (s.data->>'gps_lng')::NUMERIC                    AS longitude,
  COUNT(*) FILTER (WHERE s.submitted_at::date = CURRENT_DATE) AS submission_count_today,
  MAX(s.submitted_at)                              AS last_submission_at
FROM field_data_submissions s
WHERE s.submitted_by IS NOT NULL
  AND (s.data->>'gps_lat') IS NOT NULL
GROUP BY s.form_id, s.submitted_by
ON CONFLICT (form_id, enumerator_id) DO UPDATE SET
  submission_count_today = EXCLUDED.submission_count_today,
  latitude               = EXCLUDED.latitude,
  longitude              = EXCLUDED.longitude,
  last_submission_at     = EXCLUDED.last_submission_at,
  updated_at             = now();
*/

-- ─── 7. Update coverage zone actual counts ───────────────────────────────────
-- Run after sync if submissions have a locality/zone field.
-- Adjust data->>'locality_name' to match your actual XLSForm variable.
/*
UPDATE fd_coverage_zones cz
SET
  actual_count     = sub.cnt,
  last_activity_at = sub.last_at,
  status = CASE
    WHEN sub.cnt >= cz.target_count AND cz.target_count > 0 THEN 'complete'
    WHEN sub.cnt > 0 THEN 'in_progress'
    ELSE cz.status
  END,
  updated_at = now()
FROM (
  SELECT form_id, data->>'locality_name' AS zone_name, COUNT(*) AS cnt, MAX(submitted_at) AS last_at
  FROM field_data_submissions
  WHERE submitted_at::date = CURRENT_DATE
  GROUP BY form_id, data->>'locality_name'
) sub
WHERE cz.form_id = sub.form_id
  AND cz.zone_name = sub.zone_name;
*/

-- ============================================================================
-- Migration complete. Open /field-data/monitoring in the app.
-- ============================================================================
