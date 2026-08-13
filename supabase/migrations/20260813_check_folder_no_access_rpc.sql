-- Returns true when the calling authenticated user is explicitly denied access
-- to the target folder OR to any of its ancestors (full recursive cascade,
-- matching WorkspaceHub's BFS propagation rule).
--
-- The subject is always auth.uid() — the function never accepts a caller-
-- supplied user ID, preventing spoofed lookups. If auth.uid() is NULL
-- (unauthenticated call) the function returns false immediately; unauthenticated
-- guests cannot have named permission grants.
--
-- Checks both direct-user grants (grantee_id = auth.uid()) AND all_staff
-- grants (grantee_type = 'all_staff'), matching WorkspaceHub's applicable-
-- grantee policy.
--
-- Uses UNION (not UNION ALL) in the recursive CTE so duplicate rows are
-- eliminated — this gives implicit cycle detection for any circular
-- parent_folder_id anomaly, with no hard depth cap.
--
-- Callers MUST treat an RPC error as access-denied (fail closed). The caller
-- is responsible for the super-admin bypass; this function does not check roles.

CREATE OR REPLACE FUNCTION check_folder_no_access(p_folder_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_folder_ids uuid[];
  v_denied     boolean;
BEGIN
  -- Unauthenticated guests cannot have named permission grants
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- ── Resolve the full ancestor chain + the folder itself ───────────────────
  -- UNION (not UNION ALL) eliminates duplicates — implicit cycle detection.
  SELECT array_agg(id) INTO v_folder_ids
  FROM (
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_folder_id
      FROM workspace_folders
      WHERE id = p_folder_id

      UNION

      SELECT f.id, f.parent_folder_id
      FROM workspace_folders f
      INNER JOIN ancestors a ON f.id = a.parent_folder_id
    )
    SELECT id FROM ancestors
  ) t;

  -- ── Check for a matching no_access permission ─────────────────────────────
  SELECT EXISTS (
    SELECT 1
    FROM workspace_permissions
    WHERE folder_id    = ANY(v_folder_ids)
      AND access_level = 'no_access'
      AND (
        grantee_id   = v_user_id        -- direct-user grant
        OR grantee_type = 'all_staff'   -- all-staff grant
      )
  ) INTO v_denied;

  RETURN COALESCE(v_denied, false);
END;
$$;

-- Revoke the default PUBLIC execute privilege before granting only the
-- required role, so arbitrary callers cannot use this as a permission oracle.
REVOKE EXECUTE ON FUNCTION check_folder_no_access(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION check_folder_no_access(uuid) TO authenticated;
