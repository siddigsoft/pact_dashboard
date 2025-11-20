-- Adjust user_roles to support custom roles via role_id and harden RLS policies
-- Safe, idempotent changes

-- 1) Allow NULL in role column so we can store custom roles with role_id only
ALTER TABLE public.user_roles
  ALTER COLUMN role DROP NOT NULL;

-- 2) Relax (and re-add) CHECK constraint so it only validates when role is present
DO $$ BEGIN
  ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
  ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_role_check
    CHECK (
      role IS NULL OR role IN (
        'admin', 'ict', 'fom', 'financialAdmin', 'supervisor',
        'coordinator', 'dataCollector', 'reviewer'
      )
    );
EXCEPTION
  WHEN others THEN NULL;
END $$;

-- 3) Harden RLS policies on user_roles
-- Drop overly-permissive policies if they exist
DROP POLICY IF EXISTS "user_roles_modify_all_auth" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_select_all_auth" ON public.user_roles;

-- Ensure RLS is enabled (idempotent)
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Selection: allow self to see own roles, admins/ict can see all
CREATE POLICY IF NOT EXISTS user_roles_select_self_or_admin
  ON public.user_roles
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin','ict')
    )
  );

-- Mutations: only admins/ict may insert/update/delete
CREATE POLICY IF NOT EXISTS user_roles_modify_admin_ict
  ON public.user_roles
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin','ict')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin','ict')
    )
  );
