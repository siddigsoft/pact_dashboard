-- ── HR Policies: extra columns + storage bucket ────────────────────────────
-- Safe to re-run (IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- Apply once in Supabase SQL Editor (Dashboard → SQL Editor → New query).

-- 1. Add description, review_date, owner columns if they don't exist yet
ALTER TABLE hr_policies
  ADD COLUMN IF NOT EXISTS description  text,
  ADD COLUMN IF NOT EXISTS review_date  date,
  ADD COLUMN IF NOT EXISTS owner        text;

COMMENT ON COLUMN hr_policies.description IS 'Short 1-2 sentence summary shown on policy cards';
COMMENT ON COLUMN hr_policies.review_date  IS 'Date the policy is next due for review';
COMMENT ON COLUMN hr_policies.owner        IS 'Name or role of the responsible person';

-- 2. Create the hr-policies storage bucket (public, so download links work)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hr-policies',
  'hr-policies',
  true,
  52428800,   -- 50 MB
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- 3. Storage RLS: HR admins can upload; all authenticated users can read
INSERT INTO storage.policies (name, bucket_id, operation, definition)
VALUES
  ('hr_policies_upload_admin', 'hr-policies', 'INSERT',
   '(auth.jwt() ->> ''role'') IN (''admin'',''super_admin'',''hr_admin'',''ict'')'),
  ('hr_policies_read_auth',    'hr-policies', 'SELECT',
   'auth.role() = ''authenticated'''),
  ('hr_policies_delete_admin', 'hr-policies', 'DELETE',
   '(auth.jwt() ->> ''role'') IN (''admin'',''super_admin'',''hr_admin'',''ict'')')
ON CONFLICT (name, bucket_id) DO NOTHING;
