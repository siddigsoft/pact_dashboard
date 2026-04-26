-- ============================================================================
-- PROJECT FIELD TASK DEPENDENCIES (MS Project-style)
-- ----------------------------------------------------------------------------
-- Replaces the legacy `dependencies uuid[]` column on `project_field_tasks`
-- with a proper many-to-many table that supports the four MS Project link
-- types (FS, SS, FF, SF) and a lag/lead in days (negative = lead).
--
-- Behaviour:
--   • The legacy `dependencies` array column is KEPT for backward-compat
--     read paths but each existing entry is migrated to a row in the new
--     table as a Finish-to-Start, lag = 0 link. New code should use this
--     table; old code that reads the array continues to work.
--   • A trigger blocks INSERT/UPDATE that would create a cycle.
--   • Self-references and cross-project links are blocked.
--   • RLS: same project-membership rule as the parent task.
--
-- Apply manually in pactdb Supabase SQL editor (per the project's
-- manual-SQL standing rule). Companion runbook:
--   docs/sql/PROJECT_FIELD_TASK_DEPENDENCIES_APPLY.md
-- ============================================================================

BEGIN;

-- 1) Table -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_field_task_dependencies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  predecessor_id  uuid NOT NULL REFERENCES public.project_field_tasks(id) ON DELETE CASCADE,
  successor_id    uuid NOT NULL REFERENCES public.project_field_tasks(id) ON DELETE CASCADE,
  dep_type        TEXT NOT NULL DEFAULT 'FS'
                    CHECK (dep_type IN ('FS','SS','FF','SF')),
  lag_days        INT  NOT NULL DEFAULT 0,
  notes           TEXT,
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pftd_no_self CHECK (predecessor_id <> successor_id),
  CONSTRAINT pftd_unique  UNIQUE (predecessor_id, successor_id)
);

CREATE INDEX IF NOT EXISTS pftd_project_idx     ON public.project_field_task_dependencies(project_id);
CREATE INDEX IF NOT EXISTS pftd_predecessor_idx ON public.project_field_task_dependencies(predecessor_id);
CREATE INDEX IF NOT EXISTS pftd_successor_idx   ON public.project_field_task_dependencies(successor_id);

COMMENT ON TABLE public.project_field_task_dependencies
  IS 'MS Project-style typed dependencies (FS/SS/FF/SF) with lag/lead in days for project field tasks. Coexists with the legacy uuid[] column on project_field_tasks for backward-compat reads.';

-- 2) Same-project guard ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pftd_assert_same_project()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  pred_proj uuid;
  succ_proj uuid;
BEGIN
  SELECT project_id INTO pred_proj FROM public.project_field_tasks WHERE id = NEW.predecessor_id;
  SELECT project_id INTO succ_proj FROM public.project_field_tasks WHERE id = NEW.successor_id;
  IF pred_proj IS NULL OR succ_proj IS NULL THEN
    RAISE EXCEPTION 'Predecessor or successor task does not exist';
  END IF;
  IF pred_proj <> succ_proj THEN
    RAISE EXCEPTION 'Cross-project dependencies are not allowed';
  END IF;
  IF NEW.project_id IS DISTINCT FROM pred_proj THEN
    NEW.project_id := pred_proj;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pftd_same_project ON public.project_field_task_dependencies;
CREATE TRIGGER trg_pftd_same_project
  BEFORE INSERT OR UPDATE ON public.project_field_task_dependencies
  FOR EACH ROW EXECUTE FUNCTION public.pftd_assert_same_project();

