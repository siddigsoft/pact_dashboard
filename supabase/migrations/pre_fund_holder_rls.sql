-- pre_fund_holder_rls.sql
-- Grants fund holders SELECT access to their own rows and ensures
-- finance admins retain full access after RLS is enabled.
-- Safe to run multiple times (idempotent).

-- ─────────────────────────────────────────────────────────────────────────────
-- pre_fund_requests
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.pre_fund_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Finance admins full access pre_fund_requests" ON public.pre_fund_requests;
CREATE POLICY "Finance admins full access pre_fund_requests"
  ON public.pre_fund_requests FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('superAdmin','super_admin','admin','financialAdmin','financial_admin','auditor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('superAdmin','super_admin','admin','financialAdmin','financial_admin','auditor')
    )
  );

DROP POLICY IF EXISTS "Fund holders can read their own fund" ON public.pre_fund_requests;
CREATE POLICY "Fund holders can read their own fund"
  ON public.pre_fund_requests FOR SELECT
  USING (holder_user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- pre_fund_allocations
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.pre_fund_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Finance admins full access pre_fund_allocations" ON public.pre_fund_allocations;
CREATE POLICY "Finance admins full access pre_fund_allocations"
  ON public.pre_fund_allocations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('superAdmin','super_admin','admin','financialAdmin','financial_admin','auditor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('superAdmin','super_admin','admin','financialAdmin','financial_admin','auditor')
    )
  );

DROP POLICY IF EXISTS "Fund holders can read allocations for their fund" ON public.pre_fund_allocations;
CREATE POLICY "Fund holders can read allocations for their fund"
  ON public.pre_fund_allocations FOR SELECT
  USING (
    pre_fund_request_id IN (
      SELECT id FROM public.pre_fund_requests WHERE holder_user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- pre_fund_approval_steps
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.pre_fund_approval_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Finance admins full access pre_fund_approval_steps" ON public.pre_fund_approval_steps;
CREATE POLICY "Finance admins full access pre_fund_approval_steps"
  ON public.pre_fund_approval_steps FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('superAdmin','super_admin','admin','financialAdmin','financial_admin','auditor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('superAdmin','super_admin','admin','financialAdmin','financial_admin','auditor')
    )
  );

DROP POLICY IF EXISTS "Fund holders can read approval steps for their fund" ON public.pre_fund_approval_steps;
CREATE POLICY "Fund holders can read approval steps for their fund"
  ON public.pre_fund_approval_steps FOR SELECT
  USING (
    pre_fund_request_id IN (
      SELECT id FROM public.pre_fund_requests WHERE holder_user_id = auth.uid()
    )
  );
