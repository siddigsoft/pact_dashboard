-- Add group_id to survey_questions for Group/Repeat question nesting
-- group_id references the parent begin_group question in the same table

ALTER TABLE survey_questions
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES survey_questions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_survey_questions_group_id ON survey_questions(group_id);
