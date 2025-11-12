-- To allow public (anon) read access to mmp_files, run this in the Supabase SQL editor:

-- 1. Enable Row Level Security (if not already enabled)
ALTER TABLE mmp_files ENABLE ROW LEVEL SECURITY;

-- 2. Create a policy to allow SELECT for all users (including anon/public)
CREATE POLICY "Allow read for all"
  ON mmp_files
  FOR SELECT
  USING (true);

-- 3. (Optional) If you want to allow only authenticated users, use:
-- USING (auth.role() = 'authenticated');
