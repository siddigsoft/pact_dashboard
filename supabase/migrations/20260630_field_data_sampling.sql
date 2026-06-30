-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 6: Field Data Hub — Sampling Engine
-- Run in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Sampling studies ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fd_sampling_studies (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  description           TEXT,
  form_id               UUID REFERENCES field_data_forms(id) ON DELETE SET NULL,
  -- Calculator inputs
  population_size       INTEGER,                    -- NULL = infinite
  confidence_level      NUMERIC(5,3) NOT NULL DEFAULT 0.95,  -- 0.90 / 0.95 / 0.99
  margin_of_error       NUMERIC(5,4) NOT NULL DEFAULT 0.05,  -- e.g. 0.05 = ±5%
  expected_proportion   NUMERIC(5,4) NOT NULL DEFAULT 0.50,
  design_effect         NUMERIC(6,3) NOT NULL DEFAULT 1.0,
  nonresponse_rate      NUMERIC(5,4) NOT NULL DEFAULT 0.10,  -- e.g. 0.10 = 10%
  calculated_n          INTEGER,
  -- Method
  method                TEXT NOT NULL DEFAULT 'srs'
                        CHECK (method IN ('srs','systematic','stratified','cluster','multistage','epi','geographic','lqas','quota','snowball')),
  status                TEXT NOT NULL DEFAULT 'design'
                        CHECK (status IN ('design','drawing','field','complete','archived')),
  country_id            TEXT,
  created_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fdss_form    ON fd_sampling_studies(form_id);
CREATE INDEX IF NOT EXISTS idx_fdss_status  ON fd_sampling_studies(status);

ALTER TABLE fd_sampling_studies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fdss_select" ON fd_sampling_studies;
DROP POLICY IF EXISTS "fdss_manage" ON fd_sampling_studies;
CREATE POLICY "fdss_select" ON fd_sampling_studies FOR SELECT TO authenticated USING (true);
CREATE POLICY "fdss_manage" ON fd_sampling_studies FOR ALL   TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('super_admin','admin','ict_it','data_team','fom','project_manager','country_director')));

-- ─── 2. Sampling frames ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fd_sampling_frames (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id      UUID NOT NULL REFERENCES fd_sampling_studies(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  version       INTEGER NOT NULL DEFAULT 1,
  file_name     TEXT,
  file_url      TEXT,
  storage_path  TEXT,
  total_units   INTEGER NOT NULL DEFAULT 0,
  columns       JSONB NOT NULL DEFAULT '[]',   -- [{name, type}]
  data          JSONB NOT NULL DEFAULT '[]',   -- array of row objects (max ~5k rows stored)
  is_current    BOOLEAN NOT NULL DEFAULT true,
  notes         TEXT,
  uploaded_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fdsf_study ON fd_sampling_frames(study_id);

ALTER TABLE fd_sampling_frames ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fdsf_select" ON fd_sampling_frames;
DROP POLICY IF EXISTS "fdsf_manage" ON fd_sampling_frames;
CREATE POLICY "fdsf_select" ON fd_sampling_frames FOR SELECT TO authenticated USING (true);
CREATE POLICY "fdsf_manage" ON fd_sampling_frames FOR ALL   TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('super_admin','admin','ict_it','data_team','fom','project_manager','country_director')));

-- ─── 3. Sample draws ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fd_sample_draws (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id      UUID NOT NULL REFERENCES fd_sampling_studies(id) ON DELETE CASCADE,
  frame_id      UUID REFERENCES fd_sampling_frames(id) ON DELETE SET NULL,
  method        TEXT NOT NULL,
  params        JSONB NOT NULL DEFAULT '{}',   -- method-specific config
  seed          TEXT NOT NULL,                  -- random seed (reproducibility)
  sample_size   INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','drawn','active','archived')),
  label         TEXT,                           -- e.g. "First draw", "Final approved draw"
  drawn_at      TIMESTAMPTZ,
  drawn_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fdsd_study ON fd_sample_draws(study_id);

ALTER TABLE fd_sample_draws ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fdsd_select" ON fd_sample_draws;
DROP POLICY IF EXISTS "fdsd_manage" ON fd_sample_draws;
CREATE POLICY "fdsd_select" ON fd_sample_draws FOR SELECT TO authenticated USING (true);
CREATE POLICY "fdsd_manage" ON fd_sample_draws FOR ALL   TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('super_admin','admin','ict_it','data_team','fom','project_manager','country_director')));

