-- ============================================================================
-- PACT COMMAND CENTER - ROW LEVEL SECURITY (RLS) IMPLEMENTATION GUIDE
-- ============================================================================
-- Generated: December 2024
-- Purpose: Enable RLS table-by-table with appropriate policies
-- ============================================================================

-- ============================================================================
-- PART 1: INVENTORY QUERIES (Run these to audit current state)
-- ============================================================================

-- 1.1 List all public tables
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- 1.2 List current RLS policies
SELECT 
  tablename, 
  policyname, 
  cmd as operation,
  permissive,
  roles,
  qual as using_expression,
  with_check as check_expression
FROM pg_policies 
WHERE schemaname = 'public' 
ORDER BY tablename, policyname;

-- 1.3 Check RLS status per table
SELECT 
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' 
AND c.relkind = 'r'
ORDER BY c.relname;


-- ============================================================================
-- PART 2: AUTHORIZATION HELPER FUNCTIONS
-- ============================================================================

-- 2.1 Check if current user is an active Super Admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.super_admins 
    WHERE user_id = auth.uid() 
    AND is_active = true
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- 2.2 Check if current user has a specific role (from user_roles table)
CREATE OR REPLACE FUNCTION public.has_role(role_name TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = role_name
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- 2.3 Check if current user is Admin (from profiles or user_roles)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- 2.4 Check if current user is Admin or Super Admin
CREATE OR REPLACE FUNCTION public.is_admin_or_super()
RETURNS BOOLEAN AS $$
  SELECT public.is_super_admin() OR public.is_admin();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- 2.5 Check if current user is FOM
CREATE OR REPLACE FUNCTION public.is_fom()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'fom'
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'fom'
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- 2.6 Check if current user is Coordinator
CREATE OR REPLACE FUNCTION public.is_coordinator()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'coordinator'
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'coordinator'
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- 2.7 Check if current user is Data Collector
CREATE OR REPLACE FUNCTION public.is_data_collector()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'dataCollector'
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'dataCollector'
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- 2.8 Check if current user is Supervisor
CREATE OR REPLACE FUNCTION public.is_supervisor()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'supervisor'
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'supervisor'
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- 2.9 Check if current user is Financial Admin
CREATE OR REPLACE FUNCTION public.is_financial_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'financialAdmin'
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'financialAdmin'
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- 2.10 Get current user's hub_id for scope filtering
CREATE OR REPLACE FUNCTION public.get_user_hub_id()
RETURNS TEXT AS $$
  SELECT hub_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- 2.11 Check if user can access a specific hub
CREATE OR REPLACE FUNCTION public.can_access_hub(target_hub_id TEXT)
RETURNS BOOLEAN AS $$
  SELECT 
    public.is_admin_or_super() 
    OR public.get_user_hub_id() = target_hub_id
    OR target_hub_id IS NULL;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;


-- ============================================================================
-- PART 3: TABLE CLASSIFICATION
-- ============================================================================
/*
CATEGORY A: REFERENCE/LOOKUP TABLES (No RLS - Use GRANTs only)
  - classification_fee_structures (already has public read)
  - user_classifications (already has public read)
  - hubs
  - hub_states
  - sites_registry
  - tracker_plan_configs

CATEGORY B: USER DATA TABLES (RLS Required - User Scoped)
  - profiles
  - user_roles
  - user_settings
  - user_screen_permissions
  - super_admins
  - password_reset_tokens (already has service role policy)

CATEGORY C: WORKFLOW TABLES (RLS Required - Hub/Project Scoped)
  - mmp_files
  - mmp_site_entries
  - site_visits
  - projects
  - project_scopes

CATEGORY D: FINANCE TABLES (RLS Required - Strict Access)
  - wallets
  - wallet_transactions
  - withdrawal_requests
  - down_payment_requests
  - site_visit_costs
  - site_visit_cost_submissions
  - cost_adjustment_audit
  - cost_approval_history

CATEGORY E: AUDIT/SYSTEM TABLES (RLS Required - Admin Only)
  - audit_logs
  - deletion_audit_log
  - notifications
  - dashboard_settings
  - data_visibility_settings
*/


-- ============================================================================
-- PART 4: RLS POLICIES - CATEGORY A (Reference Tables)
-- ============================================================================

-- 4.1 hubs - Public read, Admin write
ALTER TABLE public.hubs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read hubs" ON public.hubs;
CREATE POLICY "Anyone can read hubs" ON public.hubs
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage hubs" ON public.hubs;
CREATE POLICY "Admins can manage hubs" ON public.hubs
  FOR ALL USING (public.is_admin_or_super());

-- 4.2 hub_states - Public read, Admin write
ALTER TABLE public.hub_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read hub_states" ON public.hub_states;
CREATE POLICY "Anyone can read hub_states" ON public.hub_states
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage hub_states" ON public.hub_states;
CREATE POLICY "Admins can manage hub_states" ON public.hub_states
  FOR ALL USING (public.is_admin_or_super());

-- 4.3 sites_registry - Public read, Admin write
ALTER TABLE public.sites_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read sites_registry" ON public.sites_registry;
CREATE POLICY "Anyone can read sites_registry" ON public.sites_registry
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage sites_registry" ON public.sites_registry;
CREATE POLICY "Admins can manage sites_registry" ON public.sites_registry
  FOR ALL USING (public.is_admin_or_super());

-- 4.4 tracker_plan_configs - Public read, Admin write
-- NOTE: Skip this section if table doesn't exist in your database
-- Check first: SELECT COUNT(*) FROM tracker_plan_configs;
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tracker_plan_configs') THEN
    ALTER TABLE public.tracker_plan_configs ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

DROP POLICY IF EXISTS "Anyone can read tracker_plan_configs" ON public.tracker_plan_configs;
DROP POLICY IF EXISTS "Admins can manage tracker_plan_configs" ON public.tracker_plan_configs;

-- Only run these if table exists:
-- CREATE POLICY "Anyone can read tracker_plan_configs" ON public.tracker_plan_configs
--   FOR SELECT USING (true);
-- CREATE POLICY "Admins can manage tracker_plan_configs" ON public.tracker_plan_configs
--   FOR ALL USING (public.is_admin_or_super());


-- ============================================================================
-- PART 5: RLS POLICIES - CATEGORY B (User Data Tables)
-- ============================================================================

-- 5.1 profiles - Users see own, Admin/Super see all
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (
    id = auth.uid() 
    OR public.is_admin_or_super()
    OR public.is_fom()
    OR public.is_supervisor()
  );

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (
    id = auth.uid() 
    OR public.is_admin_or_super()
  );

DROP POLICY IF EXISTS "Admins can insert profiles" ON public.profiles;
CREATE POLICY "Admins can insert profiles" ON public.profiles
  FOR INSERT WITH CHECK (public.is_admin_or_super() OR id = auth.uid());

-- 5.2 user_roles - Users see own, Admin manage all
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT USING (
    user_id = auth.uid() 
    OR public.is_admin_or_super()
  );

DROP POLICY IF EXISTS "Admins can manage user_roles" ON public.user_roles;
CREATE POLICY "Admins can manage user_roles" ON public.user_roles
  FOR ALL USING (public.is_admin_or_super());

-- 5.3 user_settings - Users manage own only
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own settings" ON public.user_settings;
CREATE POLICY "Users can manage own settings" ON public.user_settings
  FOR ALL USING (user_id = auth.uid());

-- 5.4 user_screen_permissions - Users see own, Admin manage
ALTER TABLE public.user_screen_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own permissions" ON public.user_screen_permissions;
CREATE POLICY "Users can view own permissions" ON public.user_screen_permissions
  FOR SELECT USING (
    user_id = auth.uid() 
    OR public.is_admin_or_super()
  );

DROP POLICY IF EXISTS "Admins can manage permissions" ON public.user_screen_permissions;
CREATE POLICY "Admins can manage permissions" ON public.user_screen_permissions
  FOR ALL USING (public.is_admin_or_super());

-- 5.5 super_admins - Super Admin only
ALTER TABLE public.super_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins can view super_admins" ON public.super_admins;
CREATE POLICY "Super admins can view super_admins" ON public.super_admins
  FOR SELECT USING (public.is_super_admin() OR user_id = auth.uid());

DROP POLICY IF EXISTS "Super admins can manage super_admins" ON public.super_admins;
CREATE POLICY "Super admins can manage super_admins" ON public.super_admins
  FOR ALL USING (public.is_super_admin());


-- ============================================================================
-- PART 6: RLS POLICIES - CATEGORY C (Workflow Tables)
-- ============================================================================

-- 6.1 projects - Based on role and hub scope
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view projects" ON public.projects;
CREATE POLICY "Users can view projects" ON public.projects
  FOR SELECT USING (
    public.is_admin_or_super()
    OR public.is_fom()
    OR public.can_access_hub(hub_id)
  );

DROP POLICY IF EXISTS "Admins can manage projects" ON public.projects;
CREATE POLICY "Admins can manage projects" ON public.projects
  FOR ALL USING (public.is_admin_or_super());

-- 6.2 project_scopes - Read for authenticated, Admin manage
ALTER TABLE public.project_scopes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view project_scopes" ON public.project_scopes;
CREATE POLICY "Authenticated users can view project_scopes" ON public.project_scopes
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins can manage project_scopes" ON public.project_scopes;
CREATE POLICY "Admins can manage project_scopes" ON public.project_scopes
  FOR ALL USING (public.is_admin_or_super());

-- 6.3 mmp_files - Hub/Project scoped access
ALTER TABLE public.mmp_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view mmp_files by hub" ON public.mmp_files;
CREATE POLICY "Users can view mmp_files by hub" ON public.mmp_files
  FOR SELECT USING (
    public.is_admin_or_super()
    OR public.is_fom()
    OR public.can_access_hub(hub_office)
    OR uploaded_by = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can insert mmp_files" ON public.mmp_files;
CREATE POLICY "Users can insert mmp_files" ON public.mmp_files
  FOR INSERT WITH CHECK (
    public.is_admin_or_super()
    OR public.is_fom()
    OR public.is_coordinator()
  );

DROP POLICY IF EXISTS "Users can update mmp_files" ON public.mmp_files;
CREATE POLICY "Users can update mmp_files" ON public.mmp_files
  FOR UPDATE USING (
    public.is_admin_or_super()
    OR public.is_fom()
    OR uploaded_by = auth.uid()::text
  );

DROP POLICY IF EXISTS "Admins can delete mmp_files" ON public.mmp_files;
CREATE POLICY "Admins can delete mmp_files" ON public.mmp_files
  FOR DELETE USING (public.is_admin_or_super());

-- 6.4 mmp_site_entries - Hub scoped with assignment filtering
ALTER TABLE public.mmp_site_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view mmp_site_entries" ON public.mmp_site_entries;
CREATE POLICY "Users can view mmp_site_entries" ON public.mmp_site_entries
  FOR SELECT USING (
    public.is_admin_or_super()
    OR public.is_fom()
    OR public.is_supervisor()
    OR public.is_coordinator()
    OR public.can_access_hub(hub_office)
    OR assigned_to = auth.uid()::text
    OR created_by = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can insert mmp_site_entries" ON public.mmp_site_entries;
CREATE POLICY "Users can insert mmp_site_entries" ON public.mmp_site_entries
  FOR INSERT WITH CHECK (
    public.is_admin_or_super()
    OR public.is_fom()
    OR public.is_coordinator()
  );

DROP POLICY IF EXISTS "Users can update mmp_site_entries" ON public.mmp_site_entries;
CREATE POLICY "Users can update mmp_site_entries" ON public.mmp_site_entries
  FOR UPDATE USING (
    public.is_admin_or_super()
    OR public.is_fom()
    OR public.is_supervisor()
    OR public.is_coordinator()
    OR assigned_to = auth.uid()::text
  );

DROP POLICY IF EXISTS "Admins can delete mmp_site_entries" ON public.mmp_site_entries;
CREATE POLICY "Admins can delete mmp_site_entries" ON public.mmp_site_entries
  FOR DELETE USING (public.is_admin_or_super());

-- 6.5 site_visits - Assignment based access
ALTER TABLE public.site_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view site_visits" ON public.site_visits;
CREATE POLICY "Users can view site_visits" ON public.site_visits
  FOR SELECT USING (
    public.is_admin_or_super()
    OR public.is_fom()
    OR public.is_supervisor()
    OR assigned_to = auth.uid()
    OR created_by = auth.uid()
  );

DROP POLICY IF EXISTS "Users can insert site_visits" ON public.site_visits;
CREATE POLICY "Users can insert site_visits" ON public.site_visits
  FOR INSERT WITH CHECK (
    public.is_admin_or_super()
    OR public.is_fom()
    OR public.is_coordinator()
    OR public.is_data_collector()
  );

DROP POLICY IF EXISTS "Users can update site_visits" ON public.site_visits;
CREATE POLICY "Users can update site_visits" ON public.site_visits
  FOR UPDATE USING (
    public.is_admin_or_super()
    OR public.is_fom()
    OR public.is_supervisor()
    OR assigned_to = auth.uid()
  );


-- ============================================================================
-- PART 7: RLS POLICIES - CATEGORY D (Finance Tables)
-- ============================================================================

-- 7.1 wallets - Owner sees own, Finance roles see by scope
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own wallet" ON public.wallets;
CREATE POLICY "Users can view own wallet" ON public.wallets
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_admin_or_super()
    OR public.is_financial_admin()
    OR public.is_fom()
  );

DROP POLICY IF EXISTS "Finance can manage wallets" ON public.wallets;
CREATE POLICY "Finance can manage wallets" ON public.wallets
  FOR ALL USING (
    public.is_admin_or_super()
    OR public.is_financial_admin()
  );

-- 7.2 wallet_transactions - Owner sees own, Finance sees all
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own transactions" ON public.wallet_transactions;
CREATE POLICY "Users can view own transactions" ON public.wallet_transactions
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_admin_or_super()
    OR public.is_financial_admin()
  );

DROP POLICY IF EXISTS "System can insert transactions" ON public.wallet_transactions;
CREATE POLICY "System can insert transactions" ON public.wallet_transactions
  FOR INSERT WITH CHECK (
    public.is_admin_or_super()
    OR public.is_financial_admin()
    OR public.is_supervisor()
    OR user_id = auth.uid()
  );

-- 7.3 withdrawal_requests - Owner sees own, Finance manages
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own withdrawals" ON public.withdrawal_requests;
CREATE POLICY "Users can view own withdrawals" ON public.withdrawal_requests
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_admin_or_super()
    OR public.is_financial_admin()
    OR public.is_supervisor()
  );

