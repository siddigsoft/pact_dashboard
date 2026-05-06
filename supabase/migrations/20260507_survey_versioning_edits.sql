-- Survey form versioning
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS form_version integer NOT NULL DEFAULT 1;
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS form_version integer;

-- Submission answer edit audit trail
CREATE TABLE IF NOT EXISTS survey_answer_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL REFERENCES survey_responses(id) ON DELETE CASCADE,
  question_id uuid NOT NULL,
  old_answer_text text,
  old_answer_json jsonb,
  new_answer_text text,
  new_answer_json jsonb,
  edited_by uuid,
  edited_at timestamptz NOT NULL DEFAULT now(),
  edit_note text
);
CREATE INDEX IF NOT EXISTS idx_survey_answer_edits_response ON survey_answer_edits(response_id);

-- RLS
ALTER TABLE survey_answer_edits ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "survey_answer_edits_authenticated"
  ON survey_answer_edits FOR ALL TO authenticated USING (true) WITH CHECK (true);
