-- =============================================================================
-- ROLLBACK — Personal Tasks Co-Assignee RLS v2
-- =============================================================================
-- Restores the policies as they were after 20260422_personal_tasks_co_assignee_rls_fix.sql
-- (the JSONB-containment form). Idempotent and transactional.
--
-- WARNING: that prior state still has the original bug for any task whose
-- co_assignees JSON contains a numeric, padded, or otherwise type-divergent
-- "id" field. Only roll back if v2 itself caused a regression — never as
-- a "go back to working" step, because v2 IS the working step.
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS personal_tasks_select ON public.personal_tasks;
DROP POLICY IF EXISTS personal_tasks_update ON public.personal_tasks;
DROP POLICY IF EXISTS personal_tasks_insert ON public.personal_tasks;
DROP POLICY IF EXISTS personal_tasks_delete ON public.personal_tasks;

CREATE POLICY personal_tasks_select ON public.personal_tasks
  FOR SELECT USING (
    user_id = auth.uid()
    OR assigned_to = auth.uid()
    OR (
      co_assignees IS NOT NULL
      AND co_assignees @> jsonb_build_array(jsonb_build_object('id', auth.uid()::text))
    )
  );

CREATE POLICY personal_tasks_insert ON public.personal_tasks
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY personal_tasks_update ON public.personal_tasks
  FOR UPDATE USING (
    user_id = auth.uid()
    OR assigned_to = auth.uid()
    OR (
      co_assignees IS NOT NULL
      AND co_assignees @> jsonb_build_array(jsonb_build_object('id', auth.uid()::text))
    )
  ) WITH CHECK (
    user_id = auth.uid()
    OR assigned_to = auth.uid()
    OR (
      co_assignees IS NOT NULL
      AND co_assignees @> jsonb_build_array(jsonb_build_object('id', auth.uid()::text))
    )
  );

CREATE POLICY personal_tasks_delete ON public.personal_tasks
  FOR DELETE USING (user_id = auth.uid());

-- The GIN index from v2 is still useful — leave it in place. Drop only
-- if you need to revert *every* trace of v2:
-- DROP INDEX IF EXISTS public.personal_tasks_co_assignees_gin;

COMMIT;