DROP POLICY IF EXISTS "Users can request withdrawals" ON public.withdrawal_requests;
CREATE POLICY "Users can request withdrawals" ON public.withdrawal_requests
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Finance can manage withdrawals" ON public.withdrawal_requests;
CREATE POLICY "Finance can manage withdrawals" ON public.withdrawal_requests
  FOR UPDATE USING (
    public.is_admin_or_super()
    OR public.is_financial_admin()
    OR public.is_supervisor()
  );

-- 7.4 down_payment_requests - Creator sees own, Approvers see by role
ALTER TABLE public.down_payment_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view down_payment_requests" ON public.down_payment_requests;
CREATE POLICY "Users can view down_payment_requests" ON public.down_payment_requests
  FOR SELECT USING (
    requested_by = auth.uid()
    OR public.is_admin_or_super()
    OR public.is_financial_admin()
    OR public.is_supervisor()
    OR public.is_fom()
  );

DROP POLICY IF EXISTS "Users can request down_payments" ON public.down_payment_requests;
CREATE POLICY "Users can request down_payments" ON public.down_payment_requests
  FOR INSERT WITH CHECK (
    public.is_data_collector()
    OR public.is_coordinator()
    OR public.is_fom()
  );

DROP POLICY IF EXISTS "Approvers can update down_payments" ON public.down_payment_requests;
CREATE POLICY "Approvers can update down_payments" ON public.down_payment_requests
  FOR UPDATE USING (
    public.is_admin_or_super()
    OR public.is_financial_admin()
    OR public.is_supervisor()
  );

