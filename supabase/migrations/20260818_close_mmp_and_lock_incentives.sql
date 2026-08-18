-- Migration: close_mmp_and_lock_incentives
--
-- SECURITY DEFINER RPC called by the Cycle Close Wizard (Step 6 Final Close)
-- after all readiness checks pass. It does two things atomically:
--
--   1. Sets mmp_files.cycle_status = 'closed' and records who/when.
--   2. Locks the incentive snapshot:
--        a. If a pre_approved snapshot exists → promote to 'approved' (locked).
--        b. If no snapshot exists → insert a skipped record so nobody can
--           retroactively pre-approve incentives for a closed cycle.
--        c. If the snapshot is already 'approved' or 'paid' → leave it alone.
--
-- Returns: jsonb { ok bool, closed_at text? (ISO timestamp), error text? }
--
-- SECURITY DEFINER is required because:
--   a. mmp_incentive_snapshots has tight RLS that ordinarily prevents Finance
--      from writing to it directly.
--   b. mmp_files RLS only allows the original uploader to update their own row;
--      FOM/Admin must close any hub's cycle regardless.
--
-- The caller cannot spoof closed_by: it is always derived server-side from
-- auth.uid(), not passed as a parameter.
--
-- NOTE: mmp_incentive_snapshots was created via the Supabase dashboard and
-- does not have a migration file. This function guards against the table being
-- absent (EXCEPTION WHEN undefined_table) so the close succeeds even on a
-- schema that predates the incentives feature.
-- ─────────────────────────────────────────────────────────────────────────────

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
  v_user_id        uuid        := auth.uid();
  v_is_authorized  boolean     := false;
  v_now            timestamptz := now();
  v_already_closed timestamptz;
  v_snap_id        uuid;
  v_snap_status    text;
BEGIN
  -- ── 1. Authentication ──────────────────────────────────────────────────────
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  -- ── 2. Authorisation ──────────────────────────────────────────────────────
  -- FOM, Admin, Super Admin, Country Director, ICT are permitted.
  -- Role strings are normalised across both snake_case and PascalCase variants.
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id
      AND role IN (
        'superAdmin', 'admin', 'fom', 'countryDirector', 'ict',
        'super_admin', 'Super Admin', 'SuperAdmin',
        'Admin', 'FOM', 'Field Operation Manager (FOM)',
        'Director', 'CountryDirector', 'country_director', 'ICT'
      )
  ) INTO v_is_authorized;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object(
      'ok',    false,
      'error', 'Only FOM / Director / Admin / Super Admin can close a cycle'
    );
  END IF;

  -- ── 3. Already-closed guard ───────────────────────────────────────────────
  SELECT cycle_closed_at INTO v_already_closed
  FROM public.mmp_files
  WHERE id = p_mmp_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'MMP not found');
  END IF;

  IF v_already_closed IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok',    false,
      'error', 'Cycle is already closed (closed at ' || v_already_closed::text || '). Use the reopen flow if a correction is needed.'
    );
  END IF;

  -- ── 4. Close the cycle ────────────────────────────────────────────────────
  UPDATE public.mmp_files
  SET
    cycle_status    = 'closed',
    cycle_closed_at = v_now,
    cycle_closed_by = v_user_id,
    updated_at      = v_now
  WHERE id = p_mmp_id;

  -- ── 5. Lock the incentive snapshot ────────────────────────────────────────
  BEGIN
    SELECT id, status
    INTO   v_snap_id, v_snap_status
    FROM   public.mmp_incentive_snapshots
    WHERE  mmp_id = p_mmp_id
    LIMIT  1;

    IF v_snap_id IS NOT NULL THEN
      -- Snapshot exists: promote pre_approved → approved; leave approved/paid alone.
      IF v_snap_status = 'pre_approved' THEN
        UPDATE public.mmp_incentive_snapshots
        SET
          status      = 'approved',
          approved_at = v_now,
          locked_at   = v_now,
          updated_at  = v_now
        WHERE id = v_snap_id;
      END IF;
      -- 'approved', 'paid', or 'calculating' → no change needed.

    ELSE
      -- No snapshot: insert a skipped placeholder so incentives cannot be
      -- retroactively pre-approved after cycle close.
      INSERT INTO public.mmp_incentive_snapshots (
        mmp_id,
        status,
        skipped,
        skipped_reason,
        total_dc_fee_pool_cents,
        total_bonus_cents,
        created_at,
        updated_at
      ) VALUES (
        p_mmp_id,
        'approved',       -- closed-without-incentives is "done"
        true,
        COALESCE(
          NULLIF(trim(p_skip_reason), ''),
          'Cycle closed without incentive pre-approval (admin confirmed)'
        ),
        0,
        0,
        v_now,
        v_now
      );
    END IF;

  EXCEPTION
    WHEN undefined_table OR undefined_column THEN
      -- Incentive snapshots table not yet present on this DB — safe to ignore.
      NULL;
  END;

  -- ── 6. Return success ─────────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'ok',        true,
    'closed_at', v_now::text
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Surface unexpected errors as a structured failure (not a 500 to the client).
    RETURN jsonb_build_object(
      'ok',    false,
      'error', SQLERRM
    );
END;
$$;

-- Allow any authenticated user to call; the function enforces its own role
-- check server-side (SECURITY DEFINER prevents client bypass).
GRANT EXECUTE ON FUNCTION public.close_mmp_and_lock_incentives(uuid, text)
  TO authenticated;

COMMENT ON FUNCTION public.close_mmp_and_lock_incentives(uuid, text) IS
  'Atomically closes an MMP cycle and locks its incentive snapshot. '
  'Returns jsonb { ok, closed_at?, error? }. '
  'Called exclusively by the Cycle Close Wizard final step.';
