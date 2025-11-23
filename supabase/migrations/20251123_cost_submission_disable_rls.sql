-- =========================================
-- DISABLE RLS FOR COST SUBMISSION TABLES (DEVELOPMENT ONLY)
-- =========================================
-- WARNING: This is for development only. In production, implement proper RLS policies.
-- Created: 2025-11-23

-- Disable RLS on cost submission tables
ALTER TABLE public.site_visit_cost_submissions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_approval_history DISABLE ROW LEVEL SECURITY;

-- Grant full permissions to authenticated users (development)
GRANT ALL ON public.site_visit_cost_submissions TO anon, authenticated, service_role;
GRANT ALL ON public.cost_approval_history TO anon, authenticated, service_role;

-- Grant usage on sequences if any
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- Refresh permissions
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;

COMMENT ON TABLE public.site_visit_cost_submissions IS 'RLS DISABLED FOR DEVELOPMENT - Re-enable with proper policies for production';
COMMENT ON TABLE public.cost_approval_history IS 'RLS DISABLED FOR DEVELOPMENT - Re-enable with proper policies for production';