-- 7.5 site_visit_costs - Hub scoped access
ALTER TABLE public.site_visit_costs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view site_visit_costs" ON public.site_visit_costs;
CREATE POLICY "Users can view site_visit_costs" ON public.site_visit_costs
  FOR SELECT USING (
    public.is_admin_or_super()
    OR public.is_financial_admin()
    OR public.is_fom()
    OR public.is_supervisor()
  );

DROP POLICY IF EXISTS "Finance can manage site_visit_costs" ON public.site_visit_costs;
CREATE POLICY "Finance can manage site_visit_costs" ON public.site_visit_costs
  FOR ALL USING (
    public.is_admin_or_super()
    OR public.is_financial_admin()
  );

-- 7.6 site_visit_cost_submissions - Creator sees own, Finance approves
ALTER TABLE public.site_visit_cost_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view cost_submissions" ON public.site_visit_cost_submissions;
CREATE POLICY "Users can view cost_submissions" ON public.site_visit_cost_submissions
  FOR SELECT USING (
    submitted_by = auth.uid()
    OR public.is_admin_or_super()
    OR public.is_financial_admin()
    OR public.is_supervisor()
    OR public.is_fom()
  );

DROP POLICY IF EXISTS "Users can submit costs" ON public.site_visit_cost_submissions;
CREATE POLICY "Users can submit costs" ON public.site_visit_cost_submissions
  FOR INSERT WITH CHECK (submitted_by = auth.uid());

