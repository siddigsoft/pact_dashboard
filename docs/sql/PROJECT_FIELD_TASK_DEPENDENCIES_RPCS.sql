-- ============================================================================
-- PROJECT FIELD TASK DEPENDENCIES — SECURITY DEFINER RPCS (Item-6 follow-up #1)
--
-- Tightens the typed-dep authorization model so that ONLY a user who can
-- write the SUCCESSOR task may add or remove dependency edges that point AT
-- it. Replaces the loose "SELECT visibility on both endpoints" RLS shipped
-- in PROJECT_FIELD_TASK_DEPENDENCIES.sql with two SECURITY DEFINER RPCs and
-- a deny-all-writes RLS policy on the table.
--
-- HOW THE WRITER CHECK WORKS:
--   `can_write_project_field_task(uuid)` is SECURITY INVOKER (so RLS would
--   apply to whatever role is currently effective). It probes the caller's
--   UPDATE permission via a no-op self-update on `project_field_tasks.notes`
--   (`SET notes = notes`). If the effective UPDATE policy on
--   `project_field_tasks` blocks the call, ROW_COUNT comes back 0 and the
--   helper returns false — so neither RPC needs to know the exact predicate
--   of that policy.
--
--   CRITICAL: a SECURITY DEFINER caller runs as the function owner (postgres
--   in Supabase), and postgres OWNS `project_field_tasks` so RLS is bypassed
--   for it. Calling the SECURITY INVOKER probe directly from a SECURITY
--   DEFINER body would therefore probe as postgres (always succeed) — that
--   is NOT the caller's permission. To make the check enforce the actual
--   end-user's UPDATE permission, both RPCs:
--     1. capture the original `current_user` (the definer owner) at function start;
--     2. `SET LOCAL ROLE authenticated` before invoking the probe;
--     3. explicitly restore the captured owner role via `SET LOCAL ROLE <owner>`
--        immediately after the probe — NOT `RESET ROLE`, because RESET reverts
--        to `session_user`, which under PostgREST is the connection role
--        `authenticator` (not the definer owner). With session_user restored,
--        the subsequent INSERT/DELETE on the deny-all-write
--        `project_field_task_dependencies` table would hit RLS and fail.
--   `auth.uid()` is JWT-based (via request headers) and is unaffected by
--   SET ROLE, so the probe still sees the correct user identity.
--
--   The probe is cheap (single-row affected, idempotent self-set) and any
--   AFTER UPDATE trigger that ignores zero-diff updates will not fire any
--   side-effect (notes stays bit-identical). If you have audit triggers
--   that record EVERY update regardless of diff, switch the probe to a
--   savepoint-rolled-back probe per the comment block at the bottom.
--
-- STANDING RULE: paste manually in pactdb. No Drizzle. No db:push.
-- ============================================================================

BEGIN;

-- 1) Writer probe -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_write_project_field_task(p_task_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_count int;
BEGIN
  IF p_task_id IS NULL THEN
    RETURN false;
  END IF;
  -- No-op self-update. If the caller's RLS UPDATE policy denies it, ROW_COUNT = 0.
  UPDATE public.project_field_tasks
     SET notes = notes
   WHERE id = p_task_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;

COMMENT ON FUNCTION public.can_write_project_field_task(uuid)
  IS 'Returns true iff the caller has UPDATE permission on the given project_field_task per its existing RLS. Used by the typed-dep RPCs to delegate authorization without duplicating the UPDATE predicate.';

GRANT EXECUTE ON FUNCTION public.can_write_project_field_task(uuid) TO authenticated;

-- 2) Upsert RPC --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_project_field_task_dep(
  p_predecessor_id uuid,
  p_successor_id   uuid,
  p_dep_type       text DEFAULT 'FS',
  p_lag_days       int  DEFAULT 0,
  p_notes          text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dep_id     uuid;
  v_user_id    uuid := auth.uid();
  v_proj       text;
  v_owner_role text := current_user;  -- definer owner (e.g. postgres)
  v_can_write  boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_predecessor_id IS NULL OR p_successor_id IS NULL THEN
    RAISE EXCEPTION 'Predecessor and successor task IDs are required';
  END IF;
  IF p_dep_type NOT IN ('FS','SS','FF','SF') THEN
    RAISE EXCEPTION 'Invalid dep_type %; must be one of FS, SS, FF, SF', p_dep_type;
  END IF;

  -- Authorization: probe the successor's UPDATE permission under the role
  -- 'authenticated' so RLS on project_field_tasks actually applies. Restore
  -- the captured definer-owner role explicitly afterwards (NOT `RESET ROLE`,
  -- which would revert to session_user = `authenticator` under PostgREST and
  -- block the subsequent INSERT against the deny-all-write RLS on
  -- project_field_task_dependencies). See header for full rationale.
  SET LOCAL ROLE authenticated;
  v_can_write := public.can_write_project_field_task(p_successor_id);
  EXECUTE format('SET LOCAL ROLE %I', v_owner_role);

  IF NOT v_can_write THEN
    RAISE EXCEPTION 'Not authorized to add a dependency to task %', p_successor_id
      USING ERRCODE = '42501';
  END IF;

  -- Resolve project_id from the successor task (the same-project trigger
  -- will additionally enforce that predecessor matches).
  SELECT project_id::text INTO v_proj
    FROM public.project_field_tasks WHERE id = p_successor_id;
  IF v_proj IS NULL THEN
    RAISE EXCEPTION 'Successor task % does not exist', p_successor_id;
  END IF;

  INSERT INTO public.project_field_task_dependencies
    (project_id, predecessor_id, successor_id, dep_type, lag_days, notes, created_by)
  VALUES
    (v_proj, p_predecessor_id, p_successor_id, p_dep_type, p_lag_days, p_notes, v_user_id)
  ON CONFLICT (predecessor_id, successor_id) DO UPDATE
    SET dep_type = EXCLUDED.dep_type,
        lag_days = EXCLUDED.lag_days,
        notes    = EXCLUDED.notes
  RETURNING id INTO v_dep_id;

  RETURN v_dep_id;
END;
$$;

COMMENT ON FUNCTION public.upsert_project_field_task_dep(uuid, uuid, text, int, text)
  IS 'Create or update a typed dependency edge (FS/SS/FF/SF + lag_days). Caller must be able to UPDATE the successor task per its RLS.';

GRANT EXECUTE ON FUNCTION
  public.upsert_project_field_task_dep(uuid, uuid, text, int, text) TO authenticated;

-- 3) Delete RPC --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_project_field_task_dep(
  p_predecessor_id uuid,
  p_successor_id   uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count      int;
  v_owner_role text := current_user;  -- definer owner (e.g. postgres)
  v_can_write  boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_predecessor_id IS NULL OR p_successor_id IS NULL THEN
    RAISE EXCEPTION 'Predecessor and successor task IDs are required';
  END IF;

  -- Authorization: probe under the role 'authenticated' so RLS on
  -- project_field_tasks actually applies; restore the captured definer-owner
  -- role explicitly afterwards (NOT `RESET ROLE`). See header for full rationale.
  SET LOCAL ROLE authenticated;
  v_can_write := public.can_write_project_field_task(p_successor_id);
  EXECUTE format('SET LOCAL ROLE %I', v_owner_role);

  IF NOT v_can_write THEN
    RAISE EXCEPTION 'Not authorized to remove a dependency from task %', p_successor_id
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.project_field_task_dependencies
   WHERE predecessor_id = p_predecessor_id
     AND successor_id   = p_successor_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;

COMMENT ON FUNCTION public.delete_project_field_task_dep(uuid, uuid)
  IS 'Remove a typed dependency edge. Caller must be able to UPDATE the successor task per its RLS.';

GRANT EXECUTE ON FUNCTION
  public.delete_project_field_task_dep(uuid, uuid) TO authenticated;

-- 4) Lock down direct table writes --------------------------------------------
-- Replace the loose "SELECT-both-endpoints" policy with a deny-all-writes
-- policy. SELECT remains open to authenticated.
DROP POLICY IF EXISTS pftd_write_if_task_writable ON public.project_field_task_dependencies;

