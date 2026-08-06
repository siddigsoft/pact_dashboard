-- Fix: roles_modify_admin_only excluded 'superAdmin' from profiles.role check
-- Super Admins were getting "violates row-level security policy for table roles"
-- when trying to create / update / delete custom roles.

DROP POLICY IF EXISTS roles_modify_admin_only ON public.roles;

CREATE POLICY roles_modify_admin_only
  ON public.roles
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'ict', 'superAdmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'ict', 'superAdmin')
    )
  );

-- Mirror the same fix on the permissions table so permission inserts
-- that follow a role creation also succeed.
DROP POLICY IF EXISTS permissions_modify_admin_only ON public.permissions;

CREATE POLICY permissions_modify_admin_only
  ON public.permissions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'ict', 'superAdmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'ict', 'superAdmin')
    )
  );
