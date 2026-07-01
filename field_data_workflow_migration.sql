-- ============================================================================
-- Field Data Hub — Phase 12: Workflow & Review
-- Run in Supabase SQL Editor (safe to re-run: uses IF NOT EXISTS)
-- ============================================================================

-- ─── 1. Submission Reviews ────────────────────────────────────────────────────
-- One record per submission entering a review pipeline.
CREATE TABLE IF NOT EXISTS fd_submission_reviews (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id          UUID NOT NULL,         -- REFERENCES field_data_forms(id) ON DELETE CASCADE
  submission_id    UUID,                  -- REFERENCES field_data_submissions(id) ON DELETE SET NULL
  submission_ref   TEXT,                  -- human-readable ref (UUID text, sequence #, etc.)
  submitter_name   TEXT,
  stage            TEXT NOT NULL DEFAULT 'Data Review',
                   -- e.g. 'Data Review', 'Field Supervisor', 'M&E Officer', 'Director Sign-off'
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN (
                     'pending','under_review','approved','rejected',
                     'correction_requested','resubmitted'
                   )),
  reviewer_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_name    TEXT,
  notes            TEXT,
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at      TIMESTAMPTZ,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Guard: add status if table already existed without it
ALTER TABLE fd_submission_reviews ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_fd_reviews_form     ON fd_submission_reviews(form_id);
CREATE INDEX IF NOT EXISTS idx_fd_reviews_status   ON fd_submission_reviews(status);
CREATE INDEX IF NOT EXISTS idx_fd_reviews_reviewer ON fd_submission_reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_fd_reviews_sub      ON fd_submission_reviews(submission_id);

-- ─── 2. Review Actions (audit trail) ─────────────────────────────────────────
-- Every approve / reject / correction-request / sign / comment is recorded here.
CREATE TABLE IF NOT EXISTS fd_review_actions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id       UUID NOT NULL REFERENCES fd_submission_reviews(id) ON DELETE CASCADE,
  action_type     TEXT NOT NULL
                  CHECK (action_type IN (
                    'approve','reject','request_correction','sign','comment','resubmit'
                  )),
  actor_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name      TEXT,
  notes           TEXT,
  signature_text  TEXT,     -- free-text attestation for 'sign' actions
  performed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fd_actions_review ON fd_review_actions(review_id);
CREATE INDEX IF NOT EXISTS idx_fd_actions_type   ON fd_review_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_fd_actions_time   ON fd_review_actions(performed_at DESC);

-- ─── 3. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE fd_submission_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_review_actions     ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "fd_reviews_access" ON fd_submission_reviews;
  DROP POLICY IF EXISTS "fd_review_actions_access" ON fd_review_actions;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- Reviewers and finance/admin/data team can see and act on reviews
DROP POLICY IF EXISTS "fd_reviews_access" ON fd_submission_reviews;
CREATE POLICY "fd_reviews_access" ON fd_submission_reviews FOR ALL
  USING (
    reviewer_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND LOWER(role) IN (
        'super_admin','superadmin','admin','financialadmin','financial_admin',
        'ict','fom','data_team','projectmanager','project_manager',
        'countrydirector','country_director'
      )
    )
  );

-- Action audit log: reviewer + admins can read; only reviewer/admin can insert
DROP POLICY IF EXISTS "fd_review_actions_access" ON fd_review_actions;
CREATE POLICY "fd_review_actions_access" ON fd_review_actions FOR ALL
  USING (
    actor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND LOWER(role) IN (
        'super_admin','superadmin','admin','financialadmin','financial_admin',
        'ict','fom','data_team','projectmanager','project_manager',
        'countrydirector','country_director'
      )
    )
  );

NOTIFY pgrst, 'reload schema';

-- ─── 4. Bulk-import existing submissions into review queue ────────────────────
-- Run this to push all un-reviewed submissions from a specific form into the queue.
-- Adjust status filter and form_id as needed.
/*
INSERT INTO fd_submission_reviews (form_id, submission_id, submission_ref, status, submitted_at)
SELECT
  s.form_id,
  s.id,
  s.id::TEXT,
  'pending',
  COALESCE(s.submitted_at, s.created_at)
FROM field_data_submissions s
WHERE s.form_id = '<your-form-id>'
  AND NOT EXISTS (
    SELECT 1 FROM fd_submission_reviews r WHERE r.submission_id = s.id
  )
ON CONFLICT DO NOTHING;
*/

-- ─── 5. Useful stats view ─────────────────────────────────────────────────────
CREATE OR REPLACE VIEW fd_review_stats AS
SELECT
  form_id,
  COUNT(*)                                              AS total,
  COUNT(*) FILTER (WHERE status = 'pending')            AS pending,
  COUNT(*) FILTER (WHERE status = 'under_review')       AS under_review,
  COUNT(*) FILTER (WHERE status = 'approved')           AS approved,
  COUNT(*) FILTER (WHERE status = 'rejected')           AS rejected,
  COUNT(*) FILTER (WHERE status = 'correction_requested') AS correction_requested,
  COUNT(*) FILTER (WHERE status = 'resubmitted')        AS resubmitted
FROM fd_submission_reviews
GROUP BY form_id;

-- ============================================================================
-- Migration complete. Open /field-data/workflow in the app.
-- ============================================================================
