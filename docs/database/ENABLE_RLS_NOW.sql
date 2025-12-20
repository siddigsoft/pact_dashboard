-- ============================================================================
-- URGENT: ENABLE RLS ON ALL TABLES
-- ============================================================================
-- Your policies exist but RLS is NOT enabled, so they're not enforced!
-- Run this script to activate RLS protection.
-- 
-- NOTE: Skip spatial_ref_sys (PostGIS system table)
-- ============================================================================

-- PRIORITY 1: CRITICAL SECURITY (Finance & Admin)
ALTER TABLE public.super_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.down_payment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;

-- PRIORITY 2: USER DATA
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.handwriting_signatures ENABLE ROW LEVEL SECURITY;

-- PRIORITY 3: WORKFLOW DATA
ALTER TABLE public.mmp_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mmp_site_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mmp_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_visit_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_visit_cost_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visit_rejections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_locations ENABLE ROW LEVEL SECURITY;

-- PRIORITY 4: PROJECTS & BUDGETS
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_budget_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sub_activities ENABLE ROW LEVEL SECURITY;

-- PRIORITY 5: AUDIT & LOGS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deletion_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_approval_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_adjustment_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_logs ENABLE ROW LEVEL SECURITY;

-- PRIORITY 6: NOTIFICATIONS & SETTINGS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_visibility_settings ENABLE ROW LEVEL SECURITY;

-- PRIORITY 7: REFERENCE DATA
ALTER TABLE public.hubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hub_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classification_fee_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

-- PRIORITY 8: COMMUNICATION
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_message_reads ENABLE ROW LEVEL SECURITY;

-- PRIORITY 9: REPORTS & FEEDBACK
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comprehensive_monitoring_checklists ENABLE ROW LEVEL SECURITY;

-- PRIORITY 10: OTHER TABLES
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_versions ENABLE ROW LEVEL SECURITY;

-- SKIP: spatial_ref_sys (PostGIS system table - do not enable RLS)

-- ============================================================================
-- VERIFICATION: Check which tables now have RLS enabled
-- ============================================================================
SELECT 
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  (SELECT COUNT(*) FROM pg_policies p WHERE p.tablename = c.relname) as policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' 
AND c.relkind = 'r'
ORDER BY c.relrowsecurity, c.relname;
