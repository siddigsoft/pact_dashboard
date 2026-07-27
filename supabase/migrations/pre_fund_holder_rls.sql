-- pre_fund_holder_rls.sql
-- Grants fund holders SELECT access to their own pre_fund_requests row so that:
--   • The PreFundingRoute guard can check holder_user_id = auth.uid()
--   • The sidebar isFundHolder query resolves correctly
--   • PreFundingDistribute / PreFundingReport scoped queries work
--
-- Safe to run multiple times (DROP POLICY IF EXISTS + CREATE).

-- ── 1. Ensure RLS is enabled (no-op if already on) ───────────────────────────
ALTER TABLE public.pre_fund_requests ENABLE ROW LEVEL SECURITY;

-- ── 2. Fund-holder SELECT policy ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Fund holders can read their own fund" ON public.pre_fund_requests;

CREATE POLICY "Fund holders can read their own fund"
  ON public.pre_fund_requests
  FOR SELECT
  USING (holder_user_id = auth.uid());

-- ── 3. Fund-holder allocations SELECT policy ──────────────────────────────────
ALTER TABLE public.pre_fund_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Fund holders can read allocations for their fund" ON public.pre_fund_allocations;

CREATE POLICY "Fund holders can read allocations for their fund"
  ON public.pre_fund_allocations
  FOR SELECT
  USING (
    pre_fund_request_id IN (
      SELECT id FROM public.pre_fund_requests
      WHERE holder_user_id = auth.uid()
    )
  );

-- ── 4. Fund-holder steps SELECT policy ───────────────────────────────────────
ALTER TABLE public.pre_fund_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Fund holders can read steps for their fund" ON public.pre_fund_steps;

CREATE POLICY "Fund holders can read steps for their fund"
  ON public.pre_fund_steps
  FOR SELECT
  USING (
    pre_fund_request_id IN (
      SELECT id FROM public.pre_fund_requests
      WHERE holder_user_id = auth.uid()
    )
  );
