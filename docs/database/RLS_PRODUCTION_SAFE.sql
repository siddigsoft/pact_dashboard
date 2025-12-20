-- ============================================================================
-- PACT COMMAND CENTER - PRODUCTION-SAFE RLS IMPLEMENTATION
-- ============================================================================
-- This script safely handles tables that may not exist in all environments
-- Run sections one at a time and verify before proceeding
-- ============================================================================

-- ============================================================================
-- STEP 1: RUN THIS FIRST - Get your production table inventory
-- ============================================================================
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- ============================================================================
-- STEP 2: HELPER FUNCTIONS (Required - Run all of these first)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.super_admins 
    WHERE user_id = auth.uid() 
    AND is_active = true
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.has_role(role_name TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = role_name
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_admin_or_super()
RETURNS BOOLEAN AS $$
  SELECT public.is_super_admin() OR public.is_admin();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_fom()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'fom'
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'fom'
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_coordinator()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'coordinator'
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'coordinator'
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_data_collector()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'dataCollector'
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'dataCollector'
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_supervisor()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'supervisor'
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'supervisor'
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_financial_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'financialAdmin'
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'financialAdmin'
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_user_hub_id()
RETURNS UUID AS $$
  SELECT hub_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.can_access_hub(target_hub_id UUID)
RETURNS BOOLEAN AS $$
  SELECT public.is_admin_or_super() 
    OR public.get_user_hub_id() = target_hub_id;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;


-- ============================================================================
-- STEP 3: CORE TABLES (These should exist in all environments)
-- Run each section separately to identify any missing tables
-- ============================================================================

-- 3.1 profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (public.is_admin_or_super());
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
CREATE POLICY "Admins can manage all profiles" ON public.profiles
  FOR ALL USING (public.is_admin_or_super());

-- 3.2 user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins can manage user_roles" ON public.user_roles;
CREATE POLICY "Admins can manage user_roles" ON public.user_roles
  FOR ALL USING (public.is_admin_or_super());

-- 3.3 super_admins
ALTER TABLE public.super_admins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Super admins can view super_admins" ON public.super_admins;
CREATE POLICY "Super admins can view super_admins" ON public.super_admins
  FOR SELECT USING (public.is_super_admin());
DROP POLICY IF EXISTS "Super admins can manage super_admins" ON public.super_admins;
CREATE POLICY "Super admins can manage super_admins" ON public.super_admins
  FOR ALL USING (public.is_super_admin());

-- 3.4 hubs
ALTER TABLE public.hubs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read hubs" ON public.hubs;
CREATE POLICY "Anyone can read hubs" ON public.hubs
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins can manage hubs" ON public.hubs;
CREATE POLICY "Admins can manage hubs" ON public.hubs
  FOR ALL USING (public.is_admin_or_super());

-- 3.5 hub_states
ALTER TABLE public.hub_states ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read hub_states" ON public.hub_states;
CREATE POLICY "Anyone can read hub_states" ON public.hub_states
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins can manage hub_states" ON public.hub_states;
CREATE POLICY "Admins can manage hub_states" ON public.hub_states
  FOR ALL USING (public.is_admin_or_super());

-- 3.6 sites_registry
ALTER TABLE public.sites_registry ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read sites_registry" ON public.sites_registry;
CREATE POLICY "Anyone can read sites_registry" ON public.sites_registry
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins can manage sites_registry" ON public.sites_registry;
CREATE POLICY "Admins can manage sites_registry" ON public.sites_registry
  FOR ALL USING (public.is_admin_or_super());


-- ============================================================================
-- STEP 4: WORKFLOW TABLES
-- ============================================================================

-- 4.1 mmp_files
ALTER TABLE public.mmp_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own hub mmp_files" ON public.mmp_files;
CREATE POLICY "Users can view own hub mmp_files" ON public.mmp_files
  FOR SELECT USING (
    public.is_admin_or_super() 
    OR public.can_access_hub(hub_id)
    OR uploaded_by = auth.uid()
  );
DROP POLICY IF EXISTS "Users can insert mmp_files" ON public.mmp_files;
CREATE POLICY "Users can insert mmp_files" ON public.mmp_files
  FOR INSERT WITH CHECK (
    public.is_admin_or_super() 
    OR public.is_fom() 
    OR public.is_coordinator()
  );
DROP POLICY IF EXISTS "Admins can manage mmp_files" ON public.mmp_files;
CREATE POLICY "Admins can manage mmp_files" ON public.mmp_files
  FOR ALL USING (public.is_admin_or_super());

-- 4.2 mmp_site_entries
ALTER TABLE public.mmp_site_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view accessible site entries" ON public.mmp_site_entries;
CREATE POLICY "Users can view accessible site entries" ON public.mmp_site_entries
  FOR SELECT USING (
    public.is_admin_or_super()
    OR assigned_data_collector_id = auth.uid()
    OR assigned_coordinator_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.mmp_files mf 
      WHERE mf.id = mmp_file_id 
      AND public.can_access_hub(mf.hub_id)
    )
  );
