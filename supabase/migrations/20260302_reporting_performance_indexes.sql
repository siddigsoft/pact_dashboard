-- Performance indexes for reporting and hot-path queries
-- Phase 5.2: Index and RLS Review
-- Safe to run multiple times (IF NOT EXISTS)

-- project_budgets: filter by project, date ranges
CREATE INDEX IF NOT EXISTS idx_project_budgets_project_id ON public.project_budgets(project_id);
CREATE INDEX IF NOT EXISTS idx_project_budgets_created_at ON public.project_budgets(created_at);
CREATE INDEX IF NOT EXISTS idx_project_budgets_status ON public.project_budgets(status);

-- budget_transactions: filter by project_budget (joins to project), date ranges
CREATE INDEX IF NOT EXISTS idx_budget_transactions_project_budget_id ON public.budget_transactions(project_budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_transactions_created_at ON public.budget_transactions(created_at);

-- down_payment_requests: status filtering, date sorting, user scoping
CREATE INDEX IF NOT EXISTS idx_down_payment_requests_status ON public.down_payment_requests(status);
CREATE INDEX IF NOT EXISTS idx_down_payment_requests_created_at ON public.down_payment_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_down_payment_requests_requested_by ON public.down_payment_requests(requested_by);

-- mmp_site_entries: status, date, assignment filters
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_status ON public.mmp_site_entries(status);
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_created_at ON public.mmp_site_entries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_accepted_by ON public.mmp_site_entries(accepted_by);
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_mmp_file_id ON public.mmp_site_entries(mmp_file_id);

-- cost_submissions (if exists - site_visit_cost_submissions is the likely table)
CREATE INDEX IF NOT EXISTS idx_site_visit_cost_submissions_created_at ON public.site_visit_cost_submissions(created_at);
CREATE INDEX IF NOT EXISTS idx_site_visit_cost_submissions_status ON public.site_visit_cost_submissions(status);
