-- ============================================================================
-- PREREQUISITE STUB — ensures fd_forms exists even when running this file alone
-- Safe no-op if core migration already ran (CREATE TABLE IF NOT EXISTS).
-- ============================================================================
DO $fd_prereq$ BEGIN
  CREATE TABLE IF NOT EXISTS field_data_forms (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
EXCEPTION WHEN OTHERS THEN NULL; END $fd_prereq$;

DO $fd_prereq2$ BEGIN
  CREATE TABLE IF NOT EXISTS fd_forms (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
EXCEPTION WHEN OTHERS THEN NULL; END $fd_prereq2$;
-- ============================================================================

-- ============================================================================
-- Field Data Hub — Sampling Engine (FieldDataSampling.tsx)
-- Requires: field_data_core_migration.sql (fd_forms)
--
-- Tables:
--   fd_sampling_studies   — study/survey metadata + sample size parameters
--   fd_sampling_frames    — uploaded population frames (CSV/XLSX)
--   fd_sample_draws       — seeded random draws
--   fd_sample_units       — individual sampled units with field tracking
-- ============================================================================

-- ── 1. Sampling studies ───────────────────────────────────────────────────────
-- Referenced by FieldDataSampling.tsx as 'fd_sampling_studies'
CREATE TABLE IF NOT EXISTS fd_sampling_studies (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT        NOT NULL,
  description          TEXT,
  form_id              UUID        REFERENCES fd_forms(id) ON DELETE SET NULL,
  -- Sample size calculator inputs
  population_size      INTEGER,
  confidence_level     NUMERIC(5,2) NOT NULL DEFAULT 95.0,
  margin_of_error      NUMERIC(5,2) NOT NULL DEFAULT 5.0,
  expected_proportion  NUMERIC(5,4) NOT NULL DEFAULT 0.5,
  design_effect        NUMERIC(5,2) NOT NULL DEFAULT 1.0,
  nonresponse_rate     NUMERIC(5,2) NOT NULL DEFAULT 10.0,
  calculated_n         INTEGER,
  -- Sampling method
  method               TEXT        NOT NULL DEFAULT 'srs'
                       CHECK (method IN (
                         'srs','systematic','stratified','cluster',
                         'multistage','epi','geographic','lqas','quota','snowball'
                       )),
  status               TEXT        NOT NULL DEFAULT 'design'
                       CHECK (status IN ('design','drawing','field','complete','archived')),
  created_by           UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Guard: add status if table already existed without it
ALTER TABLE fd_sampling_studies ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'design';

CREATE INDEX IF NOT EXISTS idx_fdss_status   ON fd_sampling_studies(status);
CREATE INDEX IF NOT EXISTS idx_fdss_form     ON fd_sampling_studies(form_id);
CREATE INDEX IF NOT EXISTS idx_fdss_created  ON fd_sampling_studies(created_at DESC);

-- ── 2. Sampling frames ────────────────────────────────────────────────────────
-- Referenced by FieldDataSampling.tsx as 'fd_sampling_frames'
CREATE TABLE IF NOT EXISTS fd_sampling_frames (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id      UUID        NOT NULL REFERENCES fd_sampling_studies(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  version       INTEGER     NOT NULL DEFAULT 1,
  file_name     TEXT,
  file_url      TEXT,
  storage_path  TEXT,
  total_units   INTEGER     NOT NULL DEFAULT 0,
  columns       JSONB       NOT NULL DEFAULT '[]',   -- [{ name, type }]
  data          JSONB       NOT NULL DEFAULT '[]',   -- actual row data
  is_current    BOOLEAN     NOT NULL DEFAULT true,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (study_id, version)
);

CREATE INDEX IF NOT EXISTS idx_fdsfr_study   ON fd_sampling_frames(study_id);
CREATE INDEX IF NOT EXISTS idx_fdsfr_current ON fd_sampling_frames(is_current);

-- Ensure only one frame is marked current per study
CREATE OR REPLACE FUNCTION fd_enforce_one_current_frame()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_current THEN
    UPDATE fd_sampling_frames
       SET is_current = false
     WHERE study_id = NEW.study_id AND id <> NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fd_one_current_frame ON fd_sampling_frames;
CREATE TRIGGER trg_fd_one_current_frame
  AFTER INSERT OR UPDATE OF is_current ON fd_sampling_frames
  FOR EACH ROW WHEN (NEW.is_current)
  EXECUTE FUNCTION fd_enforce_one_current_frame();

-- ── 3. Sample draws ───────────────────────────────────────────────────────────
-- Referenced by FieldDataSampling.tsx as 'fd_sample_draws'
CREATE TABLE IF NOT EXISTS fd_sample_draws (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id    UUID        NOT NULL REFERENCES fd_sampling_studies(id) ON DELETE CASCADE,
  frame_id    UUID        REFERENCES fd_sampling_frames(id) ON DELETE SET NULL,
  method      TEXT        NOT NULL,   -- srs, systematic, stratified, etc.
  params      JSONB       NOT NULL DEFAULT '{}',   -- draw parameters (strata, clusters, etc.)
  seed        TEXT        NOT NULL,                -- PRNG seed for reproducibility
  sample_size INTEGER     NOT NULL DEFAULT 0,
  status      TEXT        NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','drawing','complete','failed')),
  label       TEXT,
  drawn_at    TIMESTAMPTZ,
  drawn_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Guard: add status if table already existed without it
ALTER TABLE fd_sample_draws ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_fdsd_study   ON fd_sample_draws(study_id);
CREATE INDEX IF NOT EXISTS idx_fdsd_status  ON fd_sample_draws(status);

-- ── 4. Sample units ───────────────────────────────────────────────────────────
-- Referenced by FieldDataSampling.tsx as 'fd_sample_units'
CREATE TABLE IF NOT EXISTS fd_sample_units (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  draw_id          UUID        NOT NULL REFERENCES fd_sample_draws(id)    ON DELETE CASCADE,
  study_id         UUID        NOT NULL REFERENCES fd_sampling_studies(id) ON DELETE CASCADE,
  unit_key         TEXT        NOT NULL,   -- unique identifier from the frame
  unit_data        JSONB       NOT NULL DEFAULT '{}',
  stratum          TEXT,
  cluster          TEXT,
  sort_order       INTEGER,
  enumerator_id    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  status           TEXT        NOT NULL DEFAULT 'pending'
                   CHECK (status IN (
                     'pending','complete','not_found','refused',
                     'unavailable','duplicate','replacement_used'
                   )),
  outcome_notes    TEXT,
  is_replacement   BOOLEAN     NOT NULL DEFAULT false,
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Guard: add status if table already existed without it
ALTER TABLE fd_sample_units ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';

-- Note: idx_fdsu_status is already used for field_data_submissions.
-- Using unique name idx_fdsamu_status for fd_sample_units to avoid duplicate.
CREATE INDEX IF NOT EXISTS idx_fdsamu_draw   ON fd_sample_units(draw_id);
CREATE INDEX IF NOT EXISTS idx_fdsamu_study  ON fd_sample_units(study_id);
CREATE INDEX IF NOT EXISTS idx_fdsamu_status ON fd_sample_units(status);
CREATE INDEX IF NOT EXISTS idx_fdsu_enum     ON fd_sample_units(enumerator_id);
CREATE INDEX IF NOT EXISTS idx_fdsu_key      ON fd_sample_units(unit_key);

-- ── 5. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE fd_sampling_studies  ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_sampling_frames   ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_sample_draws      ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_sample_units      ENABLE ROW LEVEL SECURITY;

-- Uses fd_is_hub_user() / fd_is_admin() from core migration
DROP POLICY IF EXISTS "fdsamst_read" ON fd_sampling_studies;
CREATE POLICY "fdsamst_read"  ON fd_sampling_studies FOR SELECT TO authenticated USING (fd_is_hub_user());
DROP POLICY IF EXISTS "fdsamst_write" ON fd_sampling_studies;
CREATE POLICY "fdsamst_write" ON fd_sampling_studies FOR ALL    TO authenticated USING (fd_is_hub_user()) WITH CHECK (fd_is_hub_user());
DROP POLICY IF EXISTS "fdsamst_svc" ON fd_sampling_studies;
CREATE POLICY "fdsamst_svc"   ON fd_sampling_studies FOR ALL    TO service_role  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "fdsamfr_read" ON fd_sampling_frames;
CREATE POLICY "fdsamfr_read"  ON fd_sampling_frames  FOR SELECT TO authenticated USING (fd_is_hub_user());
DROP POLICY IF EXISTS "fdsamfr_write" ON fd_sampling_frames;
CREATE POLICY "fdsamfr_write" ON fd_sampling_frames  FOR ALL    TO authenticated USING (fd_is_hub_user()) WITH CHECK (fd_is_hub_user());
DROP POLICY IF EXISTS "fdsamfr_svc" ON fd_sampling_frames;
CREATE POLICY "fdsamfr_svc"   ON fd_sampling_frames  FOR ALL    TO service_role  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "fdsadr_read" ON fd_sample_draws;
CREATE POLICY "fdsadr_read"   ON fd_sample_draws     FOR SELECT TO authenticated USING (fd_is_hub_user());
DROP POLICY IF EXISTS "fdsadr_write" ON fd_sample_draws;
CREATE POLICY "fdsadr_write"  ON fd_sample_draws     FOR ALL    TO authenticated USING (fd_is_hub_user()) WITH CHECK (fd_is_hub_user());
DROP POLICY IF EXISTS "fdsadr_svc" ON fd_sample_draws;
CREATE POLICY "fdsadr_svc"    ON fd_sample_draws     FOR ALL    TO service_role  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "fdsaun_read" ON fd_sample_units;
CREATE POLICY "fdsaun_read"   ON fd_sample_units     FOR SELECT TO authenticated USING (fd_is_hub_user());
DROP POLICY IF EXISTS "fdsaun_write" ON fd_sample_units;
CREATE POLICY "fdsaun_write"  ON fd_sample_units     FOR ALL    TO authenticated USING (fd_is_hub_user()) WITH CHECK (fd_is_hub_user());
DROP POLICY IF EXISTS "fdsaun_svc" ON fd_sample_units;
CREATE POLICY "fdsaun_svc"    ON fd_sample_units     FOR ALL    TO service_role  USING (true) WITH CHECK (true);

-- ── 6. Helpful RPC: sampling progress ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION fd_sampling_progress(p_draw_id UUID)
RETURNS TABLE (
  total        BIGINT,
  complete     BIGINT,
  pending      BIGINT,
  not_found    BIGINT,
  refused      BIGINT,
  response_rate NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COUNT(*)                                                          AS total,
    COUNT(*) FILTER (WHERE status = 'complete')                       AS complete,
    COUNT(*) FILTER (WHERE status = 'pending')                        AS pending,
    COUNT(*) FILTER (WHERE status = 'not_found')                      AS not_found,
    COUNT(*) FILTER (WHERE status = 'refused')                        AS refused,
    ROUND(
      COUNT(*) FILTER (WHERE status = 'complete')::NUMERIC /
      NULLIF(COUNT(*), 0) * 100, 1
    )                                                                 AS response_rate
  FROM fd_sample_units
  WHERE draw_id = p_draw_id;
$$;

GRANT EXECUTE ON FUNCTION fd_sampling_progress(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fd_sampling_progress(UUID) TO service_role;

-- ============================================================================
-- Sampling migration complete.
-- Tables: fd_sampling_studies, fd_sampling_frames, fd_sample_draws, fd_sample_units
-- RPC:    fd_sampling_progress(UUID)
-- ============================================================================
