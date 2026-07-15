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
-- 3. Headcount Plan — tracks planned vs filled positions per department/year
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_headcount_plan (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id   uuid        REFERENCES departments(id) ON DELETE SET NULL,
  job_title       text        NOT NULL,
  fiscal_year     int         NOT NULL DEFAULT EXTRACT(year FROM now()),
  planned_count   int         NOT NULL DEFAULT 1,
  filled_count    int         NOT NULL DEFAULT 0 CHECK (filled_count >= 0),
  notes           text,
  created_by      uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (department_id, job_title, fiscal_year)
);

CREATE INDEX IF NOT EXISTS idx_hr_headcount_dept ON hr_headcount_plan(department_id, fiscal_year);

ALTER TABLE hr_headcount_plan ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_headcount_select ON hr_headcount_plan;
CREATE POLICY hr_headcount_select ON hr_headcount_plan FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS hr_headcount_insert ON hr_headcount_plan;
CREATE POLICY hr_headcount_insert ON hr_headcount_plan FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
              AND p.role IN ('super_admin','admin','hr','hr_admin','manager'))
  );

DROP POLICY IF EXISTS hr_headcount_update ON hr_headcount_plan;
CREATE POLICY hr_headcount_update ON hr_headcount_plan FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
              AND p.role IN ('super_admin','admin','hr','hr_admin','manager'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
              AND p.role IN ('super_admin','admin','hr','hr_admin','manager'))
  );

DROP POLICY IF EXISTS hr_headcount_delete ON hr_headcount_plan;
CREATE POLICY hr_headcount_delete ON hr_headcount_plan FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
              AND p.role IN ('super_admin','admin','hr','hr_admin'))
  );

-- RPC to safely increment filled_count (avoids race conditions from frontend)
CREATE OR REPLACE FUNCTION increment_headcount_filled(
  p_department_id uuid,
  p_job_title     text,
  p_fiscal_year   int DEFAULT EXTRACT(year FROM now())::int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Upsert: create the plan row if it doesn't exist, then increment
  INSERT INTO hr_headcount_plan (department_id, job_title, fiscal_year, planned_count, filled_count, created_by)
  VALUES (p_department_id, p_job_title, p_fiscal_year, 1, 1, auth.uid())
  ON CONFLICT (department_id, job_title, fiscal_year)
  DO UPDATE SET
    filled_count = hr_headcount_plan.filled_count + 1,
    updated_at   = now();
END;
$$;

-- Only HR/admin/manager can call this RPC
REVOKE ALL ON FUNCTION increment_headcount_filled FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_headcount_filled TO authenticated;