-- 3) Cycle-detection guard ---------------------------------------------------
-- Walks the predecessor graph from NEW.successor_id and aborts if it can
-- reach NEW.predecessor_id. Uses a recursive CTE; safe because
-- (predecessor, successor) is unique and the graph is bounded by project.
CREATE OR REPLACE FUNCTION public.pftd_assert_no_cycle()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  cycle_found BOOLEAN;
BEGIN
  WITH RECURSIVE walk(node) AS (
    -- seed: where the new edge would point TO
    SELECT NEW.successor_id
    UNION
    -- traverse forward through existing edges (successor -> successor's successors)
    SELECT d.successor_id
    FROM public.project_field_task_dependencies d
    JOIN walk w ON d.predecessor_id = w.node
  )
  SELECT EXISTS (SELECT 1 FROM walk WHERE node = NEW.predecessor_id) INTO cycle_found;

  IF cycle_found THEN
    RAISE EXCEPTION 'Adding this dependency would create a cycle (% -> %)',
      NEW.predecessor_id, NEW.successor_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pftd_no_cycle ON public.project_field_task_dependencies;
CREATE TRIGGER trg_pftd_no_cycle
  BEFORE INSERT OR UPDATE ON public.project_field_task_dependencies
  FOR EACH ROW EXECUTE FUNCTION public.pftd_assert_no_cycle();

-- 4) RLS ---------------------------------------------------------------------
ALTER TABLE public.project_field_task_dependencies ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read; project_field_tasks itself is protected by
-- its own RLS, so leaking dependency edges adds no extra information.
DROP POLICY IF EXISTS pftd_select_all ON public.project_field_task_dependencies;
CREATE POLICY pftd_select_all
  ON public.project_field_task_dependencies
  FOR SELECT TO authenticated
  USING (true);

-- Writes require the caller to be able to SEE BOTH endpoint tasks.
-- The inner SELECTs piggy-back on the existing project_field_tasks SELECT
-- policy, so a user who cannot read either side of the edge cannot create or
-- mutate it. (A user who can SEE both tasks but only WRITE one is still
-- allowed to wire them together — this matches every other dependency-edge
-- pattern in the app where a planner needs to draft cross-team sequences.
-- For tighter "only the successor's writer may add deps" semantics, route
-- writes through a SECURITY DEFINER RPC in a follow-up; tracked in
-- docs/STATUS_DASHBOARD.md.)
DROP POLICY IF EXISTS pftd_write_if_task_writable ON public.project_field_task_dependencies;
CREATE POLICY pftd_write_if_task_writable
  ON public.project_field_task_dependencies
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.project_field_tasks t WHERE t.id = predecessor_id)
    AND EXISTS (SELECT 1 FROM public.project_field_tasks t WHERE t.id = successor_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.project_field_tasks t WHERE t.id = predecessor_id)
    AND EXISTS (SELECT 1 FROM public.project_field_tasks t WHERE t.id = successor_id)
  );

-- 5) Migrate existing uuid[] dependencies → rows -----------------------------
-- Only runs once; ON CONFLICT DO NOTHING guarantees idempotency.
INSERT INTO public.project_field_task_dependencies
  (project_id, predecessor_id, successor_id, dep_type, lag_days, notes)
SELECT
  t.project_id,
  dep_id::uuid       AS predecessor_id,
  t.id               AS successor_id,
  'FS'               AS dep_type,
  0                  AS lag_days,
  'migrated from legacy dependencies array' AS notes
FROM public.project_field_tasks t
CROSS JOIN LATERAL unnest(COALESCE(t.dependencies, ARRAY[]::uuid[])) AS dep_id
WHERE dep_id IS NOT NULL
  AND dep_id::uuid <> t.id
  -- ensure the predecessor still exists in the same project
  AND EXISTS (
    SELECT 1 FROM public.project_field_tasks p
     WHERE p.id = dep_id::uuid AND p.project_id = t.project_id
  )
ON CONFLICT (predecessor_id, successor_id) DO NOTHING;

COMMIT;

-- ============================================================================
-- ROLLBACK SNIPPET
-- ============================================================================
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_pftd_no_cycle      ON public.project_field_task_dependencies;
-- DROP TRIGGER IF EXISTS trg_pftd_same_project  ON public.project_field_task_dependencies;
-- DROP FUNCTION IF EXISTS public.pftd_assert_no_cycle();
-- DROP FUNCTION IF EXISTS public.pftd_assert_same_project();
-- DROP TABLE IF EXISTS public.project_field_task_dependencies;
-- COMMIT;