DROP POLICY IF EXISTS "Finance can manage cost_submissions" ON public.site_visit_cost_submissions;
CREATE POLICY "Finance can manage cost_submissions" ON public.site_visit_cost_submissions
  FOR UPDATE USING (
    public.is_admin_or_super()
    OR public.is_financial_admin()
    OR public.is_supervisor()
  );

-- 7.7 cost_adjustment_audit - Admin only
ALTER TABLE public.cost_adjustment_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view cost_adjustment_audit" ON public.cost_adjustment_audit;
CREATE POLICY "Admins can view cost_adjustment_audit" ON public.cost_adjustment_audit
  FOR SELECT USING (public.is_admin_or_super() OR public.is_financial_admin());

DROP POLICY IF EXISTS "System can insert cost_adjustment_audit" ON public.cost_adjustment_audit;
CREATE POLICY "System can insert cost_adjustment_audit" ON public.cost_adjustment_audit
  FOR INSERT WITH CHECK (public.is_admin_or_super() OR public.is_financial_admin());

-- 7.8 cost_approval_history - Finance and Supervisors
ALTER TABLE public.cost_approval_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view cost_approval_history" ON public.cost_approval_history;
CREATE POLICY "Users can view cost_approval_history" ON public.cost_approval_history
  FOR SELECT USING (
    public.is_admin_or_super()
    OR public.is_financial_admin()
    OR public.is_supervisor()
    OR public.is_fom()
  );

