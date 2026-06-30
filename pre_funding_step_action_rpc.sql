-- ============================================================================
-- Pre-Funding: process_pf_step_action — SECURITY DEFINER RPC
-- Fixes: non-finance step assignees cannot directly UPDATE pre_fund_requests
-- Run in Supabase SQL Editor (safe to re-run: CREATE OR REPLACE)
-- ============================================================================
--
-- This function is called by ApprovalsHub.tsx instead of direct table mutations.
-- It runs as the postgres superuser (SECURITY DEFINER) so it can update
-- pre_fund_requests regardless of the caller's role, while still enforcing
-- authorization internally.
--
-- Parameters:
--   p_step_id  UUID        — the pre_fund_approval_steps row being acted on
--   p_action   TEXT        — 'approve' | 'reject'
--   p_notes    TEXT        — optional comment
--
-- Returns JSON:
--   { step_resolved BOOL, new_fund_status TEXT, is_optional_step BOOL, error TEXT }
--   On authorization failure:  { error: "unauthorized" }
--   On step-not-found:         { error: "step_not_found" }
-- ============================================================================

CREATE OR REPLACE FUNCTION process_pf_step_action(
  p_step_id  UUID,
  p_action   TEXT,   -- 'approve' | 'reject'
  p_notes    TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id        UUID := auth.uid();
  v_step             RECORD;
  v_fund_id          UUID;
  v_is_admin         BOOLEAN;
  v_assigned_ids     UUID[];
  v_is_assignee      BOOLEAN;
  v_approval_count   INT;
  v_any_rejected     BOOLEAN;
  v_quorum_required  INT;
  v_step_resolved    BOOLEAN := FALSE;
  v_new_step_status  TEXT;
  v_remaining_req    INT;
  v_new_fund_status  TEXT := NULL;
  v_fund_update      RECORD;
  v_now              TIMESTAMPTZ := now();
BEGIN

  -- ── 1. Load step ────────────────────────────────────────────────────────
  SELECT id, pre_fund_request_id, step_order, is_required,
         status, assigned_user_id, assigned_user_ids, required_approvals
  INTO v_step
  FROM pre_fund_approval_steps
  WHERE id = p_step_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'step_not_found');
  END IF;

  v_fund_id := v_step.pre_fund_request_id;

  -- ── 2. Authorization check ────────────────────────────────────────────
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = v_caller_id
      AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin')
  ) INTO v_is_admin;

  -- Build effective assignee list (multi-user array takes precedence)
  v_assigned_ids := CASE
    WHEN array_length(v_step.assigned_user_ids, 1) > 0
      THEN v_step.assigned_user_ids
    WHEN v_step.assigned_user_id IS NOT NULL
      THEN ARRAY[v_step.assigned_user_id]
    ELSE ARRAY[]::UUID[]
  END;

  v_is_assignee := (v_caller_id = ANY(v_assigned_ids));

  -- Only assigned users and admins may act
  IF array_length(v_assigned_ids, 1) > 0
     AND NOT v_is_assignee
     AND NOT v_is_admin THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  -- Guard: step must still be pending
  IF v_step.status <> 'pending' THEN
    RETURN jsonb_build_object('error', 'step_already_resolved');
  END IF;

  -- ── 3. Upsert vote ────────────────────────────────────────────────────
  INSERT INTO pre_fund_step_approvals (step_id, user_id, action, notes, created_at)
  VALUES (p_step_id, v_caller_id,
          CASE WHEN p_action = 'approve' THEN 'approved' ELSE 'rejected' END,
          p_notes, v_now)
  ON CONFLICT (step_id, user_id) DO UPDATE
    SET action     = EXCLUDED.action,
        notes      = EXCLUDED.notes,
        created_at = EXCLUDED.created_at;

  -- ── 4. Tally votes (authoritative DB read) ────────────────────────────
  SELECT
    COUNT(*) FILTER (WHERE action = 'approved'),
    BOOL_OR(action = 'rejected')
  INTO v_approval_count, v_any_rejected
  FROM pre_fund_step_approvals
  WHERE step_id = p_step_id;

  v_quorum_required := COALESCE(v_step.required_approvals, 1);

  -- Step resolves when: quorum of approvals reached, OR any rejection occurs
  v_step_resolved := (p_action = 'approve' AND v_approval_count >= v_quorum_required)
                  OR (p_action = 'reject'  AND v_any_rejected);

  -- ── 5. Mark step resolved (if threshold met) ─────────────────────────
  IF v_step_resolved THEN
    v_new_step_status := CASE
      WHEN p_action = 'approve' AND v_approval_count >= v_quorum_required THEN 'approved'
      ELSE 'rejected'
    END;

    UPDATE pre_fund_approval_steps
    SET status      = v_new_step_status,
        approved_by = v_caller_id,
        approved_at = v_now,
        notes       = p_notes
    WHERE id = p_step_id;
  END IF;

  -- ── 6. Compute new fund-level status ──────────────────────────────────
  IF p_action = 'reject' AND v_step.is_required THEN
    -- Required step rejected → whole fund rejected immediately
    v_new_fund_status := 'rejected';

  ELSIF v_step_resolved THEN
    -- Re-query authoritative step states after this step was resolved
    SELECT COUNT(*)
    INTO v_remaining_req
    FROM pre_fund_approval_steps
    WHERE pre_fund_request_id = v_fund_id
      AND status = 'pending'
      AND is_required = TRUE;

    IF v_remaining_req = 0 THEN
      -- All required steps cleared
      v_new_fund_status := 'awaiting_receipt';
    END IF;
    -- else: more required steps still pending → leave fund status as-is
  END IF;
  -- If step not yet resolved (quorum not met): no fund-status change

  -- ── 7. Update pre_fund_requests (SECURITY DEFINER bypasses assignee RLS) ─
  IF p_action = 'approve' THEN
    UPDATE pre_fund_requests
    SET approved_by    = v_caller_id,
        approved_at    = v_now,
        rejection_reason = NULL,
        status         = COALESCE(v_new_fund_status, status),
        updated_at     = v_now
    WHERE id = v_fund_id;
  ELSE
    -- reject: only stamp rejection_reason when it's a required-step rejection
    UPDATE pre_fund_requests
    SET approved_by    = NULL,
        approved_at    = NULL,
        rejection_reason = CASE WHEN v_step.is_required
                            THEN COALESCE(p_notes, 'Rejected via Approvals Hub')
                            ELSE rejection_reason END,
        status         = COALESCE(v_new_fund_status, status),
        updated_at     = v_now
    WHERE id = v_fund_id;
  END IF;

  -- ── 8. Return result for client-side toast logic ───────────────────────
  RETURN jsonb_build_object(
    'step_resolved',    v_step_resolved,
    'new_fund_status',  v_new_fund_status,   -- null if no fund-level change
    'is_optional_step', NOT v_step.is_required,
    'error',            NULL
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

-- Grant execute to authenticated users (RLS enforced inside the function)
GRANT EXECUTE ON FUNCTION process_pf_step_action(UUID, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- Notes:
--   • SECURITY DEFINER runs as the function owner (postgres), so it can
--     UPDATE pre_fund_requests even when the caller is a non-finance assignee.
--   • Authorization is enforced at line "Only assigned users and admins may act".
--   • The function returns { error: 'unauthorized' } rather than raising an
--     exception so ApprovalsHub can surface a user-friendly message.
--   • Re-running this file is safe (CREATE OR REPLACE).
-- ============================================================================
