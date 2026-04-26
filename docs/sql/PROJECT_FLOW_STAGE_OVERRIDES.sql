-- ============================================================================
-- PROJECT FLOW STAGE OVERRIDES
-- ----------------------------------------------------------------------------
-- The 10 project lifecycle flows are defined as code in
-- `src/config/projectFlows.ts`. This table lets admins **override** specific
-- attributes of each stage (label, description, typical duration, key
-- outputs, disabled flag) without code changes — useful when a partner uses
-- different stage names or needs to skip / extend a stage.
--
-- Overrides are matched by (project_type, stage_id). Anything NULL falls
-- back to the hard-coded definition. Routes / icons cannot be overridden
-- here because they're tied to first-class app pages.
--
-- Apply manually in pactdb Supabase SQL editor (per the project's
-- manual-SQL standing rule). Companion runbook:
--   docs/sql/PROJECT_FLOW_STAGE_OVERRIDES_APPLY.md
-- ============================================================================

BEGIN;

-- 1) Table -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_flow_stage_overrides (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_type           TEXT NOT NULL,
  stage_id               TEXT NOT NULL,
  label_en               TEXT,
  label_ar               TEXT,
  description_en         TEXT,
  description_ar         TEXT,
  typical_duration_days  INT  CHECK (typical_duration_days IS NULL OR typical_duration_days >= 0),
  key_outputs_en         TEXT[],
  key_outputs_ar         TEXT[],
  is_disabled            BOOLEAN NOT NULL DEFAULT false,
  notes                  TEXT,
  created_by             uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by             uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT project_flow_stage_overrides_unique UNIQUE (project_type, stage_id)
);

CREATE INDEX IF NOT EXISTS project_flow_stage_overrides_type_idx
  ON public.project_flow_stage_overrides(project_type);

COMMENT ON TABLE public.project_flow_stage_overrides
  IS 'Optional admin-managed overrides for the hard-coded project lifecycle stages. Match by (project_type, stage_id). NULL fields fall back to code.';

-- 2) Auto-touch updated_at ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_project_flow_stage_overrides()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_project_flow_stage_overrides
  ON public.project_flow_stage_overrides;
CREATE TRIGGER trg_touch_project_flow_stage_overrides
  BEFORE UPDATE ON public.project_flow_stage_overrides
  FOR EACH ROW EXECUTE FUNCTION public.touch_project_flow_stage_overrides();

-- 3) RLS ---------------------------------------------------------------------
ALTER TABLE public.project_flow_stage_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pfso_select_all ON public.project_flow_stage_overrides;
CREATE POLICY pfso_select_all
  ON public.project_flow_stage_overrides
  FOR SELECT TO authenticated
  USING (true);

-- Only admins / super_admins can write.
DROP POLICY IF EXISTS pfso_admin_write ON public.project_flow_stage_overrides;
CREATE POLICY pfso_admin_write
  ON public.project_flow_stage_overrides
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid()
         AND p.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid()
         AND p.role IN ('admin', 'super_admin')
    )
  );

COMMIT;

-- ============================================================================
-- ROLLBACK SNIPPET
-- ============================================================================
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_touch_project_flow_stage_overrides ON public.project_flow_stage_overrides;
-- DROP FUNCTION IF EXISTS public.touch_project_flow_stage_overrides();
-- DROP TABLE IF EXISTS public.project_flow_stage_overrides;
-- COMMIT;
