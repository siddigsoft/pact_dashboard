-- ============================================================================
-- PROGRESSIVE OUTPUT TRACKING
-- ----------------------------------------------------------------------------
-- Extends the existing `task_elements` table with optional quantitative
-- progress fields so an element can be tracked as "3 of 5 sites visited"
-- or "70 of 100 surveys" instead of just done / not-done.
--
-- Backward-compatible: every column is nullable. Elements without a
-- target_value behave exactly as today (binary done flag).
--
-- Apply manually in pactdb Supabase SQL editor (per the project's
-- manual-SQL standing rule). Companion runbook:
--   docs/sql/PROGRESSIVE_OUTPUT_TRACKING_APPLY.md
-- ============================================================================

BEGIN;

-- 1) Add quantitative fields to task_elements --------------------------------
ALTER TABLE public.task_assignee_elements
  ADD COLUMN IF NOT EXISTS target_value  NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS current_value NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit          TEXT;

COMMENT ON COLUMN public.task_assignee_elements.target_value
  IS 'Optional numeric target (e.g. 100 for "100 surveys"). NULL = binary done element.';
COMMENT ON COLUMN public.task_assignee_elements.current_value
  IS 'Current progress toward target_value. Ignored when target_value IS NULL.';
COMMENT ON COLUMN public.task_assignee_elements.unit
  IS 'Optional unit label (e.g. "surveys", "sites", "%"). Display-only.';

-- Sanity: if a quantitative element is fully met, mark it done; if not, undone
-- (only when target_value IS NOT NULL — leaves binary elements alone).
ALTER TABLE public.task_assignee_elements
  ADD CONSTRAINT task_assignee_elements_progress_consistent
  CHECK (
    target_value IS NULL
    OR (current_value IS NOT NULL AND current_value >= 0 AND current_value <= target_value)
  );

-- 2) History table for audit / charting --------------------------------------
CREATE TABLE IF NOT EXISTS public.task_element_progress_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  element_id  uuid NOT NULL REFERENCES public.task_assignee_elements(id) ON DELETE CASCADE,
  task_id     uuid NOT NULL,
  value       NUMERIC(12,2) NOT NULL,
  note        TEXT,
  updated_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS task_element_progress_log_element_idx
  ON public.task_element_progress_log(element_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS task_element_progress_log_task_idx
  ON public.task_element_progress_log(task_id, updated_at DESC);

COMMENT ON TABLE public.task_element_progress_log
  IS 'Audit trail of every current_value change on a quantitative task element.';

-- 3) RPC: update element progress + auto-set done + write log ----------------
CREATE OR REPLACE FUNCTION public.update_task_element_progress(
  p_element_id uuid,
  p_value      NUMERIC,
  p_note       TEXT DEFAULT NULL
)
RETURNS public.task_assignee_elements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_element public.task_assignee_elements;
  v_user    uuid := auth.uid();
BEGIN
  SELECT * INTO v_element FROM public.task_assignee_elements WHERE id = p_element_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Element % not found', p_element_id;
  END IF;
  IF v_element.target_value IS NULL THEN
    RAISE EXCEPTION 'Element % is not a quantitative element (no target_value)', p_element_id;
  END IF;
  IF p_value < 0 OR p_value > v_element.target_value THEN
    RAISE EXCEPTION 'Value % is out of range [0..%]', p_value, v_element.target_value;
  END IF;

  UPDATE public.task_assignee_elements
     SET current_value = p_value,
         done          = (p_value >= target_value),
         done_at       = CASE
                           WHEN p_value >= target_value AND done_at IS NULL THEN now()
                           WHEN p_value <  target_value THEN NULL
                           ELSE done_at
                         END
   WHERE id = p_element_id
   RETURNING * INTO v_element;

  INSERT INTO public.task_element_progress_log (element_id, task_id, value, note, updated_by)
  VALUES (p_element_id, v_element.task_id, p_value, p_note, v_user);

  RETURN v_element;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_task_element_progress(uuid, NUMERIC, TEXT)
  TO authenticated;

-- 4) RLS on the new log table ------------------------------------------------
ALTER TABLE public.task_element_progress_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_element_progress_log_select ON public.task_element_progress_log;
CREATE POLICY task_element_progress_log_select
  ON public.task_element_progress_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.task_assignee_elements e
        JOIN public.personal_tasks t ON t.id = e.task_id
       WHERE e.id = task_element_progress_log.element_id
         AND (
              t.user_id = auth.uid()
           OR t.assigned_to = auth.uid()
           OR e.assignee_id = auth.uid()
           OR (t.co_assignees IS NOT NULL
               AND jsonb_typeof(t.co_assignees) = 'array'
               AND EXISTS (
                 SELECT 1 FROM jsonb_array_elements(t.co_assignees) elem
                  WHERE (elem->>'id') = auth.uid()::text
               ))
         )
    )
  );

-- The RPC writes log rows under SECURITY DEFINER so no INSERT policy needed
-- for end-users; direct INSERT is implicitly denied.

COMMIT;

-- ============================================================================
-- ROLLBACK SNIPPET (run if you need to back out)
-- ============================================================================
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.update_task_element_progress(uuid, NUMERIC, TEXT);
-- DROP TABLE IF EXISTS public.task_element_progress_log;
-- ALTER TABLE public.task_assignee_elements DROP CONSTRAINT IF EXISTS task_assignee_elements_progress_consistent;
-- ALTER TABLE public.task_assignee_elements DROP COLUMN IF EXISTS unit;
-- ALTER TABLE public.task_assignee_elements DROP COLUMN IF EXISTS current_value;
-- ALTER TABLE public.task_assignee_elements DROP COLUMN IF EXISTS target_value;
-- COMMIT;
