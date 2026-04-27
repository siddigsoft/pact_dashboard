-- =============================================================================
-- PHASE C MIGRATION — WFP Confirmation + Status Audit Trail
-- Apply AFTER phase_a_migration.sql and phase_b_migration.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 1: wfp_confirmation_uploads — one row per uploaded WFP Excel file
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wfp_confirmation_uploads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mmp_id          TEXT NOT NULL,
  filename        TEXT NOT NULL,
  uploaded_by     UUID REFERENCES public.profiles(id),
  uploaded_at     TIMESTAMPTZ DEFAULT NOW(),
  row_count       INTEGER DEFAULT 0,
  matched_count   INTEGER DEFAULT 0,
  weak_count      INTEGER DEFAULT 0,
  unmatched_count INTEGER DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'ready', 'applied')),
  applied_at      TIMESTAMPTZ,
  applied_by      UUID REFERENCES public.profiles(id),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wfp_uploads_mmp ON public.wfp_confirmation_uploads(mmp_id);
CREATE INDEX IF NOT EXISTS idx_wfp_uploads_status ON public.wfp_confirmation_uploads(status);

CREATE OR REPLACE FUNCTION public.set_wfp_uploads_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_wfp_uploads_updated_at ON public.wfp_confirmation_uploads;
CREATE TRIGGER trg_wfp_uploads_updated_at
  BEFORE UPDATE ON public.wfp_confirmation_uploads
  FOR EACH ROW EXECUTE FUNCTION public.set_wfp_uploads_updated_at();

-- RLS
ALTER TABLE public.wfp_confirmation_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wfp_upl_select" ON public.wfp_confirmation_uploads
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN (
          'admin','Admin','super_admin','Super Admin','superAdmin','SuperAdmin',
          'supervisor','Supervisor','finance','Finance','fom',
          'Field Operation Manager (FOM)','data_collector','Data Collector'
        )
    )
  );

CREATE POLICY "wfp_upl_insert" ON public.wfp_confirmation_uploads
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN (
          'admin','Admin','super_admin','Super Admin','superAdmin','SuperAdmin',
          'fom','Field Operation Manager (FOM)'
        )
    )
  );

CREATE POLICY "wfp_upl_update" ON public.wfp_confirmation_uploads
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN (
          'admin','Admin','super_admin','Super Admin','superAdmin','SuperAdmin',
          'fom','Field Operation Manager (FOM)'
        )
    )
  );

-- -----------------------------------------------------------------------------
-- STEP 2: wfp_match_results — one row per WFP Excel row parsed
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wfp_match_results (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id       UUID NOT NULL REFERENCES public.wfp_confirmation_uploads(id) ON DELETE CASCADE,
  mmp_id          TEXT NOT NULL,

  -- Raw WFP fields (after synonym mapping)
  wfp_site_name   TEXT,
  wfp_state       TEXT,
  wfp_locality    TEXT,
  wfp_partner     TEXT,
  wfp_activity    TEXT,
  wfp_row_number  INTEGER,

  -- Match result computed at parse time
  site_entry_id   UUID REFERENCES public.mmp_site_entries(id),
  match_tier      TEXT CHECK (match_tier IN ('strong','weak','fuzzy','none')),
  match_score     NUMERIC(5,2) DEFAULT 0,
  match_notes     TEXT,

  -- Outcome — set automatically for 'strong' and 'none', manually for 'weak'/'fuzzy'
  outcome         TEXT NOT NULL DEFAULT 'pending'
                  CHECK (outcome IN ('confirmed','rejected','pending')),
  reviewed_by     UUID REFERENCES public.profiles(id),
  reviewed_at     TIMESTAMPTZ,
  review_note     TEXT,

  -- Tracking
  applied         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wfp_results_upload ON public.wfp_match_results(upload_id);
CREATE INDEX IF NOT EXISTS idx_wfp_results_mmp    ON public.wfp_match_results(mmp_id);
CREATE INDEX IF NOT EXISTS idx_wfp_results_site   ON public.wfp_match_results(site_entry_id);
CREATE INDEX IF NOT EXISTS idx_wfp_results_outcome ON public.wfp_match_results(outcome);

CREATE OR REPLACE FUNCTION public.set_wfp_results_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_wfp_results_updated_at ON public.wfp_match_results;
CREATE TRIGGER trg_wfp_results_updated_at
  BEFORE UPDATE ON public.wfp_match_results
  FOR EACH ROW EXECUTE FUNCTION public.set_wfp_results_updated_at();

-- RLS
ALTER TABLE public.wfp_match_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wfp_res_select" ON public.wfp_match_results
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN (
          'admin','Admin','super_admin','Super Admin','superAdmin','SuperAdmin',
          'supervisor','Supervisor','finance','Finance','fom',
          'Field Operation Manager (FOM)','data_collector','Data Collector'
        )
    )
  );

CREATE POLICY "wfp_res_insert" ON public.wfp_match_results
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN (
          'admin','Admin','super_admin','Super Admin','superAdmin','SuperAdmin',
          'fom','Field Operation Manager (FOM)'
        )
    )
  );

CREATE POLICY "wfp_res_update" ON public.wfp_match_results
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN (
          'admin','Admin','super_admin','Super Admin','superAdmin','SuperAdmin',
          'fom','Field Operation Manager (FOM)'
        )
    )
  );

DO $$ BEGIN
  RAISE NOTICE 'Phase C migration complete: wfp_confirmation_uploads + wfp_match_results created.';
END $$;
