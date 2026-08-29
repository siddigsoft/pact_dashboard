-- Reverse only the latest staff-allocation top-up.
--
-- Allocation top-ups are stored in pre_fund_allocations.notes rather than the
-- immutable pre_fund_transactions ledger. This routine serialises changes to
-- one allocation, enforces holder/admin authority, restores the prior amount
-- and receipt, and retains the removed entry in a dedicated reversal history.

CREATE TABLE IF NOT EXISTS public.pre_fund_allocation_topup_reversal_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_id UUID NOT NULL REFERENCES public.pre_fund_allocations(id) ON DELETE RESTRICT,
  pre_fund_request_id UUID NOT NULL REFERENCES public.pre_fund_requests(id) ON DELETE RESTRICT,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  reversed_top_up JSONB NOT NULL,
  before_data JSONB NOT NULL,
  after_data JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pre_fund_allocation_topup_reversal_audit ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pre_fund_allocation_topup_reversal_audit_allocation
  ON public.pre_fund_allocation_topup_reversal_audit(allocation_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.reverse_latest_pre_fund_allocation_topup_rpc(
  p_allocation_id UUID,
  p_expected_latest_date TEXT,
  p_reason TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_is_admin BOOLEAN := false;
  v_is_service_role BOOLEAN := COALESCE(
    current_setting('request.jwt.claim.role', true) = 'service_role',
    false
  );
  v_allocation RECORD;
  v_fund RECORD;
  v_meta JSONB;
  v_log JSONB;
  v_reversal_log JSONB;
  v_latest JSONB;
  v_latest_index INTEGER;
  v_remaining_count INTEGER;
  v_previous_total NUMERIC;
  v_recorded_new_total NUMERIC;
  v_restored_receipt_url TEXT;
  v_reversal_entry JSONB;
  v_after_data JSONB;
BEGIN
  IF p_allocation_id IS NULL THEN
    RAISE EXCEPTION 'Allocation id is required.';
  END IF;
  IF NULLIF(BTRIM(p_expected_latest_date), '') IS NULL THEN
    RAISE EXCEPTION 'The expected latest transaction timestamp is required.';
  END IF;
  IF NULLIF(BTRIM(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required to reverse the latest Add Funds transaction.';
  END IF;
  IF NOT v_is_service_role AND v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: sign in before reversing an Add Funds transaction.';
  END IF;

  SELECT *
    INTO v_allocation
    FROM public.pre_fund_allocations
   WHERE id = p_allocation_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Allocation not found. Refresh the page and try again.';
  END IF;

  SELECT id, holder_user_id
    INTO v_fund
    FROM public.pre_fund_requests
   WHERE id = v_allocation.pre_fund_request_id
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The allocation fund no longer exists.';
  END IF;

  IF NOT v_is_service_role THEN
    SELECT
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = v_actor_id
          AND regexp_replace(lower(COALESCE(p.role::text, '')), '[^a-z0-9]', '', 'g')
            IN ('superadmin', 'admin', 'administrator', 'finance', 'financeadmin', 'financialadmin')
      )
      OR EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = v_actor_id
          AND regexp_replace(lower(COALESCE(ur.role::text, '')), '[^a-z0-9]', '', 'g')
            IN ('superadmin', 'admin', 'administrator', 'finance', 'financeadmin', 'financialadmin')
      )
    INTO v_is_admin;

    IF v_actor_id IS DISTINCT FROM v_fund.holder_user_id
       AND NOT v_is_admin THEN
      RAISE EXCEPTION 'Access denied: only this fund holder or an administrator may reverse its latest Add Funds transaction.';
    END IF;
  END IF;

  BEGIN
    v_meta := COALESCE(NULLIF(BTRIM(v_allocation.notes), '')::jsonb, '{}'::jsonb);
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'This allocation has legacy notes without structured Add Funds history and cannot be reversed automatically.';
  END;

  v_log := COALESCE(v_meta -> 'top_up_log', '[]'::jsonb);
  IF jsonb_typeof(v_log) <> 'array' OR jsonb_array_length(v_log) = 0 THEN
    RAISE EXCEPTION 'There is no Add Funds transaction available to reverse. The original allocation cannot be deleted here.';
  END IF;

  v_latest_index := jsonb_array_length(v_log) - 1;
  v_latest := v_log -> v_latest_index;
  IF v_latest ->> 'date' IS DISTINCT FROM p_expected_latest_date THEN
    RAISE EXCEPTION 'The latest Add Funds transaction changed. Refresh the history before trying again.';
  END IF;

  BEGIN
    v_previous_total := NULLIF(v_latest ->> 'previous_total', '')::numeric;
    v_recorded_new_total := NULLIF(v_latest ->> 'new_total', '')::numeric;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'The latest Add Funds transaction has invalid amount evidence and requires Finance review.';
  END;

  IF v_previous_total IS NULL OR v_recorded_new_total IS NULL THEN
    RAISE EXCEPTION 'The latest Add Funds transaction is missing amount evidence and requires Finance review.';
  END IF;
  IF v_allocation.allocated_amount IS DISTINCT FROM v_recorded_new_total THEN
    RAISE EXCEPTION 'The allocation changed after this history was loaded. Refresh before reversing the current latest transaction.';
  END IF;
  IF v_previous_total < v_allocation.spent_amount THEN
    RAISE EXCEPTION
      'This top-up cannot be reversed because the restored allocation (%) would be below the amount already spent (%).',
      v_previous_total, v_allocation.spent_amount;
  END IF;

  v_remaining_count := v_latest_index;
  IF v_remaining_count = 0 THEN
    v_restored_receipt_url := NULLIF(v_meta ->> 'initial_receipt_url', '');
  ELSE
    v_restored_receipt_url := NULLIF(
      (v_log -> (v_remaining_count - 1)) ->> 'receipt_url',
      ''
    );
  END IF;

  v_reversal_log := COALESCE(v_meta -> 'top_up_reversal_log', '[]'::jsonb);
  IF jsonb_typeof(v_reversal_log) <> 'array' THEN
    RAISE EXCEPTION 'The Add Funds reversal history is invalid and requires Finance review.';
  END IF;

  v_reversal_entry := v_latest || jsonb_build_object(
    'reversed_at', now(),
    'reversed_by_user_id', v_actor_id,
    'reversal_reason', BTRIM(p_reason)
  );

  v_meta := jsonb_set(v_meta, '{top_up_log}', v_log - v_latest_index, true);
  v_meta := jsonb_set(v_meta, '{top_up_count}', to_jsonb(v_remaining_count), true);
  v_meta := jsonb_set(
    v_meta,
    '{top_up_reversal_log}',
    v_reversal_log || jsonb_build_array(v_reversal_entry),
    true
  );

  v_after_data := jsonb_build_object(
    'allocated_amount', v_previous_total,
    'spent_amount', v_allocation.spent_amount,
    'receipt_url', v_restored_receipt_url,
    'notes', v_meta
  );

  UPDATE public.pre_fund_allocations
     SET allocated_amount = v_previous_total,
         receipt_url = v_restored_receipt_url,
         notes = v_meta::text,
         updated_at = now()
   WHERE id = p_allocation_id;

  INSERT INTO public.pre_fund_allocation_topup_reversal_audit (
    allocation_id,
    pre_fund_request_id,
    actor_id,
    reason,
    reversed_top_up,
    before_data,
    after_data
  ) VALUES (
    p_allocation_id,
    v_allocation.pre_fund_request_id,
    v_actor_id,
    BTRIM(p_reason),
    v_latest,
    jsonb_build_object(
      'allocated_amount', v_allocation.allocated_amount,
      'spent_amount', v_allocation.spent_amount,
      'receipt_url', v_allocation.receipt_url,
      'notes', v_allocation.notes
    ),
    v_after_data
  );

  RETURN jsonb_build_object(
    'success', true,
    'allocation_id', p_allocation_id,
    'reversed_amount', NULLIF(v_latest ->> 'amount', '')::numeric,
    'new_allocated_amount', v_previous_total,
    'remaining_top_up_count', v_remaining_count,
    'restored_receipt_url', v_restored_receipt_url
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_latest_pre_fund_allocation_topup_rpc(UUID,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reverse_latest_pre_fund_allocation_topup_rpc(UUID,TEXT,TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';