DROP POLICY IF EXISTS "Approvers can insert cost_approval_history" ON public.cost_approval_history;
CREATE POLICY "Approvers can insert cost_approval_history" ON public.cost_approval_history
  FOR INSERT WITH CHECK (
    public.is_admin_or_super()
    OR public.is_financial_admin()
    OR public.is_supervisor()
  );


-- ============================================================================
-- PART 8: RLS POLICIES - CATEGORY E (Audit/System Tables)
-- ============================================================================

-- 8.1 audit_logs - Admin only read, system insert
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view audit_logs" ON public.audit_logs;
CREATE POLICY "Admins can view audit_logs" ON public.audit_logs
  FOR SELECT USING (public.is_admin_or_super());

DROP POLICY IF EXISTS "System can insert audit_logs" ON public.audit_logs;
CREATE POLICY "System can insert audit_logs" ON public.audit_logs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 8.2 deletion_audit_log - Super Admin only
ALTER TABLE public.deletion_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins can view deletion_audit_log" ON public.deletion_audit_log;
CREATE POLICY "Super admins can view deletion_audit_log" ON public.deletion_audit_log
  FOR SELECT USING (public.is_super_admin());

DROP POLICY IF EXISTS "System can insert deletion_audit_log" ON public.deletion_audit_log;
CREATE POLICY "System can insert deletion_audit_log" ON public.deletion_audit_log
  FOR INSERT WITH CHECK (public.is_admin_or_super());