DROP POLICY IF EXISTS "Assigned users can update site entries" ON public.mmp_site_entries;
CREATE POLICY "Assigned users can update site entries" ON public.mmp_site_entries
  FOR UPDATE USING (
    public.is_admin_or_super()
    OR assigned_data_collector_id = auth.uid()
    OR assigned_coordinator_id = auth.uid()
  );
DROP POLICY IF EXISTS "Admins can manage site entries" ON public.mmp_site_entries;
CREATE POLICY "Admins can manage site entries" ON public.mmp_site_entries
  FOR ALL USING (public.is_admin_or_super());

-- 4.3 site_visits
ALTER TABLE public.site_visits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view related site_visits" ON public.site_visits;
CREATE POLICY "Users can view related site_visits" ON public.site_visits
  FOR SELECT USING (
    public.is_admin_or_super()
    OR data_collector_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.mmp_site_entries mse 
      WHERE mse.id = site_entry_id 
      AND (mse.assigned_coordinator_id = auth.uid() OR public.can_access_hub(
        (SELECT hub_id FROM public.mmp_files WHERE id = mse.mmp_file_id)
      ))
    )
  );
DROP POLICY IF EXISTS "Data collectors can manage own visits" ON public.site_visits;
CREATE POLICY "Data collectors can manage own visits" ON public.site_visits
  FOR ALL USING (
    public.is_admin_or_super()
    OR data_collector_id = auth.uid()
  );


-- ============================================================================
-- STEP 5: FINANCE TABLES
-- ============================================================================

-- 5.1 wallets
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own wallet" ON public.wallets;
CREATE POLICY "Users can view own wallet" ON public.wallets
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Finance roles can view wallets" ON public.wallets;
CREATE POLICY "Finance roles can view wallets" ON public.wallets
  FOR SELECT USING (public.is_admin_or_super() OR public.is_financial_admin());
DROP POLICY IF EXISTS "Admins can manage wallets" ON public.wallets;
CREATE POLICY "Admins can manage wallets" ON public.wallets
  FOR ALL USING (public.is_admin_or_super() OR public.is_financial_admin());

-- 5.2 wallet_transactions
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own transactions" ON public.wallet_transactions;
CREATE POLICY "Users can view own transactions" ON public.wallet_transactions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.wallets w WHERE w.id = wallet_id AND w.user_id = auth.uid())
  );
DROP POLICY IF EXISTS "Finance roles can view all transactions" ON public.wallet_transactions;
CREATE POLICY "Finance roles can view all transactions" ON public.wallet_transactions
  FOR SELECT USING (public.is_admin_or_super() OR public.is_financial_admin());
DROP POLICY IF EXISTS "Finance roles can manage transactions" ON public.wallet_transactions;
CREATE POLICY "Finance roles can manage transactions" ON public.wallet_transactions
  FOR ALL USING (public.is_admin_or_super() OR public.is_financial_admin());

-- 5.3 withdrawal_requests
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own withdrawal_requests" ON public.withdrawal_requests;
CREATE POLICY "Users can view own withdrawal_requests" ON public.withdrawal_requests
  FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Users can create withdrawal_requests" ON public.withdrawal_requests;
