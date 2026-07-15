-- Task #83 addendum: extra metadata columns for hr_policies
-- Safe to re-run (IF NOT EXISTS / DO blocks).
-- Apply manually in the Supabase SQL editor.

ALTER TABLE hr_policies
  ADD COLUMN IF NOT EXISTS description  text,           -- short summary shown on policy cards
  ADD COLUMN IF NOT EXISTS review_date  date,           -- next scheduled review date
  ADD COLUMN IF NOT EXISTS owner        text;           -- responsible person or role (free text)

COMMENT ON COLUMN hr_policies.description IS 'Short 1-2 sentence summary of the policy for display on cards';
COMMENT ON COLUMN hr_policies.review_date  IS 'Date when the policy is next due for review / renewal';
COMMENT ON COLUMN hr_policies.owner        IS 'Name or role of the person responsible for this policy';
