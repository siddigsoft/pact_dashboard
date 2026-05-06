-- Allow anonymous (public) access to fill active surveys
-- Run this in Supabase SQL Editor → New query → Run

-- 1. Anyone can read surveys that are active
CREATE POLICY IF NOT EXISTS "anon_read_active_surveys"
  ON surveys
  FOR SELECT
  TO anon
  USING (status = 'active');

-- 2. Anyone can read questions belonging to active surveys
CREATE POLICY IF NOT EXISTS "anon_read_questions_active_surveys"
  ON survey_questions
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM surveys
      WHERE surveys.id = survey_questions.survey_id
        AND surveys.status = 'active'
    )
  );

-- 3. Anyone can submit a response to an active survey
CREATE POLICY IF NOT EXISTS "anon_insert_survey_responses"
  ON survey_responses
  FOR INSERT
  TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM surveys
      WHERE surveys.id = survey_responses.survey_id
        AND surveys.status = 'active'
    )
  );

-- 4. Anyone can insert answers linked to a valid response
CREATE POLICY IF NOT EXISTS "anon_insert_survey_answers"
  ON survey_answers
  FOR INSERT
  TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM survey_responses
      WHERE survey_responses.id = survey_answers.response_id
    )
  );
