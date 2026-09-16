-- Explicit Access Control pre_funding:read grants unlock org-wide Pre-Funding
-- visibility (same pattern as cost_submissions / projects).
-- Role-default pre_funding:read must NOT become org-wide — only an active
-- user_permission_overrides grant does. Existing finance-role and fund-holder
-- policies remain unchanged.

CREATE POLICY "Explicit pre_funding read grants org-wide requests"
  ON public.pre_fund_requests
  FOR SELECT
  TO authenticated
  USING (
    public.user_has_explicit_resource_grant(
      auth.uid(),
      'pre_funding',
      ARRAY['read']::text[]
    )
  );

CREATE POLICY "Explicit pre_funding read grants org-wide allocations"
  ON public.pre_fund_allocations
  FOR SELECT
  TO authenticated
  USING (
    public.user_has_explicit_resource_grant(
      auth.uid(),
      'pre_funding',
      ARRAY['read']::text[]
    )
  );

CREATE POLICY "Explicit pre_funding read grants org-wide approval steps"
  ON public.pre_fund_approval_steps
  FOR SELECT
  TO authenticated
  USING (
    public.user_has_explicit_resource_grant(
      auth.uid(),
      'pre_funding',
      ARRAY['read']::text[]
    )
  );

CREATE POLICY "Explicit pre_funding read grants org-wide transactions"
  ON public.pre_fund_transactions
  FOR SELECT
  TO authenticated
  USING (
    public.user_has_explicit_resource_grant(
      auth.uid(),
      'pre_funding',
      ARRAY['read']::text[]
    )
  );

DO $$
BEGIN
  IF to_regclass('public.pre_fund_reconciliations') IS NOT NULL THEN
    EXECUTE $p$
      CREATE POLICY "Explicit pre_funding read grants org-wide reconciliations"
        ON public.pre_fund_reconciliations
        FOR SELECT
        TO authenticated
        USING (
          public.user_has_explicit_resource_grant(
            auth.uid(),
            'pre_funding',
            ARRAY['read']::text[]
          )
        )
    $p$;
  END IF;
END $$;
