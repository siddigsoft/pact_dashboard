-- Task #51 — Make the "Start the task" dependency gate reliable.
--
-- Problem: TaskDetail.tsx calls canTaskStart() which runs two client-side
-- SELECTs against task_dependencies and personal_tasks. When the viewer
-- (e.g. an admin/superadmin who is NOT the owner/assignee of a predecessor
-- task) cannot see the parent rows via RLS, those reads either return errors
-- or partial data, and the dep-gate fails closed with the amber
-- "Couldn't verify dependencies" banner. The Start button stays disabled
-- forever even though no real predecessor is blocking.
--
-- Fix: a single SECURITY DEFINER RPC that reads task_dependencies +
-- personal_tasks server-side, bypassing the viewer's RLS visibility on the
-- predecessor rows. The function still authorizes the *caller* against the
-- dependent task (the one being viewed), so it can't be used to leak
-- arbitrary task data.
--
-- Returns: jsonb { can_start: bool, blocking: jsonb[] }
--   blocking[] = [{ id, title, status, due_date, priority,
--                   dependencyId, leadTimeDays }]
-- can_start is true iff there are zero predecessor rows whose
-- personal_tasks.status is not 'done'.

BEGIN;

CREATE OR REPLACE FUNCTION public.task_can_start(p_task_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_has_access boolean := false;
  v_blocking jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  -- Authorization: the caller must own the dependent task, be its primary
  -- assignee, be a co-assignee, OR be an admin/superadmin (as recorded in
  -- the profiles table — same role check used by update_task_co_assignees).
  -- This deliberately does NOT check RLS visibility on the *parent* rows,
  -- since the entire point of this RPC is to bypass that.
  SELECT (
    EXISTS (
      SELECT 1
      FROM public.personal_tasks pt
      WHERE pt.id = p_task_id
        AND (
          pt.user_id     = v_uid
          OR pt.assigned_to = v_uid
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(pt.co_assignees) = 'array'
                   THEN pt.co_assignees
                   ELSE '[]'::jsonb
              END
            ) AS ca
            WHERE (ca->>'id')::uuid = v_uid
          )
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = v_uid
        AND lower(coalesce(p.role, '')) IN ('admin', 'superadmin', 'super_admin')
    )
  )
  INTO v_has_access;

  IF NOT v_has_access THEN
    RAISE EXCEPTION 'not authorized for task %', p_task_id USING ERRCODE = '42501';
  END IF;

  -- Compute the list of *incomplete* predecessor tasks. Reads run as the
  -- function definer so RLS on the predecessor rows is bypassed — the
  -- dep-gate answer is identical regardless of who is viewing.
  --
  -- Notes:
  --   * dependency_type filter mirrors the previous client logic
  --     (only 'blocks' / 'blocked_by' gate the start button).
  --   * personal_tasks.status = 'done' is the terminal-success state used
  --     across the app (see PersonalTaskStatus in usePersonalTasks.ts).
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id',           pt.id,
        'title',        pt.title,
        'status',       pt.status,
        'due_date',     pt.due_date,
        'priority',     pt.priority,
        'dependencyId', td.id,
        'leadTimeDays', td.lead_time_days
      )
      ORDER BY pt.due_date NULLS LAST, pt.title
    ),
    '[]'::jsonb
  )
  INTO v_blocking
  FROM public.task_dependencies td
  JOIN public.personal_tasks pt
    ON pt.id = td.parent_task_id
  WHERE td.dependent_task_id = p_task_id
    AND td.dependency_type IN ('blocks', 'blocked_by')
    AND pt.status IS DISTINCT FROM 'done';

  RETURN jsonb_build_object(
    'can_start', jsonb_array_length(v_blocking) = 0,
    'blocking',  v_blocking
  );
END;
$$;

REVOKE ALL ON FUNCTION public.task_can_start(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.task_can_start(uuid) TO authenticated;

COMMIT;

-- =============================================================================
-- VERIFICATION (run after applying — do NOT include in the migration tx):
-- =============================================================================
-- 1. A task with NO rows in task_dependencies returns can_start=true:
--    SELECT public.task_can_start('<task-with-no-deps>'::uuid);
--    -> { "can_start": true, "blocking": [] }
--
-- 2. A task with one in-progress predecessor returns can_start=false and
--    lists the predecessor:
--    SELECT public.task_can_start('<dependent-task-id>'::uuid);
--    -> { "can_start": false, "blocking": [{ "id": "...", "title": "...", "status": "todo", ... }] }
--
-- 3. An admin viewing a task whose predecessor they CANNOT see directly
--    (predecessor owned by someone else, RLS hides it) still gets a clean
--    answer — no permission error, no empty/partial result.
