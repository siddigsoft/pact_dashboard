-- Cycle Close Hardening — June 10 2026
-- Fixes: RPC advance gate join, OCS mmp_id sync, cycle_approval_note,
-- site status normalization, extended server gates (sites/WFP/cost recovery).

-- ---------------------------------------------------------------------------
-- 1. cycle_approval_note on mmp_files
-- ---------------------------------------------------------------------------
ALTER TABLE public.mmp_files
  ADD COLUMN IF NOT EXISTS cycle_approval_note text;

-- ---------------------------------------------------------------------------
-- 2. Sync operational_cost_submissions mmp_id <-> mmp_file_id
-- ---------------------------------------------------------------------------
UPDATE public.operational_cost_submissions
SET mmp_id = mmp_file_id
WHERE mmp_id IS NULL AND mmp_file_id IS NOT NULL;

UPDATE public.operational_cost_submissions
SET mmp_file_id = mmp_id
WHERE mmp_file_id IS NULL AND mmp_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_ocs_mmp_columns()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.mmp_id := COALESCE(NEW.mmp_id, NEW.mmp_file_id);
  NEW.mmp_file_id := COALESCE(NEW.mmp_file_id, NEW.mmp_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_ocs_mmp_columns ON public.operational_cost_submissions;
CREATE TRIGGER trg_sync_ocs_mmp_columns
  BEFORE INSERT OR UPDATE ON public.operational_cost_submissions
  FOR EACH ROW EXECUTE FUNCTION public.sync_ocs_mmp_columns();

-- ---------------------------------------------------------------------------
-- 3. Site status normalization (Phase A subset)
-- ---------------------------------------------------------------------------
UPDATE public.mmp_site_entries
SET status = LOWER(TRIM(status))
WHERE status IS NOT NULL
  AND status != LOWER(TRIM(status));

UPDATE public.mmp_site_entries SET status = 'submitted' WHERE status = 'completed';
UPDATE public.mmp_site_entries SET status = 'in_progress' WHERE status IN ('in progress', 'in_progress');
UPDATE public.mmp_site_entries SET status = 'approved' WHERE status IN ('approved and costed', 'approved_and_costed');
UPDATE public.mmp_site_entries SET status = 'pending' WHERE status = 'pending';
UPDATE public.mmp_site_entries SET status = 'accepted' WHERE status = 'accepted';
UPDATE public.mmp_site_entries SET status = 'dispatched' WHERE status = 'dispatched';

-- ---------------------------------------------------------------------------
-- 4. cycle_approve_close — hardened gates
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cycle_approve_close(
  p_mmp_id uuid,
  p_close_records jsonb,
  p_super_admin_override boolean DEFAULT false,
  p_override_justification text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id               uuid      := auth.uid();
  v_is_authorized         boolean   := false;
  v_is_super_admin        boolean   := false;
  v_now                   timestamptz := now();
  v_pending_cost_count    int       := 0;
  v_unreconciled_advances int       := 0;
  v_pending_withdrawals   int       := 0;
  v_unresolved_sites      int       := 0;
  v_submitted_sites       int       := 0;
  v_wfp_applied           int       := 0;
  v_cost_recovery_pending int       := 0;
  v_already_closed        timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

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
    RAISE EXCEPTION 'Only FOM/Director/Admin/Super Admin can approve cycle close';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id
      AND role IN ('superAdmin', 'super_admin', 'Super Admin', 'SuperAdmin')
  ) INTO v_is_super_admin;

  SELECT cycle_closed_at INTO v_already_closed
  FROM public.mmp_files
  WHERE id = p_mmp_id;

  IF v_already_closed IS NOT NULL THEN
    RAISE EXCEPTION 'Cycle is already closed (closed at %). Use reopen flow to reopen.', v_already_closed;
  END IF;

  IF NOT p_super_admin_override THEN
    -- Gate 1: pending cost submissions (mmp_id OR mmp_file_id)
    SELECT COUNT(*) INTO v_pending_cost_count
    FROM public.operational_cost_submissions
    WHERE (mmp_id = p_mmp_id OR mmp_file_id = p_mmp_id)
      AND (
        tier1_status = 'pending' OR tier2_status = 'pending'
        OR tier3_status = 'pending' OR tier4_status = 'pending'
      );

    IF v_pending_cost_count > 0 THEN
      RAISE EXCEPTION 'Finance gate: % pending cost submission(s) for this cycle must be resolved before close.', v_pending_cost_count;
    END IF;

    -- Gate 2: partially_paid unreconciled advances via site entry join
    SELECT COUNT(*) INTO v_unreconciled_advances
    FROM public.down_payment_requests dpr
    JOIN public.mmp_site_entries mse ON mse.id = dpr.mmp_site_entry_id
    WHERE mse.mmp_file_id = p_mmp_id
      AND dpr.status = 'partially_paid'
      AND (
        dpr.metadata IS NULL
        OR (
          (dpr.metadata->>'reconciled') IS DISTINCT FROM 'true'
          AND (dpr.metadata->>'reconciled_at') IS NULL
        )
      );

    IF v_unreconciled_advances > 0 THEN
      RAISE EXCEPTION 'Finance gate: % partially-paid advance(s) must be reconciled or fully paid before cycle close.', v_unreconciled_advances;
    END IF;

    -- Gate 3: pending withdrawal requests tagged to this MMP only
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

    -- Gate 4: unresolved site visits (reason required when not in terminal status)
    SELECT COUNT(*) INTO v_unresolved_sites
    FROM public.mmp_site_entries mse
    WHERE mse.mmp_file_id = p_mmp_id
      AND mse.not_covered_reason IS NULL
      AND LOWER(TRIM(COALESCE(mse.status, ''))) NOT IN (
        'submitted', 'wfp_confirmed', 'rejected', 'not_covered',
        'approved', 'cancelled', 'completed', 'verified'
      );

    IF v_unresolved_sites > 0 THEN
      RAISE EXCEPTION 'Site gate: % site(s) must be resolved or assigned a not-covered reason before cycle close.', v_unresolved_sites;
    END IF;

    -- Gate 5: WFP confirmation when submitted sites exist
    SELECT COUNT(*) INTO v_submitted_sites
    FROM public.mmp_site_entries
    WHERE mmp_file_id = p_mmp_id
      AND LOWER(TRIM(COALESCE(status, ''))) = 'submitted';

    IF v_submitted_sites > 0 THEN
      SELECT COUNT(*) INTO v_wfp_applied
      FROM public.wfp_confirmation_uploads
      WHERE mmp_id::text = p_mmp_id::text
        AND status = 'applied';

      IF v_wfp_applied = 0 THEN
        RAISE EXCEPTION 'WFP gate: % submitted site(s) require a WFP confirmation file to be applied before cycle close.', v_submitted_sites;
      END IF;
    END IF;

    -- Gate 6: cost recovery for not-covered sites with advances
    BEGIN
      SELECT COUNT(*) INTO v_cost_recovery_pending
      FROM public.mmp_site_entries mse
      WHERE mse.mmp_file_id = p_mmp_id
        AND (mse.not_covered_flag = true OR LOWER(TRIM(COALESCE(mse.status, ''))) = 'not_covered')
        AND EXISTS (
          SELECT 1 FROM public.down_payment_requests dpr
          WHERE dpr.mmp_site_entry_id = mse.id
            AND dpr.status IN ('approved', 'partially_paid', 'fully_paid')
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.cost_recovery_log crl
          WHERE crl.site_entry_id = mse.id
        );
    EXCEPTION WHEN undefined_table OR undefined_column THEN
      v_cost_recovery_pending := 0;
    END;

    IF v_cost_recovery_pending > 0 THEN
      RAISE EXCEPTION 'Cost recovery gate: % not-covered site(s) with advances need a recovery decision before cycle close.', v_cost_recovery_pending;
    END IF;

  ELSE
    IF NOT v_is_super_admin THEN
      RAISE EXCEPTION 'Finance gate override requires Super Admin role';
    END IF;
    IF p_override_justification IS NULL OR trim(p_override_justification) = '' THEN
      RAISE EXCEPTION 'Super Admin override requires a non-empty justification';
    END IF;
  END IF;

  UPDATE public.mmp_files
  SET
    cycle_status        = 'closed',
    cycle_closed_at     = v_now,
    cycle_closed_by     = v_user_id,
    cycle_approved_by   = v_user_id,
    cycle_close_records = p_close_records,
    updated_at          = v_now
  WHERE id = p_mmp_id;

  BEGIN
    UPDATE public.mmp_site_entries
    SET status = 'cancelled'
    WHERE mmp_file_id = p_mmp_id
      AND not_covered_flag = true
      AND LOWER(TRIM(COALESCE(status, ''))) IN ('pending', 'assigned', 'dispatched', 'accepted');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

END;
$$;

GRANT EXECUTE ON FUNCTION public.cycle_approve_close(uuid, jsonb, boolean, text) TO authenticated;
