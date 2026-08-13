-- Returns true when the given user is explicitly denied access to the target
-- folder OR to any of its ancestors (full recursive cascade, matching the
-- WorkspaceHub BFS propagation rule).
--
-- Checks both direct-user grants (grantee_id = p_user_id) AND all_staff
-- grants (grantee_type = 'all_staff'), matching WorkspaceHub's applicable-
-- grantee policy.
--
-- Uses UNION (not UNION ALL) in the recursive CTE so duplicate rows are
-- eliminated — this gives implicit cycle detection if a data anomaly ever
-- produces a circular parent_folder_id chain.
--
-- Callers MUST treat an RPC error as access-denied (fail closed). The
-- caller is responsible for the super-admin bypass; this function does not
-- check roles.

CREATE OR REPLACE FUNCTION check_folder_no_access(
  p_folder_id  uuid,
  p_user_id    uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_folder_ids uuid[];
  v_denied     boolean;
BEGIN
  -- ── Resolve the full ancestor chain + the folder itself ───────────────────
  -- UNION (not UNION ALL) eliminates duplicates, providing implicit cycle
  -- detection: if a cycle exists in parent_folder_id links, revisited rows
  -- are discarded and the recursion terminates naturally.
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
        grantee_id   = p_user_id        -- direct-user grant
        OR grantee_type = 'all_staff'   -- all-staff grant
      )
  ) INTO v_denied;

  RETURN COALESCE(v_denied, false);
END;
$$;

-- Authenticated users call this to check their own access.
-- Authorization is enforced by the caller (super-admin bypass, userId match).
GRANT EXECUTE ON FUNCTION check_folder_no_access(uuid, uuid) TO authenticated;
