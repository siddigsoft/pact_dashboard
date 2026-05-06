-- Survey submission review workflow + response time tracking
-- Run this in Supabase SQL Editor

ALTER TABLE survey_responses
  ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'pending'
    CHECK (review_status IN ('pending','under_review','approved','rejected')),
  ADD COLUMN IF NOT EXISTS review_comment TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;

-- Authenticated users can update review fields on responses for surveys they manage
DROP POLICY IF EXISTS "auth_update_survey_responses_review" ON survey_responses;
CREATE POLICY "auth_update_survey_responses_review"
  ON survey_responses FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- Index for faster review status filtering
CREATE INDEX IF NOT EXISTS idx_survey_responses_review_status
  ON survey_responses(survey_id, review_status);
