-- ─────────────────────────────────────────────────────────────────────────────
-- Fix update_profile_avatar RPC — admin detection via user_roles
--
-- Problem: the original function only checked profiles.role to determine if
-- the caller is an admin.  profiles.role can be stale (e.g. 'dataCollector')
-- for users whose actual role lives in the user_roles table (set via the
-- Role Management screen).  This caused the "Not authorized to update another
-- user's photo" error even for legitimate admins.
--
-- Fix: after the profiles.role check, also query user_roles if the caller
-- is not yet recognised as an admin.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_profile_avatar(p_user_id uuid, p_url text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_count  int;
  v_caller_role    text;
  v_caller         uuid := auth.uid();
  v_is_admin       bool := false;
BEGIN
  -- Must be authenticated
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  -- 1. Check profiles.role (fast path)
  SELECT role INTO v_caller_role FROM profiles WHERE id = v_caller;
  v_is_admin := lower(coalesce(v_caller_role, '')) IN (
    'admin', 'superadmin', 'super_admin', 'hr_admin', 'ict'
  );

  -- 2. If not recognised from profiles.role, also check user_roles table.
  --    profiles.role is often stale when a role was assigned via the Role
  --    Management screen, which only writes to user_roles, not profiles.role.
  IF NOT v_is_admin THEN
    SELECT EXISTS (
      SELECT 1
      FROM   user_roles
      WHERE  user_id = v_caller
        AND  lower(role) IN ('admin', 'superadmin', 'super_admin', 'hr_admin', 'ict')
    ) INTO v_is_admin;
  END IF;

  -- Non-admin can only update their own photo
  IF NOT v_is_admin AND v_caller <> p_user_id THEN
    RETURN jsonb_build_object('error', 'Not authorized to update another user''s photo');
  END IF;

  -- Read current count for target user
  SELECT COALESCE(photo_upload_count, 0) INTO v_current_count
  FROM profiles WHERE id = p_user_id;

  -- Enforce 3-upload cap for non-admins
  IF NOT v_is_admin AND v_current_count >= 3 THEN
    RETURN jsonb_build_object(
      'error',
      'Photo upload limit reached (3 of 3 used). Please contact HR or Admin to update your photo.'
    );
  END IF;

  -- Apply update
  UPDATE profiles
  SET avatar_url         = p_url,
      photo_upload_count = COALESCE(photo_upload_count, 0) + 1
  WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true, 'count', v_current_count + 1);
END;
$$;

-- Re-grant (idempotent)
GRANT EXECUTE ON FUNCTION update_profile_avatar(uuid, text) TO authenticated;
