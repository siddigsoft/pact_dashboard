-- Cleanup conflicting / overlapping workspace RLS policies found on live PACT DB.
--
-- Problem: multiple PERMISSIVE policies OR together. An open policy (USING true
-- or FOR ALL on own rows) silently wins over the scoped policies from
-- 20260812_workspace_access_grants_rls.sql and 20260814_workspace_delete_requests_admin_only.sql.
--
-- Also drops legacy policies that match role = 'SuperAdmin' exactly — live data
-- stores camelCase 'superAdmin'. workspace_check_super_admin() already handles
-- lower(role) variants and remains the source of truth.

-- ── workspace_access_grants ──────────────────────────────────────────────────
-- Open SELECT that leaked every grant row to all authenticated users:
DROP POLICY IF EXISTS "workspace_access_grants_read" ON public.workspace_access_grants;
-- Duplicate ALL policy with exact SuperAdmin string (never matches live role):
DROP POLICY IF EXISTS "workspace_access_grants_admin" ON public.workspace_access_grants;

-- Keep / reaffirm the scoped set from 20260812_workspace_access_grants_rls.sql
DROP POLICY IF EXISTS "workspace_access_grants_select" ON public.workspace_access_grants;
CREATE POLICY "workspace_access_grants_select"
  ON public.workspace_access_grants
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.workspace_check_super_admin());

DROP POLICY IF EXISTS "workspace_access_grants_insert" ON public.workspace_access_grants;
CREATE POLICY "workspace_access_grants_insert"
  ON public.workspace_access_grants
  FOR INSERT TO authenticated
  WITH CHECK (public.workspace_check_super_admin() AND granted_by = auth.uid());

DROP POLICY IF EXISTS "workspace_access_grants_update" ON public.workspace_access_grants;
CREATE POLICY "workspace_access_grants_update"
  ON public.workspace_access_grants
  FOR UPDATE TO authenticated
  USING (public.workspace_check_super_admin())
  WITH CHECK (public.workspace_check_super_admin());

DROP POLICY IF EXISTS "workspace_access_grants_delete" ON public.workspace_access_grants;
CREATE POLICY "workspace_access_grants_delete"
  ON public.workspace_access_grants
  FOR DELETE TO authenticated
  USING (public.workspace_check_super_admin());

-- ── workspace_access_requests ────────────────────────────────────────────────
-- FOR ALL on own rows let a requester UPDATE status (self-approve):
DROP POLICY IF EXISTS "workspace_access_requests_self" ON public.workspace_access_requests;
-- Duplicate ALL with exact SuperAdmin:
DROP POLICY IF EXISTS "workspace_access_requests_admin" ON public.workspace_access_requests;

DROP POLICY IF EXISTS "workspace_access_requests_select" ON public.workspace_access_requests;
CREATE POLICY "workspace_access_requests_select"
  ON public.workspace_access_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.workspace_check_super_admin());

DROP POLICY IF EXISTS "workspace_access_requests_insert" ON public.workspace_access_requests;
CREATE POLICY "workspace_access_requests_insert"
  ON public.workspace_access_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "workspace_access_requests_update" ON public.workspace_access_requests;
CREATE POLICY "workspace_access_requests_update"
  ON public.workspace_access_requests
  FOR UPDATE TO authenticated
  USING (public.workspace_check_super_admin())
  WITH CHECK (public.workspace_check_super_admin());

-- ── workspace_security_clearances ────────────────────────────────────────────
DROP POLICY IF EXISTS "Super admins manage clearances" ON public.workspace_security_clearances;
DROP POLICY IF EXISTS "Users read own clearance" ON public.workspace_security_clearances;
DROP POLICY IF EXISTS "Workspace admins read all clearances" ON public.workspace_security_clearances;

DROP POLICY IF EXISTS "workspace_security_clearances_select" ON public.workspace_security_clearances;
CREATE POLICY "workspace_security_clearances_select"
  ON public.workspace_security_clearances
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.workspace_check_super_admin());

DROP POLICY IF EXISTS "workspace_security_clearances_insert" ON public.workspace_security_clearances;
CREATE POLICY "workspace_security_clearances_insert"
  ON public.workspace_security_clearances
  FOR INSERT TO authenticated
  WITH CHECK (public.workspace_check_super_admin());

DROP POLICY IF EXISTS "workspace_security_clearances_update" ON public.workspace_security_clearances;
CREATE POLICY "workspace_security_clearances_update"
  ON public.workspace_security_clearances
  FOR UPDATE TO authenticated
  USING (public.workspace_check_super_admin())
  WITH CHECK (public.workspace_check_super_admin());

DROP POLICY IF EXISTS "workspace_security_clearances_delete" ON public.workspace_security_clearances;
CREATE POLICY "workspace_security_clearances_delete"
  ON public.workspace_security_clearances
  FOR DELETE TO authenticated
  USING (public.workspace_check_super_admin());
