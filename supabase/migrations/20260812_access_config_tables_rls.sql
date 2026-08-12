-- RLS policies for column_visibility_config, data_scope_config, and page_role_configs.
--
-- These tables were created without tracked migrations so their policies may be
-- missing or misconfigured.  This migration is fully idempotent (DROP IF EXISTS
-- before every CREATE).
--
-- Apply via Supabase Studio → SQL Editor (project ref: abznugnirnlrqnnfkein).
-- See RUNBOOK_access_config_tables_rls.md for step-by-step instructions.

-- ─── Helpers ──────────────────────────────────────────────────────────────────
-- Reuse workspace_check_super_admin if it already exists (from workspace RLS
-- migration); CREATE OR REPLACE is idempotent so safe either way.
CREATE OR REPLACE FUNCTION public.workspace_check_super_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND lower(role) IN ('super_admin','superadmin','super admin')
  );
$$;

-- Admin-or-above helper (super_admin + admin roles can manage role configs).
CREATE OR REPLACE FUNCTION public.access_config_check_admin_or_above()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND lower(role) IN (
        'super_admin','superadmin','super admin',
        'admin'
      )
  );
$$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- column_visibility_config
-- ═══════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.column_visibility_config ENABLE ROW LEVEL SECURITY;

-- SELECT: own user row OR rows matching own role OR super_admin sees all
DROP POLICY IF EXISTS "column_visibility_config_select" ON public.column_visibility_config;
CREATE POLICY "column_visibility_config_select"
  ON public.column_visibility_config
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR role = (SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1)
    OR public.workspace_check_super_admin()
  );

-- INSERT: super_admin only
DROP POLICY IF EXISTS "column_visibility_config_insert" ON public.column_visibility_config;
CREATE POLICY "column_visibility_config_insert"
  ON public.column_visibility_config
  FOR INSERT TO authenticated
  WITH CHECK (public.workspace_check_super_admin());

-- UPDATE: super_admin only
DROP POLICY IF EXISTS "column_visibility_config_update" ON public.column_visibility_config;
CREATE POLICY "column_visibility_config_update"
  ON public.column_visibility_config
  FOR UPDATE TO authenticated
  USING (public.workspace_check_super_admin())
  WITH CHECK (public.workspace_check_super_admin());

-- DELETE: super_admin only
DROP POLICY IF EXISTS "column_visibility_config_delete" ON public.column_visibility_config;
CREATE POLICY "column_visibility_config_delete"
  ON public.column_visibility_config
  FOR DELETE TO authenticated
  USING (public.workspace_check_super_admin());


-- ═══════════════════════════════════════════════════════════════════════════════
-- data_scope_config
-- ═══════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.data_scope_config ENABLE ROW LEVEL SECURITY;

-- SELECT: own user row OR rows matching own role OR super_admin sees all
DROP POLICY IF EXISTS "data_scope_config_select" ON public.data_scope_config;
CREATE POLICY "data_scope_config_select"
  ON public.data_scope_config
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR role = (SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1)
    OR public.workspace_check_super_admin()
  );

-- INSERT: super_admin only
DROP POLICY IF EXISTS "data_scope_config_insert" ON public.data_scope_config;
CREATE POLICY "data_scope_config_insert"
  ON public.data_scope_config
  FOR INSERT TO authenticated
  WITH CHECK (public.workspace_check_super_admin());

-- UPDATE: super_admin only
DROP POLICY IF EXISTS "data_scope_config_update" ON public.data_scope_config;
CREATE POLICY "data_scope_config_update"
  ON public.data_scope_config
  FOR UPDATE TO authenticated
  USING (public.workspace_check_super_admin())
  WITH CHECK (public.workspace_check_super_admin());

-- DELETE: super_admin only
DROP POLICY IF EXISTS "data_scope_config_delete" ON public.data_scope_config;
CREATE POLICY "data_scope_config_delete"
  ON public.data_scope_config
  FOR DELETE TO authenticated
  USING (public.workspace_check_super_admin());


-- ═══════════════════════════════════════════════════════════════════════════════
-- page_role_configs
-- Admins as well as super_admins can read and write role configs (they use the
-- By-Page view in the Access Manager to change which roles can see a page).
-- ═══════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.page_role_configs ENABLE ROW LEVEL SECURITY;

-- SELECT: admin or above
DROP POLICY IF EXISTS "page_role_configs_select" ON public.page_role_configs;
CREATE POLICY "page_role_configs_select"
  ON public.page_role_configs
  FOR SELECT TO authenticated
  USING (public.access_config_check_admin_or_above());

-- INSERT: admin or above
DROP POLICY IF EXISTS "page_role_configs_insert" ON public.page_role_configs;
CREATE POLICY "page_role_configs_insert"
  ON public.page_role_configs
  FOR INSERT TO authenticated
  WITH CHECK (public.access_config_check_admin_or_above());

-- UPDATE: admin or above
DROP POLICY IF EXISTS "page_role_configs_update" ON public.page_role_configs;
CREATE POLICY "page_role_configs_update"
  ON public.page_role_configs
  FOR UPDATE TO authenticated
  USING (public.access_config_check_admin_or_above())
  WITH CHECK (public.access_config_check_admin_or_above());

-- DELETE: super_admin only (destructive — removing a role config resets a page to its code default)
DROP POLICY IF EXISTS "page_role_configs_delete" ON public.page_role_configs;
CREATE POLICY "page_role_configs_delete"
  ON public.page_role_configs
  FOR DELETE TO authenticated
  USING (public.workspace_check_super_admin());
