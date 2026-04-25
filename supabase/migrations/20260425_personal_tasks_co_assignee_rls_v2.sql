-- =============================================================================
-- BUG FIX — Co-assignees see "Task not found" on /tasks/:id
-- =============================================================================
-- Reported 2026-04-25 by user "Mohamed Yo..." (Employee role).
-- URL: https://app.pactorg.com/tasks/1638de9c-dd0f-469a-9682-d6192b727379
-- TaskDetail.tsx fetch at line 159-163 is `select * from personal_tasks
-- where id = $1` with .maybeSingle(); the page renders "Task not found"
-- whenever that returns null. Therefore the only way Mohamed sees this
-- screen is if RLS on personal_tasks_select is denying the row to him.
--
-- Two earlier migrations exist with the same date prefix (20260422):
--   * 20260422_personal_tasks_assignee_rls.sql      — used `co_assignees ? auth.uid()::text`
--                                                     (broken: ? only matches top-level
--                                                     string elements or object keys, never
--                                                     `[{id, ...}]` array shapes).
--   * 20260422_personal_tasks_co_assignee_rls_fix.sql — switched to JSONB containment
--                                                     `co_assignees @> jsonb_build_array(jsonb_build_object('id', auth.uid()::text))`.
--
-- Either (a) only the first file was hand-pasted into pactdb, or (b) both
-- were pasted but in alphabetical order so the broken one ran last, or
-- (c) some legacy task row stores the co-assignee shape slightly differently
-- and `@>` containment misses it (jsonb containment is strict about types
-- — a stored numeric or whitespace-padded id won't match).
--
-- This migration is the AUTHORITATIVE replacement. It:
--   1. Drops every prior personal_tasks_select / _update / _insert / _delete
--      / _owner policy by name (idempotent).
--   2. Recreates them using a bulletproof EXISTS form that walks
--      jsonb_array_elements and compares (elem->>'id') = auth.uid()::text.
--      This works for any stored shape — numeric ids, padded strings, extra
--      whitespace, arrays of mixed types — because ->> always coerces to text.
--      The CASE wrapper ensures we never call jsonb_array_elements on a
--      non-array value (would throw "cannot extract elements from a scalar"
--      and lock everyone out of any task whose co_assignees is null/scalar/object
--      from a legacy migration). Belt-and-braces: if jsonb_typeof != 'array',
--      we substitute an empty array and the EXISTS short-circuits to false.
--   3. Keeps the GIN index on co_assignees (still useful for the My Tasks
--      list query that uses `cs` / @> filter in usePersonalTasks.ts:621).
--   4. Includes verification queries at the bottom (commented) so the user
--      can run them in pactdb SQL editor to prove the fix worked for the
--      specific reported task before closing the ticket.
-- =============================================================================

BEGIN;

-- 1. Drop every policy by every name we have ever shipped on this table.
DROP POLICY IF EXISTS personal_tasks_owner          ON public.personal_tasks;
DROP POLICY IF EXISTS personal_tasks_select         ON public.personal_tasks;
DROP POLICY IF EXISTS personal_tasks_insert         ON public.personal_tasks;
DROP POLICY IF EXISTS personal_tasks_update         ON public.personal_tasks;
DROP POLICY IF EXISTS personal_tasks_delete         ON public.personal_tasks;
DROP POLICY IF EXISTS personal_tasks_select_co      ON public.personal_tasks;

-- 2. Make sure RLS is on (no-op if already enabled).
ALTER TABLE public.personal_tasks ENABLE ROW LEVEL SECURITY;

-- 3. Recreate the four policies with the bulletproof EXISTS form.
--    Every policy uses the SAME predicate so authz is consistent across
--    SELECT / UPDATE / DELETE.

CREATE POLICY personal_tasks_select ON public.personal_tasks
  FOR SELECT
  USING (
    user_id     = auth.uid()
    OR assigned_to = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(co_assignees) = 'array' THEN co_assignees
          ELSE '[]'::jsonb
        END
      ) AS elem
      WHERE (elem->>'id') = auth.uid()::text
    )
  );

CREATE POLICY personal_tasks_insert ON public.personal_tasks
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
  );

CREATE POLICY personal_tasks_update ON public.personal_tasks
  FOR UPDATE
  USING (
    user_id     = auth.uid()
    OR assigned_to = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(co_assignees) = 'array' THEN co_assignees
          ELSE '[]'::jsonb
        END
      ) AS elem
      WHERE (elem->>'id') = auth.uid()::text
    )
  )
  WITH CHECK (
    user_id     = auth.uid()
    OR assigned_to = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(co_assignees) = 'array' THEN co_assignees
          ELSE '[]'::jsonb
        END
      ) AS elem
      WHERE (elem->>'id') = auth.uid()::text
    )
  );

-- DELETE stays restrictive: only the creator (user_id) may delete the task.
-- This is INTENTIONALLY identical to the prior baseline — both
-- 20260422_personal_tasks_assignee_rls.sql and
-- 20260422_personal_tasks_co_assignee_rls_fix.sql shipped the exact same
-- DELETE policy. Do NOT widen here.
--
-- KNOWN PRE-EXISTING GAP (NOT introduced by this hot-patch, separately
-- tracked in docs/STATUS_DASHBOARD.md §5): src/pages/TaskDetail.tsx
-- exposes the Delete button to admins and the primary assignee
-- (canDeleteTask = isAdmin || user_id === me || assigned_to === me),
-- but RLS only allows the creator. So those clicks fail silently at
-- the RLS layer today. Fixing that requires its own migration with
-- its own auth review — do NOT bundle it into this scoped SELECT fix.
CREATE POLICY personal_tasks_delete ON public.personal_tasks
  FOR DELETE
  USING (
    user_id = auth.uid()
  );

-- 4. GIN index for the My Tasks list query (filter('co_assignees','cs',...)).
--    Idempotent.
CREATE INDEX IF NOT EXISTS personal_tasks_co_assignees_gin
  ON public.personal_tasks USING gin (co_assignees);

COMMIT;

-- =============================================================================
-- VERIFICATION QUERIES — run AFTER the COMMIT above, as the *Mohamed* user
-- (set the JWT in pactdb SQL editor "Run as user" dropdown to his UUID).
-- DO NOT run these inside the migration transaction.
-- =============================================================================
-- A. Confirm the four policies exist and use the new predicate.
--    Expect 4 rows: select, insert, update, delete.
-- SELECT policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'personal_tasks'
-- ORDER BY policyname;
--
-- B. Confirm the reported task is now visible to Mohamed.
--    Run as Mohamed (set his uid in the editor's "Run as user" picker).
--    Expect 1 row.
-- SELECT id, title, user_id, assigned_to,
--        jsonb_path_query_array(co_assignees, '$[*].id') AS co_ids,
--        auth.uid() AS my_uid
-- FROM public.personal_tasks
-- WHERE id = '1638de9c-dd0f-469a-9682-d6192b727379';
--
-- C. Sanity check on the underlying data (run as super_admin, NOT Mohamed).
--    Confirms his uid actually appears in the co_assignees JSON for that row.
-- SELECT id, co_assignees
-- FROM public.personal_tasks
-- WHERE id = '1638de9c-dd0f-469a-9682-d6192b727379';
--    -> Look for an element whose "id" field equals Mohamed's auth uid
--       (find his uid via: SELECT id, full_name FROM profiles WHERE full_name ILIKE 'Mohamed%';)
-- =============================================================================
