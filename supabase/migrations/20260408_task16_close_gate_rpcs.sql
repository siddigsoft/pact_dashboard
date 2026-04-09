-- Task #16: Cycle Close & Finance Reconciliation Gate
-- Adds role-restricted RPCs for project close/reopen with server-side enforcement

-- Add columns to mmp_files for cycle close tracking (IF NOT EXISTS for idempotency)
ALTER TABLE public.mmp_files ADD COLUMN IF NOT EXISTS cycle_status text;
ALTER TABLE public.mmp_files ADD COLUMN IF NOT EXISTS cycle_closed_at timestamptz;
ALTER TABLE public.mmp_files ADD COLUMN IF NOT EXISTS cycle_closed_by uuid REFERENCES auth.users(id);
ALTER TABLE public.mmp_files ADD COLUMN IF NOT EXISTS cycle_approved_by uuid REFERENCES auth.users(id);
ALTER TABLE public.mmp_files ADD COLUMN IF NOT EXISTS cycle_close_records jsonb;

-- close_project: Close a project with server-side authorization.
-- Finance + readiness gates scoped to project; Super Admin can override with justification.
-- Persists immutable close snapshot to projects.budget JSONB field.
CREATE OR REPLACE FUNCTION public.close_project(
  p_id uuid,
  p_justification text DEFAULT NULL,
  p_super_admin_override boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_project projects%ROWTYPE;
  v_is_authorized boolean := false;
  v_is_super_admin boolean := false;
  v_snapshot jsonb;
  v_pending_costs int := 0;
  v_incomplete_activities int := 0;
  v_incomplete_deliverables int := 0;
  v_budget_reconciled boolean := true;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_project FROM public.projects WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found';
  END IF;

  IF v_project.archived THEN
    RAISE EXCEPTION 'Project is already closed';
  END IF;

  -- Check caller role: matches UI canArchive = isAdminUser (super_admin/admin/fom) OR isProjectManagerUser
  -- isProjectManagerUser = project.team.projectManager === currentUser.fullName OR project creator
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_user_id
    AND (
      p.role IN ('super_admin', 'Super Admin', 'admin', 'Admin',
                 'FOM', 'fom', 'Field Operation Manager (FOM)', 'Director')
      OR p.id = v_project.created_by
      OR (v_project.team IS NOT NULL AND v_project.team->>'projectManager' = p.full_name)
    )
  ) INTO v_is_authorized;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Not authorized to close this project';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND role IN ('super_admin', 'Super Admin')
  ) INTO v_is_super_admin;

  -- Finance gate: check pending cost submissions scoped to this project
  SELECT COUNT(*) INTO v_pending_costs
  FROM public.operational_cost_submissions
  WHERE project_id = p_id
    AND (tier1_status = 'pending' OR tier2_status = 'pending');

  -- Readiness gate: check incomplete activities for this project
  -- COALESCE handles NULL status: NULL is treated as non-terminal (incomplete)
  SELECT COUNT(*) INTO v_incomplete_activities
  FROM public.project_activities
  WHERE project_id = p_id
    AND COALESCE(status::text, '') NOT IN ('completed', 'cancelled');

  -- Readiness gate: sub-activities (deliverables) — joined through project_activities
  -- Only checked if sub-activities exist; passes if no sub-activities configured.
  -- NULL status is treated as non-terminal (incomplete).
  SELECT COUNT(*) INTO v_incomplete_deliverables
  FROM public.sub_activities sa
  JOIN public.project_activities pa ON pa.id = sa.activity_id
  WHERE pa.project_id = p_id
    AND COALESCE(sa.status::text, '') NOT IN ('completed', 'cancelled');

  -- Readiness gate: budget reconciliation — no pending tier2 approvals for this project
  -- Passes if there are no cost submissions (nothing to reconcile).
  SELECT NOT EXISTS (
    SELECT 1 FROM public.operational_cost_submissions
    WHERE project_id = p_id
      AND tier2_status = 'pending'
  ) INTO v_budget_reconciled;

  -- Enforce gates unless Super Admin override
  IF NOT p_super_admin_override THEN
    IF v_pending_costs > 0 THEN
      RAISE EXCEPTION 'Finance gate: % pending cost submission(s) must be resolved before closing this project.', v_pending_costs;
    END IF;

    IF v_incomplete_activities > 0 THEN
      RAISE EXCEPTION 'Readiness gate: % incomplete activit(y/ies) must reach a terminal state before closing this project.', v_incomplete_activities;
    END IF;

    IF v_incomplete_deliverables > 0 THEN
      RAISE EXCEPTION 'Readiness gate: % deliverable(s) must be checked off before closing this project.', v_incomplete_deliverables;
    END IF;

    IF NOT v_budget_reconciled THEN
      RAISE EXCEPTION 'Finance gate: Project budget must be reconciled or approved before closing.';
    END IF;
  ELSE
    -- Super Admin override requires justification and must be authorized as SA
    IF NOT v_is_super_admin THEN
      RAISE EXCEPTION 'Override requires Super Admin role';
    END IF;
    IF p_justification IS NULL OR trim(p_justification) = '' THEN
      RAISE EXCEPTION 'Super Admin override requires a non-empty justification';
    END IF;
  END IF;

  -- Build immutable close snapshot
  v_snapshot := jsonb_build_object(
    'closed_at', v_now,
    'closed_by', v_user_id,
    'project_id', p_id,
    'project_name', v_project.name,
    'project_status', v_project.status,
    'justification', COALESCE(p_justification, 'Closed via ProjectDetail'),
    'super_admin_override', p_super_admin_override,
    'snapshot_type', 'project_close',
    'pending_costs_at_close', v_pending_costs,
    'incomplete_activities_at_close', v_incomplete_activities
  );

  -- Set archived flag and persist immutable snapshot in budget JSONB field
  UPDATE public.projects
  SET
    archived   = true,
    budget     = COALESCE(budget, '{}'::jsonb) || jsonb_build_object('close_snapshot', v_snapshot),
    updated_at = v_now
  WHERE id = p_id;

  RETURN v_snapshot;
