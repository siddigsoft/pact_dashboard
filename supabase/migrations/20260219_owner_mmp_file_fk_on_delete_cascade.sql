-- Owner-run migration: change FK from mmp_site_entries.mmp_file_id -> mmp_files.id to ON DELETE CASCADE
-- Run this as a DB owner in Supabase SQL editor (requires permission to ALTER TABLE / DROP CONSTRAINT).

-- Safety: do not run without a backup. Dropping the FK and making it cascade will allow deleting files and automatically remove related site entries.

BEGIN;

-- 1) Ensure the constraint exists (it does in schema). Drop if present.
ALTER TABLE IF EXISTS public.mmp_site_entries
  DROP CONSTRAINT IF EXISTS mmp_site_entries_mmp_file_id_fkey;

-- 2) Recreate the FK with ON DELETE CASCADE.
ALTER TABLE IF EXISTS public.mmp_site_entries
  ADD CONSTRAINT mmp_site_entries_mmp_file_id_fkey
    FOREIGN KEY (mmp_file_id) REFERENCES public.mmp_files(id) ON DELETE CASCADE;

COMMIT;

-- Quick verification queries (run after the migration):
-- 1) Confirm FK has ON DELETE CASCADE:
-- SELECT pg_get_constraintdef(con.oid)
-- FROM pg_constraint con
-- JOIN pg_class rel ON rel.oid = con.conrelid
-- WHERE rel.relname = 'mmp_site_entries' AND con.conname = 'mmp_site_entries_mmp_file_id_fkey';

-- 2) Test (owner):
-- DELETE FROM public.mmp_files WHERE id = 'your-file-id';
-- Then check that corresponding rows in public.mmp_site_entries were removed.

-- If you prefer NOT to cascade deletes, alternative approaches:
--  - Prevent deleting mmp_files when referenced: keep FK and handle error in application (show message, unlink references first)
--  - Use ON DELETE SET NULL if mmp_file_id can be nullable (requires altering column to allow NULL and adjusting app logic)

-- Notes:
-- - This migration is destructive from the perspective that deleting a file will remove site entries referencing it. Confirm this is the intended behavior.
-- - Run backups and a quick data audit before applying to production.
