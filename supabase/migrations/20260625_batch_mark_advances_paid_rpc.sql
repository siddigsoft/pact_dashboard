-- =============================================================================
-- batch_mark_advances_paid — SECURITY DEFINER RPC  (v2 — minimal & robust)
-- Run this in Supabase SQL Editor → it is safe to run multiple times.
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
  v_request_id    uuid;
  v_req           record;
  v_approved_amt  numeric;
  v_paid          numeric;
  v_remaining     numeric;
  v_new_status    text;
  v_now           timestamptz := now();
  v_success_count integer     := 0;
  v_fail_count    integer     := 0;
  v_errors        jsonb       := '{}';
BEGIN
  FOREACH v_request_id IN ARRAY p_request_ids LOOP
    BEGIN
      -- ── Fetch the row ──────────────────────────────────────────────────────
      SELECT id,
             status,
             requested_amount,
             -- approved_amount column (added Feb 2026) may be NULL on old rows;
             -- fall back to metadata JSONB or the requested_amount
             COALESCE(
               approved_amount,
               (metadata->>'approved_amount')::numeric,
               requested_amount,
               0
             ) AS resolved_approved_amt
      INTO   v_req
      FROM   public.down_payment_requests
      WHERE  id = v_request_id;

      -- ── Guard: row must exist ──────────────────────────────────────────────
      IF NOT FOUND THEN
        v_fail_count := v_fail_count + 1;
        v_errors     := v_errors || jsonb_build_object(
          v_request_id::text,
          'Row not found'
        );
        CONTINUE;
      END IF;

      -- ── Guard: must be in approved status ─────────────────────────────────
      IF v_req.status != 'approved' THEN
        v_fail_count := v_fail_count + 1;
        v_errors     := v_errors || jsonb_build_object(
          v_request_id::text,
          format('Cannot pay: current status is "%s" (expected "approved")', v_req.status)
        );
        CONTINUE;
      END IF;

      -- ── Calculate amounts ──────────────────────────────────────────────────
      v_approved_amt := v_req.resolved_approved_amt;

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

      -- ── Update the row ─────────────────────────────────────────────────────
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

-- ── Ensure admin-all RLS policy covers all super_admin variants ───────────────
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