END;
$$;
GRANT EXECUTE ON FUNCTION public.close_project(uuid, text, boolean) TO authenticated;

-- reopen_project: ONLY Super Admin can reopen a closed project.
-- Server-enforced: role check, mandatory justification, RAISES EXCEPTION for others.
CREATE OR REPLACE FUNCTION public.reopen_project(
  p_id uuid,
  p_justification text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_super_admin boolean;
  v_project projects%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_project FROM public.projects WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found';
  END IF;

  IF NOT v_project.archived THEN
    RAISE EXCEPTION 'Project is not closed';
  END IF;

  IF p_justification IS NULL OR trim(p_justification) = '' THEN
    RAISE EXCEPTION 'Justification is required to reopen a closed project';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id
    AND role IN ('super_admin', 'Super Admin')
  ) INTO v_is_super_admin;

  IF NOT v_is_super_admin THEN
    RAISE EXCEPTION 'Only Super Admins can reopen a closed project';
  END IF;

  UPDATE public.projects
  SET
    archived   = false,
    budget     = CASE
                   WHEN budget IS NOT NULL
                   THEN budget || jsonb_build_object(
                     'reopened_at', now(),
                     'reopened_by', v_user_id,
                     'reopen_justification', p_justification
                   )
                   ELSE NULL
                 END,
    updated_at = now()
  WHERE id = p_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.reopen_project(uuid, text) TO authenticated;

-- cycle_approve_close: Server-enforced cycle close approval.
-- Only FOM/Director/Admin/Super Admin can approve cycle close.
-- close actor is derived from auth.uid() — no client attribution spoofing.
-- Finance gates:
--   1. Pending cost submissions scoped to cycle month/year
--   2. Unreconciled transport advances (down_payment_requests) for this cycle
--   3. Pending withdrawal requests for this cycle
-- Super Admin can override all gates with mandatory justification.
CREATE OR REPLACE FUNCTION public.cycle_approve_close(
  p_mmp_id uuid,
  p_close_records jsonb,
  p_super_admin_override boolean DEFAULT false,
  p_override_justification text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_authorized boolean := false;
  v_is_super_admin boolean := false;
  v_now timestamptz := now();
  v_pending_cost_count int := 0;
  v_unreconciled_advances int := 0;
  v_pending_withdrawals int := 0;
  v_cycle_month int;
  v_cycle_year int;
  v_start_date date;
  v_end_date date;
  v_already_closed timestamptz;
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

  -- Immutability guard: reject if cycle is already closed (cycle_closed_at IS NOT NULL)
  -- Prevents overwriting immutable close metadata/timestamp.
  -- Only a dedicated Super Admin reopen flow (not this function) may clear the closed state.
  SELECT cycle_closed_at INTO v_already_closed
  FROM public.mmp_files
  WHERE id = p_mmp_id;

  IF v_already_closed IS NOT NULL THEN
    RAISE EXCEPTION 'Cycle is already closed (closed at %). Use reopen flow to reopen.', v_already_closed;
  END IF;

  -- Get cycle month/year for scoped finance check
  SELECT month, year INTO v_cycle_month, v_cycle_year
  FROM public.mmp_files
  WHERE id = p_mmp_id;

  IF NOT p_super_admin_override THEN
    -- Gate 1: pending cost submissions scoped to cycle month/year
    IF v_cycle_month IS NOT NULL AND v_cycle_year IS NOT NULL THEN
      v_start_date := make_date(v_cycle_year, v_cycle_month, 1);
      v_end_date := (v_start_date + interval '1 month - 1 day')::date;
      SELECT COUNT(*) INTO v_pending_cost_count
      FROM public.operational_cost_submissions
      WHERE (tier1_status = 'pending' OR tier2_status = 'pending')
        AND expense_date >= v_start_date
        AND expense_date <= v_end_date;
    ELSE
      SELECT COUNT(*) INTO v_pending_cost_count
      FROM public.operational_cost_submissions
      WHERE tier1_status = 'pending' OR tier2_status = 'pending';
    END IF;

    IF v_pending_cost_count > 0 THEN
      RAISE EXCEPTION 'Finance gate: % pending cost submission(s) for this cycle must be resolved before close.', v_pending_cost_count;
    END IF;

    -- Gate 2: unreconciled transport advances for this cycle (down_payment_requests)
    BEGIN
      SELECT COUNT(*) INTO v_unreconciled_advances
      FROM public.down_payment_requests
      WHERE mmp_id = p_mmp_id
        AND status IN ('approved', 'paid')
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
      RAISE EXCEPTION 'Finance gate: % unreconciled transport advance(s) must be reconciled before cycle close.', v_unreconciled_advances;
    END IF;

    -- Gate 3: pending withdrawal requests for this cycle
    -- COALESCE handles NULL status: NULL is treated as pending (unresolved).
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
    -- Super Admin override: must be SA with non-empty justification
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
END;
$$;
GRANT EXECUTE ON FUNCTION public.cycle_approve_close(uuid, jsonb, boolean, text) TO authenticated;
