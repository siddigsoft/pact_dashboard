-- ============================================================
-- PACT Command Center — Survey Module
-- Run this in your Supabase SQL editor
-- ============================================================

-- 1. surveys — survey definitions
CREATE TABLE IF NOT EXISTS surveys (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT        NOT NULL,
  description   TEXT,
  status        TEXT        NOT NULL DEFAULT 'draft', -- draft | active | closed
  created_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settings      JSONB       NOT NULL DEFAULT '{}'::jsonb
  -- settings keys: allow_anonymous (bool), show_progress (bool), one_per_user (bool)
);

-- 2. survey_questions — questions within a survey
CREATE TABLE IF NOT EXISTS survey_questions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id     UUID        NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  type          TEXT        NOT NULL,
  -- types: text | textarea | radio | checkbox | rating | scale | date | dropdown | section_header
  label         TEXT        NOT NULL,
  description   TEXT,
  required      BOOLEAN     NOT NULL DEFAULT false,
  options       JSONB,      -- string[] for radio/checkbox/dropdown
  order_index   INT         NOT NULL DEFAULT 0,
  settings      JSONB       NOT NULL DEFAULT '{}'::jsonb
  -- settings keys: min (scale), max (scale), placeholder (text/textarea)
);

-- 3. survey_responses — one row per submission
CREATE TABLE IF NOT EXISTS survey_responses (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id         UUID        NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  respondent_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  respondent_name   TEXT,
  respondent_email  TEXT,
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. survey_answers — individual question answers
CREATE TABLE IF NOT EXISTS survey_answers (
  id            UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id   UUID  NOT NULL REFERENCES survey_responses(id) ON DELETE CASCADE,
  question_id   UUID  NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
  answer_text   TEXT,   -- text / textarea / radio / dropdown
  answer_json   JSONB   -- checkbox [] / rating number / scale number / date string
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_survey_questions_survey ON survey_questions(survey_id, order_index);
CREATE INDEX IF NOT EXISTS idx_survey_responses_survey ON survey_responses(survey_id);
CREATE INDEX IF NOT EXISTS idx_survey_answers_response  ON survey_answers(response_id);
CREATE INDEX IF NOT EXISTS idx_survey_answers_question  ON survey_answers(question_id);

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE surveys         ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_answers   ENABLE ROW LEVEL SECURITY;

-- Surveys: admins / managers can do anything; everyone can read active surveys
CREATE POLICY "surveys_admin_all" ON surveys FOR ALL TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin','admin','hub_manager','fom','sr_program_officer','country_director')
    )
  )
  WITH CHECK (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin','admin','hub_manager','fom','sr_program_officer','country_director')
    )
  );

CREATE POLICY "surveys_active_read" ON surveys FOR SELECT TO authenticated
  USING (status = 'active');

-- Survey questions: readable if survey is readable, writable if survey is writable
CREATE POLICY "survey_questions_all" ON survey_questions FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM surveys s WHERE s.id = survey_id
        AND (
          s.status = 'active'
          OR s.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
              AND role IN ('super_admin','admin','hub_manager','fom','sr_program_officer','country_director')
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM surveys s WHERE s.id = survey_id
        AND (
          s.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
              AND role IN ('super_admin','admin','hub_manager','fom','sr_program_officer','country_director')
          )
        )
    )
  );

-- Responses: authenticated users can submit to active surveys; admins can view all
CREATE POLICY "survey_responses_insert" ON survey_responses FOR INSERT TO authenticated
  WITH CHECK (
    respondent_id = auth.uid()
    AND EXISTS (SELECT 1 FROM surveys s WHERE s.id = survey_id AND s.status = 'active')
  );

CREATE POLICY "survey_responses_select" ON survey_responses FOR SELECT TO authenticated
  USING (
    respondent_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin','admin','hub_manager','fom','sr_program_officer','country_director')
    )
  );

-- Answers: can insert own; admins can read all
CREATE POLICY "survey_answers_insert" ON survey_answers FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM survey_responses r
      WHERE r.id = response_id AND r.respondent_id = auth.uid()
    )
  );

CREATE POLICY "survey_answers_select" ON survey_answers FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM survey_responses r WHERE r.id = response_id
        AND (
          r.respondent_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
              AND role IN ('super_admin','admin','hub_manager','fom','sr_program_officer','country_director')
          )
        )
    )
  );
