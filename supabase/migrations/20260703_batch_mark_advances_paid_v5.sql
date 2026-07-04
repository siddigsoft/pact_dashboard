-- =============================================================================
-- batch_mark_advances_paid — SECURITY DEFINER RPC  (v5)
-- Run this in Supabase SQL Editor AFTER 20260625_batch_mark_advances_paid_rpc.sql
--
-- What changed vs v4:
--   v4 only accepted rows with status = 'approved'. Requests that already had
--   a partial payment (status = 'partially_paid') were rejected outright,
--   which meant the "Batch Pay" action in the Processing tab could never
--   complete an already-partially-paid advance — you had to pay each one
--   individually via "Process Payment".
--
--   v5 accepts BOTH 'approved' and 'partially_paid' rows:
--     - 'approved'        -> basis = resolved approved amount (first payment)
--     - 'partially_paid'  -> basis = remaining_amount (outstanding balance only)
--   The payment made this round is added on top of any existing
--   total_paid_amount, so previously-paid amounts are never double-counted
--   or overwritten.
--
-- Safe to re-run — uses CREATE OR REPLACE.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.batch_mark_advances_paid(
  p_request_ids   uuid[],
  p_proof_url     text,
  p_notes         text    DEFAULT NULL,
  p_partial_pct   numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_id     uuid;
  v_req            record;
  v_basis_amt      numeric;
  v_paid_this_round numeric;
  v_new_total_paid numeric;
  v_remaining      numeric;
  v_new_status     text;
  v_now            timestamptz := now();
  v_success_count  integer     := 0;
  v_fail_count     integer     := 0;
  v_errors         jsonb       := '{}';
BEGIN
  FOREACH v_request_id IN ARRAY p_request_ids LOOP
    BEGIN
      -- Fetch the row
      SELECT id,
             status,
             requested_amount,
             COALESCE(total_paid_amount, 0)     AS existing_paid,
             COALESCE(remaining_amount, 0)      AS existing_remaining,
             COALESCE(
               approved_amount,
               (metadata->>'approved_amount')::numeric,
               requested_amount,
               0
             ) AS resolved_approved_amt
      INTO   v_req
      FROM   public.down_payment_requests
      WHERE  id = v_request_id;

      IF NOT FOUND THEN
        v_fail_count := v_fail_count + 1;
        v_errors     := v_errors || jsonb_build_object(v_request_id::text, 'Row not found');
        CONTINUE;
      END IF;

      IF v_req.status NOT IN ('approved', 'partially_paid') THEN
        v_fail_count := v_fail_count + 1;
        v_errors     := v_errors || jsonb_build_object(
          v_request_id::text,
          format('Cannot pay: current status is "%s" (expected "approved" or "partially_paid")', v_req.status)
        );
        CONTINUE;
      END IF;

      -- Basis is the amount still owed: full approved amount for a fresh
      -- approval, or just the outstanding remainder for a partially-paid row.
      IF v_req.status = 'partially_paid' THEN
        v_basis_amt := v_req.existing_remaining;
      ELSE
        v_basis_amt := v_req.resolved_approved_amt;
      END IF;

      IF p_partial_pct IS NOT NULL AND p_partial_pct > 0 AND p_partial_pct < 100 THEN
        v_paid_this_round := ROUND(v_basis_amt * (p_partial_pct / 100.0));
        v_remaining       := v_basis_amt - v_paid_this_round;
        v_new_status      := 'partially_paid';
      ELSE
        v_paid_this_round := v_basis_amt;
        v_remaining       := 0;
        v_new_status      := 'fully_paid';
      END IF;

      v_new_total_paid := v_req.existing_paid + v_paid_this_round;

      -- Update the row
      UPDATE public.down_payment_requests
      SET
        status                    = v_new_status,
        total_paid_amount         = v_new_total_paid,
        remaining_amount          = v_remaining,
        payment_proof_url         = p_proof_url,
        payment_proof_uploaded_at = v_now,
        payment_proof_notes       = p_notes,
        updated_at                = v_now
      WHERE id = v_request_id;

      v_success_count := v_success_count + 1;

    EXCEPTION WHEN OTHERS THEN
      v_fail_count := v_fail_count + 1;
      v_errors     := v_errors || jsonb_build_object(
        v_request_id::text,
        format('DB error [%s]: %s', SQLSTATE, SQLERRM)
      );
      RAISE WARNING 'batch_mark_advances_paid: id=% sqlstate=% err=%',
        v_request_id, SQLSTATE, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success_count', v_success_count,
    'fail_count',    v_fail_count,
    'errors',        v_errors
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.batch_mark_advances_paid(uuid[], text, text, numeric)
  TO authenticated;