CREATE POLICY "Users can create withdrawal_requests" ON public.withdrawal_requests
  FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Finance can manage withdrawal_requests" ON public.withdrawal_requests;
CREATE POLICY "Finance can manage withdrawal_requests" ON public.withdrawal_requests
  FOR ALL USING (public.is_admin_or_super() OR public.is_financial_admin());

-- 5.4 down_payment_requests
ALTER TABLE public.down_payment_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own down_payment_requests" ON public.down_payment_requests;
CREATE POLICY "Users can view own down_payment_requests" ON public.down_payment_requests
  FOR SELECT USING (requester_id = auth.uid());
DROP POLICY IF EXISTS "Users can create down_payment_requests" ON public.down_payment_requests;
CREATE POLICY "Users can create down_payment_requests" ON public.down_payment_requests
  FOR INSERT WITH CHECK (requester_id = auth.uid());
DROP POLICY IF EXISTS "Finance can manage down_payment_requests" ON public.down_payment_requests;
CREATE POLICY "Finance can manage down_payment_requests" ON public.down_payment_requests
  FOR ALL USING (public.is_admin_or_super() OR public.is_financial_admin());


-- ============================================================================
-- STEP 6: AUDIT & SETTINGS TABLES
-- ============================================================================

-- 6.1 audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can view audit_logs" ON public.audit_logs;
CREATE POLICY "Admins can view audit_logs" ON public.audit_logs
  FOR SELECT USING (public.is_admin_or_super());
DROP POLICY IF EXISTS "System can insert audit_logs" ON public.audit_logs;
CREATE POLICY "System can insert audit_logs" ON public.audit_logs
  FOR INSERT WITH CHECK (true);

-- 6.2 deletion_audit_log
ALTER TABLE public.deletion_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can view deletion_audit_log" ON public.deletion_audit_log;
CREATE POLICY "Admins can view deletion_audit_log" ON public.deletion_audit_log
  FOR SELECT USING (public.is_admin_or_super());
DROP POLICY IF EXISTS "System can insert deletion_audit_log" ON public.deletion_audit_log;
CREATE POLICY "System can insert deletion_audit_log" ON public.deletion_audit_log
  FOR INSERT WITH CHECK (true);

-- 6.3 notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid());
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;
CREATE POLICY "System can create notifications" ON public.notifications
  FOR INSERT WITH CHECK (true);

-- 6.4 user_settings
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own settings" ON public.user_settings;
CREATE POLICY "Users can manage own settings" ON public.user_settings
  FOR ALL USING (user_id = auth.uid());

-- 6.5 dashboard_settings
ALTER TABLE public.dashboard_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own dashboard_settings" ON public.dashboard_settings;
CREATE POLICY "Users can manage own dashboard_settings" ON public.dashboard_settings
  FOR ALL USING (user_id = auth.uid());

-- 6.6 data_visibility_settings
ALTER TABLE public.data_visibility_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage data_visibility_settings" ON public.data_visibility_settings;
CREATE POLICY "Admins can manage data_visibility_settings" ON public.data_visibility_settings
  FOR ALL USING (public.is_admin_or_super());
DROP POLICY IF EXISTS "Users can view data_visibility_settings" ON public.data_visibility_settings;
CREATE POLICY "Users can view data_visibility_settings" ON public.data_visibility_settings
  FOR SELECT USING (auth.uid() IS NOT NULL);


-- ============================================================================
-- STEP 7: COST & PROJECT TABLES
-- ============================================================================

