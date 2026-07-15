-- Recruitment 360°: Job Requisitions, Candidate Scoring & Interview Slots
-- Extends the existing hr_job_postings / hr_candidates tables from
-- 20260705_hr_recruitment_disciplinary_benefits_headcount.sql
--
-- Apply manually in the Supabase SQL editor for the PACT production project.
-- Safe to re-run: every statement is guarded with IF NOT EXISTS / DO blocks.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Job Requisitions  (formal JR approval before a posting opens)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_job_requisitions (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title                 text        NOT NULL,
  department_id         uuid        REFERENCES departments(id)  ON DELETE SET NULL,
  hub_id                uuid        REFERENCES hubs(id)         ON DELETE SET NULL,
  headcount             int         NOT NULL DEFAULT 1,
  justification         text,
  salary_band           text,                    -- free-text band, e.g. "Grade 5 — SDG 80 000–110 000"
  target_start_date     date,
  status                text        NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','pending_manager','pending_hr','approved','rejected')),
  requested_by          uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  -- Manager approval layer
  manager_approved_at   timestamptz,
  manager_approved_by   uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  manager_rejection_note text,
  -- HR approval layer
  hr_approved_at        timestamptz,
  hr_approved_by        uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  hr_rejection_note     text,
  -- Links to the job posting auto-created on HR approval
  linked_posting_id     uuid        REFERENCES hr_job_postings(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_jr_status    ON hr_job_requisitions(status);
CREATE INDEX IF NOT EXISTS idx_hr_jr_dept      ON hr_job_requisitions(department_id);
CREATE INDEX IF NOT EXISTS idx_hr_jr_requested ON hr_job_requisitions(requested_by);

ALTER TABLE hr_job_requisitions ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can submit a JR (requesters include managers, officers)
DROP POLICY IF EXISTS hr_jr_select ON hr_job_requisitions;
CREATE POLICY hr_jr_select ON hr_job_requisitions FOR SELECT
  USING (auth.role() = 'authenticated');

-- Create: any authenticated user can raise a requisition
DROP POLICY IF EXISTS hr_jr_insert ON hr_job_requisitions;
CREATE POLICY hr_jr_insert ON hr_job_requisitions FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Update/delete: HR/admin always; requester can edit own draft; manager can approve their layer
DROP POLICY IF EXISTS hr_jr_update ON hr_job_requisitions;
CREATE POLICY hr_jr_update ON hr_job_requisitions FOR UPDATE
  USING (
    requested_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                AND p.role IN ('super_admin','admin','hr','hr_admin','manager'))
  )
  WITH CHECK (
    requested_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                AND p.role IN ('super_admin','admin','hr','hr_admin','manager'))
  );

