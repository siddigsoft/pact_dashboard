-- ─────────────────────────────────────────────────────────────────────────────
-- Profile-photo upload count enforcement
-- Run manually: supabase db push  OR  paste into Supabase SQL editor
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add upload-counter column (idempotent)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS photo_upload_count INT NOT NULL DEFAULT 0;

-- 2. SECURITY-DEFINER function — bypasses RLS, enforces 3-upload cap for non-admins
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

  -- Determine if caller is admin/HR (role check on profiles table)
  SELECT role INTO v_caller_role FROM profiles WHERE id = v_caller;
  v_is_admin := lower(v_caller_role) IN ('admin', 'superadmin', 'super_admin', 'hr_admin', 'ict');

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

-- 3. Grant execute to all authenticated users
GRANT EXECUTE ON FUNCTION update_profile_avatar(uuid, text) TO authenticated;
