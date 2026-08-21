-- ============================================================================
-- PRE-FUND EXCEPTION VISIBILITY AND COUNTRY DIRECTOR READ SCOPE
-- ============================================================================
-- Finance needs one cross-fund exception queue. Country Directors may inspect
-- only exceptions tied to funds they currently hold; unassigned source-payment
-- gaps are intentionally not exposed because no safe holder can be inferred.

CREATE OR REPLACE FUNCTION public.get_pre_fund_finance_exception_queue_rpc(
  p_fund_id UUID DEFAULT NULL
) RETURNS SETOF public.pre_fund_finance_exception_queue_v
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- Service automations retain the existing unrestricted, auditable read path.
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN QUERY
    SELECT q.*
    FROM public.pre_fund_finance_exception_queue_v q
    WHERE p_fund_id IS NULL
       OR q.fund_id = p_fund_id
       OR q.fund_id IS NULL
    ORDER BY
      CASE q.resolution WHEN 'open' THEN 0 ELSE 1 END,
      q.transaction_date DESC NULLS LAST,
      q.exception_key;
    RETURN;
  END IF;

  SELECT lower(trim(role)) INTO v_role
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;

  -- Finance and Admin roles can review every fund and unassigned source-payment
  -- gap. Correction RPCs still perform their own Finance-only role assertion.
  IF v_role IN (
    'super_admin', 'superadmin',
    'admin', 'administrator',
    'finance', 'finance admin',
    'financialadmin', 'financial_admin',
    'accountant', 'fom'
  ) THEN
    RETURN QUERY
    SELECT q.*
    FROM public.pre_fund_finance_exception_queue_v q
    WHERE p_fund_id IS NULL
       OR q.fund_id = p_fund_id
       OR q.fund_id IS NULL
    ORDER BY
      CASE q.resolution WHEN 'open' THEN 0 ELSE 1 END,
      q.transaction_date DESC NULLS LAST,
      q.exception_key;
    RETURN;
  END IF;

  -- Country Directors have read-only, holder-scoped visibility. A source gap
  -- without a fund cannot be associated with a Country Director safely, so it
  -- remains Finance-only until evidence identifies the fund.
  IF v_role IN ('countrydirector', 'country director', 'country_director') THEN
    RETURN QUERY
    SELECT q.*
    FROM public.pre_fund_finance_exception_queue_v q
    JOIN public.pre_fund_requests f ON f.id = q.fund_id
    WHERE f.holder_user_id = auth.uid()
      AND (p_fund_id IS NULL OR q.fund_id = p_fund_id)
    ORDER BY
      CASE q.resolution WHEN 'open' THEN 0 ELSE 1 END,
      q.transaction_date DESC NULLS LAST,
      q.exception_key;
    RETURN;
  END IF;

  RAISE EXCEPTION 'Access denied: Finance, Admin, or Country Director role required (role="%").',
    COALESCE(v_role, '<null>');
END;
$$;

REVOKE ALL ON FUNCTION public.get_pre_fund_finance_exception_queue_rpc(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pre_fund_finance_exception_queue_rpc(UUID) TO authenticated;