-- Fix: Profile saves fail for admins because:
--   1) The only profiles UPDATE policy is for service_role, blocking direct updates
--   2) admin_update_profile() RPC was never tracked in a migration (untracked Supabase function)
-- Solution:
--   A) Add a broad admin/super-admin UPDATE policy on profiles
--   B) Create the admin_update_profile() RPC with SECURITY DEFINER

-- ─────────────────────────────────────────────────────────────────────────────
-- A) Profiles UPDATE policy for admins
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS profiles_admin_update ON public.profiles;

CREATE POLICY profiles_admin_update
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND LOWER(p.role) IN ('admin', 'superadmin', 'super_admin')
    )
  )
  WITH CHECK (
    public.is_super_admin((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND LOWER(p.role) IN ('admin', 'superadmin', 'super_admin')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- B) admin_update_profile() RPC — SECURITY DEFINER bypasses RLS entirely
--    Called as fallback when the direct UPDATE fails (e.g. on older permission sets)
--    Drop ALL existing overloads first (name is ambiguous = multiple signatures exist)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure::text AS sig
    FROM pg_proc
    WHERE proname = 'admin_update_profile'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.admin_update_profile(
  target_id        UUID,
  new_full_name    TEXT    DEFAULT NULL,
  new_username     TEXT    DEFAULT NULL,
  new_email        TEXT    DEFAULT NULL,
  new_role         TEXT    DEFAULT NULL,
  new_avatar_url   TEXT    DEFAULT NULL,
  new_hub_id       TEXT    DEFAULT NULL,
  new_state_id     TEXT    DEFAULT NULL,
  new_locality_id  TEXT    DEFAULT NULL,
  new_employee_id  TEXT    DEFAULT NULL,
  new_phone        TEXT    DEFAULT NULL,
  new_bank_account JSONB   DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT;
BEGIN
  -- Only admins / super-admins may call this function
  SELECT LOWER(role) INTO caller_role FROM profiles WHERE id = auth.uid();

  IF NOT (
    public.is_super_admin(auth.uid())
    OR caller_role IN ('admin', 'superadmin', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Forbidden: only admins may call admin_update_profile';
  END IF;

  UPDATE public.profiles
  SET
    full_name    = COALESCE(new_full_name,    full_name),
    username     = COALESCE(new_username,     username),
    email        = COALESCE(new_email,        email),
    role         = COALESCE(new_role,         role),
    avatar_url   = CASE WHEN new_avatar_url IS NOT NULL THEN new_avatar_url ELSE avatar_url END,
    hub_id       = COALESCE(new_hub_id,       hub_id),
    state_id     = COALESCE(new_state_id,     state_id),
    locality_id  = COALESCE(new_locality_id,  locality_id),
    employee_id  = COALESCE(new_employee_id,  employee_id),
    phone        = COALESCE(new_phone,        phone),
    bank_account = COALESCE(new_bank_account, bank_account)
  WHERE id = target_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_profile(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB
) TO authenticated;

COMMENT ON FUNCTION public.admin_update_profile IS
'SECURITY DEFINER: allows admins to update any user profile, bypassing RLS.
 Guards internally: only admin/super-admin callers are permitted.
 Called as RPC fallback from UserContext.updateUser() when the direct UPDATE is blocked.';
