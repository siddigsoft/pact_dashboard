-- FIX: co-assignees were silently filtered out of personal_tasks SELECT/UPDATE.
-- The previous policy used the JSONB ? operator: `co_assignees ? auth.uid()::text`.
-- That operator only matches top-level string elements of an array OR top-level
-- object keys. Our `co_assignees` column stores `[{id, name, email?}, ...]`,
-- so the ? operator never matched, and co-assignees could not see or update
-- the tasks they were added to (My Tasks page appeared empty for them).
--
-- New policy uses jsonb containment: co_assignees @> '[{"id": <uid>}]'.

DROP POLICY IF EXISTS personal_tasks_select ON public.personal_tasks;
DROP POLICY IF EXISTS personal_tasks_update ON public.personal_tasks;

CREATE POLICY personal_tasks_select ON public.personal_tasks
  FOR SELECT USING (
    user_id = auth.uid()
    OR assigned_to = auth.uid()
    OR (
      co_assignees IS NOT NULL
      AND co_assignees @> jsonb_build_array(jsonb_build_object('id', auth.uid()::text))
    )
  );

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

-- Helpful GIN index so the containment check stays fast as the table grows.
CREATE INDEX IF NOT EXISTS personal_tasks_co_assignees_gin
  ON public.personal_tasks USING gin (co_assignees);