-- ─── 4. Sample units ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fd_sample_units (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draw_id           UUID NOT NULL REFERENCES fd_sample_draws(id) ON DELETE CASCADE,
  study_id          UUID NOT NULL REFERENCES fd_sampling_studies(id) ON DELETE CASCADE,
  unit_key          TEXT NOT NULL,              -- unique ID of the unit in the frame
  unit_data         JSONB NOT NULL DEFAULT '{}', -- full row from frame
  stratum           TEXT,                        -- stratum label (stratified)
  cluster           TEXT,                        -- cluster label (cluster/EPI)
  sort_order        INTEGER,                     -- position in draw
  enumerator_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','complete','not_found','refused','unavailable','duplicate','replacement_used')),
  outcome_notes     TEXT,
  is_replacement    BOOLEAN NOT NULL DEFAULT false,
  replaced_unit_id  UUID REFERENCES fd_sample_units(id) ON DELETE SET NULL,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fdsu_draw    ON fd_sample_units(draw_id);
CREATE INDEX IF NOT EXISTS idx_fdsu_study   ON fd_sample_units(study_id);
CREATE INDEX IF NOT EXISTS idx_fdsu_status  ON fd_sample_units(status);
CREATE INDEX IF NOT EXISTS idx_fdsu_enumer  ON fd_sample_units(enumerator_id);

ALTER TABLE fd_sample_units ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fdsu_select" ON fd_sample_units;
DROP POLICY IF EXISTS "fdsu_manage" ON fd_sample_units;
CREATE POLICY "fdsu_select" ON fd_sample_units FOR SELECT TO authenticated USING (true);
CREATE POLICY "fdsu_manage" ON fd_sample_units FOR ALL   TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('super_admin','admin','ict_it','data_team','fom','project_manager','country_director','coordinator','supervisor')));

-- ─── 5. Strata definitions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fd_sampling_strata (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draw_id         UUID NOT NULL REFERENCES fd_sample_draws(id) ON DELETE CASCADE,
  study_id        UUID NOT NULL REFERENCES fd_sampling_studies(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  filter_col      TEXT,
  filter_val      TEXT,
  population_size INTEGER NOT NULL DEFAULT 0,
  proportional_n  INTEGER,
  equal_n         INTEGER,
  neyman_n        INTEGER,
  target_n        INTEGER NOT NULL DEFAULT 0,
  drawn_n         INTEGER NOT NULL DEFAULT 0,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fdstr_draw  ON fd_sampling_strata(draw_id);

ALTER TABLE fd_sampling_strata ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fdstr_all" ON fd_sampling_strata;
CREATE POLICY "fdstr_all" ON fd_sampling_strata FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('super_admin','admin','ict_it','data_team','fom','project_manager','country_director','coordinator','supervisor')));

-- ─── Storage bucket ───────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('fd-sampling-frames', 'fd-sampling-frames', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "fdsamp_store_sel" ON storage.objects;
DROP POLICY IF EXISTS "fdsamp_store_ins" ON storage.objects;
DROP POLICY IF EXISTS "fdsamp_store_del" ON storage.objects;
CREATE POLICY "fdsamp_store_sel" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'fd-sampling-frames');
CREATE POLICY "fdsamp_store_ins" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'fd-sampling-frames');
CREATE POLICY "fdsamp_store_del" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'fd-sampling-frames');
