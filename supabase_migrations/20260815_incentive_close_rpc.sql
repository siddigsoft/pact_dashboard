-- =============================================================================
-- Migration: Incentive close RPC + pre-approval enforcement trigger
-- Date: 2026-08-15
-- Run in: Supabase Studio → SQL Editor
-- Safe to re-run: uses CREATE OR REPLACE / DROP TRIGGER IF EXISTS
--
-- Two objects:
--
--   1. close_mmp_and_lock_incentives()  — SECURITY DEFINER RPC that atomically
--      closes mmp_files and transitions the incentive snapshot.
--      SECURITY DEFINER is required so users whose DB role permits cycle close
--      (FOM, Admin, SuperAdmin) can write to mmp_incentive_snapshots without
--      needing a separate RLS grant.
--      Authorization is enforced INSIDE the function via auth.uid() and a
--      profile-role check — no caller can bypass this by guessing a UUID.
--      closed_by is derived from auth.uid(), never accepted as a parameter.
--
--   2. prevent_incentive_preapproval_on_closed_mmp()  — BEFORE INSERT/UPDATE
--      trigger that raises an exception when a pre_approved snapshot is written
--      for a closed or historical MMP, enforcing the lifecycle at the DB layer
--      regardless of client state or race conditions.
-- =============================================================================


-- ── 1. Transactional close RPC ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.close_mmp_and_lock_incentives(
  p_mmp_id      uuid,
  p_skip_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id   uuid        := auth.uid();
  v_caller_role text;
  v_closed_at   timestamptz := now();
  v_snap_id     uuid;
  v_snap_status text;
BEGIN
  -- ── Authorization ─────────────────────────────────────────────────────────
  -- Reject unauthenticated callers immediately.
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated.');
  END IF;

  -- Look up the caller's role from the trusted profiles table, not from any
  -- caller-supplied parameter.
  SELECT role INTO v_caller_role
    FROM public.profiles
   WHERE id = v_caller_id;

  -- Permit: admin, super_admin (DB spelling), superAdmin (app spelling),
  --         fom, ict, Senior Management.  Extend this list if new roles are
  --         granted cycle-close capability in the future.
  IF v_caller_role IS NULL OR v_caller_role NOT IN (
      'admin', 'super_admin', 'superAdmin',
      'fom', 'ict', 'Senior Management'
  ) THEN
    RETURN jsonb_build_object(
      'ok',    false,
      'error', format('Role "%s" is not permitted to close an MMP cycle.', v_caller_role)
    );
  END IF;

  -- ── 1. Close the MMP ──────────────────────────────────────────────────────
  -- Idempotent: WHERE guard skips the update if already closed.
  -- closed_by is set to auth.uid() — never to a caller-supplied value.
  UPDATE public.mmp_files
     SET status          = 'closed',
         cycle_status    = 'closed',
         closed_at       = v_closed_at,
         cycle_closed_at = v_closed_at,
         closed_by       = v_caller_id
   WHERE id = p_mmp_id
     AND cycle_status IS DISTINCT FROM 'closed';

  -- ── 2. Incentive snapshot lifecycle ───────────────────────────────────────
  SELECT id, status
    INTO v_snap_id, v_snap_status
    FROM public.mmp_incentive_snapshots
   WHERE mmp_id = p_mmp_id;

  IF v_snap_id IS NULL THEN
    -- No snapshot → insert a locked/skipped record so the cycle cannot be
    -- retroactively pre-approved and paid after close.
    INSERT INTO public.mmp_incentive_snapshots (
      mmp_id,
      status,
      total_dc_fee_pool_cents,
      total_bonus_cents,
      skipped,
      skipped_reason,
      locked_at,
      approved_at
    ) VALUES (
      p_mmp_id,
      'approved',
      0,
      0,
      true,
      COALESCE(p_skip_reason, 'Cycle closed without incentive pre-approval.'),
      v_closed_at,
      v_closed_at
    );

  ELSIF v_snap_status = 'pre_approved' THEN
    -- Pre-approved → promote to approved and lock
    UPDATE public.mmp_incentive_snapshots
       SET status      = 'approved',
           approved_at = v_closed_at,
           locked_at   = v_closed_at
     WHERE id = v_snap_id;

  END IF;
  -- Status already 'approved' or 'paid': leave as-is

  RETURN jsonb_build_object('ok', true, 'closed_at', v_closed_at);

EXCEPTION WHEN OTHERS THEN
  -- Any DB error rolls back both writes.  Return structured error so the
  -- caller receives a usable message rather than a raw 500.
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- Revoke broad public execute; grant only to authenticated users.
-- The role-check inside the function is the real authorization boundary.
REVOKE EXECUTE ON FUNCTION public.close_mmp_and_lock_incentives(uuid, text)
  FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.close_mmp_and_lock_incentives(uuid, text)
  TO authenticated;


-- ── 2. Pre-approval enforcement trigger ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.prevent_incentive_preapproval_on_closed_mmp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cycle_status text;
  v_uploaded_at  timestamptz;
BEGIN
  SELECT cycle_status,
         COALESCE(uploaded_at, created_at)
    INTO v_cycle_status, v_uploaded_at
    FROM public.mmp_files
   WHERE id = NEW.mmp_id;

  -- Block: cycle already closed
  IF v_cycle_status = 'closed' THEN
    RAISE EXCEPTION
      'Cannot pre-approve incentives: MMP cycle is already closed.';
  END IF;

  -- Block: MMP predates incentive system activation (2026-08-01)
  IF v_uploaded_at IS NOT NULL
     AND v_uploaded_at < '2026-08-01 00:00:00+00'::timestamptz THEN
    RAISE EXCEPTION
      'Cannot pre-approve incentives: MMP predates the incentive system activation date (2026-08-01).';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_incentive_preapproval_on_closed
  ON public.mmp_incentive_snapshots;

CREATE TRIGGER trg_prevent_incentive_preapproval_on_closed
  BEFORE INSERT OR UPDATE ON public.mmp_incentive_snapshots
  FOR EACH ROW
  WHEN (NEW.status = 'pre_approved')
  EXECUTE FUNCTION public.prevent_incentive_preapproval_on_closed_mmp();

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================
