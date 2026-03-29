-- Applied on remote as: user_roles_rls_and_initplan_fixes
-- Consolidates user_roles RLS: drops overlapping policies, removes SELECT(true) leak,
-- adds profile_can_manage_user_roles() with lower()-normalized profiles.role matching.

CREATE OR REPLACE FUNCTION public.profile_can_manage_user_roles(check_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = check_uid
      AND lower(trim(COALESCE(p.role, ''))) = ANY (ARRAY[
        'admin',
        'ict',
        'superadmin',
        'super_admin',
        'super admin',
        'country director',
        'countrydirector',
        'field operation manager (fom)',
        'fom'
      ])
  );
$$;

COMMENT ON FUNCTION public.profile_can_manage_user_roles(uuid) IS
  'True if profiles.role allows assigning user_roles (admin/ict/FOM-style roles). Used by RLS; pass (select auth.uid()).';

DROP POLICY IF EXISTS "Admins can manage user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS user_roles_modify_admin_ict ON public.user_roles;
DROP POLICY IF EXISTS user_roles_select_self_or_admin ON public.user_roles;
DROP POLICY IF EXISTS user_roles_select_any_authenticated ON public.user_roles;
DROP POLICY IF EXISTS user_roles_select_all_auth ON public.user_roles;
DROP POLICY IF EXISTS user_roles_modify_all_auth ON public.user_roles;

CREATE POLICY user_roles_select_policy
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (
    user_id = (select auth.uid())
    OR public.profile_can_manage_user_roles((select auth.uid()))
  );

CREATE POLICY user_roles_insert_policy
  ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (public.profile_can_manage_user_roles((select auth.uid())));

CREATE POLICY user_roles_update_policy
  ON public.user_roles
  FOR UPDATE
  TO authenticated
  USING (public.profile_can_manage_user_roles((select auth.uid())))
  WITH CHECK (public.profile_can_manage_user_roles((select auth.uid())));

CREATE POLICY user_roles_delete_policy
  ON public.user_roles
  FOR DELETE
  TO authenticated
  USING (public.profile_can_manage_user_roles((select auth.uid())));

CREATE INDEX IF NOT EXISTS idx_user_roles_assigned_by
  ON public.user_roles (assigned_by);
