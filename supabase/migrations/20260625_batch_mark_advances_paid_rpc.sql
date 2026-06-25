-- =============================================================================
-- batch_mark_advances_paid — SECURITY DEFINER RPC
-- Called by the Batch Pay dialog in DownPaymentApprovalPanel.
-- Uses SECURITY DEFINER so it bypasses RLS and trigger-related permission
-- issues that can silently fail a direct client-side UPDATE.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.batch_mark_advances_paid(
  p_request_ids   uuid[],
  p_proof_url     text,
  p_notes         text    DEFAULT NULL,
  p_partial_pct   numeric DEFAULT NULL   -- NULL or 100 = full payment
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role   text;
  v_request_id    uuid;
  v_req           record;
  v_approved_amt  numeric;
  v_paid          numeric;
  v_remaining     numeric;
  v_new_status    text;
  v_now           timestamptz := now();
  v_success_ids   uuid[]      := '{}';
  v_failed_ids    uuid[]      := '{}';
  v_errors        jsonb       := '{}';
BEGIN
  -- ── Role guard ─────────────────────────────────────────────────────────────
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_caller_role IS NULL OR v_caller_role NOT IN (
    'admin', 'Admin',
    'financialAdmin', 'FinancialAdmin',
    'super_admin', 'SuperAdmin', 'superAdmin', 'Super Admin',
    'ict', 'ICT'
  ) THEN
    RAISE EXCEPTION 'batch_mark_advances_paid: caller role "%" is not authorised', v_caller_role;
  END IF;

  -- ── Process each request ──────────────────────────────────────────────────
  FOREACH v_request_id IN ARRAY p_request_ids LOOP
    BEGIN
      SELECT id,
             COALESCE(approved_amount, requested_amount, 0) AS approved_amt,
             requested_amount,
             requested_by
      INTO   v_req
      FROM   public.down_payment_requests
      WHERE  id     = v_request_id
        AND  status = 'approved';

      IF NOT FOUND THEN
        v_failed_ids := v_failed_ids || v_request_id;
        v_errors     := v_errors || jsonb_build_object(
          v_request_id::text, 'Row not found or status != approved'
        );
        CONTINUE;
      END IF;

      v_approved_amt := v_req.approved_amt;

      -- Calculate paid / remaining amounts
      IF p_partial_pct IS NOT NULL
         AND p_partial_pct > 0
         AND p_partial_pct < 100 THEN
        v_paid       := ROUND(v_approved_amt * (p_partial_pct / 100.0));
        v_remaining  := v_approved_amt - v_paid;
        v_new_status := 'partially_paid';
      ELSE
        v_paid       := v_approved_amt;
        v_remaining  := 0;
        v_new_status := 'fully_paid';
      END IF;

      UPDATE public.down_payment_requests
      SET
        status                    = v_new_status,
        total_paid_amount         = v_paid,
        remaining_amount          = v_remaining,
        payment_proof_url         = p_proof_url,
        payment_proof_uploaded_at = v_now,
        payment_proof_notes       = p_notes,
        updated_at                = v_now
      WHERE id = v_request_id;

      -- Ensure requester has a wallet (so downstream wallet-deduction
      -- triggers never block future operations)
      IF v_req.requested_by IS NOT NULL THEN
        INSERT INTO public.wallets (
          user_id, currency, balance_cents, total_earned_cents,
          total_paid_out_cents, pending_payout_cents, balances, total_earned
        )
        VALUES (v_req.requested_by, 'SDG', 0, 0, 0, 0, '{"SDG":0}'::jsonb, 0)
        ON CONFLICT (user_id) DO NOTHING;
      END IF;

      v_success_ids := v_success_ids || v_request_id;

    EXCEPTION WHEN OTHERS THEN
      v_failed_ids := v_failed_ids || v_request_id;
      v_errors     := v_errors || jsonb_build_object(
        v_request_id::text, SQLERRM
      );
      RAISE WARNING 'batch_mark_advances_paid: failed for % — % (%)',
        v_request_id, SQLERRM, SQLSTATE;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success_count', COALESCE(array_length(v_success_ids, 1), 0),
    'fail_count',    COALESCE(array_length(v_failed_ids,  1), 0),
    'success_ids',   v_success_ids,
    'failed_ids',    v_failed_ids,
    'errors',        v_errors
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.batch_mark_advances_paid(uuid[], text, text, numeric)
  TO authenticated;

-- ── Also fix the RLS admin-all policy to include super_admin variants ─────────
-- This ensures direct-client queries (export, read, etc.) also work for super_admin.
DROP POLICY IF EXISTS "down_payment_requests_admin_all" ON public.down_payment_requests;
CREATE POLICY "down_payment_requests_admin_all" ON public.down_payment_requests
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN (
          'admin', 'Admin',
          'financialAdmin', 'FinancialAdmin',
          'super_admin', 'SuperAdmin', 'superAdmin', 'Super Admin',
          'ict', 'ICT'
        )
    )
  );
