-- ============================================================================
-- FIX ALL FUNCTION SEARCH PATH SECURITY ISSUES
-- ============================================================================
-- Run this entire script in Supabase SQL Editor
-- Skip any functions that error with "does not exist"
-- ============================================================================

-- Authorization functions
ALTER FUNCTION public.is_super_admin() SET search_path = public;
ALTER FUNCTION public.is_admin() SET search_path = public;
ALTER FUNCTION public.is_admin_or_super() SET search_path = public;
ALTER FUNCTION public.is_admin_user() SET search_path = public;
ALTER FUNCTION public.is_fom() SET search_path = public;
ALTER FUNCTION public.is_coordinator() SET search_path = public;
ALTER FUNCTION public.is_data_collector() SET search_path = public;
ALTER FUNCTION public.is_supervisor() SET search_path = public;
ALTER FUNCTION public.is_financial_admin() SET search_path = public;
ALTER FUNCTION public.has_role(TEXT) SET search_path = public;
ALTER FUNCTION public.get_user_hub_id() SET search_path = public;
ALTER FUNCTION public.can_access_hub(UUID) SET search_path = public;

-- Wallet functions
ALTER FUNCTION public.wallet_tx_after_change() SET search_path = public;
ALTER FUNCTION public.wallet_tx_ensure_wallet() SET search_path = public;
ALTER FUNCTION public.wallet_tx_set_posted_at() SET search_path = public;
ALTER FUNCTION public.create_wallet_for_user() SET search_path = public;

-- Classification & fee functions
ALTER FUNCTION public.get_classification_fee() SET search_path = public;
ALTER FUNCTION public.update_classification_timestamp() SET search_path = public;
ALTER FUNCTION public.update_classification_updated_at() SET search_path = public;
ALTER FUNCTION public.ensure_fee_on_assignment() SET search_path = public;

-- Site & MMP functions
ALTER FUNCTION public.set_site_location_user() SET search_path = public;
ALTER FUNCTION public.handle_mmp_site_entries_cost_acknowledged() SET search_path = public;
ALTER FUNCTION public.is_site_forwarded() SET search_path = public;
ALTER FUNCTION public.get_site_forwarded_details() SET search_path = public;
ALTER FUNCTION public.get_site_entry_with_users() SET search_path = public;

-- Trigger & update functions
ALTER FUNCTION public.set_roles_updated_at() SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
ALTER FUNCTION public.update_app_versions_updated_at() SET search_path = public;
ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.update_cost_submission_timestamp() SET search_path = public;

-- Cost & calculation functions
ALTER FUNCTION public.calculate_total_cost_submission() SET search_path = public;

-- Stats & query functions
ALTER FUNCTION public.get_feedback_stats() SET search_path = public;
ALTER FUNCTION public.get_roles_with_permissions() SET search_path = public;
ALTER FUNCTION public.get_active_super_admin_count() SET search_path = public;

-- Chat functions
ALTER FUNCTION public.chat_messages_broadcast_trigger() SET search_path = public;

-- ============================================================================
-- VERIFICATION: Count remaining functions without search_path
-- ============================================================================
SELECT COUNT(*) as remaining_issues
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.prokind = 'f'
AND (p.proconfig IS NULL OR NOT EXISTS (
  SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'
));
