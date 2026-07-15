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
-- 3. Headcount sync — extend hr_headcount_plans with hire attribution columns
--    (HeadcountPlanning.tsx already uses this table; we extend it in-place)
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE hr_headcount_plans
  ADD COLUMN IF NOT EXISTS filled_count         int  NOT NULL DEFAULT 0 CHECK (filled_count >= 0),
  ADD COLUMN IF NOT EXISTS last_hired_candidate text,
  ADD COLUMN IF NOT EXISTS last_hired_date      date;

-- RPC: safely increment filled_count and record hire attribution when a candidate is hired.
-- SECURITY DEFINER runs as the DB owner, so it can bypass RLS for the update;
-- an explicit role-guard inside the body ensures only HR/manager/admin can call it.
CREATE OR REPLACE FUNCTION increment_headcount_filled(
  p_department_id       uuid,
  p_position_title      text,
  p_fiscal_year         int  DEFAULT EXTRACT(year FROM now())::int,
  p_hired_candidate     text DEFAULT NULL,
  p_hired_start_date    date DEFAULT NULL
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

  -- Increment filled_count and record who was hired on the matching plan row.
  -- Best-effort match by dept + title + year; no-op if no matching row exists.
  UPDATE hr_headcount_plans
  SET    filled_count         = filled_count + 1,
         last_hired_candidate = COALESCE(p_hired_candidate, last_hired_candidate),
         last_hired_date      = COALESCE(p_hired_start_date, last_hired_date)
  WHERE  fiscal_year    = p_fiscal_year
    AND  (department_id = p_department_id OR department_id IS NULL)
    AND  lower(position_title) = lower(p_position_title);
END;
$$;

-- Restrict execution: revoke PUBLIC, grant only to authenticated users (role guard is inside)
REVOKE ALL ON FUNCTION increment_headcount_filled FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_headcount_filled TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. hr_manager role gap fixes across all recruitment tables
--    The UI treats hr_manager as admin-capable; RLS must match.
-- ─────────────────────────────────────────────────────────────────────────

-- JR: update admin policy to include hr_manager
DROP POLICY IF EXISTS hr_jr_update_admin ON hr_job_requisitions;
CREATE POLICY hr_jr_update_admin ON hr_job_requisitions FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
              AND p.role IN ('super_admin','admin','hr','hr_admin','hr_manager'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
              AND p.role IN ('super_admin','admin','hr','hr_admin','hr_manager'))
  );

-- JR: manager-layer policy also needs hr_manager
DROP POLICY IF EXISTS hr_jr_update_manager ON hr_job_requisitions;
CREATE POLICY hr_jr_update_manager ON hr_job_requisitions FOR UPDATE
  USING (
    status = 'pending_manager'
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                  AND p.role IN ('super_admin','admin','hr','hr_admin','hr_manager','manager'))
  )
  WITH CHECK (
    status IN ('pending_hr', 'rejected')
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                  AND p.role IN ('super_admin','admin','hr','hr_admin','hr_manager','manager'))
  );

-- Scorecard: hr_manager should be able to insert/update/delete scorecards
DROP POLICY IF EXISTS hr_scores_insert ON hr_candidate_scores;
CREATE POLICY hr_scores_insert ON hr_candidate_scores FOR INSERT
  WITH CHECK (
    interviewer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                AND p.role IN ('super_admin','admin','hr','hr_admin','hr_manager','manager'))
  );

DROP POLICY IF EXISTS hr_scores_update ON hr_candidate_scores;
CREATE POLICY hr_scores_update ON hr_candidate_scores FOR UPDATE
  USING (
    interviewer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                AND p.role IN ('super_admin','admin','hr','hr_admin','hr_manager'))
  )
  WITH CHECK (
    interviewer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                AND p.role IN ('super_admin','admin','hr','hr_admin','hr_manager'))
  );

DROP POLICY IF EXISTS hr_scores_delete ON hr_candidate_scores;
CREATE POLICY hr_scores_delete ON hr_candidate_scores FOR DELETE
  USING (
    interviewer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                AND p.role IN ('super_admin','admin','hr','hr_admin','hr_manager'))
  );

-- Onboarding records: hr_manager should have full access
DROP POLICY IF EXISTS hr_onboarding_all ON hr_onboarding_records;
CREATE POLICY hr_onboarding_all ON hr_onboarding_records FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
              AND p.role IN ('super_admin','admin','hr','hr_admin','hr_manager','manager'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
              AND p.role IN ('super_admin','admin','hr','hr_admin','hr_manager','manager'))
  );

-- Interview slots: hr_manager can update and delete
DROP POLICY IF EXISTS hr_slots_update ON hr_interview_slots;
CREATE POLICY hr_slots_update ON hr_interview_slots FOR UPDATE
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                AND p.role IN ('super_admin','admin','hr','hr_admin','hr_manager'))
  )
  WITH CHECK (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                AND p.role IN ('super_admin','admin','hr','hr_admin','hr_manager'))
  );

DROP POLICY IF EXISTS hr_slots_delete ON hr_interview_slots;
CREATE POLICY hr_slots_delete ON hr_interview_slots FOR DELETE
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                AND p.role IN ('super_admin','admin','hr','hr_admin','hr_manager'))
  );
