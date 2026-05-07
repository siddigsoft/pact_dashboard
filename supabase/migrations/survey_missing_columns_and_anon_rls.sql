-- ============================================================
-- Survey Module: Missing Columns + Anonymous-fill RLS Fixes
-- Apply in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- ── 1. surveys table ────────────────────────────────────────
ALTER TABLE surveys
  ADD COLUMN IF NOT EXISTS title_ar       TEXT,
  ADD COLUMN IF NOT EXISTS description_ar TEXT,
  ADD COLUMN IF NOT EXISTS form_version   INTEGER NOT NULL DEFAULT 1;

-- ── 2. survey_questions table ───────────────────────────────
ALTER TABLE survey_questions
  ADD COLUMN IF NOT EXISTS label_ar       TEXT,
  ADD COLUMN IF NOT EXISTS description_ar TEXT,
  ADD COLUMN IF NOT EXISTS options_ar     JSONB;

-- ── 3. survey_responses table ───────────────────────────────
ALTER TABLE survey_responses
  ADD COLUMN IF NOT EXISTS duration_seconds  INTEGER,
  ADD COLUMN IF NOT EXISTS form_version      INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS review_status     TEXT    NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS review_comment    TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by       UUID    REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at       TIMESTAMPTZ;

-- ── 4. RLS: allow anonymous users to read active surveys ────
-- (needed so public fill-link pages can load without a login)
DROP POLICY IF EXISTS "surveys_anon_read" ON surveys;
CREATE POLICY "surveys_anon_read" ON surveys
  FOR SELECT TO anon
  USING (status = 'active');

-- ── 5. RLS: allow anonymous users to read questions of active surveys ──
DROP POLICY IF EXISTS "survey_questions_anon_read" ON survey_questions;
CREATE POLICY "survey_questions_anon_read" ON survey_questions
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM surveys s
      WHERE s.id = survey_id AND s.status = 'active'
    )
  );

-- ── 6. RLS: fix survey_responses INSERT to allow anonymous submissions ──
-- Old policy required respondent_id = auth.uid() which fails when auth.uid()
-- is NULL (unauthenticated users). New policy also grants anon role access
-- and allows NULL respondent_id for public fill links.
DROP POLICY IF EXISTS "survey_responses_insert" ON survey_responses;
CREATE POLICY "survey_responses_insert" ON survey_responses
  FOR INSERT TO authenticated, anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM surveys s
      WHERE s.id = survey_id AND s.status = 'active'
    )
    AND (
      respondent_id IS NULL
      OR respondent_id = auth.uid()
    )
  );

-- ── 7. RLS: fix survey_answers INSERT to allow anonymous submissions ────
DROP POLICY IF EXISTS "survey_answers_insert" ON survey_answers;
CREATE POLICY "survey_answers_insert" ON survey_answers
  FOR INSERT TO authenticated, anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM survey_responses r
      WHERE r.id = response_id
        AND (r.respondent_id IS NULL OR r.respondent_id = auth.uid())
    )
  );

-- ── 8. Useful index for review workflow queries ──────────────
CREATE INDEX IF NOT EXISTS idx_survey_responses_review_status
  ON survey_responses (survey_id, review_status);
