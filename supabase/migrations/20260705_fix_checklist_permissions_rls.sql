-- Fix production RLS errors:
-- 1. project_stage_checklist: RLS enabled with zero policies → all access denied
-- 2. permissions: modify policy only allowed admin/ict, blocking super admins

-- project_stage_checklist: app-layer auth (same as project_flow_log)
ALTER TABLE public.project_stage_checklist DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_stage_checklist_auth_all ON public.project_stage_checklist;

-- permissions: allow super admins and legacy admin role variants to manage
DROP POLICY IF EXISTS permissions_modify_admin_only ON public.permissions;

CREATE POLICY permissions_modify_admin_only
  ON public.permissions
  FOR ALL
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = ANY (ARRAY[
          'admin', 'Admin', 'ict', 'ICT',
          'super_admin', 'Super Admin', 'superAdmin', 'SuperAdmin'
        ])
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = ANY (ARRAY[
          'admin', 'Admin', 'ict', 'ICT',
          'super_admin', 'Super Admin', 'superAdmin', 'SuperAdmin'
        ])
    )
  );
