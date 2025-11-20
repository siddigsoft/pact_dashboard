-- Fix RLS recursion by avoiding self-referential queries in policies
-- This migration replaces policies that referenced public.user_roles from within
-- policies on user_roles (and roles/permissions which indirectly depended on them),
-- which caused "infinite recursion detected in policy" errors.

-- Ensure RLS enabled (idempotent)
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

-- 1) user_roles policies
DROP POLICY IF EXISTS user_roles_select_self_or_admin ON public.user_roles;
DROP POLICY IF EXISTS user_roles_select_all_auth ON public.user_roles; -- legacy
DROP POLICY IF EXISTS user_roles_modify_admin_ict ON public.user_roles;
DROP POLICY IF EXISTS user_roles_modify_all_auth ON public.user_roles; -- legacy

-- Allow a user to see their own rows, and admins/ict (by profiles.role) to see all
CREATE POLICY user_roles_select_self_or_admin
  ON public.user_roles
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin','ict')
    )
  );

-- Only admins/ict (by profiles.role) may insert/update/delete
CREATE POLICY user_roles_modify_admin_ict
  ON public.user_roles
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin','ict')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin','ict')
    )
  );

-- 2) roles policies: avoid depending on user_roles inside policy evaluation
DROP POLICY IF EXISTS roles_modify_admin_only ON public.roles;
CREATE POLICY roles_modify_admin_only
  ON public.roles
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin','ict')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin','ict')
    )
  );

-- 3) permissions policies: avoid depending on user_roles inside policy evaluation
DROP POLICY IF EXISTS permissions_modify_admin_only ON public.permissions;
CREATE POLICY permissions_modify_admin_only
  ON public.permissions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin','ict')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin','ict')
    )
  );
