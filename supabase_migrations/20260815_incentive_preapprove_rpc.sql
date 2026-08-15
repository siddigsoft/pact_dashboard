-- =============================================================================
-- Migration: Incentive pre-approval RPC + payment lifecycle trigger
-- Date: 2026-08-15
-- Run in: Supabase Studio → SQL Editor
-- Safe to re-run: uses CREATE OR REPLACE / DROP TRIGGER IF EXISTS
--
-- Objects:
--   1. pre_approve_mmp_incentives()    — SECURITY DEFINER RPC that atomically
--      upserts the snapshot and all payment rows in one transaction.
--      Sequential client writes left a window where a failed payment insert
--      produced a pre_approved snapshot with an incomplete payout set that
--      could never be corrected. This RPC closes that window.
--
--   2. enforce_incentive_payment_approved_snapshot()  — BEFORE UPDATE trigger
--      that prevents a payment row from being marked 'paid' unless its parent
--      snapshot is already 'approved' or 'paid'. Keeps lifecycle client-side
--      enforcement from being the only line of defence.
--
--   3. idx_mmp_incentive_payments_unique_person  — unique partial index on
--      (mmp_id, user_id, role) so the RPC can use INSERT ... ON CONFLICT DO
--      UPDATE for idempotent payment-row upserts.
-- =============================================================================


-- ── 0. Unique partial index for idempotent payment upsert ──────────────────
-- A coordinator or supervisor may only have one payment row per MMP.
CREATE UNIQUE INDEX IF NOT EXISTS idx_mmp_incentive_payments_unique_person
  ON public.mmp_incentive_payments(mmp_id, user_id, role);


-- ── 1. Transactional pre-approval RPC ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.pre_approve_mmp_incentives(
  p_mmp_id        uuid,
  p_total_pool    bigint,
  p_total_bonus   bigint,
  p_config_snap   jsonb,
  p_payment_rows  jsonb   -- jsonb array: [{user_id, role, hub_id, hub_name,
                          --   dc_count, dc_fee_pool_cents, bonus_pct,
                          --   bonus_amount_cents, currency, excluded,
                          --   exclusion_note}, ...]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id   uuid := auth.uid();
  v_caller_role text;
  v_snap_id     uuid;
  v_now         timestamptz := now();
  v_row         jsonb;
BEGIN
  -- ── Authorization ─────────────────────────────────────────────────────────
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated.');
  END IF;

  SELECT role INTO v_caller_role
    FROM public.profiles WHERE id = v_caller_id;

  -- Pre-approval is an admin/finance action
  IF v_caller_role IS NULL OR v_caller_role NOT IN (
      'admin', 'super_admin', 'superAdmin', 'finance', 'financialAdmin', 'ict'
  ) THEN
    RETURN jsonb_build_object(
      'ok',    false,
      'error', format('Role "%s" is not permitted to pre-approve incentives.', v_caller_role)
    );
  END IF;

  -- ── 1. Upsert snapshot ────────────────────────────────────────────────────
  -- The pre-approval enforcement trigger fires here and blocks closed/historical MMPs.
  INSERT INTO public.mmp_incentive_snapshots (
    mmp_id,
    status,
    total_dc_fee_pool_cents,
    total_bonus_cents,
    config_snapshot,
    pre_approved_by,
    pre_approved_at
  ) VALUES (
    p_mmp_id,
    'pre_approved',
    p_total_pool,
    p_total_bonus,
    p_config_snap,
    v_caller_id,
    v_now
  )
  ON CONFLICT (mmp_id) DO UPDATE
    SET status                  = 'pre_approved',
        total_dc_fee_pool_cents = EXCLUDED.total_dc_fee_pool_cents,
        total_bonus_cents       = EXCLUDED.total_bonus_cents,
        config_snapshot         = EXCLUDED.config_snapshot,
        pre_approved_by         = EXCLUDED.pre_approved_by,
        pre_approved_at         = EXCLUDED.pre_approved_at
  RETURNING id INTO v_snap_id;

  -- ── 2. Upsert payment rows ─────────────────────────────────────────────────
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_payment_rows)
  LOOP
    -- Skip rows without a resolved user (unlinked states produce userId=null)
    CONTINUE WHEN (v_row->>'user_id') IS NULL;

    INSERT INTO public.mmp_incentive_payments (
      snapshot_id,
      mmp_id,
      user_id,
      role,
      hub_id,
      hub_name,
      dc_count,
      dc_fee_pool_cents,
      bonus_pct,
      bonus_amount_cents,
      currency,
      excluded,
      exclusion_note,
      status
    ) VALUES (
      v_snap_id,
      p_mmp_id,
      (v_row->>'user_id')::uuid,
      v_row->>'role',
      v_row->>'hub_id',
      v_row->>'hub_name',
      COALESCE((v_row->>'dc_count')::integer, 0),
      COALESCE((v_row->>'dc_fee_pool_cents')::bigint, 0),
      COALESCE((v_row->>'bonus_pct')::numeric, 0),
      COALESCE((v_row->>'bonus_amount_cents')::bigint, 0),
      COALESCE(v_row->>'currency', 'SDG'),
      COALESCE((v_row->>'excluded')::boolean, false),
      v_row->>'exclusion_note',
      'pending'
    )
    ON CONFLICT (mmp_id, user_id, role) DO UPDATE
      SET snapshot_id         = EXCLUDED.snapshot_id,
          dc_count            = EXCLUDED.dc_count,
          dc_fee_pool_cents   = EXCLUDED.dc_fee_pool_cents,
          bonus_pct           = EXCLUDED.bonus_pct,
          bonus_amount_cents  = EXCLUDED.bonus_amount_cents,
          excluded            = EXCLUDED.excluded,
          exclusion_note      = EXCLUDED.exclusion_note,
          status              = 'pending';  -- reset to pending on re-approval
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'snapshot_id', v_snap_id);

EXCEPTION WHEN OTHERS THEN
  -- Any DB error (including the lifecycle trigger) rolls back both the snapshot
  -- and all payment inserts.  Return structured error for the client.
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pre_approve_mmp_incentives(uuid, bigint, bigint, jsonb, jsonb)
  FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.pre_approve_mmp_incentives(uuid, bigint, bigint, jsonb, jsonb)
  TO authenticated;


-- ── 2. Payment lifecycle enforcement trigger ───────────────────────────────
-- Prevents a payment from being marked paid unless its snapshot is approved.

CREATE OR REPLACE FUNCTION public.enforce_incentive_payment_approved_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snap_status text;
BEGIN
  -- Only enforce when transitioning INTO 'paid'
  IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid') THEN
    SELECT status INTO v_snap_status
      FROM public.mmp_incentive_snapshots
     WHERE id = NEW.snapshot_id;

    IF v_snap_status IS NULL OR
       v_snap_status NOT IN ('approved', 'paid') THEN
      RAISE EXCEPTION
        'Cannot mark incentive payment as paid: snapshot status is "%" (must be "approved").',
        COALESCE(v_snap_status, 'NULL');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_incentive_payment_approved_snapshot
  ON public.mmp_incentive_payments;

CREATE TRIGGER trg_enforce_incentive_payment_approved_snapshot
  BEFORE UPDATE ON public.mmp_incentive_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_incentive_payment_approved_snapshot();

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================