DROP POLICY IF EXISTS pftd_no_direct_writes ON public.project_field_task_dependencies;
CREATE POLICY pftd_no_direct_writes
  ON public.project_field_task_dependencies
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

-- The two SECURITY DEFINER RPCs above bypass this policy (definer = postgres),
-- so all real writes go through the RPCs and inherit their successor-writer
-- authorization rule.

COMMIT;

-- ============================================================================
-- ROLLBACK SNIPPET
-- ============================================================================
-- BEGIN;
-- DROP POLICY  IF EXISTS pftd_no_direct_writes ON public.project_field_task_dependencies;
-- -- Restore the looser "SELECT-both-endpoints" policy from the original migration:
-- CREATE POLICY pftd_write_if_task_writable
--   ON public.project_field_task_dependencies
--   FOR ALL TO authenticated
--   USING (
--     EXISTS (SELECT 1 FROM public.project_field_tasks t WHERE t.id = predecessor_id)
--     AND EXISTS (SELECT 1 FROM public.project_field_tasks t WHERE t.id = successor_id)
--   )
--   WITH CHECK (
--     EXISTS (SELECT 1 FROM public.project_field_tasks t WHERE t.id = predecessor_id)
--     AND EXISTS (SELECT 1 FROM public.project_field_tasks t WHERE t.id = successor_id)
--   );
-- DROP FUNCTION IF EXISTS public.delete_project_field_task_dep(uuid, uuid);
-- DROP FUNCTION IF EXISTS public.upsert_project_field_task_dep(uuid, uuid, text, int, text);
-- DROP FUNCTION IF EXISTS public.can_write_project_field_task(uuid);
-- COMMIT;

-- ============================================================================
-- IF YOU HAVE AN AUDIT TRIGGER ON project_field_tasks THAT FIRES ON ZERO-DIFF
-- UPDATES (ie. records EVERY update regardless of changed columns), replace
-- the body of can_write_project_field_task with a savepoint-rolled-back probe
-- so the audit log is not polluted by permission checks:
--
--   CREATE OR REPLACE FUNCTION public.can_write_project_field_task(p_task_id uuid)
--   RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER AS $$
--   DECLARE v_count int;
--   BEGIN
--     IF p_task_id IS NULL THEN RETURN false; END IF;
--     BEGIN
--       SAVEPOINT probe;
--       UPDATE public.project_field_tasks SET notes = notes WHERE id = p_task_id;
--       GET DIAGNOSTICS v_count = ROW_COUNT;
--       ROLLBACK TO SAVEPOINT probe;
--       RETURN v_count > 0;
--     EXCEPTION WHEN insufficient_privilege THEN
--       RETURN false;
--     END;
--   END;
--   $$;
-- ============================================================================
