-- Creates the project_stage_checklist table (it never actually existed in
-- this database, even though the app code already reads/writes it) and adds
-- two extra columns so the Overview "Required Deliverables" list and the
-- Stages tab "Checklist" become ONE shared list instead of two disconnected
-- ones.
--
-- Safe to run: every statement uses IF NOT EXISTS, so re-running this is a
-- no-op if some parts already exist.
--
-- HOW TO RUN:
-- 1. Open your Supabase project dashboard → SQL Editor.
-- 2. Paste the entire contents of this file and click "Run".
-- 3. Refresh the project page in PACT — the Stages tab checklist and the
--    Overview "Required Deliverables" list will now be the same list, and
--    completing all of them lets you advance the stage.

CREATE TABLE IF NOT EXISTS public.project_stage_checklist (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  stage_id       text NOT NULL,
  item_text      text NOT NULL,
  completed      boolean NOT NULL DEFAULT false,
  completed_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  completed_at   timestamptz,
  created_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  sort_order     integer NOT NULL DEFAULT 0
);

-- Add the deliverable-sync columns even if the table already existed before
-- this migration (e.g. from a previous partial run) without them.
-- 'deliverable' rows are auto-created from the project type's Required
-- Deliverables list; 'manual' rows are ad-hoc items added from the Stages
-- tab. deliverable_id is the stable config id (e.g. "as-4") used to avoid
-- re-seeding the same deliverable twice.
ALTER TABLE public.project_stage_checklist
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

ALTER TABLE public.project_stage_checklist
  ADD COLUMN IF NOT EXISTS deliverable_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'project_stage_checklist_source_check'
  ) THEN
    ALTER TABLE public.project_stage_checklist
      ADD CONSTRAINT project_stage_checklist_source_check
      CHECK (source IN ('manual', 'deliverable'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_project_stage_checklist_project_stage
  ON public.project_stage_checklist(project_id, stage_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_project_stage_checklist_deliverable
  ON public.project_stage_checklist(project_id, deliverable_id)
  WHERE deliverable_id IS NOT NULL;

COMMENT ON TABLE public.project_stage_checklist IS
  'Per-stage checklist items gating stage advancement in the Project Flow Engine. Also doubles as the "Required Deliverables" list shown on the project Overview tab (source = ''deliverable'').';

-- No RLS on this table, consistent with the existing project_flow_log table
-- (authorization for this app is enforced at the application layer, not via
-- Postgres RLS, for the projects/flow feature set).
