-- ============================================================================
-- FIX FUNCTION SEARCH PATH SECURITY
-- ============================================================================
-- Issue: Functions without search_path set are vulnerable to search_path attacks
-- Solution: Recreate functions with SET search_path = '' or SET search_path = public
-- ============================================================================

-- First, let's see all functions with this issue
SELECT 
  p.proname as function_name,
  p.proconfig as config
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND (p.proconfig IS NULL OR NOT 'search_path=' = ANY(p.proconfig))
ORDER BY p.proname;

-- ============================================================================
-- FIX: Update functions to include search_path
-- Run each one separately
-- ============================================================================

-- Fix wallet_tx_after_change trigger function
ALTER FUNCTION public.wallet_tx_after_change() SET search_path = public;

-- Fix get_classification_fee function
ALTER FUNCTION public.get_classification_fee SET search_path = public;

-- Fix has_role function
ALTER FUNCTION public.has_role(TEXT) SET search_path = public;

-- Fix set_roles_updated_at function
ALTER FUNCTION public.set_roles_updated_at() SET search_path = public;

-- Fix chat_messages_broadcast_trigger function
ALTER FUNCTION public.chat_messages_broadcast_trigger() SET search_path = public;

-- ============================================================================
-- Additional common functions that may need fixing
-- ============================================================================

-- Try these - skip any that don't exist
ALTER FUNCTION public.is_super_admin() SET search_path = public;
ALTER FUNCTION public.is_admin() SET search_path = public;
ALTER FUNCTION public.is_admin_or_super() SET search_path = public;
ALTER FUNCTION public.is_fom() SET search_path = public;
ALTER FUNCTION public.is_coordinator() SET search_path = public;
ALTER FUNCTION public.is_data_collector() SET search_path = public;
ALTER FUNCTION public.is_supervisor() SET search_path = public;
ALTER FUNCTION public.is_financial_admin() SET search_path = public;
ALTER FUNCTION public.get_user_hub_id() SET search_path = public;
ALTER FUNCTION public.can_access_hub(UUID) SET search_path = public;

-- ============================================================================
-- VERIFICATION: Check functions now have search_path set
-- ============================================================================
SELECT 
  p.proname as function_name,
  p.proconfig as config
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
ORDER BY p.proname;
