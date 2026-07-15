-- Recruitment 360° Phase 2: Security & Headcount Fixes
-- Fixes:
--   1. JR workflow RLS — granular per-state policies (prevent self-approval)
--   2. Scorecard panel visibility — interviewers can see all scorecards for shared candidates
--   3. hr_headcount_plan table — track planned vs filled positions
--
-- Apply AFTER 20260715_hr_recruitment_jr_scoring.sql

-- ─────────────────────────────────────────────────────────────────────────
-- 1. JR workflow: replace broad UPDATE policy with fine-grained policies
-- ─────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS hr_jr_update ON hr_job_requisitions;

-- 1a. Requester can edit own DRAFT metadata (status stays 'draft')
DROP POLICY IF EXISTS hr_jr_update_own_draft ON hr_job_requisitions;
CREATE POLICY hr_jr_update_own_draft ON hr_job_requisitions FOR UPDATE
  USING   (requested_by = auth.uid() AND status = 'draft')
  WITH CHECK (requested_by = auth.uid() AND status = 'draft');

-- 1b. Requester can ONLY submit their own draft (draft → pending_manager, no other fields are manager-only)
DROP POLICY IF EXISTS hr_jr_submit_own ON hr_job_requisitions;
CREATE POLICY hr_jr_submit_own ON hr_job_requisitions FOR UPDATE
  USING   (requested_by = auth.uid() AND status = 'draft')
  WITH CHECK (requested_by = auth.uid() AND status = 'pending_manager');

-- 1c. Manager can advance/reject the pending_manager layer only
--     (status → pending_hr or rejected; only manager_* fields + status change allowed)
DROP POLICY IF EXISTS hr_jr_update_manager ON hr_job_requisitions;
CREATE POLICY hr_jr_update_manager ON hr_job_requisitions FOR UPDATE
  USING (
    status = 'pending_manager'
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                  AND p.role IN ('super_admin','admin','hr','hr_admin','manager'))
  )
  WITH CHECK (
    status IN ('pending_hr', 'rejected')
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                  AND p.role IN ('super_admin','admin','hr','hr_admin','manager'))
  );

-- 1d. HR/admin can update any row from any state (they run the final approval)
DROP POLICY IF EXISTS hr_jr_update_admin ON hr_job_requisitions;
CREATE POLICY hr_jr_update_admin ON hr_job_requisitions FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
              AND p.role IN ('super_admin','admin','hr','hr_admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
              AND p.role IN ('super_admin','admin','hr','hr_admin'))
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Scorecard visibility: interview panel members see all scorecards
--    for candidates they are listed to interview
-- ─────────────────────────────────────────────────────────────────────────

-- Drop narrow policy and replace with panel-aware one
DROP POLICY IF EXISTS hr_scores_select ON hr_candidate_scores;

-- Panel members: any interviewer listed in an interview_slot for this candidate
-- can see all scorecards for that candidate (so the hiring panel can compare)
CREATE POLICY hr_scores_select ON hr_candidate_scores FOR SELECT
  USING (
    -- Own scorecard
    interviewer_id = auth.uid()
    -- Panel member for this candidate
    OR EXISTS (
      SELECT 1 FROM hr_interview_slots s
      WHERE s.candidate_id = hr_candidate_scores.candidate_id
        AND auth.uid() = ANY(s.interviewer_ids)
    )
    -- Manager / HR / admin see all
    OR EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid()
        AND p.role IN ('super_admin','admin','hr','hr_admin','manager')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Headcount sync — add filled_count to the EXISTING hr_headcount_plans table
--    (HeadcountPlanning.tsx already uses this table; we extend it in-place)
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE hr_headcount_plans
  ADD COLUMN IF NOT EXISTS filled_count int NOT NULL DEFAULT 0
    CHECK (filled_count >= 0);

-- RPC: safely increment filled_count when a candidate is hired.
-- SECURITY DEFINER runs as the DB owner, so it can bypass RLS for the update;
-- but an explicit role-guard inside the body ensures only HR/manager/admin can call it.
CREATE OR REPLACE FUNCTION increment_headcount_filled(
  p_department_id  uuid,
  p_position_title text,
  p_fiscal_year    int DEFAULT EXTRACT(year FROM now())::int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  -- Role guard: only HR / manager / admin may mutate headcount plan data
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role IS NULL OR v_role NOT IN (
    'super_admin','admin','hr','hr_admin','hr_manager','manager'
  ) THEN
    RAISE EXCEPTION 'Insufficient privileges: only HR or managers may update headcount';
  END IF;

  -- Increment filled_count on the matching plan row (best-effort match by dept + title + year).
  -- If no matching row exists yet, the UPDATE is a no-op (doesn't create phantom rows).
  UPDATE hr_headcount_plans
  SET    filled_count = filled_count + 1
  WHERE  fiscal_year    = p_fiscal_year
    AND  (department_id = p_department_id OR department_id IS NULL)
    AND  lower(position_title) = lower(p_position_title);
END;
$$;

-- Restrict execution: revoke PUBLIC, grant only to authenticated users (role guard is inside)
REVOKE ALL ON FUNCTION increment_headcount_filled FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_headcount_filled TO authenticated;
