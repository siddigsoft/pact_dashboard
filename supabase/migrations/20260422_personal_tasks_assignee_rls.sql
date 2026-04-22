-- Allow assignees and co-assignees (not only the creator) to view and update
-- their personal tasks. Previously the single `personal_tasks_owner` policy
-- restricted everything to user_id = auth.uid(), which silently blocked
-- assignees from changing task status from My Tasks views.

DROP POLICY IF EXISTS personal_tasks_owner  ON public.personal_tasks;
DROP POLICY IF EXISTS personal_tasks_select ON public.personal_tasks;
DROP POLICY IF EXISTS personal_tasks_insert ON public.personal_tasks;
DROP POLICY IF EXISTS personal_tasks_update ON public.personal_tasks;
DROP POLICY IF EXISTS personal_tasks_delete ON public.personal_tasks;

CREATE POLICY personal_tasks_select ON public.personal_tasks
  FOR SELECT USING (
    user_id = auth.uid()
    OR assigned_to = auth.uid()
    OR (co_assignees IS NOT NULL AND co_assignees ? auth.uid()::text)
  );

CREATE POLICY personal_tasks_insert ON public.personal_tasks
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY personal_tasks_update ON public.personal_tasks
  FOR UPDATE USING (
    user_id = auth.uid()
    OR assigned_to = auth.uid()
    OR (co_assignees IS NOT NULL AND co_assignees ? auth.uid()::text)
  ) WITH CHECK (
    user_id = auth.uid()
    OR assigned_to = auth.uid()
    OR (co_assignees IS NOT NULL AND co_assignees ? auth.uid()::text)
  );

CREATE POLICY personal_tasks_delete ON public.personal_tasks
  FOR DELETE USING (user_id = auth.uid());
