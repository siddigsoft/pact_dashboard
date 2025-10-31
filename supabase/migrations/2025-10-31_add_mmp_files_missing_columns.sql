-- Migration: Add missing columns used by the app to public.mmp_files
-- Safe to run multiple times (uses IF NOT EXISTS guards)

BEGIN;

-- 1) Add columns expected by the app (concatenated naming)
ALTER TABLE public.mmp_files
  ADD COLUMN IF NOT EXISTS archivedby text,
  ADD COLUMN IF NOT EXISTS archivedat timestamptz,
  ADD COLUMN IF NOT EXISTS approvedby text,
  ADD COLUMN IF NOT EXISTS approvedat timestamptz,
  ADD COLUMN IF NOT EXISTS rejectionreason text;

-- 2) Backfill from snake_case columns when present
DO $$
BEGIN
  -- approved_by -> approvedby
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mmp_files' AND column_name = 'approved_by'
  ) THEN
    EXECUTE 'UPDATE public.mmp_files SET approvedby = approved_by WHERE approvedby IS NULL AND approved_by IS NOT NULL';
  END IF;

  -- approved_at -> approvedat
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mmp_files' AND column_name = 'approved_at'
  ) THEN
    EXECUTE 'UPDATE public.mmp_files SET approvedat = approved_at WHERE approvedat IS NULL AND approved_at IS NOT NULL';
  END IF;

  -- rejection_reason -> rejectionreason
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mmp_files' AND column_name = 'rejection_reason'
  ) THEN
    EXECUTE 'UPDATE public.mmp_files SET rejectionreason = rejection_reason WHERE rejectionreason IS NULL AND rejection_reason IS NOT NULL';
  END IF;

  -- archived_by -> archivedby
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mmp_files' AND column_name = 'archived_by'
  ) THEN
    EXECUTE 'UPDATE public.mmp_files SET archivedby = archived_by WHERE archivedby IS NULL AND archived_by IS NOT NULL';
  END IF;

  -- archived_at -> archivedat
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mmp_files' AND column_name = 'archived_at'
  ) THEN
    EXECUTE 'UPDATE public.mmp_files SET archivedat = archived_at WHERE archivedat IS NULL AND archived_at IS NOT NULL';
  END IF;
END
$$;

COMMIT;