DROP POLICY IF EXISTS hr_jr_delete ON hr_job_requisitions;
CREATE POLICY hr_jr_delete ON hr_job_requisitions FOR DELETE
  USING (
    (requested_by = auth.uid() AND status = 'draft')
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                AND p.role IN ('super_admin','admin','hr','hr_admin'))
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Add requisition_id back-reference to job postings
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE hr_job_postings
  ADD COLUMN IF NOT EXISTS requisition_id uuid REFERENCES hr_job_requisitions(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Extend hr_candidates with offer & onboarding fields
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE hr_candidates
  ADD COLUMN IF NOT EXISTS salary_offer       numeric(14,2),
  ADD COLUMN IF NOT EXISTS offer_currency     text DEFAULT 'SDG',
  ADD COLUMN IF NOT EXISTS offer_start_date   date,
  ADD COLUMN IF NOT EXISTS offer_sent_at      timestamptz,
  ADD COLUMN IF NOT EXISTS linked_profile_id  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS onboarding_noted   boolean NOT NULL DEFAULT false;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Candidate Scores  (one scorecard per interviewer per candidate)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_candidate_scores (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id   uuid        NOT NULL REFERENCES hr_candidates(id) ON DELETE CASCADE,
  interviewer_id uuid        NOT NULL REFERENCES profiles(id)      ON DELETE CASCADE,
  rubric_scores  jsonb       NOT NULL DEFAULT '{}',  -- { "technical": 4, "communication": 3, ... }
  overall_score  numeric(4,2),                       -- auto-calculated average of rubric_scores
  notes          text,
  submitted_at   timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, interviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_hr_scores_candidate ON hr_candidate_scores(candidate_id);
CREATE INDEX IF NOT EXISTS idx_hr_scores_interviewer ON hr_candidate_scores(interviewer_id);

ALTER TABLE hr_candidate_scores ENABLE ROW LEVEL SECURITY;

-- HR/admin see all; interviewers see their own and the candidate's aggregate
DROP POLICY IF EXISTS hr_scores_select ON hr_candidate_scores;
CREATE POLICY hr_scores_select ON hr_candidate_scores FOR SELECT
  USING (
    interviewer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                AND p.role IN ('super_admin','admin','hr','hr_admin','manager'))
  );

DROP POLICY IF EXISTS hr_scores_insert ON hr_candidate_scores;
CREATE POLICY hr_scores_insert ON hr_candidate_scores FOR INSERT
  WITH CHECK (
    interviewer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                AND p.role IN ('super_admin','admin','hr','hr_admin'))
  );

DROP POLICY IF EXISTS hr_scores_update ON hr_candidate_scores;
CREATE POLICY hr_scores_update ON hr_candidate_scores FOR UPDATE
  USING (
    interviewer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                AND p.role IN ('super_admin','admin','hr','hr_admin'))
  )
  WITH CHECK (
    interviewer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                AND p.role IN ('super_admin','admin','hr','hr_admin'))
  );

DROP POLICY IF EXISTS hr_scores_delete ON hr_candidate_scores;
CREATE POLICY hr_scores_delete ON hr_candidate_scores FOR DELETE
  USING (
    interviewer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                AND p.role IN ('super_admin','admin','hr','hr_admin'))
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Interview Slots  (one row per scheduled interview session)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_interview_slots (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id     uuid        NOT NULL REFERENCES hr_candidates(id) ON DELETE CASCADE,
  interviewer_ids  uuid[]      NOT NULL DEFAULT '{}',
  scheduled_at     timestamptz NOT NULL,
  duration_minutes int         NOT NULL DEFAULT 60,
  interview_type   text        NOT NULL DEFAULT 'video'
    CHECK (interview_type IN ('in_person','video','phone')),
  location         text,
  meeting_link     text,
  notes            text,
  created_by       uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_slots_candidate ON hr_interview_slots(candidate_id);
CREATE INDEX IF NOT EXISTS idx_hr_slots_scheduled ON hr_interview_slots(scheduled_at);

ALTER TABLE hr_interview_slots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_slots_select ON hr_interview_slots;
CREATE POLICY hr_slots_select ON hr_interview_slots FOR SELECT
  USING (
    auth.uid() = ANY(interviewer_ids)
    OR created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                AND p.role IN ('super_admin','admin','hr','hr_admin','manager'))
  );

DROP POLICY IF EXISTS hr_slots_insert ON hr_interview_slots;
CREATE POLICY hr_slots_insert ON hr_interview_slots FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
              AND p.role IN ('super_admin','admin','hr','hr_admin','manager'))
  );

DROP POLICY IF EXISTS hr_slots_update ON hr_interview_slots;
CREATE POLICY hr_slots_update ON hr_interview_slots FOR UPDATE
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                AND p.role IN ('super_admin','admin','hr','hr_admin'))
  )
  WITH CHECK (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                AND p.role IN ('super_admin','admin','hr','hr_admin'))
  );

DROP POLICY IF EXISTS hr_slots_delete ON hr_interview_slots;
CREATE POLICY hr_slots_delete ON hr_interview_slots FOR DELETE
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                AND p.role IN ('super_admin','admin','hr','hr_admin'))
  );
