-- Fix RLS policies on workspace_access_grants, workspace_access_requests,
-- and workspace_security_clearances.
--
-- These tables were created without tracked migrations, so policies may be
-- missing or misconfigured.  This migration is fully idempotent (DROP IF EXISTS
-- before every CREATE).
--
-- Apply via Supabase Studio → SQL Editor (or see RUNBOOK_workspace_access_rls.md).

-- ─── Helper: is the current JWT user a super_admin? ───────────────────────────
-- We use a SECURITY DEFINER function so the sub-select on profiles is not
-- itself subject to the profiles RLS policies.
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND lower(role) IN ('super_admin', 'superadmin', 'super admin')
  );
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- workspace_access_grants
-- ═══════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.workspace_access_grants ENABLE ROW LEVEL SECURITY;

-- SELECT: own row (for WorkspaceAccessGate) OR super_admin (for the manager UI)
DROP POLICY IF EXISTS "workspace_access_grants_select" ON public.workspace_access_grants;
CREATE POLICY "workspace_access_grants_select"
  ON public.workspace_access_grants
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_super_admin()
  );

-- INSERT: super_admin only; granted_by must equal the calling user
DROP POLICY IF EXISTS "workspace_access_grants_insert" ON public.workspace_access_grants;
CREATE POLICY "workspace_access_grants_insert"
  ON public.workspace_access_grants
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin()
    AND granted_by = auth.uid()
  );

-- UPDATE: super_admin only
DROP POLICY IF EXISTS "workspace_access_grants_update" ON public.workspace_access_grants;
CREATE POLICY "workspace_access_grants_update"
  ON public.workspace_access_grants
  FOR UPDATE
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- DELETE: super_admin only (hard deletes are rare; revoke via is_active=false)
DROP POLICY IF EXISTS "workspace_access_grants_delete" ON public.workspace_access_grants;
CREATE POLICY "workspace_access_grants_delete"
  ON public.workspace_access_grants
  FOR DELETE
  TO authenticated
  USING (public.is_super_admin());

-- ═══════════════════════════════════════════════════════════════════════════════
-- workspace_access_requests
-- ═══════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.workspace_access_requests ENABLE ROW LEVEL SECURITY;

-- SELECT: own row OR super_admin
DROP POLICY IF EXISTS "workspace_access_requests_select" ON public.workspace_access_requests;
CREATE POLICY "workspace_access_requests_select"
  ON public.workspace_access_requests
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_super_admin()
  );

-- INSERT: any authenticated user (to submit a request for themselves)
DROP POLICY IF EXISTS "workspace_access_requests_insert" ON public.workspace_access_requests;
CREATE POLICY "workspace_access_requests_insert"
  ON public.workspace_access_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- UPDATE: super_admin only (to approve/reject)
DROP POLICY IF EXISTS "workspace_access_requests_update" ON public.workspace_access_requests;
CREATE POLICY "workspace_access_requests_update"
  ON public.workspace_access_requests
  FOR UPDATE
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ═══════════════════════════════════════════════════════════════════════════════
-- workspace_security_clearances
-- ═══════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.workspace_security_clearances ENABLE ROW LEVEL SECURITY;

-- SELECT: own row OR super_admin
DROP POLICY IF EXISTS "workspace_security_clearances_select" ON public.workspace_security_clearances;
CREATE POLICY "workspace_security_clearances_select"
  ON public.workspace_security_clearances
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_super_admin()
  );

-- INSERT / UPDATE (upsert): super_admin only
DROP POLICY IF EXISTS "workspace_security_clearances_insert" ON public.workspace_security_clearances;
CREATE POLICY "workspace_security_clearances_insert"
  ON public.workspace_security_clearances
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "workspace_security_clearances_update" ON public.workspace_security_clearances;
CREATE POLICY "workspace_security_clearances_update"
  ON public.workspace_security_clearances
  FOR UPDATE
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "workspace_security_clearances_delete" ON public.workspace_security_clearances;
CREATE POLICY "workspace_security_clearances_delete"
  ON public.workspace_security_clearances
  FOR DELETE
  TO authenticated
  USING (public.is_super_admin());
