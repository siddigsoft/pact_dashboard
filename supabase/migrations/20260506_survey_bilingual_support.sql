-- Add bilingual (Arabic/English) support to survey tables
-- Adds nullable Arabic columns; English columns remain the source-of-truth fallback.

ALTER TABLE public.surveys
  ADD COLUMN IF NOT EXISTS title_ar       TEXT,
  ADD COLUMN IF NOT EXISTS description_ar TEXT;

ALTER TABLE public.survey_questions
  ADD COLUMN IF NOT EXISTS label_ar       TEXT,
  ADD COLUMN IF NOT EXISTS description_ar TEXT,
  ADD COLUMN IF NOT EXISTS options_ar     TEXT[];

COMMENT ON COLUMN public.surveys.title_ar       IS 'Arabic translation of the survey title';
COMMENT ON COLUMN public.surveys.description_ar IS 'Arabic translation of the survey description';
COMMENT ON COLUMN public.survey_questions.label_ar       IS 'Arabic translation of the question label';
COMMENT ON COLUMN public.survey_questions.description_ar IS 'Arabic translation of the question helper text';
COMMENT ON COLUMN public.survey_questions.options_ar     IS 'Arabic translations of answer options (1-to-1 with options array)';
