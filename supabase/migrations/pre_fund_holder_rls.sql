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
-- Allows any authenticated user to read rows where they are the designated holder.
-- Finance-admin / superAdmin policies (if any) remain separate and unaffected.
DROP POLICY IF EXISTS "Fund holders can read their own fund" ON public.pre_fund_requests;

CREATE POLICY "Fund holders can read their own fund"
  ON public.pre_fund_requests
  FOR SELECT
  USING (holder_user_id = auth.uid());

-- ── 3. Fund-holder allocations SELECT policy ──────────────────────────────────
-- pre_fund_allocations rows belong to a fund; holders need to read their fund's
-- allocations to use the Distribute and Report tabs.
ALTER TABLE public.pre_fund_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Fund holders can read allocations for their fund" ON public.pre_fund_allocations;

CREATE POLICY "Fund holders can read allocations for their fund"
  ON public.pre_fund_allocations
  FOR SELECT
  USING (
    fund_id IN (
      SELECT id FROM public.pre_fund_requests
      WHERE holder_user_id = auth.uid()
    )
  );

-- ── 4. Fund-holder steps SELECT policy ───────────────────────────────────────
-- pre_fund_steps (approval chain) also needs to be visible to the holder.
ALTER TABLE public.pre_fund_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Fund holders can read steps for their fund" ON public.pre_fund_steps;

CREATE POLICY "Fund holders can read steps for their fund"
  ON public.pre_fund_steps
  FOR SELECT
  USING (
    fund_id IN (
      SELECT id FROM public.pre_fund_requests
      WHERE holder_user_id = auth.uid()
    )
  );