-- 8.3 notifications - User sees own
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT USING (
    user_id = auth.uid()
    OR recipient_id = auth.uid()::text
    OR public.is_admin_or_super()
  );

DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
CREATE POLICY "System can insert notifications" ON public.notifications
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE USING (
    user_id = auth.uid()
    OR recipient_id = auth.uid()::text
  );

-- 8.4 dashboard_settings - Users manage own
ALTER TABLE public.dashboard_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own dashboard_settings" ON public.dashboard_settings;
CREATE POLICY "Users can manage own dashboard_settings" ON public.dashboard_settings
  FOR ALL USING (user_id = auth.uid());

-- 8.5 data_visibility_settings - Admin manages
ALTER TABLE public.data_visibility_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage data_visibility_settings" ON public.data_visibility_settings;
CREATE POLICY "Admins can manage data_visibility_settings" ON public.data_visibility_settings
  FOR ALL USING (public.is_admin_or_super());

DROP POLICY IF EXISTS "Users can view data_visibility_settings" ON public.data_visibility_settings;
CREATE POLICY "Users can view data_visibility_settings" ON public.data_visibility_settings
  FOR SELECT USING (auth.uid() IS NOT NULL);


-- ============================================================================
-- PART 9: VERIFICATION QUERIES
-- ============================================================================

-- 9.1 Verify all RLS is enabled
SELECT 
  c.relname as table_name,
  CASE WHEN c.relrowsecurity THEN 'ENABLED' ELSE 'DISABLED' END as rls_status,
  CASE WHEN c.relforcerowsecurity THEN 'FORCED' ELSE 'NOT FORCED' END as force_status
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' 
AND c.relkind = 'r'
ORDER BY c.relrowsecurity DESC, c.relname;

-- 9.2 Count policies per table
SELECT 
  tablename,
  COUNT(*) as policy_count
FROM pg_policies 
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY policy_count DESC;

-- 9.3 List all policies with details
SELECT 
  tablename,
  policyname,
  cmd as operation,
  permissive
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, cmd;


-- ============================================================================
-- PART 10: OPTIONAL - FORCE RLS (Run after testing)
-- ============================================================================
-- Uncomment and run after verifying policies work correctly:

-- ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
-- ALTER TABLE public.user_roles FORCE ROW LEVEL SECURITY;
-- ALTER TABLE public.mmp_files FORCE ROW LEVEL SECURITY;
-- ALTER TABLE public.mmp_site_entries FORCE ROW LEVEL SECURITY;
-- ALTER TABLE public.site_visits FORCE ROW LEVEL SECURITY;
-- ALTER TABLE public.wallets FORCE ROW LEVEL SECURITY;
-- ALTER TABLE public.wallet_transactions FORCE ROW LEVEL SECURITY;
-- ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;


-- ============================================================================
-- END OF RLS IMPLEMENTATION GUIDE
-- ============================================================================