-- 7.1 site_visit_costs
ALTER TABLE public.site_visit_costs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view related costs" ON public.site_visit_costs;
CREATE POLICY "Users can view related costs" ON public.site_visit_costs
  FOR SELECT USING (
    public.is_admin_or_super() 
    OR public.is_financial_admin()
    OR EXISTS (
      SELECT 1 FROM public.site_visits sv 
      WHERE sv.id = site_visit_id AND sv.data_collector_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "Finance can manage costs" ON public.site_visit_costs;
CREATE POLICY "Finance can manage costs" ON public.site_visit_costs
  FOR ALL USING (public.is_admin_or_super() OR public.is_financial_admin());

-- 7.2 site_visit_cost_submissions
ALTER TABLE public.site_visit_cost_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own cost_submissions" ON public.site_visit_cost_submissions;
CREATE POLICY "Users can view own cost_submissions" ON public.site_visit_cost_submissions
  FOR SELECT USING (submitted_by = auth.uid() OR public.is_admin_or_super() OR public.is_financial_admin());
DROP POLICY IF EXISTS "Users can create cost_submissions" ON public.site_visit_cost_submissions;
CREATE POLICY "Users can create cost_submissions" ON public.site_visit_cost_submissions
  FOR INSERT WITH CHECK (submitted_by = auth.uid());
DROP POLICY IF EXISTS "Finance can manage cost_submissions" ON public.site_visit_cost_submissions;
CREATE POLICY "Finance can manage cost_submissions" ON public.site_visit_cost_submissions
  FOR ALL USING (public.is_admin_or_super() OR public.is_financial_admin());

-- 7.3 cost_approval_history
ALTER TABLE public.cost_approval_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Finance can view cost_approval_history" ON public.cost_approval_history;
CREATE POLICY "Finance can view cost_approval_history" ON public.cost_approval_history
  FOR SELECT USING (public.is_admin_or_super() OR public.is_financial_admin());
DROP POLICY IF EXISTS "Finance can manage cost_approval_history" ON public.cost_approval_history;
CREATE POLICY "Finance can manage cost_approval_history" ON public.cost_approval_history
  FOR ALL USING (public.is_admin_or_super() OR public.is_financial_admin());

-- 7.4 cost_adjustment_audit
ALTER TABLE public.cost_adjustment_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Finance can view cost_adjustment_audit" ON public.cost_adjustment_audit;
CREATE POLICY "Finance can view cost_adjustment_audit" ON public.cost_adjustment_audit
  FOR SELECT USING (public.is_admin_or_super() OR public.is_financial_admin());
DROP POLICY IF EXISTS "System can insert cost_adjustment_audit" ON public.cost_adjustment_audit;
CREATE POLICY "System can insert cost_adjustment_audit" ON public.cost_adjustment_audit
  FOR INSERT WITH CHECK (true);

-- 7.5 projects
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read projects" ON public.projects;
CREATE POLICY "Anyone can read projects" ON public.projects
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins can manage projects" ON public.projects;
CREATE POLICY "Admins can manage projects" ON public.projects
  FOR ALL USING (public.is_admin_or_super());

-- 7.6 project_scopes
ALTER TABLE public.project_scopes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read project_scopes" ON public.project_scopes;
CREATE POLICY "Anyone can read project_scopes" ON public.project_scopes
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins can manage project_scopes" ON public.project_scopes;
CREATE POLICY "Admins can manage project_scopes" ON public.project_scopes
  FOR ALL USING (public.is_admin_or_super());


-- ============================================================================
-- STEP 8: REMAINING TABLES (May not exist in all environments)
-- ============================================================================

-- 8.1 password_reset_tokens (usually has policies already)
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- 8.2 user_classifications (usually has policies already)
ALTER TABLE public.user_classifications ENABLE ROW LEVEL SECURITY;

-- 8.3 classification_fee_structures (usually has policies already)
ALTER TABLE public.classification_fee_structures ENABLE ROW LEVEL SECURITY;

-- 8.4 user_screen_permissions
ALTER TABLE public.user_screen_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own permissions" ON public.user_screen_permissions;
CREATE POLICY "Users can view own permissions" ON public.user_screen_permissions
  FOR SELECT USING (user_id = auth.uid() OR public.is_admin_or_super());
DROP POLICY IF EXISTS "Admins can manage permissions" ON public.user_screen_permissions;
CREATE POLICY "Admins can manage permissions" ON public.user_screen_permissions
  FOR ALL USING (public.is_admin_or_super());


-- ============================================================================
-- STEP 9: VERIFICATION - Run after all policies are applied
-- ============================================================================

-- Check which tables have RLS enabled
SELECT 
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' 
AND c.relkind = 'r'
AND c.relrowsecurity = true
ORDER BY c.relname;

-- Count policies per table
SELECT tablename, COUNT(*) as policy_count
FROM pg_policies 
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;
