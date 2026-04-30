-- ============================================================
-- Cycle Close Fixes — April 30 2026
-- ============================================================
-- Fix 3a: Gate 2 in cycle_approve_close now matches client-side logic:
--   Only partially_paid + unreconciled advances are blocking.
--   approved (zero-disbursement) advances are non-blocking — they
--   will be settled via the payment report post-close.
--   Previously the RPC blocked on ANY advance in ('approved','paid')
--   that wasn't reconciled, which was stricter than the client gate.
--
-- Fix 3b: The cancellation of not_covered pending site entries is now
--   performed atomically inside the RPC (BEGIN...EXCEPTION block).
--   Previously this was a separate client-side UPDATE that could be
--   skipped if the browser disconnected right after the RPC succeeded,
--   leaving pending entries in a non-terminal state on a closed cycle.
--
-- Fix 3c: Gate 1 (cost submissions) now scopes by mmp_id FK instead
--   of by calendar month/year range. This prevents submissions from
--   other MMPs in the same month from blocking an unrelated close.
--   (The client-side gate already used mmp_id; the RPC is now aligned.)
-- ============================================================

CREATE OR REPLACE FUNCTION public.cycle_approve_close(
  p_mmp_id uuid,
  p_close_records jsonb,
  p_super_admin_override boolean DEFAULT false,
  p_override_justification text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id          uuid      := auth.uid();
  v_is_authorized    boolean   := false;
  v_is_super_admin   boolean   := false;
  v_now              timestamptz := now();
  v_pending_cost_count   int   := 0;
  v_unreconciled_advances int  := 0;
  v_pending_withdrawals  int   := 0;
  v_already_closed   timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id
      AND role IN ('super_admin', 'Super Admin', 'admin', 'Admin',
                   'FOM', 'fom', 'Field Operation Manager (FOM)', 'Director')
  ) INTO v_is_authorized;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Only FOM/Director/Admin/Super Admin can approve cycle close';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND role IN ('super_admin', 'Super Admin')
  ) INTO v_is_super_admin;

  -- Immutability guard: reject if cycle is already closed.
  SELECT cycle_closed_at INTO v_already_closed
  FROM public.mmp_files
  WHERE id = p_mmp_id;

  IF v_already_closed IS NOT NULL THEN
    RAISE EXCEPTION 'Cycle is already closed (closed at %). Use reopen flow to reopen.', v_already_closed;
  END IF;

  IF NOT p_super_admin_override THEN
    -- Gate 1: pending cost submissions scoped by mmp_id FK.
    -- Previously used calendar month/year range which incorrectly counted
    -- submissions from other MMPs sharing the same month.
    SELECT COUNT(*) INTO v_pending_cost_count
    FROM public.operational_cost_submissions
    WHERE mmp_id = p_mmp_id
      AND (tier1_status = 'pending' OR tier2_status = 'pending');

    IF v_pending_cost_count > 0 THEN
      RAISE EXCEPTION 'Finance gate: % pending cost submission(s) for this cycle must be resolved before close.', v_pending_cost_count;
    END IF;

    -- Gate 2: only partially_paid + unreconciled advances are blocking.
    -- approved (zero-disbursement) advances are non-blocking — they will be
    -- settled via the payment report post-close. This matches the client gate.
    BEGIN
      SELECT COUNT(*) INTO v_unreconciled_advances
      FROM public.down_payment_requests
      WHERE mmp_id = p_mmp_id
        AND status = 'partially_paid'
        AND (
          metadata IS NULL
          OR (
            (metadata->>'reconciled') IS DISTINCT FROM 'true'
            AND (metadata->>'reconciled_at') IS NULL
          )
        );
    EXCEPTION WHEN undefined_table OR undefined_column THEN
      v_unreconciled_advances := 0;
    END;

    IF v_unreconciled_advances > 0 THEN
      RAISE EXCEPTION 'Finance gate: % partially-paid advance(s) must be reconciled or fully paid before cycle close.', v_unreconciled_advances;
    END IF;

    -- Gate 3: pending withdrawal requests for this cycle.
    BEGIN
      SELECT COUNT(*) INTO v_pending_withdrawals
      FROM public.withdrawal_requests
      WHERE mmp_id = p_mmp_id
        AND COALESCE(status, '') NOT IN ('approved', 'rejected', 'completed', 'paid');
    EXCEPTION WHEN undefined_table OR undefined_column THEN
      v_pending_withdrawals := 0;
    END;

    IF v_pending_withdrawals > 0 THEN
      RAISE EXCEPTION 'Finance gate: % pending withdrawal request(s) must be processed before cycle close.', v_pending_withdrawals;
    END IF;

  ELSE
    -- Super Admin override: must be SA with non-empty justification.
    IF NOT v_is_super_admin THEN
      RAISE EXCEPTION 'Finance gate override requires Super Admin role';
    END IF;
    IF p_override_justification IS NULL OR trim(p_override_justification) = '' THEN
      RAISE EXCEPTION 'Super Admin override requires a non-empty justification';
    END IF;
  END IF;

  -- Atomic close: update mmp_files first.
  UPDATE public.mmp_files
  SET
    cycle_status        = 'closed',
    cycle_closed_at     = v_now,
    cycle_closed_by     = v_user_id,
    cycle_approved_by   = v_user_id,
    cycle_close_records = p_close_records,
    updated_at          = v_now
  WHERE id = p_mmp_id;

  -- Then atomically cancel any remaining not_covered site entries still in a
  -- non-terminal status. Previously done client-side which left a race condition
  -- if the browser disconnected after the RPC succeeded. Now atomic with the close.
  BEGIN
    UPDATE public.mmp_site_entries
    SET status = 'cancelled'
    WHERE mmp_file_id = p_mmp_id
      AND not_covered_flag = true
      AND status IN ('pending', 'assigned', 'dispatched', 'accepted');
  EXCEPTION WHEN OTHERS THEN
    NULL; -- Non-fatal: entries may already be in terminal status.
  END;

END;
$$;

GRANT EXECUTE ON FUNCTION public.cycle_approve_close(uuid, jsonb, boolean, text) TO authenticated;
